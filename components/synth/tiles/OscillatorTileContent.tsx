"use client"

import { memo } from "react"
import { Knob } from "@/components/synth/Knob"
import { LiveWaveform } from "./LiveWaveform"

const ACCENT = "#5865f2"
const TAB_W = 26

type OscEngineType = "VA" | "WAVE" | "FM" | "GRAN" | "MODAL" | "ADD" | "SAMP"
type VaWaveform = "sine" | "tri" | "saw" | "square" | "noise"
type VaModel = "blep" | "tpt" | "circuit"
type VaSubOsc = "off" | "sub1sin" | "sub1sq" | "sub2sin"
type WavePreset = "basic" | "pwm" | "formant" | "digital" | "vocal"
type FmAlgorithm = 1 | 2 | 3 | 4 | 5 | 6
type GranWindow = "hann" | "gauss" | "trapez" | "rect"
type ModalBody = "string" | "bar" | "membrane" | "plate" | "tube" | "bell"
type SamplerMode = "oneshot" | "loop" | "pingpong" | "susloop"

interface OscState {
  engineType?: OscEngineType
  vaWaveform?: VaWaveform
  octave?: number
  semitone?: number
  cent?: number
  level?: number
  pan?: number
  phase?: number
  stereo?: number
  vaPulseWidth?: number
  vaPWM?: number
  vaDrift?: number
  vaVintage?: number
  vaBright?: number
  vaSubOsc?: VaSubOsc
  vaSubLevel?: number
  vaSync?: boolean
  vaModel?: VaModel
  waveFrame?: number
  waveMorph?: number
  waveScan?: boolean
  waveScanTime?: number
  wavePreset?: WavePreset
  fmAlgorithm?: number
  fmSelectedOp?: number
  fmOp1Ratio?: number
  fmOp1Level?: number
  fmOp2Ratio?: number
  fmOp2Level?: number
  fmOp3Ratio?: number
  fmOp3Level?: number
  fmOp4Ratio?: number
  fmOp4Level?: number
  fmModIndex?: number
  fmFeedback?: number
  granSize?: number
  granDensity?: number
  granPosition?: number
  granSpray?: number
  granPitchRandom?: number
  granWindow?: GranWindow
  modalBody?: ModalBody
  modalDecay?: number
  modalBrightness?: number
  addHarmonicCount?: number
  addMorph?: number
  sampMode?: SamplerMode
  sampStart?: number
  sampEnd?: number
  sampPitch?: number
}

interface OscillatorTileContentProps {
  state: OscState
  onChange: (patch: Partial<OscState>) => void
}

const ENGINE_TYPES: OscEngineType[] = ["VA", "WAVE", "FM", "GRAN", "MODAL", "ADD", "SAMP"]
const VA_WAVEFORMS: VaWaveform[] = ["sine", "tri", "saw", "square", "noise"]
const VA_MODELS: { id: VaModel; label: string }[] = [
  { id: "blep", label: "BLP" },
  { id: "tpt", label: "TPT" },
  { id: "circuit", label: "CIR" },
]
const VA_SUBS: { id: VaSubOsc; label: string }[] = [
  { id: "off", label: "OFF" },
  { id: "sub1sin", label: "S1" },
  { id: "sub1sq", label: "Q1" },
  { id: "sub2sin", label: "S2" },
]
const WAVE_PRESETS: { id: WavePreset; title: string; frames: number }[] = [
  { id: "basic", title: "Basic waves", frames: 8 },
  { id: "pwm", title: "PWM sweep", frames: 16 },
  { id: "formant", title: "Formant sweep", frames: 8 },
  { id: "digital", title: "Digital harmonics", frames: 8 },
  { id: "vocal", title: "Vocal formants", frames: 5 },
]
const GRAN_WINDOWS: { id: GranWindow; label: string; title: string }[] = [
  { id: "hann", label: "HN", title: "Hann window" },
  { id: "gauss", label: "GS", title: "Gaussian window" },
  { id: "trapez", label: "TZ", title: "Trapezoid window" },
  { id: "rect", label: "RC", title: "Rectangular window" },
]
const MODAL_BODIES: { id: ModalBody; label: string; title: string }[] = [
  { id: "string", label: "STR", title: "String body" },
  { id: "bar", label: "BAR", title: "Bar body" },
  { id: "membrane", label: "MEM", title: "Membrane body" },
  { id: "plate", label: "PLT", title: "Plate body" },
  { id: "tube", label: "TUB", title: "Tube body" },
  { id: "bell", label: "BEL", title: "Bell body" },
]
const SAMPLER_MODES: { id: SamplerMode; label: string; title: string }[] = [
  { id: "oneshot", label: "1SH", title: "One-shot" },
  { id: "loop", label: "LOP", title: "Loop" },
  { id: "pingpong", label: "PNG", title: "Ping-pong" },
  { id: "susloop", label: "SUS", title: "Sustain loop" },
]
const FM_ALGOS: FmAlgorithm[] = [1, 2, 3, 4, 5, 6]

interface FmLayout {
  ops: { x: number; y: number }[]
  connections: [number, number][]
  carriers: number[]
}

const FM_LAYOUTS: Record<FmAlgorithm, FmLayout> = {
  1: { ops: [{ x: 60, y: 44 }, { x: 60, y: 31 }, { x: 60, y: 18 }, { x: 60, y: 6 }], connections: [[4, 3], [3, 2], [2, 1]], carriers: [1] },
  2: { ops: [{ x: 60, y: 44 }, { x: 60, y: 28 }, { x: 34, y: 9 }, { x: 86, y: 9 }], connections: [[3, 2], [4, 2], [2, 1]], carriers: [1] },
  3: { ops: [{ x: 35, y: 44 }, { x: 35, y: 14 }, { x: 85, y: 44 }, { x: 85, y: 14 }], connections: [[2, 1], [4, 3]], carriers: [1, 3] },
  4: { ops: [{ x: 60, y: 44 }, { x: 60, y: 28 }, { x: 36, y: 11 }, { x: 84, y: 11 }], connections: [[4, 3], [3, 2], [3, 1]], carriers: [1] },
  5: { ops: [{ x: 28, y: 44 }, { x: 60, y: 44 }, { x: 92, y: 44 }, { x: 60, y: 11 }], connections: [[4, 1], [4, 2], [4, 3]], carriers: [1, 2, 3] },
  6: { ops: [{ x: 24, y: 28 }, { x: 48, y: 28 }, { x: 72, y: 28 }, { x: 96, y: 28 }], connections: [], carriers: [1, 2, 3, 4] },
}

const ENGINE_LABELS: Record<OscEngineType, string> = {
  VA: "Virtual Analog",
  WAVE: "Wavetable",
  FM: "FM Synthesis",
  GRAN: "Granular",
  MODAL: "Modal / Physical",
  ADD: "Additive",
  SAMP: "Sampler",
}

// helper: animation styles when active, empty when not (zero CPU for inactive)
function anim(
  active: boolean,
  name: string,
  duration: string,
  timing = "linear",
  delay = "0s",
  direction = "normal" as "normal" | "alternate",
): React.CSSProperties {
  if (!active) return {}
  return {
    animationName: name,
    animationDuration: duration,
    animationTimingFunction: timing,
    animationIterationCount: "infinite",
    animationDelay: delay,
    animationDirection: direction,
  }
}

// ── Engine type SVG icons ─────────────────────────────────────────────────
// Each 18×12 with viewBox "0 0 18 12" so 1 SVG unit ≡ 1 CSS px (clean math).
// Animations only run when active=true → paused/absent otherwise.
// ─────────────────────────────────────────────────────────────────────────
const EngineTabIcon = memo(function EngineTabIcon({
  type,
  active,
}: {
  type: OscEngineType
  active: boolean
}) {
  const stroke = active ? "#ffffff" : "#7788bb"
  const fill   = active ? "#ffffff" : "#7788bb"
  const W = 18, H = 12

  switch (type) {
    // ── Virtual Analog: scrolling sawtooth (period=4 px) ─────────────
    case "VA":
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ overflow: "hidden" }}>
          <g style={{ ...anim(active, "osc-va-scroll", "1s") }}>
            <path
              d="M-4,11 L0,1 L0,11 L4,1 L4,11 L8,1 L8,11 L12,1 L12,11 L16,1 L16,11 L20,1 L20,11 L24,1"
              fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round"
            />
          </g>
        </svg>
      )

    // ── Wavetable: scrolling sine (period=9 px) ───────────────────────
    case "WAVE":
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ overflow: "hidden" }}>
          <g style={{ ...anim(active, "osc-wave-scroll", "2s") }}>
            <path
              d="M-9,6 C-6.75,1 -2.25,1 0,6 C2.25,11 6.75,11 9,6 C11.25,1 15.75,1 18,6 C20.25,11 24.75,11 27,6"
              fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"
            />
          </g>
        </svg>
      )

    // ── FM: complex waveform, scaleY pulse centered ───────────────────
    case "FM":
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <g style={{ transformOrigin: "9px 6px", ...anim(active, "osc-fm-pulse", "0.5s", "ease-in-out") }}>
            <path
              d="M0,6 C0.5,3 1,9 1.5,6 C2,2 2.5,10 3,6 C3.5,3 4,9 5,6 C6,1 7,11 8,6 C9,3 10,9 11,6 C12,2 13,10 14,6 C14.5,3 15,9 15.5,6 C16,3.5 17,8.5 18,6"
              fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"
            />
          </g>
        </svg>
      )

    // ── Granular: scattered dots, staggered flicker ───────────────────
    case "GRAN": {
      const dots: [number, number, number][] = [
        [3, 2, 0], [7, 9, 0.35], [11, 3, 0.65],
        [15, 8, 0.1], [1, 7, 0.9], [5, 10, 0.48],
        [9, 1, 0.75], [13, 5, 0.22], [17, 9, 0.58],
      ]
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          {dots.map(([cx, cy, delay], i) => (
            <circle
              key={i} cx={cx} cy={cy} r={1.3}
              fill={fill}
              opacity={active ? 0.7 : 0.45}
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                ...anim(active, "osc-gran-dot", "0.9s", "ease-in-out", `${delay}s`, "alternate"),
              }}
            />
          ))}
        </svg>
      )
    }

    // ── Modal/Physical: damped sine drawn/erased cyclically ───────────
    case "MODAL":
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          <path
            d="M0,6 C0.4,1 1.6,1 2,6 C2.4,11 3.6,11 4,6 C4.3,2.5 5.7,2.5 6,6 C6.3,9.5 7.7,9.5 8,6 C8.2,3 9.8,3 10,6 C10.2,9 11.8,9 12,6 C12.2,4 13.8,4 14,6 C14.2,8 15.8,8 16,6 C16.1,5 16.9,5 17,6 C17.1,7 17.9,7 18,6"
            fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"
            pathLength={100}
            style={{
              strokeDasharray: "100",
              strokeDashoffset: active ? undefined : 0,
              ...anim(active, "osc-modal-draw", "2.2s", "ease-in-out"),
            }}
          />
        </svg>
      )

    // ── Additive: harmonic bars, staggered scaleY bounce ─────────────
    case "ADD": {
      // [x, barTop, barHeight] — bars grow upward from y=12
      const bars: [number, number, number][] = [
        [1, 2, 10], [4, 5, 7], [7, 7, 5], [10, 8, 4], [13, 9, 3], [16, 10, 2],
      ]
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
          {bars.map(([x, y, bh], i) => (
            <rect
              key={i} x={x} y={y} width={2} height={bh}
              fill={fill} opacity={0.85}
              style={{
                transformOrigin: `${x + 1}px 12px`,
                ...anim(active, "osc-add-bar", "1.4s", "ease-in-out", `${i * 0.17}s`, "alternate"),
              }}
            />
          ))}
        </svg>
      )
    }

    // ── Sampler: stepped waveform + sweeping playhead ─────────────────
    case "SAMP":
      return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ overflow: "hidden" }}>
          <path
            d="M0,6 L1,6 L1,3 L2,3 L2,9 L3,9 L3,5 L4,5 L4,8 L5,8 L5,2 L6,2 L6,10 L7,10 L7,6 L8,6 L8,4 L9,4 L9,7 L10,7 L10,11 L11,11 L11,6 L12,6 L12,3 L13,3 L13,8 L14,8 L14,6 L15,6 L15,5 L16,5 L16,9 L17,9 L17,6 L18,6"
            fill="none" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" opacity={0.8}
          />
          {/* playhead cursor — invisible when inactive */}
          <g
            opacity={active ? 1 : 0}
            style={{ ...anim(active, "osc-samp-cursor", "2s") }}
          >
            <line x1={0} y1={0} x2={0} y2={H}
              stroke={active ? "#a0b8ff" : "transparent"} strokeWidth="1.2"
            />
          </g>
        </svg>
      )

    default:
      return null
  }
})

// ── Waveform shape SVG buttons ────────────────────────────────────────────
// Tiny 16×10 SVG paths — shape tells you the waveform at a glance.
// ─────────────────────────────────────────────────────────────────────────
function WaveformSvgIcon({ wf, active }: { wf: VaWaveform; active: boolean }) {
  const c = active ? "#fff" : "#7788bb"
  const sp = {
    fill: "none" as const, stroke: c, strokeWidth: 1.5,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  }
  switch (wf) {
    case "sine":
      return <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden><path d="M0,5 C1,0.5 3,0.5 4,5 C5,9.5 7,9.5 8,5 C9,0.5 11,0.5 12,5 C13,9.5 15,9.5 16,5" {...sp}/></svg>
    case "tri":
      return <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden><path d="M0,5 L2,1 L6,9 L10,1 L14,9 L16,5" {...sp}/></svg>
    case "saw":
      return <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden><path d="M0,9 L8,1 L8,9 L16,1" {...sp}/></svg>
    case "square":
      return <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden><path d="M0,2 L4,2 L4,8 L8,8 L8,2 L12,2 L12,8 L16,8" {...sp}/></svg>
    case "noise":
      return <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden><path d="M0,5 L1,2 L2,8 L3,3 L4,7 L5,1 L6,9 L7,4 L8,6 L9,2 L10,8 L11,3 L12,7 L13,5 L14,3 L15,6 L16,4" {...sp}/></svg>
    default:
      return null
  }
}

function WavetablePresetIcon({ preset, active }: { preset: WavePreset; active: boolean }) {
  const c = active ? "#fff" : "#7788bb"
  const sp = { fill: "none" as const, stroke: c, strokeWidth: 1.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

  switch (preset) {
    case "basic":
      return <svg width={18} height={11} viewBox="0 0 18 11" aria-hidden><path d="M0,6 C2,1 4,1 6,6 C8,11 10,11 12,6 C14,1 16,1 18,6" {...sp}/></svg>
    case "pwm":
      return <svg width={18} height={11} viewBox="0 0 18 11" aria-hidden><path d="M0,2 L5,2 L5,9 L8,9 L8,2 L10,2 L10,9 L14,9 L14,2 L15,2 L15,9 L18,9" {...sp}/></svg>
    case "formant":
      return <svg width={18} height={11} viewBox="0 0 18 11" aria-hidden><path d="M1,9 C2,2 4,2 5,9 M7,9 C8,1 11,1 12,9 M14,9 C15,4 17,4 18,9" {...sp}/></svg>
    case "digital":
      return <svg width={18} height={11} viewBox="0 0 18 11" aria-hidden><path d="M1,8 L3,8 L3,3 L5,3 L5,6 L7,6 L7,1 L9,1 L9,10 L11,10 L11,4 L13,4 L13,7 L15,7 L15,2 L17,2" {...sp}/></svg>
    case "vocal":
      return <svg width={18} height={11} viewBox="0 0 18 11" aria-hidden><ellipse cx="4" cy="5.5" rx="2.5" ry="4" {...sp}/><ellipse cx="10" cy="5.5" rx="1.5" ry="4" {...sp}/><ellipse cx="15" cy="5.5" rx="2" ry="2.8" {...sp}/></svg>
    default:
      return null
  }
}

function WavetableMiniDisplay({
  preset,
  frame,
  morph,
  scan,
  scanTime,
  onFrameChange,
}: {
  preset: WavePreset
  frame: number
  morph: number
  scan: boolean
  scanTime: number
  onFrameChange: (value: number) => void
}) {
  const normalized = Math.max(0, Math.min(1, frame / 255))
  const x = normalized * 120
  const morphAlpha = 0.18 + Math.max(0, Math.min(1, morph / 100)) * 0.42
  const scanDuration = `${Math.max(0.1, Math.min(10, scanTime))}s`

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)))
    onFrameChange(Math.round(next * 255))
  }

  const paths: Record<WavePreset, string[]> = {
    basic: [
      "M0,28 C10,5 20,5 30,28 C40,51 50,51 60,28 C70,5 80,5 90,28 C100,51 110,51 120,28",
      "M0,34 L15,14 L30,44 L45,14 L60,44 L75,14 L90,44 L105,14 L120,34",
      "M0,46 L40,10 L40,46 L80,10 L80,46 L120,10",
      "M0,13 L30,13 L30,43 L60,43 L60,13 L90,13 L90,43 L120,43",
    ],
    pwm: [
      "M0,13 L60,13 L60,43 L120,43",
      "M0,13 L45,13 L45,43 L120,43",
      "M0,13 L28,13 L28,43 L120,43",
      "M0,13 L14,13 L14,43 L120,43",
    ],
    formant: [
      "M0,43 C8,14 18,14 26,43 C35,6 48,6 58,43 C70,18 82,18 92,43 C100,28 111,28 120,43",
      "M0,44 C12,32 20,32 30,44 C40,10 55,10 66,44 C78,20 94,20 104,44 C110,34 116,34 120,44",
      "M0,44 C14,38 24,38 34,44 C45,24 60,24 72,44 C82,8 102,8 114,44 C116,40 118,40 120,44",
    ],
    digital: [
      "M0,30 L8,30 L8,12 L16,12 L16,44 L24,44 L24,22 L32,22 L32,8 L40,8 L40,48 L48,48 L48,30 L56,30 L56,16 L64,16 L64,40 L72,40 L72,10 L80,10 L80,46 L88,46 L88,25 L96,25 L96,38 L104,38 L104,14 L112,14 L112,30 L120,30",
      "M0,42 L12,8 L24,38 L36,16 L48,44 L60,5 L72,35 L84,20 L96,49 L108,10 L120,40",
      "M0,28 L20,28 L20,9 L24,9 L24,47 L42,47 L42,13 L46,13 L46,41 L70,41 L70,7 L74,7 L74,48 L100,48 L100,18 L104,18 L104,35 L120,35",
    ],
    vocal: [
      "M0,44 C10,20 20,20 30,44 C40,8 55,8 66,44 C78,26 88,26 98,44 C106,32 114,32 120,44",
      "M0,44 C8,32 16,32 24,44 C36,18 48,18 60,44 C74,10 92,10 104,44 C110,36 116,36 120,44",
      "M0,44 C12,34 22,34 34,44 C45,28 58,28 70,44 C80,12 100,12 114,44 C116,38 118,38 120,44",
    ],
  }

  return (
    <div
      className="panel-recessed"
      role="slider"
      aria-label="Wavetable frame"
      aria-valuemin={0}
      aria-valuemax={255}
      aria-valuenow={Math.round(frame)}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); handlePointer(event) }}
      onPointerMove={(event) => { if (event.buttons === 1) handlePointer(event) }}
      style={{ minHeight: 0, position: "relative", overflow: "hidden", borderRadius: 3, cursor: "ew-resize", touchAction: "none" }}
    >
      <svg width="100%" height="100%" viewBox="0 0 120 54" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="wtFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.42} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        {[12, 24, 36, 48].map((gy) => <line key={gy} x1="0" y1={gy} x2="120" y2={gy} stroke={`${ACCENT}18`} strokeWidth="0.7" />)}
        {paths[preset].map((d, i) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke={ACCENT}
            strokeWidth={i === 0 ? 1.6 : 1.0}
            opacity={i === 0 ? 0.88 : morphAlpha}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <rect x="0" y="0" width={x} height="54" fill="url(#wtFill)" opacity="0.65" />
        <line x1={x} y1="0" x2={x} y2="54" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {scan && (
          <line
            x1="0" y1="0" x2="0" y2="54"
            stroke="#9db4ff" strokeOpacity="0.9" strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            style={{ animation: `osc-wt-scan ${scanDuration} linear infinite` }}
          />
        )}
      </svg>
      <div style={{ position: "absolute", right: 4, bottom: 2, color: "#7788bb", fontSize: "clamp(5px,1.05cqmin,7px)", fontFamily: "var(--font-mono), monospace", pointerEvents: "none" }}>
        {Math.round(frame).toString().padStart(3, "0")}
      </div>
    </div>
  )
}

function FmConnectionPath({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const midY = (from.y + to.y) / 2
  return (
    <path
      d={`M${from.x},${from.y + 4} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y - 4}`}
      fill="none"
      stroke={ACCENT}
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeDasharray="3 3"
      opacity="0.68"
      vectorEffect="non-scaling-stroke"
      style={{ animation: "osc-fm-flow 0.9s linear infinite" }}
    />
  )
}

function FmAlgorithmIcon({ algorithm, active }: { algorithm: FmAlgorithm; active: boolean }) {
  const layout = FM_LAYOUTS[algorithm]
  const stroke = active ? "#fff" : "#7788bb"
  const fill = active ? "#fff" : "#7788bb"

  return (
    <svg width={20} height={14} viewBox="0 0 120 54" aria-hidden>
      {layout.connections.map(([from, to]) => {
        const a = layout.ops[from - 1]
        const b = layout.ops[to - 1]
        return <line key={`${from}-${to}`} x1={a.x} y1={a.y + 4} x2={b.x} y2={b.y - 4} stroke={stroke} strokeWidth="4" opacity="0.55" strokeLinecap="round" />
      })}
      {layout.carriers.map((op) => {
        const p = layout.ops[op - 1]
        return <line key={`c-${op}`} x1={p.x} y1={p.y + 5} x2={p.x} y2="52" stroke={stroke} strokeWidth="3" opacity="0.32" strokeLinecap="round" />
      })}
      {layout.ops.map((p, index) => {
        const op = index + 1
        const carrier = layout.carriers.includes(op)
        return <circle key={op} cx={p.x} cy={p.y} r={carrier ? 6 : 5} fill={carrier ? fill : "none"} stroke={stroke} strokeWidth="4" opacity={carrier ? 0.9 : 0.75} />
      })}
    </svg>
  )
}

function FmMiniAlgorithmDisplay({
  algorithm,
  selectedOp,
  opLevels,
  feedback,
  onSelectOp,
}: {
  algorithm: FmAlgorithm
  selectedOp: number
  opLevels: number[]
  feedback: number
  onSelectOp: (op: number) => void
}) {
  const layout = FM_LAYOUTS[algorithm]
  const feedbackOpacity = Math.max(0, Math.min(1, feedback / 100))

  return (
    <div className="panel-recessed" style={{ minHeight: 0, position: "relative", overflow: "hidden", borderRadius: 3 }}>
      <svg width="100%" height="100%" viewBox="0 0 120 54" preserveAspectRatio="xMidYMid meet" aria-label={`FM algorithm ${algorithm}`}>
        <line x1="10" y1="51" x2="110" y2="51" stroke={`${ACCENT}55`} strokeWidth="1.1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <text x="107" y="48" fill="#7788bb" fontSize="6" fontFamily="monospace" textAnchor="end">OUT</text>

        {layout.connections.map(([from, to]) => (
          <FmConnectionPath key={`${from}-${to}`} from={layout.ops[from - 1]} to={layout.ops[to - 1]} />
        ))}

        {layout.carriers.map((op) => {
          const p = layout.ops[op - 1]
          return (
            <g key={`carrier-${op}`}>
              <line x1={p.x} y1={p.y + 5} x2={p.x} y2="51" stroke={`${ACCENT}66`} strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <circle cx={p.x} cy="51" r="2" fill={ACCENT} opacity="0.9" />
            </g>
          )
        })}

        {feedbackOpacity > 0.01 && layout.ops.map((p, index) => (
          <path
            key={`fb-${index}`}
            d={`M${p.x + 6},${p.y - 2} C${p.x + 18},${p.y - 15} ${p.x - 18},${p.y - 15} ${p.x - 6},${p.y - 2}`}
            fill="none"
            stroke="#ff6b9a"
            strokeWidth="1.1"
            opacity={feedbackOpacity * 0.75}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
            style={{ animation: "osc-fm-flow 0.7s linear infinite" }}
          />
        ))}

        {layout.ops.map((p, index) => {
          const op = index + 1
          const carrier = layout.carriers.includes(op)
          const selected = selectedOp === op
          const level = Math.max(0.18, Math.min(1, (opLevels[index] ?? 75) / 100))
          return (
            <g key={op} onClick={() => onSelectOp(op)} style={{ cursor: "pointer" }}>
              <circle cx={p.x} cy={p.y} r={selected ? 8.5 : 7.2} fill={carrier ? ACCENT : "#12142a"} opacity={carrier ? 0.45 + level * 0.55 : 0.9} stroke={selected ? "#fff" : ACCENT} strokeWidth={selected ? 1.9 : 1.15} vectorEffect="non-scaling-stroke" />
              <circle cx={p.x} cy={p.y} r={3 + level * 2} fill={carrier ? "#fff" : ACCENT} opacity={carrier ? 0.85 : 0.75} />
              <text x={p.x} y={p.y + 1.5} fill={carrier ? "#11152f" : "#fff"} fontSize="5.5" fontFamily="monospace" fontWeight="700" textAnchor="middle">{op}</text>
              {carrier && <text x={p.x + 8.2} y={p.y - 5.4} fill="#fff" opacity="0.7" fontSize="4.4" fontFamily="monospace">C</text>}
            </g>
          )
        })}

        <text x="6" y="8" fill="#7788bb" fontSize="6" fontFamily="monospace">ALGO {algorithm}</text>
      </svg>
    </div>
  )
}

function GranularWindowIcon({ windowType, active }: { windowType: GranWindow; active: boolean }) {
  const stroke = active ? "#fff" : "#7788bb"
  const sp = { fill: "none" as const, stroke, strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  switch (windowType) {
    case "hann":
      return <svg width={18} height={10} viewBox="0 0 18 10" aria-hidden><path d="M1,9 C4,1 14,1 17,9" {...sp} /></svg>
    case "gauss":
      return <svg width={18} height={10} viewBox="0 0 18 10" aria-hidden><path d="M1,9 C4,9 5,1 9,1 C13,1 14,9 17,9" {...sp} /></svg>
    case "trapez":
      return <svg width={18} height={10} viewBox="0 0 18 10" aria-hidden><path d="M1,9 L5,2 L13,2 L17,9" {...sp} /></svg>
    case "rect":
      return <svg width={18} height={10} viewBox="0 0 18 10" aria-hidden><path d="M2,9 L2,2 L16,2 L16,9" {...sp} /></svg>
    default:
      return null
  }
}

function GranularMiniDisplay({
  size,
  density,
  position,
  spray,
  pitchRandom,
  windowType,
  onPositionChange,
}: {
  size: number
  density: number
  position: number
  spray: number
  pitchRandom: number
  windowType: GranWindow
  onPositionChange: (value: number) => void
}) {
  const pos = Math.max(0, Math.min(100, position)) / 100
  const dens = Math.max(0, Math.min(100, density)) / 100
  const spr = Math.max(0, Math.min(100, spray)) / 100
  const pitch = Math.max(0, Math.min(100, pitchRandom)) / 100
  const sizeNorm = Math.max(0, Math.min(1, (size - 10) / 490))
  const markerX = 8 + pos * 104
  const cloudWidth = 14 + sizeNorm * 24 + spr * 54
  const cloudHeight = 10 + pitch * 28
  const grainCount = Math.round(8 + dens * 24)

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const next = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)))
    onPositionChange(Math.round(next * 100))
  }

  const windowPath = {
    hann: "M0,48 C24,4 96,4 120,48",
    gauss: "M0,48 C24,48 34,6 60,6 C86,6 96,48 120,48",
    trapez: "M0,48 L32,14 L88,14 L120,48",
    rect: "M8,48 L8,14 L112,14 L112,48",
  }[windowType]

  return (
    <div
      className="panel-recessed"
      role="slider"
      aria-label="Granular source position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); handlePointer(event) }}
      onPointerMove={(event) => { if (event.buttons === 1) handlePointer(event) }}
      style={{ minHeight: 0, position: "relative", overflow: "hidden", borderRadius: 3, cursor: "ew-resize", touchAction: "none" }}
    >
      <svg width="100%" height="100%" viewBox="0 0 120 54" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", inset: 0 }}>
        {[12, 24, 36, 48].map((y) => <line key={y} x1="0" y1={y} x2="120" y2={y} stroke={`${ACCENT}13`} strokeWidth="0.8" />)}
        <path d="M0,30 C13,11 22,44 34,28 C45,13 54,39 65,27 C78,9 90,43 103,25 C111,15 116,35 120,27" fill="none" stroke={`${ACCENT}55`} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <rect x={markerX - cloudWidth / 2} y={27 - cloudHeight / 2} width={cloudWidth} height={cloudHeight} rx="4" fill={ACCENT} opacity={0.08 + spr * 0.12} />
        <path d={windowPath} fill="none" stroke={ACCENT} strokeWidth="1.1" opacity="0.52" vectorEffect="non-scaling-stroke" transform={`translate(${markerX - 60}, 0) scale(${Math.max(0.18, Math.min(0.55, cloudWidth / 120))}, 0.42)`} />
        {Array.from({ length: grainCount }).map((_, i) => {
          const u = ((i * 37) % 101) / 100
          const v = ((i * 53 + 17) % 101) / 100
          const gx = markerX + (u - 0.5) * cloudWidth
          const gy = 27 + (v - 0.5) * cloudHeight
          const r = 1.1 + ((i * 19) % 7) * 0.18 + sizeNorm * 1.0
          return (
            <circle
              key={i}
              cx={gx}
              cy={gy}
              r={r}
              fill={ACCENT}
              opacity={0.28 + dens * 0.52}
              style={{
                transformOrigin: `${gx}px ${gy}px`,
                animation: `osc-gran-dot ${0.9 + (i % 5) * 0.18}s ease-in-out ${((i * 0.11) % 0.8).toFixed(2)}s infinite alternate`,
              }}
            />
          )
        })}
        <line x1={markerX} y1="0" x2={markerX} y2="54" stroke="#fff" strokeOpacity="0.75" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ position: "absolute", left: 4, top: 2, color: "#7788bb", fontSize: "clamp(5px,1.05cqmin,7px)", fontFamily: "var(--font-mono), monospace", pointerEvents: "none" }}>
        {windowType.toUpperCase().slice(0, 3)}
      </div>
      <div style={{ position: "absolute", right: 4, bottom: 2, color: "#7788bb", fontSize: "clamp(5px,1.05cqmin,7px)", fontFamily: "var(--font-mono), monospace", pointerEvents: "none" }}>
        POS {Math.round(position)}
      </div>
    </div>
  )
}

// ── Vertical engine tab button ────────────────────────────────────────────
const EngineTab = memo(function EngineTab({
  type, active, onClick,
}: {
  type: OscEngineType; active: boolean; onClick: () => void
}) {
  return (
    <button
      title={ENGINE_LABELS[type]}
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: active
          ? `linear-gradient(160deg, ${ACCENT}cc 0%, ${ACCENT}88 100%)`
          : "rgba(255,255,255,0.04)",
        border: active
          ? `1px solid ${ACCENT}bb`
          : "1px solid rgba(255,255,255,0.08)",
        borderRight: active
          ? `2px solid #9db4ff`
          : "1px solid rgba(255,255,255,0.06)",
        borderRadius: 3,
        cursor: "pointer",
        padding: "1px 1px",
        boxShadow: active
          ? `inset 0 0 6px ${ACCENT}55, 0 0 5px ${ACCENT}44`
          : "none",
        transition: "background 0.14s, box-shadow 0.14s",
        minWidth: 0,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <EngineTabIcon type={type} active={active} />
    </button>
  )
})

// ── Main component ────────────────────────────────────────────────────────
export function OscillatorTileContent({ state, onChange }: OscillatorTileContentProps) {
  const wf         = state.vaWaveform ?? "saw"
  const engineType = state.engineType ?? "VA"
  const isVA       = engineType === "VA"
  const isWave     = engineType === "WAVE"
  const isFM       = engineType === "FM"
  const isGran     = engineType === "GRAN"
  const isModal    = engineType === "MODAL"
  const isAdd      = engineType === "ADD"
  const isSamp     = engineType === "SAMP"
  const wavePreset = state.wavePreset ?? "basic"
  const granWindow = state.granWindow ?? "hann"
  const modalBody = state.modalBody ?? "string"
  const samplerMode = state.sampMode ?? "loop"
  const fmAlgorithm = Math.max(1, Math.min(6, Math.round(state.fmAlgorithm ?? 1))) as FmAlgorithm
  const fmSelectedOp = Math.max(1, Math.min(4, Math.round(state.fmSelectedOp ?? 1)))
  const fmRatioKey = `fmOp${fmSelectedOp}Ratio` as keyof OscState
  const fmLevelKey = `fmOp${fmSelectedOp}Level` as keyof OscState
  const fmOpLevels = [state.fmOp1Level ?? 100, state.fmOp2Level ?? 75, state.fmOp3Level ?? 75, state.fmOp4Level ?? 75]

  const knobs = isVA
    ? [
        { label: "OCT",   value: (state.octave ?? 0) + 4, min: 1,    max: 8,    onChange: (v: number) => onChange({ octave: v - 4 }) },
        { label: "SEMI",  value: state.semitone ?? 0,      min: -12,  max: 12,   onChange: (v: number) => onChange({ semitone: v }) },
        { label: "LEVEL", value: state.level ?? 100,       min: 0,    max: 100,  onChange: (v: number) => onChange({ level: v }) },
        { label: "PW",    value: state.vaPulseWidth ?? 50, min: 0,    max: 100,  onChange: (v: number) => onChange({ vaPulseWidth: v }) },
        { label: "PWM",   value: state.vaPWM ?? 0,         min: 0,    max: 100,  onChange: (v: number) => onChange({ vaPWM: v }) },
        { label: "DRIFT", value: state.vaDrift ?? 0,       min: 0,    max: 100,  onChange: (v: number) => onChange({ vaDrift: v }) },
        { label: "WARM",  value: state.vaVintage ?? 0,     min: 0,    max: 100,  onChange: (v: number) => onChange({ vaVintage: v }) },
        { label: "BRITE", value: state.vaBright ?? 50,     min: 0,    max: 100,  onChange: (v: number) => onChange({ vaBright: v }) },
      ]
    : isWave
      ? [
          { label: "OCT",   value: (state.octave ?? 0) + 4,       min: 1,    max: 8,    onChange: (v: number) => onChange({ octave: v - 4 }) },
          { label: "SEMI",  value: state.semitone ?? 0,            min: -12,  max: 12,   onChange: (v: number) => onChange({ semitone: v }) },
          { label: "LEVEL", value: state.level ?? 100,             min: 0,    max: 100,  onChange: (v: number) => onChange({ level: v }) },
          { label: "FRM",   value: state.waveFrame ?? 0,           min: 0,    max: 255,  onChange: (v: number) => onChange({ waveFrame: v }) },
          { label: "MORPH", value: state.waveMorph ?? 0,           min: 0,    max: 100,  onChange: (v: number) => onChange({ waveMorph: v }) },
          { label: "TIME",  value: state.waveScanTime ?? 2.0,      min: 0.1,  max: 10,   onChange: (v: number) => onChange({ waveScanTime: v }) },
        ]
    : isFM
      ? [
          { label: "OCT",   value: (state.octave ?? 0) + 4,                   min: 1,   max: 8,   onChange: (v: number) => onChange({ octave: v - 4 }) },
          { label: "SEMI",  value: state.semitone ?? 0,                        min: -12, max: 12,  onChange: (v: number) => onChange({ semitone: v }) },
          { label: "LEVEL", value: state.level ?? 100,                         min: 0,   max: 100, onChange: (v: number) => onChange({ level: v }) },
          { label: `R${fmSelectedOp}`, value: (state[fmRatioKey] as number) ?? 1, min: 0.5, max: 16, onChange: (v: number) => onChange({ [fmRatioKey]: v } as Partial<OscState>) },
          { label: `L${fmSelectedOp}`, value: (state[fmLevelKey] as number) ?? 75, min: 0, max: 100, onChange: (v: number) => onChange({ [fmLevelKey]: v } as Partial<OscState>) },
          { label: "MOD",   value: state.fmModIndex ?? 100,                    min: 0,   max: 200, onChange: (v: number) => onChange({ fmModIndex: v }) },
          { label: "FDBK",  value: state.fmFeedback ?? 0,                      min: 0,   max: 100, onChange: (v: number) => onChange({ fmFeedback: v }) },
        ]
    : isGran
      ? [
          { label: "OCT",   value: (state.octave ?? 0) + 4, min: 1,   max: 8,   onChange: (v: number) => onChange({ octave: v - 4 }) },
          { label: "SEMI",  value: state.semitone ?? 0,      min: -12, max: 12,  onChange: (v: number) => onChange({ semitone: v }) },
          { label: "LEVEL", value: state.level ?? 100,       min: 0,   max: 100, onChange: (v: number) => onChange({ level: v }) },
          { label: "SIZE",  value: state.granSize ?? 80,     min: 10,  max: 500, onChange: (v: number) => onChange({ granSize: v }) },
          { label: "DENS",  value: state.granDensity ?? 40,  min: 1,   max: 100, onChange: (v: number) => onChange({ granDensity: v }) },
          { label: "POS",   value: state.granPosition ?? 50, min: 0,   max: 100, onChange: (v: number) => onChange({ granPosition: v }) },
          { label: "SPRY",  value: state.granSpray ?? 0,     min: 0,   max: 100, onChange: (v: number) => onChange({ granSpray: v }) },
          { label: "PCH",   value: state.granPitchRandom ?? 0, min: 0, max: 100, onChange: (v: number) => onChange({ granPitchRandom: v }) },
        ]
    : isModal
      ? [
          { label: "OCT",   value: (state.octave ?? 0) + 4, min: 1,   max: 8,   onChange: (v: number) => onChange({ octave: v - 4 }) },
          { label: "SEMI",  value: state.semitone ?? 0,      min: -12, max: 12,  onChange: (v: number) => onChange({ semitone: v }) },
          { label: "LEVEL", value: state.level ?? 100,       min: 0,   max: 100, onChange: (v: number) => onChange({ level: v }) },
          { label: "DECAY", value: state.modalDecay ?? 2,    min: 0.1, max: 10,  onChange: (v: number) => onChange({ modalDecay: v }) },
          { label: "BRITE", value: state.modalBrightness ?? 60, min: 0, max: 100, onChange: (v: number) => onChange({ modalBrightness: v }) },
          { label: "PAN",   value: state.pan ?? 0,           min: -100,max: 100, onChange: (v: number) => onChange({ pan: v }) },
        ]
    : isAdd
      ? [
          { label: "OCT",   value: (state.octave ?? 0) + 4, min: 1,   max: 8,   onChange: (v: number) => onChange({ octave: v - 4 }) },
          { label: "SEMI",  value: state.semitone ?? 0,      min: -12, max: 12,  onChange: (v: number) => onChange({ semitone: v }) },
          { label: "LEVEL", value: state.level ?? 100,       min: 0,   max: 100, onChange: (v: number) => onChange({ level: v }) },
          { label: "HARMS", value: state.addHarmonicCount ?? 16, min: 8, max: 128, onChange: (v: number) => onChange({ addHarmonicCount: Math.round(v) }) },
          { label: "MORPH", value: state.addMorph ?? 0,      min: 0,   max: 100, onChange: (v: number) => onChange({ addMorph: v }) },
          { label: "PAN",   value: state.pan ?? 0,           min: -100,max: 100, onChange: (v: number) => onChange({ pan: v }) },
        ]
    : isSamp
      ? [
          { label: "OCT",   value: (state.octave ?? 0) + 4, min: 1,   max: 8,   onChange: (v: number) => onChange({ octave: v - 4 }) },
          { label: "SEMI",  value: state.semitone ?? 0,      min: -12, max: 12,  onChange: (v: number) => onChange({ semitone: v }) },
          { label: "LEVEL", value: state.level ?? 100,       min: 0,   max: 100, onChange: (v: number) => onChange({ level: v }) },
          { label: "START", value: state.sampStart ?? 0,     min: 0,   max: 95,  onChange: (v: number) => onChange({ sampStart: Math.min(v, (state.sampEnd ?? 100) - 5) }) },
          { label: "END",   value: state.sampEnd ?? 100,     min: 5,   max: 100, onChange: (v: number) => onChange({ sampEnd: Math.max(v, (state.sampStart ?? 0) + 5) }) },
          { label: "PITCH", value: state.sampPitch ?? 0,     min: -24, max: 24,  onChange: (v: number) => onChange({ sampPitch: v }) },
        ]
    : [
        { label: "OCT",   value: (state.octave ?? 0) + 4, min: 1,   max: 8,   onChange: (v: number) => onChange({ octave: v - 4 }) },
        { label: "SEMI",  value: state.semitone ?? 0,      min: -12, max: 12,  onChange: (v: number) => onChange({ semitone: v }) },
        { label: "LEVEL", value: state.level ?? 100,       min: 0,   max: 100, onChange: (v: number) => onChange({ level: v }) },
        { label: "PAN",   value: state.pan ?? 0,           min: -100,max: 100, onChange: (v: number) => onChange({ pan: v }) },
        { label: "PHASE", value: state.phase ?? 0,         min: 0,   max: 360, onChange: (v: number) => onChange({ phase: v }) },
        { label: "STRO",  value: state.stereo ?? 0,        min: 0,   max: 100, onChange: (v: number) => onChange({ stereo: v }) },
      ]

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", overflow: "hidden",
      padding: 3, gap: 3, boxSizing: "border-box",
    }}>

      {/* ── LEFT: Vertical engine type tabs ───────────────────────────── */}
      <div style={{
        width: TAB_W, flexShrink: 0,
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        {ENGINE_TYPES.map((et) => (
          <EngineTab
            key={et}
            type={et}
            active={engineType === et}
            onClick={() => onChange({ engineType: et })}
          />
        ))}
      </div>

      {/* ── RIGHT: Controls + waveform + knobs ────────────────────────── */}
      <div style={{
        flex: 1, minWidth: 0,
        display: "grid",
        gridTemplateRows: (isVA || isWave || isFM || isGran || isModal || isAdd || isSamp) ? "auto auto minmax(0,1fr) auto" : "auto minmax(0,1fr) auto",
        gap: 3,
      }}>

        {/* Row 1 — VA: model/waveform | WAVE: wavetable presets | FM: algorithms | GRAN: windows | other: engine label */}
        {isVA ? (
          <div style={{ display: "flex", columnGap: 3, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {/* Model buttons */}
            {VA_MODELS.map(({ id, label }) => {
              const active = (state.vaModel ?? "circuit") === id
              return (
                <button key={id} onClick={() => onChange({ vaModel: id })} style={{
                  fontSize: "clamp(6px, 1.3cqmin, 8px)",
                  padding: "1px 3px", lineHeight: 1.5,
                  background: active ? ACCENT : "rgba(255,255,255,0.09)",
                  color: active ? "#fff" : "#7788bb",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.13)"}`,
                  borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono), monospace", letterSpacing: "0.05em",
                  transition: "background 0.12s",
                }}>
                  {label}
                </button>
              )
            })}
            <div style={{ width: 1, height: 10, background: "rgba(255,255,255,0.12)", flexShrink: 0 }} />
            {/* Waveform SVG icon buttons */}
            {VA_WAVEFORMS.map((w) => {
              const active = wf === w
              return (
                <button key={w} title={w} onClick={() => onChange({ vaWaveform: w })} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "1px 3px",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  boxShadow: active ? `0 0 4px ${ACCENT}44` : "none",
                  transition: "background 0.12s, border-color 0.12s",
                }}>
                  <WaveformSvgIcon wf={w} active={active} />
                </button>
              )
            })}
          </div>
        ) : isWave ? (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {WAVE_PRESETS.map(({ id, title }) => {
              const active = wavePreset === id
              return (
                <button key={id} title={title} onClick={() => onChange({ wavePreset: id })} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minWidth: 25, height: 16, padding: "1px 3px",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  boxShadow: active ? `0 0 4px ${ACCENT}44` : "none",
                  transition: "background 0.12s, border-color 0.12s",
                }}>
                  <WavetablePresetIcon preset={id} active={active} />
                </button>
              )
            })}
          </div>
        ) : isFM ? (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {FM_ALGOS.map((algo) => {
              const active = fmAlgorithm === algo
              return (
                <button key={algo} title={`FM Algorithm ${algo}`} onClick={() => onChange({ fmAlgorithm: algo })} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minWidth: 24, height: 16, padding: "1px 2px",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  boxShadow: active ? `0 0 4px ${ACCENT}44` : "none",
                  transition: "background 0.12s, border-color 0.12s",
                }}>
                  <FmAlgorithmIcon algorithm={algo} active={active} />
                </button>
              )
            })}
          </div>
        ) : isGran ? (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {GRAN_WINDOWS.map(({ id, title }) => {
              const active = granWindow === id
              return (
                <button key={id} title={title} onClick={() => onChange({ granWindow: id })} style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minWidth: 27, height: 16, padding: "1px 3px",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  boxShadow: active ? `0 0 4px ${ACCENT}44` : "none",
                  transition: "background 0.12s, border-color 0.12s",
                }}>
                  <GranularWindowIcon windowType={id} active={active} />
                </button>
              )
            })}
          </div>
        ) : isModal ? (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {MODAL_BODIES.map(({ id, label, title }) => {
              const active = modalBody === id
              return (
                <button key={id} title={title} onClick={() => onChange({ modalBody: id })} style={{
                  minWidth: 24, height: 16, padding: "1px 3px",
                  fontSize: "clamp(5px, 1.1cqmin, 7px)",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  color: active ? "#fff" : "#7788bb",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono), monospace",
                }}>{label}</button>
              )
            })}
          </div>
        ) : isAdd ? (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {[8, 16, 32, 64, 128].map((count) => {
              const active = (state.addHarmonicCount ?? 16) === count
              return (
                <button key={count} title={`${count} harmonics`} onClick={() => onChange({ addHarmonicCount: count })} style={{
                  minWidth: 24, height: 16, padding: "1px 3px",
                  fontSize: "clamp(5px, 1.1cqmin, 7px)",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  color: active ? "#fff" : "#7788bb",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono), monospace",
                }}>{count}</button>
              )
            })}
          </div>
        ) : isSamp ? (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {SAMPLER_MODES.map(({ id, label, title }) => {
              const active = samplerMode === id
              return (
                <button key={id} title={title} onClick={() => onChange({ sampMode: id })} style={{
                  minWidth: 24, height: 16, padding: "1px 3px",
                  fontSize: "clamp(5px, 1.1cqmin, 7px)",
                  background: active ? `${ACCENT}bb` : "rgba(255,255,255,0.07)",
                  color: active ? "#fff" : "#7788bb",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono), monospace",
                }}>{label}</button>
              )
            })}
          </div>
        ) : (
          <div style={{
            fontSize: "clamp(6px, 1.2cqmin, 8px)", color: "#4455aa",
            fontFamily: "var(--font-mono), monospace",
            letterSpacing: "0.08em", textTransform: "uppercase", alignSelf: "center",
          }}>
            {ENGINE_LABELS[engineType]}
          </div>
        )}

        {/* Row 2 (VA only) — Sub-osc mode + Hard Sync */}
        {isVA && (
          <div style={{ display: "flex", columnGap: 1, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {VA_SUBS.map(({ id, label }) => {
              const active = (state.vaSubOsc ?? "off") === id
              return (
                <button key={id} onClick={() => onChange({ vaSubOsc: id })} style={{
                  fontSize: "clamp(5px, 1.1cqmin, 7px)",
                  padding: "1px 3px", lineHeight: 1.5,
                  background: active ? `${ACCENT}cc` : "rgba(255,255,255,0.07)",
                  color: active ? "#fff" : "#7788bb",
                  border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.11)"}`,
                  borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono), monospace",
                  transition: "background 0.12s",
                }}>
                  {label}
                </button>
              )
            })}
            <button
              onClick={() => onChange({ vaSync: !(state.vaSync ?? false) })}
              style={{
                fontSize: "clamp(5px, 1.1cqmin, 7px)",
                padding: "1px 3px", lineHeight: 1.5,
                background: state.vaSync ? "#c0304a" : "rgba(255,255,255,0.07)",
                color: state.vaSync ? "#fff" : "#7788bb",
                border: `1px solid ${state.vaSync ? "#c0304a" : "rgba(255,255,255,0.11)"}`,
                borderRadius: 2, cursor: "pointer",
                fontFamily: "var(--font-mono), monospace",
                marginLeft: 3,
                transition: "background 0.12s",
              }}
            >
              SYNC
            </button>
          </div>
        )}
        {isWave && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", minWidth: 0 }}>
            <button
              onClick={() => onChange({ waveScan: !(state.waveScan ?? false) })}
              style={{
                fontSize: "clamp(5px, 1.1cqmin, 7px)",
                padding: "1px 4px", lineHeight: 1.5,
                background: state.waveScan ? ACCENT : "rgba(255,255,255,0.07)",
                color: state.waveScan ? "#fff" : "#7788bb",
                border: `1px solid ${state.waveScan ? ACCENT : "rgba(255,255,255,0.11)"}`,
                borderRadius: 2, cursor: "pointer",
                fontFamily: "var(--font-mono), monospace",
                transition: "background 0.12s",
              }}
            >
              SCAN
            </button>
            <div style={{
              flex: 1, minWidth: 0, height: 3, borderRadius: 999,
              background: "rgba(255,255,255,0.10)", overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.max(0, Math.min(100, ((state.waveFrame ?? 0) / 255) * 100))}%`,
                height: "100%", background: ACCENT,
                boxShadow: `0 0 5px ${ACCENT}`,
              }} />
            </div>
            <span style={{
              fontSize: "clamp(5px, 1.1cqmin, 7px)", color: "#7788bb",
              fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap",
            }}>
              {WAVE_PRESETS.find((p) => p.id === wavePreset)?.frames ?? 8}F
            </span>
          </div>
        )}
        {isFM && (
          <div style={{ display: "flex", columnGap: 2, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
            {[1, 2, 3, 4].map((op) => {
              const active = fmSelectedOp === op
              const carrier = FM_LAYOUTS[fmAlgorithm].carriers.includes(op)
              return (
                <button key={op} title={`Operator ${op}${carrier ? " carrier" : " modulator"}`} onClick={() => onChange({ fmSelectedOp: op })} style={{
                  fontSize: "clamp(5px, 1.1cqmin, 7px)",
                  padding: "1px 4px", lineHeight: 1.5,
                  background: active ? ACCENT : carrier ? "rgba(88,101,242,0.18)" : "rgba(255,255,255,0.07)",
                  color: active ? "#fff" : carrier ? "#aebcff" : "#7788bb",
                  border: `1px solid ${active ? ACCENT : carrier ? "rgba(88,101,242,0.35)" : "rgba(255,255,255,0.11)"}`,
                  borderRadius: 2, cursor: "pointer",
                  fontFamily: "var(--font-mono), monospace",
                  transition: "background 0.12s",
                }}>
                  {carrier ? "●" : "○"}{op}
                </button>
              )
            })}
            <div style={{ flex: 1, minWidth: 8 }} />
            <span style={{
              fontSize: "clamp(5px, 1.1cqmin, 7px)", color: "#7788bb",
              fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap",
            }}>
              OP{fmSelectedOp}
            </span>
          </div>
        )}
        {isGran && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", minWidth: 0 }}>
            <span style={{
              fontSize: "clamp(5px, 1.1cqmin, 7px)", color: "#7788bb",
              fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap",
            }}>
              CLOUD
            </span>
            <div style={{
              flex: 1, minWidth: 0, height: 3, borderRadius: 999,
              background: "rgba(255,255,255,0.10)", overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.max(0, Math.min(100, state.granDensity ?? 40))}%`,
                height: "100%", background: ACCENT,
                boxShadow: `0 0 5px ${ACCENT}`,
              }} />
            </div>
            <span style={{
              fontSize: "clamp(5px, 1.1cqmin, 7px)", color: "#7788bb",
              fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap",
            }}>
              {Math.round(state.granSize ?? 80)}MS
            </span>
          </div>
        )}
        {(isModal || isAdd || isSamp) && (
          <div style={{ display: "flex", gap: 3, alignItems: "center", minWidth: 0 }}>
            <span style={{
              fontSize: "clamp(5px, 1.1cqmin, 7px)", color: "#7788bb",
              fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap",
            }}>
              {isModal ? modalBody.toUpperCase() : isAdd ? `${Math.round(state.addHarmonicCount ?? 16)}H` : samplerMode.toUpperCase()}
            </span>
            <div style={{
              flex: 1, minWidth: 0, height: 3, borderRadius: 999,
              background: "rgba(255,255,255,0.10)", overflow: "hidden",
            }}>
              <div style={{
                width: `${isModal ? Math.max(0, Math.min(100, state.modalBrightness ?? 60)) : isAdd ? Math.max(0, Math.min(100, state.addMorph ?? 0)) : Math.max(0, Math.min(100, state.sampEnd ?? 100))}%`,
                height: "100%", background: ACCENT,
                boxShadow: `0 0 5px ${ACCENT}`,
              }} />
            </div>
          </div>
        )}

        {/* Row 3 — Display: wavetable scrubber, FM topology, granular cloud, or live waveform */}
        {isWave ? (
          <WavetableMiniDisplay
            preset={wavePreset}
            frame={state.waveFrame ?? 0}
            morph={state.waveMorph ?? 0}
            scan={state.waveScan ?? false}
            scanTime={state.waveScanTime ?? 2.0}
            onFrameChange={(value) => onChange({ waveFrame: value })}
          />
        ) : isFM ? (
          <FmMiniAlgorithmDisplay
            algorithm={fmAlgorithm}
            selectedOp={fmSelectedOp}
            opLevels={fmOpLevels}
            feedback={state.fmFeedback ?? 0}
            onSelectOp={(op) => onChange({ fmSelectedOp: op })}
          />
        ) : isGran ? (
          <GranularMiniDisplay
            size={state.granSize ?? 80}
            density={state.granDensity ?? 40}
            position={state.granPosition ?? 50}
            spray={state.granSpray ?? 0}
            pitchRandom={state.granPitchRandom ?? 0}
            windowType={granWindow}
            onPositionChange={(value) => onChange({ granPosition: value })}
          />
        ) : (
          <div className="panel-recessed" style={{
            minHeight: 0, position: "relative", overflow: "hidden", borderRadius: 3,
          }}>
            <LiveWaveform
              waveform={wf}
              pulseWidth={state.vaPulseWidth ?? 50}
              cycles={2}
              accent={ACCENT}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            />
          </div>
        )}

        {/* Row 4 — Knob row */}
        <div
          className="v2-mini-knob-row"
          style={{ gridTemplateColumns: `repeat(${knobs.length}, minmax(0, 1fr))` }}
        >
          {knobs.map((k) => (
            <div key={k.label} className="v2-knob-cell">
              <Knob
                value={k.value} min={k.min} max={k.max}
                size="micro" accentColor={ACCENT}
                onChange={k.onChange}
              />
              <span>{k.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
