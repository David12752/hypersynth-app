/**
 * RustAudioBridge.ts
 *
 * Zero-latency data bridge between the Rust audio engine (exposed via the
 * Electron N-API native-host module) and the React UI layer.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Architecture                                                           │
 * │                                                                         │
 * │  Rust engine thread                                                     │
 * │     │ writes Float32 samples via N-API addon                            │
 * │     ▼                                                                   │
 * │  SharedArrayBuffer ring buffer  ─────────────────────────────────────┐  │
 * │  (or IPC postMessage fallback)                                        │  │
 * │                                                                       ▼  │
 * │  RustAudioBridge singleton          React components                  │  │
 * │     • detectMode()                  useEffect(() => {                 │  │
 * │     • initRustBridge()                const unsub = onAudioFrame(cb)  │  │
 * │     • requestAnimationFrame loop      return unsub                    │  │
 * │     • typed pub/sub API             }, [])                            │  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ─── SharedArrayBuffer (SAB) mode ─────────────────────────────────────────────
 * The Rust addon allocates a SharedArrayBuffer and returns it via:
 *   window.nativeHost.getSharedAudioBuffer(): SharedArrayBuffer
 *
 * Buffer layout (all values are 32-bit; first 4 × 4 = 16 bytes are headers):
 *
 *   Offset (Int32)  Field
 *   ──────────────  ─────────────────────────────────────────────────────
 *    0              writeHead    — Atomics-updated write position in scope ring
 *    1              frameCount   — number of wavetable frames currently in buf
 *    2              frameSize    — samples per wavetable frame
 *    3              flags        — bitmask: bit 0 = new wavetable data ready
 *   ──────────────  ─────────────────────────────────────────────────────
 *    4..4+SR-1      scope ring   — SCOPE_RING_SIZE Float32 samples (circular)
 *    4+SR..end      wavetable    — frameCount×frameSize Float32 samples
 *
 * The Rust side uses Atomics.store (or the C equivalent via N-API) so reads
 * are safe without a mutex.
 *
 * ─── IPC message mode (fallback) ─────────────────────────────────────────────
 * window.nativeHost.onAudioFrame(callback) — callback receives serialised packets:
 *   { scope: number[], wavetable?: { samples: number[], frameCount: number, frameSize: number } }
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   // In your app entry point (e.g. layout.tsx):
 *   import { initRustBridge } from "@/lib/audio/RustAudioBridge"
 *   initRustBridge()
 *
 *   // In a React component:
 *   import { onAudioFrame, onWavetableUpdate } from "@/lib/audio/RustAudioBridge"
 *
 *   useEffect(() => {
 *     const unsub = onAudioFrame(({ scopeSamples }) => {
 *       scopeRef.current.pushSamples(scopeSamples)
 *     })
 *     return unsub
 *   }, [])
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Ring-buffer constants ─────────────────────────────────────────────────────
export const SCOPE_RING_SIZE    = 8192     // scope ring buffer (float32 entries)
export const WAVETABLE_MAX_SIZE = 64 * 2048 // max wavetable data  (float32 entries)

// SharedArrayBuffer header layout (Int32 indices)
const HDR_WRITE_HEAD   = 0
const HDR_FRAME_COUNT  = 1
const HDR_FRAME_SIZE   = 2
const HDR_FLAGS        = 3
const HDR_SIZE_I32     = 4   // header occupies 4 × 4 = 16 bytes

// Float32 offsets into the SAB (each = byte offset ÷ 4)
const SAB_SCOPE_F32_START = HDR_SIZE_I32                       // = 4
const SAB_WAVE_F32_START  = SAB_SCOPE_F32_START + SCOPE_RING_SIZE  // = 8196

// Flag bits
const FLAG_WAVETABLE_READY = 0x01

// ─── Public types ──────────────────────────────────────────────────────────────

export interface AudioFrame {
  /** Snapshot of the scope ring buffer at the time of the rAF tick */
  scopeSamples: Float32Array
  /** Current write-head position in the ring (0 .. SCOPE_RING_SIZE-1) */
  writeHead: number
}

export interface WavetableData {
  /** Flat array of all frames: [frame0_sample0, frame0_sample1, ..., frameN_sampleM] */
  samples:    Float32Array
  frameCount: number
  frameSize:  number
}

export type AudioFrameCallback    = (frame: AudioFrame)    => void
export type WavetableCallback     = (data:  WavetableData) => void

export type BridgeMode = "sab" | "ipc" | "none"

// ─── Internal singleton state ─────────────────────────────────────────────────
interface BridgeState {
  mode:               BridgeMode
  sabBuffer:          SharedArrayBuffer | null
  int32View:          Int32Array  | null
  float32View:        Float32Array | null
  rafId:              number
  scopeSnapshot:      Float32Array
  audioListeners:     Set<AudioFrameCallback>
  wavetableListeners: Set<WavetableCallback>
}

const _state: BridgeState = {
  mode:               "none",
  sabBuffer:          null,
  int32View:          null,
  float32View:        null,
  rafId:              0,
  scopeSnapshot:      new Float32Array(SCOPE_RING_SIZE),
  audioListeners:     new Set(),
  wavetableListeners: new Set(),
}

// ─── Mode detection ────────────────────────────────────────────────────────────

function detectMode(): BridgeMode {
  if (typeof window === "undefined") return "none"
  const nh = (window as any).nativeHost
  if (!nh) return "none"

  // Try SharedArrayBuffer — requires COOP/COEP headers (Electron sets these)
  try {
    const buf = nh.getSharedAudioBuffer?.()
    if (buf instanceof SharedArrayBuffer) return "sab"
  } catch { /* not available */ }

  // IPC message fallback
  if (typeof nh.onAudioFrame === "function") return "ipc"

  return "none"
}

// ─── Initialise ────────────────────────────────────────────────────────────────

/**
 * Call once at app start (e.g. in layout.tsx useEffect) to start the bridge.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Returns the detected transport mode.
 */
export function initRustBridge(): BridgeMode {
  if (_state.mode !== "none") return _state.mode

  _state.mode = detectMode()

  switch (_state.mode) {
    case "sab": {
      const buf = (window as any).nativeHost.getSharedAudioBuffer() as SharedArrayBuffer
      _state.sabBuffer   = buf
      _state.int32View   = new Int32Array(buf)
      _state.float32View = new Float32Array(buf)
      _startSABLoop()
      break
    }

    case "ipc":
      _startIPCListener()
      break

    case "none":
      // No native bridge — components will rely on the WASM fallback in AudioBridge.ts
      break
  }

  return _state.mode
}

// ─── SAB rAF polling loop ──────────────────────────────────────────────────────

function _startSABLoop() {
  const tick = () => {
    _state.rafId = requestAnimationFrame(tick)

    const hdr = _state.int32View!
    const f32 = _state.float32View!

    // Read header fields atomically
    const writeHead  = Atomics.load(hdr, HDR_WRITE_HEAD)
    const frameCount = Atomics.load(hdr, HDR_FRAME_COUNT)
    const frameSize  = Atomics.load(hdr, HDR_FRAME_SIZE)
    const flags      = Atomics.load(hdr, HDR_FLAGS)

    // Copy scope ring snapshot (full buffer — consumer can use writeHead to
    // reconstruct the chronological order if needed)
    _state.scopeSnapshot.set(
      f32.subarray(SAB_SCOPE_F32_START, SAB_SCOPE_F32_START + SCOPE_RING_SIZE),
    )

    if (_state.audioListeners.size > 0) {
      const frame: AudioFrame = {
        scopeSamples: _state.scopeSnapshot.slice(0),
        writeHead,
      }
      _state.audioListeners.forEach(cb => {
        try { cb(frame) } catch { /* isolate listener errors */ }
      })
    }

    // Check for new wavetable data
    if ((flags & FLAG_WAVETABLE_READY) && _state.wavetableListeners.size > 0) {
      const total     = frameCount * frameSize
      const waveSamples = f32.slice(SAB_WAVE_F32_START, SAB_WAVE_F32_START + total)
      const data: WavetableData = { samples: waveSamples, frameCount, frameSize }

      _state.wavetableListeners.forEach(cb => {
        try { cb(data) } catch { /* isolate listener errors */ }
      })

      // Clear the ready flag so we don't re-dispatch the same data
      Atomics.store(hdr, HDR_FLAGS, flags & ~FLAG_WAVETABLE_READY)
    }
  }

  _state.rafId = requestAnimationFrame(tick)
}

// ─── IPC message listener ──────────────────────────────────────────────────────

interface RawAudioPacket {
  scope: number[]
  wavetable?: {
    samples:    number[]
    frameCount: number
    frameSize:  number
  }
}

function _startIPCListener() {
  ;(window as any).nativeHost.onAudioFrame((packet: RawAudioPacket) => {
    if (_state.audioListeners.size > 0) {
      const scope  = Float32Array.from(packet.scope)
      const frame: AudioFrame = { scopeSamples: scope, writeHead: 0 }
      _state.audioListeners.forEach(cb => {
        try { cb(frame) } catch { /* isolate */ }
      })
    }

    if (packet.wavetable && _state.wavetableListeners.size > 0) {
      const data: WavetableData = {
        samples:    Float32Array.from(packet.wavetable.samples),
        frameCount: packet.wavetable.frameCount,
        frameSize:  packet.wavetable.frameSize,
      }
      _state.wavetableListeners.forEach(cb => {
        try { cb(data) } catch { /* isolate */ }
      })
    }
  })
}

// ─── Public pub/sub API ────────────────────────────────────────────────────────

/**
 * Subscribe to the audio scope stream.
 * The callback is called every rAF tick (SAB mode) or on each IPC packet.
 * Returns an unsubscribe function — call it in a useEffect cleanup.
 *
 * @example
 *   useEffect(() => onAudioFrame(frame => { ... }), [])
 */
export function onAudioFrame(cb: AudioFrameCallback): () => void {
  _state.audioListeners.add(cb)
  return () => _state.audioListeners.delete(cb)
}

/**
 * Subscribe to wavetable data updates.
 * In SAB mode: fires whenever the Rust engine sets the FLAG_WAVETABLE_READY bit.
 * In IPC mode: fires on every packet that includes wavetable data.
 *
 * @example
 *   useEffect(() => onWavetableUpdate(data => terrainRef.current?.updateWavetable(...)), [])
 */
export function onWavetableUpdate(cb: WavetableCallback): () => void {
  _state.wavetableListeners.add(cb)
  return () => _state.wavetableListeners.delete(cb)
}

/** Returns the currently active transport mode */
export function getRustBridgeMode(): BridgeMode {
  return _state.mode
}

/**
 * Stops the SAB rAF loop. Call this in Electron's beforeunload handler
 * to avoid orphaned rAF loops during hot-reload.
 */
export function shutdownRustBridge(): void {
  if (_state.rafId) cancelAnimationFrame(_state.rafId)
  _state.audioListeners.clear()
  _state.wavetableListeners.clear()
}

// ─── React convenience hook ────────────────────────────────────────────────────
// NOTE: This thin hook is defined here for colocation. You can also move it to
//       hooks/useRustAudio.ts if you prefer strict separation.

import { useEffect, useRef } from "react"

/**
 * Subscribes a component to the audio scope stream and populates
 * `latestFrameRef.current` each tick without triggering a React re-render.
 *
 * @example
 *   const frame = useRustAudioFrame()
 *   // In a rAF loop or canvas effect: frame.current?.scopeSamples
 */
export function useRustAudioFrame(): React.MutableRefObject<AudioFrame | null> {
  const ref = useRef<AudioFrame | null>(null)
  useEffect(() => onAudioFrame(f => { ref.current = f }), [])
  return ref
}

/**
 * Subscribes a component to wavetable data updates.
 *
 * @example
 *   const data = useWavetableData()
 *   useEffect(() => {
 *     if (data.current) terrainRef.current?.updateWavetable(...)
 *   })
 */
export function useWavetableData(): React.MutableRefObject<WavetableData | null> {
  const ref = useRef<WavetableData | null>(null)
  useEffect(() => onWavetableUpdate(d => { ref.current = d }), [])
  return ref
}

// ─── Rust N-API stub (for native-host.js reference) ──────────────────────────
/**
 * The native-host N-API module (hypersynth-engine/src/napi.rs) must expose:
 *
 * ```rust
 * #[napi]
 * pub fn get_shared_audio_buffer(env: Env) -> Result<JsArrayBuffer> {
 *   // Return the pre-allocated SharedArrayBuffer written by the audio thread
 *   todo!()
 * }
 * ```
 *
 * And in electron/preload.js, expose it to the renderer:
 *
 * ```js
 * const { getSharedAudioBuffer } = require('../native-addon')
 * contextBridge.exposeInMainWorld('nativeHost', {
 *   getSharedAudioBuffer: () => getSharedAudioBuffer(),
 *   // ...existing IPC methods...
 * })
 * ```
 *
 * Electron main process must also send:
 * ```js
 * win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
 *   callback(true)
 * })
 * // And set webPreferences:
 * // { contextIsolation: true, nodeIntegration: false, worldSafeExecuteJavaScript: false }
 * // Plus response headers for COOP + COEP to enable SAB:
 * // "Cross-Origin-Opener-Policy": "same-origin"
 * // "Cross-Origin-Embedder-Policy": "require-corp"
 * ```
 */
export const _RUST_NAPI_STUB = null
