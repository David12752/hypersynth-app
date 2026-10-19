# HyperSynth Wave Display Discovery

## Workspace shape

- Frontend shell: Next.js 16 + React 19 + TypeScript in `app/`, `components/`, `hooks/`, `lib/`
- Electron desktop shell: `electron/main.js`, `electron/preload.js`, `electron/native-host.js`
- Rust workspace: `hypersynth-engine/`
  - `engine/` core DSP crate
  - `standalone/` native host executable used by Electron
  - `wasm-bridge/` wasm-bindgen bridge for browser mode
  - `plugin/` NIH-plug wrapper

## Rust source inventory

Core DSP and host files relevant to waveform display:

- `hypersynth-engine/engine/src/lib.rs`
- `hypersynth-engine/engine/src/voice.rs`
- `hypersynth-engine/engine/src/params.rs`
- `hypersynth-engine/engine/src/smoothing.rs`
- `hypersynth-engine/engine/src/oscillators/va.rs`
- `hypersynth-engine/engine/src/oscillators/wavetable.rs`
- `hypersynth-engine/engine/src/oscillators/fm.rs`
- `hypersynth-engine/engine/src/filters/*.rs`
- `hypersynth-engine/engine/src/modulation/*.rs`
- `hypersynth-engine/standalone/src/main.rs`
- `hypersynth-engine/wasm-bridge/src/lib.rs`

## Electron / renderer entry points

- Electron main process: `electron/main.js`
- Electron preload bridge: `electron/preload.js`
- Native process manager: `electron/native-host.js`
- Renderer root: `app/page.tsx`
- Oscillator UI entry: `components/synth/panels/OscillatorPanel.tsx`

## Existing rendering code

Current visualizers are Canvas 2D only. No WebGL / Three.js code exists.

Existing display components:

- `components/synth/WavetableDisplay2D.tsx`
- `components/synth/WavetableDisplay3D.tsx`
- `components/synth/Oscilloscope.tsx`
- `components/synth/FmAlgorithmDisplay.tsx`
- `components/synth/WaveformDisplay.tsx`
- `components/synth/EnvelopeDisplay.tsx`
- `components/synth/FilterDisplay.tsx`
- `components/synth/VUMeter.tsx`

## Current waveform data pipeline

### Desktop / Electron path

The Electron app does not talk to Rust through napi-rs, SharedArrayBuffer, WebSocket, or direct FFI.

Current path:

1. Renderer calls `window.hyperSynthNative.*` from `electron/preload.js`
2. Preload uses `ipcRenderer.invoke(...)`
3. Electron main forwards commands to `NativeHostManager` in `electron/native-host.js`
4. `NativeHostManager` spawns `hypersynth-standalone.exe`
5. Control messages go to Rust over JSON lines on `stdin`
6. Telemetry comes back over JSON lines on `stdout`
7. Main process broadcasts snapshots back to renderer via `hypersynth-native-event`

### Current telemetry content

`standalone/src/main.rs` currently exports:

- backend info
- engine stats
- meters
- scope samples
- device inventory
- MIDI inventory

The status thread emits snapshots every 120 ms. That is sufficient for meters and a footer scope, but not for a premium 60 fps waveform overlay.

### Current scope data

- Captured from mixed stereo output in the standalone renderer
- Current capture size: 256 samples
- Stored in atomic telemetry and serialized as JSON
- Exposed in JS through `getScopeFrame()` in `lib/audio/AudioBridge.ts`

## Current wavetable data availability

### What exists

- `engine/src/oscillators/wavetable.rs` contains a real wavetable engine implementation
- Frames are 2048 samples each (`FRAME_SIZE = 2048`)
- Factory tables exist: Basic, PWM Sweep, Formant Sweep, Digital, Vocal
- The wavetable module already contains the source data needed for a display

### What does not exist

- No exported API from Rust to fetch wavetable frames for the renderer
- No live per-oscillator wavetable telemetry
- No real-time wavetable scan telemetry channel
- No SharedArrayBuffer transport

## Critical architectural finding

The audio engine used in the live voice path is still VA-only.

Evidence:

- `engine/src/voice.rs` constructs `Box<dyn OscillatorEngine>` with `VaOscillator::new(...)`
- `HyperSynthEngine::sync_params_to_voices()` only pushes VA-style osc parameters into each voice
- `WavetableOscillator` exists, but is not yet wired into the active synth voice architecture

This means the current `WAVE` UI page is visually present, but its display is still driven by demo/generated renderer-side data rather than the active audio engine.

## Audio settings discovered

- Requested sample rate defaults to 44100 Hz
- Requested buffer size defaults to 256 samples
- Desktop host is CPAL native audio host with ASIO preferred on Windows when available
- Telemetry status thread cadence: 120 ms

## UI state findings

- Oscillator UI state is held in React state in `app/page.tsx`
- `OscillatorPanel.tsx` renders per-engine views
- Existing WAVE view currently uses renderer-generated demo frames, not engine-exported frames
- Footer `Oscilloscope` already uses `getScopeFrame()` and polls in `requestAnimationFrame`
- `useAudioEngine.ts` refreshes engine stats/meters/backend info every 120 ms

## Architecture decision

### Rejected: napi-rs + SharedArrayBuffer

This project already uses an out-of-process Rust standalone host controlled by Electron over stdio. Adding napi-rs would require introducing a second native integration path, a Node addon build, and a different runtime ownership model than the current ASIO/CPAL desktop path. That is a much larger architectural fork than the current codebase justifies.

### Rejected: full-frame 60 fps JSON streaming of 64 x 2048 wavetable data

Streaming full wavetable stacks every frame over JSON/stdout would add unnecessary serialization and parsing overhead. The wavetable itself changes rarely relative to the active scope.

### Chosen approach: hybrid bridge on top of existing IPC

Use the current Electron IPC + native host architecture, but split the display data into two classes:

1. Static / infrequent wavetable data:
   - Export wavetable frame data from Rust on demand via a new IPC request
   - Fetch once on mount or when preset/display source changes
   - Renderer uploads it to Three.js `BufferGeometry`

2. Fast live overlay data:
   - Upgrade existing scope telemetry from 256 samples / 120 ms to a real-time ring snapshot suitable for animation
   - Keep this as lightweight atomic telemetry in the standalone host
   - Renderer consumes the latest scope frame without reallocating geometry

This keeps the current desktop architecture intact, avoids a new native binding system, and isolates the high-frequency path to the small live waveform overlay instead of the entire wavetable stack.

## Implementation plan derived from discovery

1. Add an Electron IPC request for wavetable display data
2. Export flattened wavetable frames from Rust for display use
3. Improve live scope telemetry for faster refresh and larger capture window
4. Add Three.js-based wavetable display component in TypeScript
5. Integrate it into the WAVE engine area inside `OscillatorPanel.tsx`
6. Add spectrogram ribbon in renderer from live scope data
7. Validate Electron app and Rust release build

## Known limitations before implementation

- The active synth voice path is not yet truly using `WavetableOscillator`
- Therefore the professional display can be made engine-backed for wavetable table content, but the live overlay will represent current engine output scope rather than a dedicated WAVE-osc-only render until the engine architecture is upgraded later
- This is still a valid and non-breaking improvement for the current desktop app
