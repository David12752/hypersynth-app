"use client"

import { useCallback, useRef, useState } from "react"
import { WavetableTerrainDisplay, type TerrainHandle } from "@/components/synth/WavetableTerrainDisplay"
import { WebGLWaveformDisplay } from "@/components/synth/WebGLWaveformDisplay"
import { PremiumKnob }         from "@/components/synth/PremiumKnob"

// =============================================================================
//  ProSynthLayout
//
//  Main professional synthesizer layout.
//
//  ┌──────────────────────────────────────────────────────────────────────────┐
//  │  Header bar — logo, preset name, transport, Hebrew branding             │
//  ├─────────────┬────────────────────────────────────────────┬──────────────┤
//  │  Left       │  Centre — 3D Wavetable Terrain (full flex) │  Right       │
//  │  Sidebar    │                                            │  Sidebar     │
//  │  • Octave   │  ─────────────────────────────────────── │  • Macro 1-4 │
//  │  • Table    │  WebGL Waveform scope (120 px)            │              │
//  │    Selector │                                            │              │
//  ├─────────────┴────────────────────────────────────────────┴──────────────┤
//  │  Bottom panel — Unison + Advanced parameters (8 knobs + labels)         │
//  └──────────────────────────────────────────────────────────────────────────┘
//
//  Design language:
//    • '#04040e' background  — near-black, deep space
//    • '#0b1232' panels      — dark navy for sidebar / bottom
//    • '#00d4ff' accent      — neon cyan for all active elements
//    • '#8899aa' muted text  — secondary labels
//    • Hebrew labels appear in the header and certain section headings
//      as product branding (Unicode — no RTL special handling needed here)
// =============================================================================

// ── Wavetable presets list ─────────────────────────────────────────────────────
const WAVETABLE_PRESETS = [
  { id: "basic",     label: "Basic",       heLabel: "בסיסי" },
  { id: "pwm_sweep", label: "PWM Sweep",   heLabel: "רוחב דופק" },
  { id: "formant",   label: "Formant",     heLabel: "פורמנט" },
  { id: "digital",   label: "Digital",     heLabel: "דיגיטלי" },
  { id: "vocal",     label: "Vocal",       heLabel: "קולי" },
] as const

type PresetId = (typeof WAVETABLE_PRESETS)[number]["id"]

// ── Octave range ───────────────────────────────────────────────────────────────
const OCTAVE_LABELS = ["-4", "-3", "-2", "-1", "0", "+1", "+2", "+3", "+4"]

// ── Unison / Advanced parameter state ─────────────────────────────────────────
interface SynthParams {
  // Unison
  unisonVoices:  number   // 1..16
  unisonDetune:  number   // 0..100 cents
  unisonSpread:  number   // 0..100%
  unisonWidth:   number   // 0..100%
  // Advanced oscillator
  pbRange:       number   // 0..24 semitones
  fineTune:      number   // -100..100 cents
  phaseReset:    number   // 0 = free, 1 = always, mapped to 0..100 toggle
  unisonBlend:   number   // 0..100%
}

const DEFAULT_PARAMS: SynthParams = {
  unisonVoices: 3,
  unisonDetune: 18,
  unisonSpread: 65,
  unisonWidth:  85,
  pbRange:      2,
  fineTune:     0,
  phaseReset:   0,
  unisonBlend:  70,
}

// =============================================================================
//  Sub-components
// =============================================================================

// ── Header ─────────────────────────────────────────────────────────────────────
function Header({
  presetName,
  onPresetNameChange,
}: {
  presetName: string
  onPresetNameChange: (name: string) => void
}) {
  return (
    <header
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 16px",
        height:         44,
        background:     "linear-gradient(180deg, #0e1440 0%, #06091e 100%)",
        borderBottom:   "1px solid #1c2050",
        flexShrink:     0,
      }}
    >
      {/* Back button + logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <a
          href="/"
          title="חזור למסך הראשי"
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            width:          28,
            height:         28,
            borderRadius:   4,
            background:     "rgba(0,212,255,0.08)",
            border:         "1px solid rgba(0,212,255,0.25)",
            color:          "#00d4ff",
            fontSize:       13,
            textDecoration: "none",
            flexShrink:     0,
          }}
        >
          ←
        </a>
        <span
          style={{
            fontSize:      18,
            fontWeight:    900,
            letterSpacing: "0.14em",
            color:         "#00d4ff",
            textTransform: "uppercase",
            fontFamily:    "system-ui, sans-serif",
          }}
        >
          HYPERSYNTH
        </span>
        {/* Hebrew sub-brand — "מתקדם" = Advanced */}
        <span
          style={{
            fontSize:   10,
            color:      "#3355aa",
            letterSpacing: "0.05em",
            marginTop:  2,
          }}
        >
          מתקדם
        </span>
      </div>

      {/* Editable preset name */}
      <input
        value={presetName}
        onChange={e => onPresetNameChange(e.target.value)}
        style={{
          background:  "rgba(0,212,255,0.06)",
          border:      "1px solid rgba(0,212,255,0.22)",
          borderRadius: 5,
          color:       "#cce8ff",
          fontSize:    12,
          fontWeight:  600,
          padding:     "3px 10px",
          textAlign:   "center",
          outline:     "none",
          width:       200,
          letterSpacing: "0.06em",
        }}
      />

      {/* Transport / status indicators */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {/* "מקצועי" = Professional */}
        <span style={{ fontSize: 9, color: "#44aacc", letterSpacing: "0.08em" }}>
          מקצועי
        </span>
        <Pip color="#00d4ff" label="OSC" />
        <Pip color="#a855f7" label="ENV" />
        <Pip color="#f59e0b" label="LFO" />
      </div>
    </header>
  )
}

function Pip({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div
        style={{
          width:        7,
          height:       7,
          borderRadius: "50%",
          background:   color,
          boxShadow:    `0 0 5px ${color}`,
        }}
      />
      <span style={{ fontSize: 9, color: "#4466aa", letterSpacing: "0.06em" }}>
        {label}
      </span>
    </div>
  )
}

// ── Left sidebar ────────────────────────────────────────────────────────────────
function LeftSidebar({
  octave,
  onOctaveChange,
  selectedPreset,
  onPresetChange,
  framePosition,
  frameCount,
  onFrameChange,
}: {
  octave:          number        // 0-8 index into OCTAVE_LABELS
  onOctaveChange:  (idx: number) => void
  selectedPreset:  PresetId
  onPresetChange:  (id: PresetId) => void
  framePosition:   number
  frameCount:      number
  onFrameChange:   (pos: number) => void
}) {
  return (
    <aside
      style={{
        width:      120,
        flexShrink: 0,
        background: "#070a1c",
        borderRight:"1px solid #111830",
        display:    "flex",
        flexDirection: "column",
        gap:        0,
        overflowY:  "auto",
      }}
    >
      {/* Section: Octave — "אוקטבה" */}
      <SideSection title="OCTAVE" heTitle="אוקטבה">
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}>
          {OCTAVE_LABELS.map((lbl, idx) => (
            <button
              key={idx}
              onClick={() => onOctaveChange(idx)}
              style={{
                background:  idx === octave ? "rgba(0,212,255,0.14)" : "transparent",
                border:      idx === octave ? "1px solid rgba(0,212,255,0.38)" : "1px solid transparent",
                borderRadius: 4,
                color:       idx === octave ? "#00d4ff" : "#556688",
                fontSize:    11,
                fontWeight:  idx === octave ? 700 : 400,
                padding:     "4px 0",
                cursor:      "pointer",
                textAlign:   "center",
                transition:  "all 0.12s",
                letterSpacing: "0.06em",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </SideSection>

      {/* Section: Wavetable — "גלית" */}
      <SideSection title="WAVE TABLE" heTitle="גלית">
        <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingBottom: 4 }}>
          {WAVETABLE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => onPresetChange(p.id)}
              style={{
                background:  p.id === selectedPreset ? "rgba(0,212,255,0.12)" : "transparent",
                border:      p.id === selectedPreset ? "1px solid rgba(0,212,255,0.35)" : "1px solid transparent",
                borderRadius: 4,
                color:       p.id === selectedPreset ? "#00d4ff" : "#445566",
                fontSize:    10,
                padding:     "5px 6px",
                cursor:      "pointer",
                textAlign:   "left",
                transition:  "all 0.12s",
                display:     "flex",
                flexDirection: "column",
                gap:         1,
              }}
            >
              <span style={{ fontWeight: p.id === selectedPreset ? 700 : 400, letterSpacing: "0.04em" }}>
                {p.label}
              </span>
              <span style={{ fontSize: 8, opacity: 0.6 }}>{p.heLabel}</span>
            </button>
          ))}
        </div>
      </SideSection>

      {/* Section: Frame scrub */}
      <SideSection title="FRAME" heTitle="מסגרת">
        <div style={{ padding: "4px 4px 8px" }}>
          <input
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            value={framePosition}
            onChange={e => onFrameChange(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#00d4ff" }}
          />
          <div style={{ textAlign: "center", fontSize: 10, color: "#00d4ff", marginTop: 3 }}>
            {framePosition + 1} / {frameCount || "–"}
          </div>
        </div>
      </SideSection>
    </aside>
  )
}

function SideSection({
  title, heTitle, children,
}: { title: string; heTitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          padding:      "8px 10px 4px",
          borderBottom: "1px solid #101830",
          display:      "flex",
          alignItems:   "center",
          gap:          6,
        }}
      >
        <span style={{ fontSize: 8, color: "#2244aa", letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>
          {title}
        </span>
        <span style={{ fontSize: 7, color: "#1a2255" }}>{heTitle}</span>
      </div>
      <div style={{ padding: "4px 8px" }}>{children}</div>
    </div>
  )
}

// ── Right sidebar — macro knobs ────────────────────────────────────────────────
function RightSidebar({
  macros,
  onMacroChange,
}: {
  macros:        [number, number, number, number]
  onMacroChange: (idx: number, v: number) => void
}) {
  const colors = ["#a3e635", "#34d399", "#fbbf24", "#f87171"] as const

  return (
    <aside
      style={{
        width:      80,
        flexShrink: 0,
        background: "#070a1c",
        borderLeft: "1px solid #111830",
        display:    "flex",
        flexDirection: "column",
        alignItems: "center",
        padding:    "14px 0",
        gap:        18,
      }}
    >
      <div style={{ fontSize: 8, color: "#1a2255", letterSpacing: "0.12em", fontWeight: 700, textTransform: "uppercase" }}>
        MACRO
      </div>
      {macros.map((v, i) => (
        <PremiumKnob
          key={i}
          value={v}
          min={0}
          max={100}
          step={0.5}
          defaultValue={0}
          size={44}
          label={`M${i + 1}`}
          unit="%"
          accentColor={colors[i]}
          onChange={nv => onMacroChange(i, nv)}
        />
      ))}
      {/* "מקרו" = Macro */}
      <span style={{ fontSize: 7, color: "#1a2255", marginTop: 4 }}>מקרו</span>
    </aside>
  )
}

// ── Bottom panel ───────────────────────────────────────────────────────────────
function BottomPanel({
  params,
  onParamChange,
}: {
  params:        SynthParams
  onParamChange: <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => void
}) {
  type Patch = {
    key:     keyof SynthParams
    label:   string
    heLabel: string
    min:     number
    max:     number
    step?:   number
    unit?:   string
  }

  const UNISON_KNOBS: Patch[] = [
    { key: "unisonVoices", label: "VOICES",  heLabel: "קולות",  min: 1,  max: 16, step: 1, unit: "" },
    { key: "unisonDetune", label: "DETUNE",  heLabel: "חריגה",  min: 0,  max: 100, unit: "¢" },
    { key: "unisonSpread", label: "SPREAD",  heLabel: "פיזור",  min: 0,  max: 100, unit: "%" },
    { key: "unisonWidth",  label: "WIDTH",   heLabel: "רוחב",   min: 0,  max: 100, unit: "%" },
  ]

  const ADVANCED_KNOBS: Patch[] = [
    { key: "pbRange",    label: "PB RANGE",  heLabel: "טווח PB",  min: 0,  max: 24, step: 1, unit: "st" },
    { key: "fineTune",   label: "FINE",      heLabel: "עדין",     min: -100, max: 100, unit: "¢" },
    { key: "phaseReset", label: "PH RESET",  heLabel: "קבוע פאזה", min: 0, max: 100, step: 100, unit: "" },
    { key: "unisonBlend",label: "BLEND",     heLabel: "ערבוב",    min: 0,  max: 100, unit: "%" },
  ]

  return (
    <footer
      style={{
        height:       96,
        flexShrink:   0,
        background:   "#06091b",
        borderTop:    "1px solid #111830",
        display:      "flex",
        alignItems:   "stretch",
        gap:          0,
        overflow:     "hidden",
      }}
    >
      {/* Unison section — "אוניסון" */}
      <BottomSection label="UNISON" heLabel="אוניסון">
        {UNISON_KNOBS.map(k => (
          <PremiumKnob
            key={k.key}
            value={params[k.key] as number}
            min={k.min}
            max={k.max}
            step={k.step}
            defaultValue={DEFAULT_PARAMS[k.key] as number}
            size={44}
            label={k.label}
            unit={k.unit}
            accentColor="#00d4ff"
            onChange={v => onParamChange(k.key, v)}
          />
        ))}
      </BottomSection>

      <div style={{ width: 1, background: "#111830", flexShrink: 0 }} />

      {/* Advanced section — "מתקדם" */}
      <BottomSection label="ADVANCED" heLabel="מתקדם">
        {ADVANCED_KNOBS.map(k => (
          <PremiumKnob
            key={k.key}
            value={params[k.key] as number}
            min={k.min}
            max={k.max}
            step={k.step}
            defaultValue={DEFAULT_PARAMS[k.key] as number}
            size={44}
            label={k.label}
            unit={k.unit}
            accentColor="#5865f2"
            onChange={v => onParamChange(k.key, v)}
          />
        ))}
      </BottomSection>
    </footer>
  )
}

function BottomSection({
  label, heLabel, children,
}: { label: string; heLabel: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        padding:       "6px 16px 0",
        flex:          1,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontSize: 8, color: "#1e2a66", letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontSize: 7, color: "#151d44" }}>{heLabel}</span>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {children}
      </div>
    </div>
  )
}

// =============================================================================
//  ProSynthLayout — root export
// =============================================================================
export function ProSynthLayout() {
  // ── UI state ────────────────────────────────────────────────────────────────
  const [presetName,     setPresetName]     = useState("Init Patch 001")
  const [octave,         setOctave]         = useState(4)   // index 4 = "0"
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("basic")
  const [framePosition,  setFramePosition]  = useState(0)
  const [frameCount]     = useState(64)
  const [macros,         setMacros]         = useState<[number, number, number, number]>([0, 0, 0, 0])
  const [params,         setParams]         = useState<SynthParams>({ ...DEFAULT_PARAMS })

  const terrainRef = useRef<TerrainHandle>(null)

  // Sync frame position to terrain
  const handleFrameChange = useCallback((pos: number) => {
    setFramePosition(pos)
    terrainRef.current?.setFramePosition(pos)
  }, [])

  const handleMacroChange = useCallback((idx: number, v: number) => {
    setMacros(prev => {
      const next = [...prev] as [number, number, number, number]
      next[idx] = v
      return next
    })
  }, [])

  const handleParamChange = useCallback(
    <K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
      setParams(prev => ({ ...prev, [key]: value }))
    },
    [],
  )

  return (
    <div
      style={{
        width:         "100%",
        height:        "100vh",
        background:    "#04040e",
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        fontFamily:    "system-ui, -apple-system, sans-serif",
        color:         "#c8d8e8",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Header presetName={presetName} onPresetNameChange={setPresetName} />

      {/* ── Main row ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left sidebar */}
        <LeftSidebar
          octave={octave}
          onOctaveChange={setOctave}
          selectedPreset={selectedPreset}
          onPresetChange={setSelectedPreset}
          framePosition={framePosition}
          frameCount={frameCount}
          onFrameChange={handleFrameChange}
        />

        {/* Centre — visualisers */}
        <main
          style={{
            flex:          1,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            gap:           0,
          }}
        >
          {/* 3D Wavetable terrain — takes all available height */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <WavetableTerrainDisplay
              ref={terrainRef}
              framePosition={framePosition}
              preset={selectedPreset}
              className="w-full h-full"
            />

            {/* Corner label — "גלגל הגלים" = Wave Wheel */}
            <span
              style={{
                position:     "absolute",
                top:          8,
                left:         10,
                fontSize:     9,
                color:        "rgba(0,212,255,0.4)",
                letterSpacing:"0.12em",
                pointerEvents:"none",
              }}
            >
              גלגל הגלים  ·  3D WAVETABLE
            </span>
          </div>

          {/* WebGL scope — fixed height strip */}
          <div
            style={{
              height:     120,
              flexShrink: 0,
              borderTop:  "1px solid #0e1428",
              position:   "relative",
            }}
          >
            <WebGLWaveformDisplay height={120} />

            {/* Corner label — "גלי קול" = Sound waves */}
            <span
              style={{
                position:     "absolute",
                top:          6,
                left:         10,
                fontSize:     9,
                color:        "rgba(0,212,255,0.35)",
                letterSpacing:"0.10em",
                pointerEvents:"none",
              }}
            >
              גלי קול  ·  SCOPE
            </span>
          </div>
        </main>

        {/* Right sidebar — macros */}
        <RightSidebar macros={macros} onMacroChange={handleMacroChange} />
      </div>

      {/* ── Bottom panel ───────────────────────────────────────────────────── */}
      <BottomPanel params={params} onParamChange={handleParamChange} />
    </div>
  )
}
