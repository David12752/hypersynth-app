"use client"

import { Knob } from "@/components/synth/Knob"
import { LiveADSR } from "./LiveADSR"

const ACCENT = "#f59e0b"

interface EnvState {
  attack?: number
  decay?: number
  sustain?: number
  release?: number
  trigger?: "GATE" | "TRIG" | "LOOP"
}

interface EnvelopeTileContentProps {
  state: EnvState
  onChange: (patch: Partial<EnvState>) => void
  playhead?: number
}

const TRIGGERS = ["GATE", "TRIG", "LOOP"] as const

export function EnvelopeTileContent({ state, onChange, playhead }: EnvelopeTileContentProps) {
  const A = state.attack ?? 5
  const D = state.decay ?? 30
  const S = state.sustain ?? 80
  const R = state.release ?? 20
  const trig = state.trigger ?? "GATE"

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      {/* Trigger mode */}
      <div className="flex items-center gap-px flex-shrink-0">
        {TRIGGERS.map((t) => {
          const active = trig === t
          return (
            <button
              key={t}
              onClick={() => onChange({ trigger: t })}
              className="font-mono uppercase"
              style={{
                fontSize: "clamp(6px, 1.45cqmin, 8px)",
                padding: "1px 5px",
                background: active ? ACCENT : "rgba(255,255,255,0.35)",
                color: active ? "#fff" : "var(--text-label)",
                border: `1px solid ${active ? ACCENT : "var(--panel-shadow)"}`,
                borderRadius: 2,
                cursor: "pointer",
                lineHeight: 1.5,
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* ADSR canvas */}
      <div className="flex-1 panel-recessed rounded" style={{ minHeight: 0, position: "relative", overflow: "hidden" }}>
        <LiveADSR attack={A} decay={D} sustain={S} release={R} accent={ACCENT} playhead={playhead} />
      </div>

      {/* Knobs */}
      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {[
          { label: "A",   value: A, min: 0, max: 100, onChange: (v: number) => onChange({ attack: v }) },
          { label: "D",   value: D, min: 0, max: 100, onChange: (v: number) => onChange({ decay: v }) },
          { label: "S",   value: S, min: 0, max: 100, onChange: (v: number) => onChange({ sustain: v }) },
          { label: "R",   value: R, min: 0, max: 100, onChange: (v: number) => onChange({ release: v }) },
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
