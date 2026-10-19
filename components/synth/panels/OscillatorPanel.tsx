"use client"

import { useState } from "react"
import { Knob } from "../Knob"
import { ToggleButton } from "../ToggleButton"
import { WavetableTerrainDisplay } from "../WavetableTerrainDisplay"
import { FmAlgorithmDisplay } from "../FmAlgorithmDisplay"
import { ProfessionalEngineDisplay } from "../ProfessionalEngineDisplay"
import { VAVintagePanel } from "./VAVintagePanel"

interface OscillatorEngineState {
  engineType: "VA" | "WAVE" | "FM" | "GRAN" | "MODAL" | "ADD" | "SAMP"
  // Core params
  octave: number
  semitone: number
  cent: number
  level: number
  pan: number
  phase: number
  randPhase: boolean
  stereo: number
  // VA
  vaWaveform: "sine" | "tri" | "saw" | "square" | "noise"
  vaPulseWidth: number
  vaPWM: number
  vaSync: boolean
  vaModel: "blep" | "tpt" | "circuit"
  vaSyncMode: "dft" | "vin" | "brt"
  vaDrift: number
  vaVintage: number
  vaBright: number
  vaSubOsc: "off" | "sub1sin" | "sub1sq" | "sub2sin"
  vaSubLevel: number
  // WAVE
  waveFrame: number
  waveMorph: number
  waveScan: boolean
  waveScanTime: number
  wavePreset: "basic" | "pwm" | "formant" | "digital" | "vocal"
  // FM
  fmAlgorithm: number
  fmSelectedOp: number
  fmOp1Ratio: number
  fmOp1Level: number
  fmOp2Ratio: number
  fmOp2Level: number
  fmOp3Ratio: number
  fmOp3Level: number
  fmOp4Ratio: number
  fmOp4Level: number
  fmModIndex: number
  fmFeedback: number
  // GRAN
  granSize: number
  granDensity: number
  granPosition: number
  granSpray: number
  granPitchRandom: number
  granWindow: "hann" | "gauss" | "trapez" | "rect"
  // MODAL
  modalBody: "string" | "bar" | "membrane" | "plate" | "tube" | "bell"
  modalDecay: number
  modalBrightness: number
  // ADD
  addHarmonicCount: number
  addMorph: number
  // SAMP
  sampFile: string
  sampMode: "oneshot" | "loop" | "pingpong" | "susloop"
  sampStart: number
  sampEnd: number
  sampPitch: number
  // Unison
  unisonVoices: number
  unisonDetune: number
  unisonSpread: number
  unisonBlend: number
  unisonPhaseMode: "zero" | "random" | "free"
}

interface OscillatorPanelProps {
  oscNumber: number
  state: Partial<OscillatorEngineState>
  onStateChange: (newState: Partial<OscillatorEngineState>) => void
}

const ENGINE_TYPES: OscillatorEngineState["engineType"][] = ["VA", "WAVE", "FM", "GRAN", "MODAL", "ADD", "SAMP"]
const ACCENT_COLOR = "#5865f2"

const WAVEFORM_NAMES: Record<string, string> = {
  sine: "SINE",
  tri: "TRIANGLE",
  saw: "SAWTOOTH",
  square: "SQUARE",
  noise: "NOISE",
}

const VA_PANEL_ART = {
  url: "/assets/synth/va-oscillator-panel.png.png",
  width: 2532,
  height: 1664,
}

export function OscillatorPanel({ oscNumber, state, onStateChange }: OscillatorPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const engineType = (state.engineType || "VA") as OscillatorEngineState["engineType"]
  const isVAEngine = engineType === "VA"

  const formatSemi = (v: number) => `${Math.round(v)}`
  const formatCent = (v: number) => `${Math.round(v)}\u00a2`
  const formatPercent = (v: number) => `${Math.round(v)}%`
  const formatPan = (v: number) => {
    if (Math.abs(v) < 1) return "C"
    return v > 0 ? `R${Math.round(v)}` : `L${Math.round(Math.abs(v))}`
  }

  const octaveDisplay = 4 + (state.octave ?? 0)
  const getEngineInfoText = () => {
    switch (engineType) {
      case "VA":
        return `OCT ${octaveDisplay}  |  ${WAVEFORM_NAMES[state.vaWaveform ?? "saw"]}  |  PHASE ${Math.round(state.phase ?? 0)}\u00b0`
      case "WAVE":
        return `OCT ${octaveDisplay}  |  FRAME ${Math.round(state.waveFrame ?? 0)}  |  ${(state.wavePreset ?? "basic").toUpperCase()}`
      case "FM":
        return `OCT ${octaveDisplay}  |  ALGO ${state.fmAlgorithm ?? 1}  |  OP${state.fmSelectedOp ?? 1}`
      case "GRAN":
        return `OCT ${octaveDisplay}  |  GRANULAR  |  ${(state.granWindow ?? "hann").toUpperCase()}`
      case "MODAL":
        return `OCT ${octaveDisplay}  |  ${(state.modalBody ?? "string").toUpperCase()}`
      case "ADD":
        return `OCT ${octaveDisplay}  |  ADDITIVE  |  ${state.addHarmonicCount ?? 16}H`
      case "SAMP":
        return `OCT ${octaveDisplay}  |  SAMPLER  |  ${(state.sampMode ?? "loop").toUpperCase()}`
    }
  }

  const panelStyle = isVAEngine
    ? {
        backgroundColor: "#18130f",
        backgroundImage: `url("${VA_PANEL_ART.url}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "top left",
        backgroundSize: `${VA_PANEL_ART.width}px ${VA_PANEL_ART.height}px`,
      }
    : {
        background: "linear-gradient(145deg, #e8eaef 0%, #dde0e7 100%)",
      }

  const headerFill = isVAEngine
    ? "rgba(42, 35, 29, 0.18)"
    : "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)"

  const sideRailFill = isVAEngine ? "rgba(28, 22, 18, 0.12)" : "rgba(0,0,0,0.05)"
  const infoFill = isVAEngine ? "rgba(18, 14, 10, 0.2)" : "rgba(0,0,0,0.06)"
  const sectionFill = isVAEngine ? "rgba(18, 14, 10, 0.2)" : "rgba(0,0,0,0.1)"
  const cardFill = isVAEngine ? "rgba(18, 14, 10, 0.14)" : "rgba(0,0,0,0.05)"

  return (
    <div className="flex flex-col h-full overflow-hidden panel-raised" style={panelStyle}>
      {/* ═══ HEADER ═══ */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: headerFill,
          borderBottom: "1px solid var(--panel-shadow)",
          flexShrink: 0,
        }}
      >
        <span className="font-mono font-bold" style={{ fontSize: 11, letterSpacing: "1.5px", color: "#e0e4f0" }}>
          OSC {oscNumber}
        </span>
        <div className="flex gap-px">
          {ENGINE_TYPES.map((type) => (
            <ToggleButton
              key={type}
              label={type}
              active={engineType === type}
              accentColor={ACCENT_COLOR}
              onClick={() => onStateChange({ engineType: type })}
            />
          ))}
        </div>
        <span className="font-mono" style={{ fontSize: 8, color: "#10b981", letterSpacing: "0.5px" }}>{"\u05de\u05ea\u05d7\u05d9\u05dc"}</span>
      </div>

      {/* ═══ VA ENGINE: Vintage Panel ═══ */}
      {isVAEngine ? (
        <VAVintagePanel oscNumber={oscNumber} state={state} onStateChange={onStateChange} />
      ) : (
      <>
      {/* ═══ MAIN BODY: 3-column ═══ */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>

        {/* LEFT COLUMN: OCTAVE + engine-specific selector */}
        <div
          className="flex flex-col items-center gap-1 py-2 px-1 overflow-y-auto overflow-x-hidden"
          style={{ width: 46, flexShrink: 0, minHeight: 0, background: sideRailFill }}
        >
          <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>
            OCTAVE
          </span>
          {[2, 1, 0, -1, -2].map((v) => (
            <ToggleButton
              key={v}
              label={v > 0 ? `+${v}` : `${v}`}
              active={(state.octave ?? 0) === v}
              accentColor={ACCENT_COLOR}
              onClick={() => onStateChange({ octave: v })}
            />
          ))}

          <div style={{ width: "65%", height: 1, background: "var(--panel-shadow)", flexShrink: 0, margin: "4px 0" }} />

          {/* FM: algorithm selector */}
          {engineType === "FM" && (
            <>
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>ALGO</span>
              {[1, 2, 3, 4, 5, 6].map((a) => (
                <ToggleButton key={a} label={String(a)} active={(state.fmAlgorithm ?? 1) === a} accentColor={ACCENT_COLOR} onClick={() => onStateChange({ fmAlgorithm: a })} />
              ))}
            </>
          )}

          {/* WAVE: table preset selector */}
          {engineType === "WAVE" && (
            <>
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>TABLE</span>
              {([["BSC", "basic"], ["PWM", "pwm"], ["FRM", "formant"], ["DIG", "digital"], ["VOC", "vocal"]] as [string, string][]).map(([label, value]) => (
                <ToggleButton
                  key={value}
                  label={label}
                  active={(state.wavePreset ?? "basic") === value}
                  accentColor={ACCENT_COLOR}
                  onClick={() => onStateChange({ wavePreset: value as OscillatorEngineState["wavePreset"] })}
                />
              ))}
            </>
          )}

          {/* GRAN: window selector */}
          {engineType === "GRAN" && (
            <>
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>WIN</span>
              {([["HAN", "hann"], ["GAU", "gauss"], ["TRP", "trapez"], ["REC", "rect"]] as [string, string][]).map(([label, value]) => (
                <ToggleButton
                  key={value}
                  label={label}
                  active={(state.granWindow ?? "hann") === value}
                  accentColor={ACCENT_COLOR}
                  onClick={() => onStateChange({ granWindow: value as OscillatorEngineState["granWindow"] })}
                />
              ))}
            </>
          )}

          {/* MODAL: body selector */}
          {engineType === "MODAL" && (
            <>
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>BODY</span>
              {([["STR", "string"], ["BAR", "bar"], ["MEM", "membrane"], ["PLT", "plate"], ["TUB", "tube"], ["BEL", "bell"]] as [string, string][]).map(([label, value]) => (
                <ToggleButton
                  key={value}
                  label={label}
                  active={(state.modalBody ?? "string") === value}
                  accentColor={ACCENT_COLOR}
                  onClick={() => onStateChange({ modalBody: value as OscillatorEngineState["modalBody"] })}
                />
              ))}
            </>
          )}
        </div>

        {/* CENTER COLUMN: Info bar + Engine display */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0, minHeight: 0 }}>
          {/* Info bar */}
          <div
            className="flex items-center justify-between px-3 py-1"
            style={{
              background: infoFill,
              borderBottom: "1px solid var(--panel-shadow)",
              flexShrink: 0,
            }}
          >
            <span className="font-mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "2px" }}>
              {getEngineInfoText()}
            </span>
            {/* RMS level indicator */}
            <div className="flex items-center gap-1.5">
              <div style={{
                width: 72,
                height: 10,
                background: "rgba(0,0,0,0.5)",
                borderRadius: 2,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(10, (state.level ?? 100) * 0.65))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #10b981, #22c55e)",
                  borderRadius: 1,
                }} />
              </div>
              <span className="font-mono font-bold" style={{ fontSize: 7, color: "#10b981", letterSpacing: "0.5px" }}>RMS</span>
            </div>
          </div>

          {/* Engine display */}
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            {engineType === "WAVE" && <EngineWAVE state={state} onStateChange={onStateChange} />}
            {engineType === "FM" && <EngineFM state={state} onStateChange={onStateChange} />}
            {engineType === "GRAN" && <EngineGRAN state={state} onStateChange={onStateChange} />}
            {engineType === "MODAL" && <EngineMODAL state={state} onStateChange={onStateChange} />}
            {engineType === "ADD" && <EngineADD state={state} onStateChange={onStateChange} />}
            {engineType === "SAMP" && <EngineSAMP state={state} onStateChange={onStateChange} />}
          </div>
        </div>

        {/* RIGHT COLUMN: Level / Pan / Stereo */}
        <div
          className="flex flex-col items-center justify-center gap-2 py-2 px-1"
          style={{ width: 56, flexShrink: 0, background: sideRailFill }}
        >
          <Knob
            value={state.level ?? 100}
            min={0}
            max={100}
            size="small"
            label="LEVEL"
            displayValue={formatPercent(state.level ?? 100)}
            accentColor={ACCENT_COLOR}
            onChange={(v) => onStateChange({ level: v })}
          />
          <Knob
            value={state.pan ?? 0}
            min={-100}
            max={100}
            size="small"
            label="PAN"
            displayValue={formatPan(state.pan ?? 0)}
            accentColor={ACCENT_COLOR}
            onChange={(v) => onStateChange({ pan: v })}
          />
          <Knob
            value={state.stereo ?? 0}
            min={0}
            max={100}
            size="small"
            label="STEREO"
            displayValue={formatPercent(state.stereo ?? 0)}
            accentColor={ACCENT_COLOR}
            onChange={(v) => onStateChange({ stereo: v })}
          />
        </div>
      </div>

      {/* ═══ EXPAND / COLLAPSE ARROW ═══ */}
      <div className="flex justify-center" style={{ flexShrink: 0, padding: "2px 0" }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "transform 0.2s ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 4.5L6 8.5L10 4.5"
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* ═══ EXPANDABLE BOTTOM SECTION ═══ */}
      {expanded && (
        <>
          {/* Params row: SEMI + CENT + PHASE + engine-specific */}
          <div
            className="flex items-center gap-3 px-3 py-1.5"
            style={{
              flexShrink: 0,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: sectionFill,
            }}
          >
            <Knob
              value={state.semitone ?? 0}
              min={-12}
              max={12}
              size="mini"
              label="SEMI"
              displayValue={formatSemi(state.semitone ?? 0)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ semitone: v })}
            />
            <Knob
              value={state.cent ?? 0}
              min={-100}
              max={100}
              size="mini"
              label="CENT"
              displayValue={formatCent(state.cent ?? 0)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ cent: v })}
            />
            <Knob
              value={state.phase ?? 0}
              min={0}
              max={360}
              size="mini"
              label="PHASE"
              displayValue={`${Math.round(state.phase ?? 0)}\u00b0`}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ phase: v })}
            />

            {/* Engine-specific params inline */}
            {engineType === "WAVE" && <EngineWAVEParams state={state} onStateChange={onStateChange} />}
            {engineType === "FM" && <EngineFMParams state={state} onStateChange={onStateChange} />}
            {engineType === "GRAN" && <EngineGRANParams state={state} onStateChange={onStateChange} />}
            {engineType === "MODAL" && <EngineMODALParams state={state} onStateChange={onStateChange} />}
            {engineType === "ADD" && <EngineADDParams state={state} onStateChange={onStateChange} />}
            {engineType === "SAMP" && <EngineSAMPParams state={state} onStateChange={onStateChange} />}
          </div>

          {/* Bottom split: UNISON */}
          <div className="flex gap-2 px-2 pb-2 pt-1" style={{ flexShrink: 0 }}>
            {/* UNISON */}
            <div
              style={{
                flex: 1,
                background: cardFill,
                border: "1px solid var(--panel-shadow)",
                borderRadius: 4,
                padding: "6px 10px",
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span className="font-mono uppercase font-bold" style={{ fontSize: 8, letterSpacing: "1.5px", color: "var(--text-section)" }}>
                  UNISON
                </span>
                <span className="font-mono" style={{ fontSize: 7, color: "rgba(255,255,255,0.3)" }}>{"\u05de\u05e7\u05e6\u05d5\u05e2\u05df"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-px">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                    <ToggleButton
                      key={v}
                      label={String(v)}
                      active={(state.unisonVoices ?? 1) === v}
                      accentColor={ACCENT_COLOR}
                      onClick={() => onStateChange({ unisonVoices: v })}
                    />
                  ))}
                </div>
                <Knob
                  value={state.unisonDetune ?? 0}
                  min={0}
                  max={100}
                  size="mini"
                  label="DET"
                  displayValue={formatCent(state.unisonDetune ?? 0)}
                  accentColor={ACCENT_COLOR}
                  onChange={(v) => onStateChange({ unisonDetune: v })}
                />
                <Knob
                  value={state.unisonSpread ?? 0}
                  min={0}
                  max={100}
                  size="mini"
                  label="SPRD"
                  displayValue={formatPercent(state.unisonSpread ?? 0)}
                  accentColor={ACCENT_COLOR}
                  onChange={(v) => onStateChange({ unisonSpread: v })}
                />
                <Knob
                  value={state.unisonBlend ?? 100}
                  min={0}
                  max={100}
                  size="mini"
                  label="BLND"
                  displayValue={formatPercent(state.unisonBlend ?? 100)}
                  accentColor={ACCENT_COLOR}
                  onChange={(v) => onStateChange({ unisonBlend: v })}
                />
                <div className="flex gap-px">
                  {(["ZERO", "RAND", "FREE"] as const).map((m) => (
                    <ToggleButton
                      key={m}
                      label={m}
                      active={(state.unisonPhaseMode ?? "random") === (m === "RAND" ? "random" : m.toLowerCase())}
                      accentColor={ACCENT_COLOR}
                      onClick={() => onStateChange({ unisonPhaseMode: (m === "RAND" ? "random" : m.toLowerCase()) as OscillatorEngineState["unisonPhaseMode"] })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ENGINE DISPLAY COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function EngineVA({ state }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <ProfessionalEngineDisplay
      mode="VA"
      accentColor={ACCENT_COLOR}
      vaWaveform={state.vaWaveform ?? "saw"}
      vaPulseWidth={state.vaPulseWidth ?? 50}
      vaBright={state.vaBright ?? 50}
      vaSubOsc={state.vaSubOsc ?? "off"}
      vaSubLevel={state.vaSubLevel ?? 0}
    />
  )
}

function EngineVAParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <>
      <Knob
        value={state.vaPulseWidth ?? 50}
        min={0}
        max={100}
        size="mini"
        label="PW"
        displayValue={`${Math.round(state.vaPulseWidth ?? 50)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ vaPulseWidth: v })}
      />
      <Knob
        value={state.vaPWM ?? 0}
        min={0}
        max={100}
        size="mini"
        label="PWM"
        displayValue={`${Math.round(state.vaPWM ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ vaPWM: v })}
      />
      <Knob
        value={state.vaDrift ?? 0}
        min={0}
        max={100}
        size="mini"
        label="DRIFT"
        displayValue={`${Math.round(state.vaDrift ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ vaDrift: v })}
      />
      <Knob
        value={state.vaVintage ?? 0}
        min={0}
        max={100}
        size="mini"
        label="WARM"
        displayValue={`${Math.round(state.vaVintage ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ vaVintage: v })}
      />
      <Knob
        value={state.vaBright ?? 50}
        min={0}
        max={100}
        size="mini"
        label="BRIGHT"
        displayValue={`${Math.round(state.vaBright ?? 50)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ vaBright: v })}
      />
      <div className="flex flex-col items-center gap-0.5" style={{ marginLeft: 6 }}>
        <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)" }}>SYNC</span>
        <div className="flex gap-px">
          {(["dft", "vin", "brt"] as const).map((m) => (
            <ToggleButton
              key={m}
              label={m.toUpperCase()}
              active={(state.vaSyncMode ?? "dft") === m}
              accentColor={ACCENT_COLOR}
              onClick={() => onStateChange({ vaSyncMode: m })}
            />
          ))}
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// WAVETABLE ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function EngineWAVE({ state }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  // Convert waveFrame (0..255) to a 0-based frame index for WavetableTerrainDisplay
  const frameIdx = Math.round(((state.waveFrame ?? 0) / 255) * 63)
  return (
    <WavetableTerrainDisplay
      framePosition={frameIdx}
      preset={state.wavePreset ?? "basic"}
      className="w-full h-full"
    />
  )
}

function EngineWAVEParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <>
      <Knob
        value={state.waveFrame ?? 0}
        min={0}
        max={255}
        size="mini"
        label="FRM"
        displayValue={String(Math.round(state.waveFrame ?? 0))}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ waveFrame: v })}
      />
      <Knob
        value={state.waveMorph ?? 0}
        min={0}
        max={100}
        size="mini"
        label="MORPH"
        displayValue={`${Math.round(state.waveMorph ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ waveMorph: v })}
      />
      <ToggleButton
        label="SCAN"
        active={state.waveScan ?? false}
        accentColor={ACCENT_COLOR}
        onClick={() => onStateChange({ waveScan: !state.waveScan })}
      />
      <Knob
        value={state.waveScanTime ?? 2.0}
        min={0.1}
        max={10}
        size="mini"
        label="TIME"
        displayValue={`${(state.waveScanTime ?? 2.0).toFixed(1)}s`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ waveScanTime: v })}
      />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FM ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function EngineFM({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  const algo = state.fmAlgorithm ?? 1
  const selOp = state.fmSelectedOp ?? 1
  return (
    <FmAlgorithmDisplay
      algorithm={algo}
      selectedOp={selOp}
      onSelectOp={(op) => onStateChange({ fmSelectedOp: op })}
      color={ACCENT_COLOR}
      height="100%"
    />
  )
}

function EngineFMParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  const selOp = state.fmSelectedOp ?? 1
  const ratioKey = `fmOp${selOp}Ratio` as keyof OscillatorEngineState
  const levelKey = `fmOp${selOp}Level` as keyof OscillatorEngineState
  const ratio = (state[ratioKey] as number) ?? 1.0
  const level = (state[levelKey] as number) ?? 100
  return (
    <>
      <Knob
        value={ratio}
        min={0.5}
        max={16}
        step={0.5}
        size="mini"
        label="RATIO"
        displayValue={ratio.toFixed(1)}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ [ratioKey]: v })}
      />
      <Knob
        value={level}
        min={0}
        max={100}
        size="mini"
        label="LEVEL"
        displayValue={`${Math.round(level)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ [levelKey]: v })}
      />
          <div style={{ width: 1, height: 24, background: "var(--panel-shadow)", flexShrink: 0 }} />
      <Knob
        value={state.fmModIndex ?? 100}
        min={0}
        max={200}
        size="mini"
        label="MOD"
        displayValue={`${Math.round(state.fmModIndex ?? 100)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ fmModIndex: v })}
      />
      <Knob
        value={state.fmFeedback ?? 0}
        min={0}
        max={100}
        size="mini"
        label="FDBK"
        displayValue={`${Math.round(state.fmFeedback ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ fmFeedback: v })}
      />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GRANULAR ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function EngineGRAN({ state }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <ProfessionalEngineDisplay
      mode="GRAN"
      accentColor={ACCENT_COLOR}
      granSize={state.granSize ?? 80}
      granDensity={state.granDensity ?? 40}
      granPosition={state.granPosition ?? 50}
      granSpray={state.granSpray ?? 0}
      granPitchRandom={state.granPitchRandom ?? 0}
      granWindow={state.granWindow ?? "hann"}
    />
  )
}

function EngineGRANParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <>
      <Knob
        value={state.granSize ?? 80}
        min={10}
        max={500}
        size="mini"
        label="SZ"
        displayValue={`${Math.round(state.granSize ?? 80)}ms`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ granSize: v })}
      />
      <Knob
        value={state.granDensity ?? 40}
        min={1}
        max={100}
        size="mini"
        label="DNS"
        displayValue={`${Math.round(state.granDensity ?? 40)}/s`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ granDensity: v })}
      />
      <Knob
        value={state.granPosition ?? 50}
        min={0}
        max={100}
        size="mini"
        label="POS"
        displayValue={`${Math.round(state.granPosition ?? 50)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ granPosition: v })}
      />
      <Knob
        value={state.granSpray ?? 0}
        min={0}
        max={100}
        size="mini"
        label="SPRY"
        displayValue={`${Math.round(state.granSpray ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ granSpray: v })}
      />
      <Knob
        value={state.granPitchRandom ?? 0}
        min={0}
        max={100}
        size="mini"
        label="PCH"
        displayValue={`${Math.round(state.granPitchRandom ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ granPitchRandom: v })}
      />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function EngineMODAL({ state }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <ProfessionalEngineDisplay
      mode="MODAL"
      accentColor={ACCENT_COLOR}
      modalBody={state.modalBody ?? "string"}
      modalDecay={state.modalDecay ?? 2}
      modalBrightness={state.modalBrightness ?? 60}
    />
  )
}

function EngineMODALParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <>
      <Knob
        value={state.modalDecay ?? 2}
        min={0.1}
        max={10}
        size="mini"
        label="DECAY"
        displayValue={`${(state.modalDecay ?? 2).toFixed(1)}s`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ modalDecay: v })}
      />
      <Knob
        value={state.modalBrightness ?? 60}
        min={0}
        max={100}
        size="mini"
        label="BRT"
        displayValue={`${Math.round(state.modalBrightness ?? 60)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ modalBrightness: v })}
      />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ADDITIVE ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function EngineADD({ state }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <ProfessionalEngineDisplay
      mode="ADD"
      accentColor={ACCENT_COLOR}
      addHarmonicCount={state.addHarmonicCount ?? 16}
      addMorph={state.addMorph ?? 0}
    />
  )
}

function EngineADDParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <>
      <div className="flex gap-px">
        {[8, 16, 32, 64, 128].map((c) => (
          <ToggleButton
            key={c}
            label={String(c)}
            active={(state.addHarmonicCount ?? 16) === c}
            accentColor={ACCENT_COLOR}
            onClick={() => onStateChange({ addHarmonicCount: c })}
          />
        ))}
      </div>
      <Knob
        value={state.addMorph ?? 0}
        min={0}
        max={100}
        size="mini"
        label="MORPH"
        displayValue={`${Math.round(state.addMorph ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ addMorph: v })}
      />
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SAMPLER ENGINE
// ══════════════════════════════════════════════════════════════════════════════

function EngineSAMP({ state }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <ProfessionalEngineDisplay
      mode="SAMP"
      accentColor={ACCENT_COLOR}
      sampMode={state.sampMode ?? "loop"}
      sampStart={state.sampStart ?? 0}
      sampEnd={state.sampEnd ?? 100}
      sampPitch={state.sampPitch ?? 0}
    />
  )
}

function EngineSAMPParams({ state, onStateChange }: { state: Partial<OscillatorEngineState>; onStateChange: (s: Partial<OscillatorEngineState>) => void }) {
  return (
    <>
      <div className="flex gap-px">
        {(["oneshot", "loop", "pingpong", "susloop"] as const).map((m) => (
          <ToggleButton
            key={m}
            label={m}
            active={(state.sampMode ?? "loop") === m}
            accentColor={ACCENT_COLOR}
            onClick={() => onStateChange({ sampMode: m })}
          />
        ))}
      </div>
      <Knob
        value={state.sampStart ?? 0}
        min={0}
        max={95}
        size="mini"
        label="START"
        displayValue={`${Math.round(state.sampStart ?? 0)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ sampStart: Math.min(v, (state.sampEnd ?? 100) - 5) })}
      />
      <Knob
        value={state.sampEnd ?? 100}
        min={5}
        max={100}
        size="mini"
        label="END"
        displayValue={`${Math.round(state.sampEnd ?? 100)}%`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ sampEnd: Math.max(v, (state.sampStart ?? 0) + 5) })}
      />
      <Knob
        value={state.sampPitch ?? 0}
        min={-24}
        max={24}
        size="mini"
        label="PITCH"
        displayValue={`${Math.round(state.sampPitch ?? 0) >= 0 ? "+" : ""}${Math.round(state.sampPitch ?? 0)}`}
        accentColor={ACCENT_COLOR}
        onChange={(v) => onStateChange({ sampPitch: v })}
      />
    </>
  )
}
