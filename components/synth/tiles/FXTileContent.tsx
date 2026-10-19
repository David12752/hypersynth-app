"use client"

import { Knob } from "@/components/synth/Knob"

const ACCENT = "#ef4444"

type EffectState = {
  id: string
  type: string
  enabled: boolean
  params: Record<string, number>
}

interface FXTileContentProps {
  effects?: EffectState[]
  onChange?: (effects: EffectState[]) => void
}

const DEFAULT_EFFECTS: EffectState[] = [
  { id: "1", type: "REVERB", enabled: true, params: { mix: 30, size: 60, damp: 40 } },
  { id: "2", type: "DELAY", enabled: true, params: { mix: 25, time: 50, feedback: 40 } },
  { id: "3", type: "CHORUS", enabled: false, params: { mix: 35, rate: 30, depth: 50 } },
]

export function FXTileContent({ effects = DEFAULT_EFFECTS, onChange }: FXTileContentProps) {
  const updateEffect = (id: string, patch: Partial<EffectState>) => {
    onChange?.(effects.map((fx) => (fx.id === id ? { ...fx, ...patch } : fx)))
  }

  const primary = effects[0] ?? DEFAULT_EFFECTS[0]
  const updateParam = (key: string, value: number) => {
    updateEffect(primary.id, { params: { ...primary.params, [key]: value } })
  }

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 3, minHeight: 38 }}>
        {effects.slice(0, 3).map((fx, index) => (
          <button
            key={fx.id}
            onClick={() => updateEffect(fx.id, { enabled: !fx.enabled })}
            className="font-mono uppercase panel-recessed"
            style={{
              minWidth: 0,
              padding: "3px 4px",
              borderRadius: 3,
              border: `1px solid ${fx.enabled ? ACCENT : "var(--panel-shadow)"}`,
              color: fx.enabled ? ACCENT : "var(--text-label)",
              background: fx.enabled ? "rgba(239,68,68,0.09)" : "rgba(0,0,0,0.08)",
              boxShadow: fx.enabled ? `inset 0 0 10px ${ACCENT}22` : "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: fx.enabled ? ACCENT : "var(--led-off)", boxShadow: fx.enabled ? `0 0 6px ${ACCENT}` : "none", flexShrink: 0 }} />
              <span style={{ fontSize: "clamp(6px, 1.4cqmin, 8px)", letterSpacing: "0.11em", overflow: "hidden", textOverflow: "ellipsis" }}>{index + 1}. {fx.type}</span>
            </div>
            <div style={{ marginTop: 3, height: 3, borderRadius: 999, background: "rgba(0,0,0,0.22)", overflow: "hidden" }}>
              <div style={{ width: `${Math.max(0, Math.min(100, fx.params.mix ?? 0))}%`, height: "100%", background: ACCENT }} />
            </div>
          </button>
        ))}
      </div>

      <div className="panel-recessed" style={{ borderRadius: 3, minHeight: 0, padding: 4, overflow: "hidden" }}>
        <div className="font-mono uppercase" style={{ fontSize: "clamp(6px, 1.25cqmin, 8px)", color: ACCENT, letterSpacing: "0.16em", marginBottom: 4 }}>
          Active slot · {primary.type}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 2, height: "calc(100% - 14px)", minHeight: 30 }}>
          {Array.from({ length: 36 }, (_, i) => {
            const level = Math.sin(i * 0.55) * 0.5 + 0.5
            return (
              <div
                key={i}
                style={{
                  alignSelf: "end",
                  height: `${18 + level * 72}%`,
                  background: `linear-gradient(180deg, ${ACCENT}, rgba(239,68,68,0.18))`,
                  opacity: primary.enabled ? 0.32 + level * 0.5 : 0.15,
                  borderRadius: 1,
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {[
          { label: "MIX", key: "mix", value: primary.params.mix ?? 0 },
          { label: primary.type === "DELAY" ? "TIME" : "SIZE", key: primary.type === "DELAY" ? "time" : "size", value: primary.type === "DELAY" ? primary.params.time ?? 50 : primary.params.size ?? 50 },
          { label: primary.type === "CHORUS" ? "DEPTH" : "FDBK", key: primary.type === "CHORUS" ? "depth" : "feedback", value: primary.type === "CHORUS" ? primary.params.depth ?? 50 : primary.params.feedback ?? primary.params.damp ?? 40 },
        ].map((k) => (
          <div key={k.label} className="v2-knob-cell">
            <Knob value={k.value} min={0} max={100} size="micro" accentColor={ACCENT} onChange={(v) => updateParam(k.key, v)} />
            <span>{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
