"use client"

import { useState } from "react"
import { Knob } from "../Knob"
import { ToggleButton } from "../ToggleButton"
import { ProfessionalEngineDisplay } from "../ProfessionalEngineDisplay"

const ACCENT_COLOR = "#5865f2"

interface VAState {
  octave?: number
  semitone?: number
  cent?: number
  level?: number
  pan?: number
  stereo?: number
  phase?: number
  randPhase?: boolean
  vaWaveform?: "sine" | "tri" | "saw" | "square" | "noise"
  vaPulseWidth?: number
  vaPWM?: number
  vaSync?: boolean
  vaModel?: "blep" | "tpt" | "circuit"
  vaSyncMode?: "dft" | "vin" | "brt"
  vaDrift?: number
  vaVintage?: number
  vaBright?: number
  vaSubOsc?: "off" | "sub1sin" | "sub1sq" | "sub2sin"
  vaSubLevel?: number
  unisonVoices?: number
  unisonDetune?: number
  unisonSpread?: number
  unisonBlend?: number
  unisonPhaseMode?: "zero" | "random" | "free"
}

interface VAVintagePanelProps {
  oscNumber: number
  state: VAState
  onStateChange: (s: VAState) => void
}

const WAVEFORMS = [
  { value: "sine", label: "SINE" },
  { value: "tri", label: "TRI" },
  { value: "saw", label: "SAW" },
  { value: "square", label: "SQ" },
  { value: "noise", label: "NOISE" },
] as const

const SUB_OSCS = [
  { value: "off", label: "OFF" },
  { value: "sub1sin", label: "-1 SIN" },
  { value: "sub1sq", label: "-1 SQ" },
  { value: "sub2sin", label: "-2 SIN" },
] as const

const VA_MODELS = [
  { value: "blep", label: "BLEP", title: "Clean polyBLEP VA" },
  { value: "tpt", label: "TPT", title: "Topology-preserving VCO" },
  { value: "circuit", label: "CIR", title: "Physical capacitor/comparator circuit" },
] as const

const cardStyle = {
  background: "rgba(18, 14, 10, 0.22)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 4,
  padding: "6px 10px",
}

function SectionLabel({ children }: { children: string }) {
  return (
    <span
      className="font-mono uppercase"
      style={{ fontSize: 8, letterSpacing: "1.1px", color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 5 }}
    >
      {children}
    </span>
  )
}

export function VAVintagePanel({ oscNumber, state, onStateChange }: VAVintagePanelProps) {
  const [expanded, setExpanded] = useState(true)

  const waveform = state.vaWaveform ?? "saw"
  const subOsc = state.vaSubOsc ?? "off"

  const formatPercent = (v: number) => `${Math.round(v)}%`
  const formatCent = (v: number) => `${Math.round(v)}\u00a2`
  const formatSemi = (v: number) => `${Math.round(v)}`
  const formatPan = (v: number) => {
    if (Math.abs(v) < 1) return "C"
    return v > 0 ? `R${Math.round(v)}` : `L${Math.round(Math.abs(v))}`
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>

      {/* ── MAIN BODY ── */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>

        {/* LEFT RAIL: Octave */}
        <div
          className="flex flex-col items-center gap-1 py-2 px-1 overflow-y-auto overflow-x-hidden"
          style={{ width: 46, flexShrink: 0, minHeight: 0, background: "rgba(28, 22, 18, 0.12)" }}
        >
          <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>
            OCT
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

          <div style={{ width: "65%", height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0, margin: "4px 0" }} />

          <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: 1 }}>
            WAVE
          </span>
          {WAVEFORMS.map(({ value, label }) => (
            <ToggleButton
              key={value}
              label={label}
              active={waveform === value}
              accentColor={ACCENT_COLOR}
              onClick={() => onStateChange({ vaWaveform: value })}
            />
          ))}
        </div>

        {/* CENTER: display + info bar */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0, minHeight: 0 }}>
          {/* Info bar */}
          <div
            className="flex items-center justify-between px-3 py-1"
            style={{
              background: "rgba(18, 14, 10, 0.2)",
              borderBottom: "1px solid var(--panel-shadow)",
              flexShrink: 0,
            }}
          >
            <span className="font-mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "2px" }}>
              {`OCT ${4 + (state.octave ?? 0)}  |  ${waveform.toUpperCase()}  |  PHASE ${Math.round(state.phase ?? 0)}\u00b0`}
            </span>
            <div className="flex items-center gap-2">
              <div style={{ width: 72, height: 10, background: "rgba(0,0,0,0.5)", borderRadius: 2, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
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

          {/* Oscilloscope display */}
          <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
            <ProfessionalEngineDisplay
              mode="VA"
              accentColor={ACCENT_COLOR}
              vaWaveform={waveform}
              vaPulseWidth={state.vaPulseWidth ?? 50}
              vaBright={state.vaBright ?? 50}
              vaSubOsc={subOsc}
              vaSubLevel={state.vaSubLevel ?? 0}
            />
          </div>
        </div>

        {/* RIGHT RAIL: Level / Pan / Stereo */}
        <div
          className="flex flex-col items-center justify-center gap-2 py-2 px-1"
          style={{ width: 56, flexShrink: 0, background: "rgba(28, 22, 18, 0.12)" }}
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

      {/* ── EXPAND TOGGLE ── */}
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
            <path d="M2 4.5L6 8.5L10 4.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* ── EXPANDABLE SECTION ── */}
      {expanded && (
        <>
          {/* Params row */}
          <div
            className="flex items-center gap-3 px-3 py-1.5"
            style={{
              flexShrink: 0,
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: "rgba(18, 14, 10, 0.2)",
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

            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

            {/* VA-specific params */}
            <Knob
              value={state.vaPulseWidth ?? 50}
              min={0}
              max={100}
              size="mini"
              label="PW"
              displayValue={formatPercent(state.vaPulseWidth ?? 50)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ vaPulseWidth: v })}
            />
            <Knob
              value={state.vaPWM ?? 0}
              min={0}
              max={100}
              size="mini"
              label="PWM"
              displayValue={formatPercent(state.vaPWM ?? 0)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ vaPWM: v })}
            />
            <Knob
              value={state.vaDrift ?? 0}
              min={0}
              max={100}
              size="mini"
              label="DRIFT"
              displayValue={formatPercent(state.vaDrift ?? 0)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ vaDrift: v })}
            />
            <Knob
              value={state.vaVintage ?? 0}
              min={0}
              max={100}
              size="mini"
              label="WARM"
              displayValue={formatPercent(state.vaVintage ?? 0)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ vaVintage: v })}
            />
            <Knob
              value={state.vaBright ?? 50}
              min={0}
              max={100}
              size="mini"
              label="BRIGHT"
              displayValue={formatPercent(state.vaBright ?? 50)}
              accentColor={ACCENT_COLOR}
              onChange={(v) => onStateChange({ vaBright: v })}
            />

            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

            {/* VA model */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)" }}>MODEL</span>
              <div className="flex gap-px">
                {VA_MODELS.map(({ value, label }) => (
                  <ToggleButton
                    key={value}
                    label={label}
                    active={(state.vaModel ?? "circuit") === value}
                    accentColor={ACCENT_COLOR}
                    onClick={() => onStateChange({ vaModel: value })}
                  />
                ))}
              </div>
            </div>

            {/* Hard sync toggle */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)" }}>SYNC</span>
              <ToggleButton
                label={state.vaSync ? "ON" : "OFF"}
                active={state.vaSync ?? false}
                accentColor={ACCENT_COLOR}
                onClick={() => onStateChange({ vaSync: !state.vaSync })}
              />
            </div>

            {/* Random phase toggle */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "rgba(255,255,255,0.35)" }}>RAND PH</span>
              <ToggleButton
                label={state.randPhase ? "ON" : "OFF"}
                active={state.randPhase ?? false}
                accentColor={ACCENT_COLOR}
                onClick={() => onStateChange({ randPhase: !state.randPhase })}
              />
            </div>
          </div>

          {/* Bottom: Sub-osc + Unison */}
          <div className="flex gap-2 px-2 pb-2 pt-1" style={{ flexShrink: 0 }}>
            {/* Sub-osc */}
            <div style={{ ...cardStyle, minWidth: 0 }}>
              <SectionLabel>Sub Osc</SectionLabel>
              <div className="flex items-center gap-2">
                <div className="flex gap-px">
                  {SUB_OSCS.map(({ value, label }) => (
                    <ToggleButton
                      key={value}
                      label={label}
                      active={subOsc === value}
                      accentColor={ACCENT_COLOR}
                      onClick={() => onStateChange({ vaSubOsc: value })}
                    />
                  ))}
                </div>
                <Knob
                  value={state.vaSubLevel ?? 0}
                  min={0}
                  max={100}
                  size="mini"
                  label="LEVEL"
                  displayValue={formatPercent(state.vaSubLevel ?? 0)}
                  accentColor={ACCENT_COLOR}
                  onChange={(v) => onStateChange({ vaSubLevel: v })}
                />
              </div>
            </div>

            {/* Unison */}
            <div style={{ ...cardStyle, flex: 1 }}>
              <SectionLabel>Unison</SectionLabel>
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
                      onClick={() => onStateChange({ unisonPhaseMode: (m === "RAND" ? "random" : m.toLowerCase()) as VAState["unisonPhaseMode"] })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
