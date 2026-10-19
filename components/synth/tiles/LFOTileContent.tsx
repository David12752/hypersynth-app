"use client"

import { Knob } from "@/components/synth/Knob"
import { LiveLFO } from "./LiveLFO"

const ACCENT = "#10b981"

const LFO_WAVEFORMS = [
  { id: "sine",     label: "∿" },
  { id: "triangle", label: "△" },
  { id: "saw",      label: "⊿" },
  { id: "square",   label: "⊓" },
  { id: "sh",       label: "S&H" },
] as const

type LfoWaveform = "sine" | "triangle" | "saw" | "square" | "sh"

interface LfoState {
  waveform?: LfoWaveform
  rate?: number
  amount?: number
  sync?: boolean
  retrig?: boolean
}

interface LFOTileContentProps {
  state: LfoState
  onChange: (patch: Partial<LfoState>) => void
}

export function LFOTileContent({ state, onChange }: LFOTileContentProps) {
  const wf = (state.waveform ?? "sine") as LfoWaveform
  const rate = state.rate ?? 30
  const amount = state.amount ?? 50

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      {/* Waveform selector */}
      <div className="flex items-center gap-px flex-shrink-0">
        {LFO_WAVEFORMS.map(({ id, label }) => {
          const active = wf === id
          return (
            <button
              key={id}
              onClick={() => onChange({ waveform: id as LfoWaveform })}
              className="font-mono"
              style={{
                fontSize: "clamp(7px, 1.7cqmin, 10px)",
                padding: "1px 5px",
                background: active ? ACCENT : "rgba(255,255,255,0.35)",
                color: active ? "#fff" : "var(--text-label)",
                border: `1px solid ${active ? ACCENT : "var(--panel-shadow)"}`,
                borderRadius: 2,
                cursor: "pointer",
                lineHeight: 1.5,
              }}
            >
              {label}
            </button>
          )
        })}

        {/* Sync / Retrig toggles */}
        <div className="flex gap-px ml-2">
          {[
            { label: "SYNC",   key: "sync" as const,   val: state.sync ?? false },
            { label: "RETRIG", key: "retrig" as const, val: state.retrig ?? false },
          ].map(({ label, key, val }) => (
            <button
              key={key}
              onClick={() => onChange({ [key]: !val })}
              className="font-mono uppercase"
              style={{
                fontSize: "clamp(5px, 1.25cqmin, 7px)",
                padding: "1px 4px",
                background: val ? `${ACCENT}cc` : "rgba(255,255,255,0.25)",
                color: val ? "#fff" : "var(--text-label)",
                border: `1px solid ${val ? ACCENT : "var(--panel-shadow)"}`,
                borderRadius: 2,
                cursor: "pointer",
                lineHeight: 1.5,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Live LFO canvas */}
      <div className="flex-1 panel-recessed rounded" style={{ minHeight: 0, position: "relative", overflow: "hidden" }}>
        <LiveLFO waveform={wf} rate={rate} accent={ACCENT} />
      </div>

      {/* Knobs */}
      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {[
          { label: "RATE",  value: rate,   min: 0, max: 100, onChange: (v: number) => onChange({ rate: v }) },
          { label: "AMT",   value: amount, min: 0, max: 100, onChange: (v: number) => onChange({ amount: v }) },
        ].map((k) => (
          <div key={k.label} className="v2-knob-cell">
            <Knob
              value={k.value}
              min={k.min}
              max={k.max}
              size="micro"
              accentColor={ACCENT}
              onChange={k.onChange}
            />
            <span>{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
