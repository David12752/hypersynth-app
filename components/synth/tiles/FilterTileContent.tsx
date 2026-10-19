"use client"

import { Knob } from "@/components/synth/Knob"
import { FilterResponse } from "./FilterResponse"

const ACCENT = "#a855f7"

const FILTER_MODES = ["LP", "HP", "BP", "NOTCH"] as const
type FilterMode = typeof FILTER_MODES[number]

interface FilterState {
  filterMode?: FilterMode
  cutoff?: number
  resonance?: number
  drive?: number
  envAmount?: number
  keytrack?: number
}

interface FilterTileContentProps {
  state: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

export function FilterTileContent({ state, onChange }: FilterTileContentProps) {
  const mode = state.filterMode ?? "LP"
  const cutoff = state.cutoff ?? 75
  const res = state.resonance ?? 25

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      {/* Filter mode selector */}
      <div className="flex items-center gap-px flex-shrink-0">
        {FILTER_MODES.map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              onClick={() => onChange({ filterMode: m })}
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
              {m}
            </button>
          )
        })}
      </div>

      {/* Frequency response curve */}
      <div className="flex-1 panel-recessed rounded" style={{ minHeight: 0, position: "relative", overflow: "hidden" }}>
        <FilterResponse
          filterType={mode}
          cutoff={cutoff}
          resonance={res}
          accent={ACCENT}
        />
      </div>

      {/* Knobs */}
      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {[
          { label: "CUT",    value: cutoff,                 min: 0, max: 100, onChange: (v: number) => onChange({ cutoff: v }) },
          { label: "RESO",   value: res,                    min: 0, max: 100, onChange: (v: number) => onChange({ resonance: v }) },
          { label: "DRIVE",  value: state.drive ?? 0,       min: 0, max: 100, onChange: (v: number) => onChange({ drive: v }) },
          { label: "ENV",    value: state.envAmount ?? 50,  min: -100, max: 100, onChange: (v: number) => onChange({ envAmount: v }) },
          { label: "K.TRK",  value: state.keytrack ?? 50,   min: 0, max: 100, onChange: (v: number) => onChange({ keytrack: v }) },
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
