"use client"

import { Knob } from "@/components/synth/Knob"

const ACCENT = "#ec4899"

type ModRoute = {
  id: string
  source: string
  destination: string
  amount: number
  enabled: boolean
}

interface ModMatrixTileContentProps {
  routes?: ModRoute[]
  onRoutesChange?: (routes: ModRoute[]) => void
  macros?: number[]
  onMacroChange?: (index: number, value: number) => void
}

const DEFAULT_ROUTES: ModRoute[] = [
  { id: "1", source: "LFO 1", destination: "Filter Cutoff", amount: 65, enabled: true },
  { id: "2", source: "ENV 2", destination: "Osc 1 Pitch", amount: -30, enabled: true },
  { id: "3", source: "MOD", destination: "Filter Reso", amount: 50, enabled: false },
]

export function ModMatrixTileContent({ routes = DEFAULT_ROUTES, onRoutesChange, macros = [50, 50, 50, 50], onMacroChange }: ModMatrixTileContentProps) {
  const updateRoute = (id: string, patch: Partial<ModRoute>) => {
    onRoutesChange?.(routes.map((route) => (route.id === id ? { ...route, ...patch } : route)))
  }

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      <div className="panel-recessed" style={{ borderRadius: 3, minHeight: 0, padding: 4, overflow: "hidden" }}>
        <div style={{ display: "grid", gap: 3 }}>
          {routes.slice(0, 4).map((route) => {
            const norm = Math.min(100, Math.abs(route.amount))
            return (
              <button
                key={route.id}
                onClick={() => updateRoute(route.id, { enabled: !route.enabled })}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(36px, 0.8fr) 12px minmax(54px, 1.2fr) minmax(38px, 0.7fr)",
                  alignItems: "center",
                  gap: 5,
                  border: `1px solid ${route.enabled ? `${ACCENT}88` : "rgba(160,168,184,0.36)"}`,
                  borderRadius: 3,
                  padding: "3px 5px",
                  background: route.enabled ? "rgba(236,72,153,0.08)" : "rgba(0,0,0,0.08)",
                  color: route.enabled ? "var(--text-display)" : "var(--text-label)",
                  cursor: "pointer",
                  minWidth: 0,
                }}
              >
                <span className="font-mono uppercase" style={{ fontSize: "clamp(6px, 1.4cqmin, 8px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{route.source}</span>
                <span className="font-mono" style={{ fontSize: 8, color: route.enabled ? ACCENT : "var(--text-label)" }}>→</span>
                <span className="font-mono uppercase" style={{ fontSize: "clamp(6px, 1.4cqmin, 8px)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{route.destination}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0 }}>
                  <span style={{ position: "relative", height: 4, flex: 1, background: "rgba(0,0,0,0.28)", borderRadius: 999, overflow: "hidden" }}>
                    <span style={{ position: "absolute", left: route.amount < 0 ? `${50 - norm / 2}%` : "50%", width: `${norm / 2}%`, top: 0, bottom: 0, background: route.amount < 0 ? "#06b6d4" : ACCENT }} />
                  </span>
                  <span className="font-mono" style={{ fontSize: "clamp(6px, 1.3cqmin, 8px)", color: route.amount < 0 ? "#06b6d4" : ACCENT, width: 24, textAlign: "right" }}>{route.amount}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
        {macros.slice(0, 4).map((value, index) => (
          <div key={index} className="v2-knob-cell">
            <Knob value={value} min={0} max={100} size="micro" accentColor={ACCENT} onChange={(v) => onMacroChange?.(index, v)} />
            <span>M{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
