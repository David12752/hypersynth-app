"use client"

import { LED } from "../LED"
import { SliderTrack } from "../SliderTrack"

interface ModRoute {
  id: string
  source: string
  destination: string
  amount: number
  enabled: boolean
}

interface ModMatrixPanelProps {
  routes: ModRoute[]
  onRouteToggle: (id: string) => void
  onRouteAmountChange: (id: string, amount: number) => void
  onRouteRemove: (id: string) => void
  onAddRoute: () => void
}

const SOURCES = ["LFO 1", "LFO 2", "LFO 3", "LFO 4", "ENV 1", "ENV 2", "ENV 3", "VEL", "MOD", "AFT"]
const DESTINATIONS = [
  "Filter Cutoff",
  "Filter Reso",
  "Osc 1 Pitch",
  "Osc 2 Pitch",
  "Osc 1 Level",
  "Osc 2 Level",
  "Pan",
  "Master",
]

const SOURCE_COLORS: Record<string, string> = {
  "LFO 1": "#5865f2",
  "LFO 2": "#10b981",
  "LFO 3": "#a855f7",
  "LFO 4": "#f59e0b",
  "ENV 1": "#f59e0b",
  "ENV 2": "#f59e0b",
  "ENV 3": "#f59e0b",
  VEL: "#10b981",
  MOD: "#5865f2",
  AFT: "#a855f7",
}

export function ModMatrixPanel({
  routes,
  onRouteToggle,
  onRouteAmountChange,
  onRouteRemove,
  onAddRoute,
}: ModMatrixPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{
          background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
          borderBottom: "1px solid var(--panel-shadow)",
        }}
      >
        <span
          className="font-mono uppercase"
          style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}
        >
          ▼ MODULATION MATRIX
        </span>
        <button
          className="px-2 py-0.5 font-mono uppercase"
          style={{
            fontSize: 6,
            letterSpacing: "1px",
            background: "var(--display-bg)",
            color: "var(--text-label)",
            border: "1px solid var(--panel-shadow)",
          }}
          onClick={onAddRoute}
        >
          + ADD ROUTE
        </button>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-2 overflow-auto">
        {/* Mod Routes */}
        {routes.map((route) => {
                  const sourceColor = SOURCE_COLORS[route.source] || "#5865f2"

          return (
            <div
              key={route.id}
              className="panel-raised p-2"
              style={{ opacity: route.enabled ? 1 : 0.5 }}
            >
              <div className="flex items-center gap-2">
                {/* Enable LED */}
                <button onClick={() => onRouteToggle(route.id)}>
                  <LED active={route.enabled} color={sourceColor} size={6} />
                </button>

                {/* Source Dropdown */}
                <select
                  className="font-mono uppercase px-2 py-1"
                  style={{
                    fontSize: 7,
                    letterSpacing: "0.5px",
                    background: "var(--display-bg)",
                    color: "var(--text-display)",
                    border: "1px solid var(--panel-shadow)",
                  }}
                  value={route.source}
                  onChange={() => {}}
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                {/* Arrow */}
                <span
                  className="font-mono"
                  style={{ fontSize: 10, color: sourceColor }}
                >
                  →
                </span>

                {/* Destination Dropdown */}
                <select
                  className="font-mono uppercase px-2 py-1 flex-1"
                  style={{
                    fontSize: 7,
                    letterSpacing: "0.5px",
                    background: "var(--display-bg)",
                    color: "var(--text-display)",
                    border: "1px solid var(--panel-shadow)",
                  }}
                  value={route.destination}
                  onChange={() => {}}
                >
                  {DESTINATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                {/* Remove Button */}
                <button
                  className="px-2 py-0.5 font-mono"
                  style={{
                    fontSize: 8,
                    background: "var(--display-bg)",
                    color: "var(--text-label)",
                    border: "1px solid var(--panel-shadow)",
                  }}
                  onClick={() => onRouteRemove(route.id)}
                >
                  ✕
                </button>
              </div>

              {/* Amount Slider */}
              <div className="mt-2">
                <SliderTrack
                  value={route.amount}
                  min={-100}
                  max={100}
                  displayValue={`${route.amount > 0 ? "+" : ""}${route.amount}%`}
                  accentColor={sourceColor}
                  onChange={(v) => onRouteAmountChange(route.id, Math.round(v))}
                />
              </div>
            </div>
          )
        })}

        {/* Empty slots indicator */}
        {routes.length < 12 &&
          Array.from({ length: Math.min(3, 12 - routes.length) }, (_, i) => (
            <div
              key={`empty-${i}`}
              className="h-6 flex items-center justify-center"
              style={{
                border: "1px dashed var(--panel-highlight)",
                background: "transparent",
              }}
            >
              <span
                className="font-mono uppercase"
                style={{ fontSize: 6, color: "var(--text-label)", opacity: 0.5 }}
              >
                EMPTY SLOT
              </span>
            </div>
          ))}

        {/* Routing Visualization */}
        <div className="mt-auto pt-3">
          <div
            className="font-mono uppercase mb-2"
            style={{ fontSize: 6, letterSpacing: "1.5px", color: "var(--text-label)" }}
          >
            ROUTING MAP
          </div>
          <div className="panel-recessed p-2" style={{ height: 80 }}>
            <svg width="100%" height="100%" viewBox="0 0 300 60">
              {/* Sources (left) */}
              {routes
                .filter((r) => r.enabled)
                .slice(0, 4)
                .map((route, i) => {
          const sourceColor = SOURCE_COLORS[route.source] || "#5865f2"
                  const y = 10 + i * 14
                  return (
                    <g key={route.id}>
                      <text
                        x={10}
                        y={y + 4}
                        fill={sourceColor}
                        fontSize={6}
                        fontFamily="monospace"
                      >
                        {route.source}
                      </text>
                      <path
                        d={`M 45 ${y} Q 150 ${y + (i % 2 === 0 ? 10 : -10)} 255 ${y}`}
                        stroke={sourceColor}
                        strokeWidth={Math.abs(route.amount) / 25}
                        fill="none"
                        opacity={0.6}
                      />
                      <text
                        x={260}
                        y={y + 4}
                        fill="var(--text-section)"
                        fontSize={6}
                        fontFamily="monospace"
                      >
                        {route.destination.slice(0, 12)}
                      </text>
                    </g>
                  )
                })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
