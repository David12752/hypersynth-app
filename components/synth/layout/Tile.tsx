"use client"

import { useState, type ReactNode } from "react"

// =============================================================================
//  Tile
//
//  A unified wrapper around every functional block in the new MainGrid.
//  Visual language matches the existing physical-panel aesthetic
//  (panel-raised + recessed inner area + thin accent bar at the top).
//
//  Features:
//    • Section colour accent (top hairline) for instant identification
//    • Optional tab bar for instances (OSC1..4 / ENV1..4 / LFO1..4)
//    • "ⓘ MORE" button to open the full Inspector Drawer
//    • :focus-within glow so the active tile is obvious
//    • Stage badge (1..7) to reinforce signal flow ordering
// =============================================================================

export interface TileTab {
  id: string
  label: string
  /** Optional active dot — e.g. when an envelope/LFO is routed somewhere */
  routed?: boolean
}

interface TileProps {
  /** Stage number in signal flow — rendered as a small badge */
  stage?: number
  /** Section title (English, uppercase). e.g. "OSCILLATORS" */
  title: string
  /** Hebrew sub-label drawn under the title (optional) */
  subtitle?: string
  /** Section accent colour — used for the top hairline + active tab */
  accent: string
  /** Optional tab definitions — when present, a TabBar is shown */
  tabs?: TileTab[]
  /** Currently selected tab id */
  activeTab?: string
  onTabChange?: (id: string) => void
  /** Optional callback for the ⓘ MORE button (opens drawer) */
  onOpenInspector?: () => void
  /** Optional right-side header slot (extra controls) */
  headerRight?: ReactNode
  /** When inside react-grid-layout, add drag-handle class to header */
  draggable?: boolean
  children: ReactNode
}

export function Tile({
  stage,
  title,
  subtitle,
  accent,
  tabs,
  activeTab,
  onTabChange,
  onOpenInspector,
  headerRight,
  draggable,
  children,
}: TileProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="panel-raised flex flex-col h-full w-full overflow-hidden"
      style={{
        borderRadius: 4,
        position: "relative",
        transition: "box-shadow 180ms ease",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {/* Accent hairline at the top — section colour */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${accent} 20%, ${accent} 80%, transparent 100%)`,
          opacity: hovered ? 1 : 0.55,
          transition: "opacity 180ms ease",
          pointerEvents: "none",
        }}
      />

      {/* Header bar */}
      <div
        className={`flex items-center gap-1 px-1${draggable ? " tile-drag-handle" : ""}`}
        style={{
          height: 25,
          background: "linear-gradient(180deg, #dfe2e8 0%, #d0d4dc 100%)",
          borderBottom: "1px solid var(--panel-shadow)",
          flexShrink: 0,
          cursor: draggable ? "grab" : "default",
          userSelect: "none",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Stage badge */}
        {stage !== undefined && (
          <span
            className="font-mono"
            style={{
              fontSize: 8,
                width: 15,
                height: 15,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 3,
              background: accent,
              color: "#fff",
              fontWeight: 700,
              flexShrink: 0,
              boxShadow: `0 0 6px ${accent}66`,
            }}
          >
            {stage}
          </span>
        )}

        {/* Title */}
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 9,
            letterSpacing: "1.2px",
            color: "var(--text-section)",
            fontWeight: 700,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          {title}
        </span>

        {/* Hebrew subtitle */}
        {subtitle && (
          <span
            style={{
              fontSize: 8,
              color: "var(--text-label)",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              flexShrink: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </span>
        )}

        {/* Tabs (instances) */}
        {tabs && tabs.length > 0 && (
          <div className="flex gap-px ml-1" style={{ minWidth: 0, overflow: "hidden", flexShrink: 0 }}>
            {tabs.map((t) => {
              const active = t.id === activeTab
              return (
                <button
                  key={t.id}
                  onClick={() => onTabChange?.(t.id)}
                  className="font-mono uppercase transition-colors"
                  style={{
                    fontSize: 8,
                    letterSpacing: "0.7px",
                    padding: "2px 6px",
                    background: active ? accent : "rgba(255,255,255,0.45)",
                    color: active ? "#fff" : "var(--text-section)",
                    border: `1px solid ${active ? accent : "var(--panel-shadow)"}`,
                    borderRadius: 2,
                    boxShadow: active ? `0 0 6px ${accent}66` : "none",
                    cursor: "pointer",
                    position: "relative",
                    minWidth: 0,
                  }}
                >
                  {t.label}
                  {t.routed && !active && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        background: accent,
                        boxShadow: `0 0 3px ${accent}`,
                      }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Header right slot */}
        <div style={{ flexShrink: 0 }}>{headerRight}</div>

        {/* MORE / Inspector button */}
        {onOpenInspector && (
          <button
            onClick={onOpenInspector}
            className="font-mono uppercase transition-colors"
            style={{
              fontSize: 7,
              letterSpacing: "1px",
              padding: "2px 5px",
              background: "rgba(255,255,255,0.4)",
              color: "var(--text-label)",
              border: "1px solid var(--panel-shadow)",
              borderRadius: 2,
              cursor: "pointer",
              flexShrink: 0,
            }}
            title="Open full inspector"
          >
            ⓘ MORE
          </button>
        )}
      </div>

      {/* Content area — recessed display surface */}
      <div
        className="panel-recessed flex-1 overflow-hidden"
        style={{
          margin: 3,
          borderRadius: 3,
          minHeight: 0,
          minWidth: 0,
          position: "relative",
          containerType: "size",
        }}
      >
        {children}
      </div>
    </div>
  )
}

// =============================================================================
//  TilePlaceholder
//
//  Used during the "shell only" phase so the user can resize panels and
//  decide on real proportions before content is filled in.
// =============================================================================
export function TilePlaceholder({
  hint,
  accent,
}: {
  hint?: string
  accent: string
}) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center font-mono"
      style={{
        color: accent,
        letterSpacing: "0.18em",
        textShadow: `0 0 8px ${accent}55`,
        gap: "min(1cqmin, 6px)",
      }}
    >
      <div style={{ fontSize: "min(5cqmin, 28px)", opacity: 0.4 }}>◇</div>
      {hint && (
        <div style={{ fontSize: "clamp(7px, 1.6cqmin, 11px)", opacity: 0.55, letterSpacing: "0.12em" }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// =============================================================================
//  HyperSynthLogo
//
//  Branded identity display for the MASTER tile (the tall right-column panel).
//  Scales fluidly using CSS container query units (cqmin).
// =============================================================================
export function HyperSynthLogo({ accent = "#10b981" }: { accent?: string }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center select-none"
      style={{ position: "relative", overflow: "hidden" }}
    >
      {/* Scan line overlay */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
          pointerEvents: "none",
        }}
      />
      {/* Radial ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(ellipse 80% 55% at 50% 38%, ${accent}1a 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <div
        className="flex flex-col items-center"
        style={{ position: "relative", gap: "min(2.5cqmin, 10px)", padding: "0 12px" }}
      >
        {/* Diamond logo mark */}
        <div
          style={{
            width: "min(18cqmin, 60px)",
            height: "min(18cqmin, 60px)",
            border: `2px solid ${accent}`,
            borderRadius: "min(0.6cqmin, 4px)",
            transform: "rotate(45deg)",
            boxShadow: `0 0 24px ${accent}bb, 0 0 48px ${accent}44, inset 0 0 16px ${accent}22`,
            marginBottom: "min(3cqmin, 14px)",
            flexShrink: 0,
          }}
        />

        {/* HYPER */}
        <div
          className="font-mono"
          style={{
            fontSize: "min(9cqmin, 36px)",
            letterSpacing: "0.45em",
            color: accent,
            textShadow: `0 0 12px ${accent}ee, 0 0 28px ${accent}66`,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          HYPER
        </div>

        {/* SYNTH */}
        <div
          className="font-mono"
          style={{
            fontSize: "min(9cqmin, 36px)",
            letterSpacing: "0.45em",
            color: accent,
            textShadow: `0 0 12px ${accent}ee, 0 0 28px ${accent}66`,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          SYNTH
        </div>

        {/* Divider */}
        <div
          style={{
            width: "70%", height: 1,
            background: `linear-gradient(90deg, transparent, ${accent}99, transparent)`,
            margin: "min(2.5cqmin, 10px) 0 min(1.5cqmin, 6px)",
          }}
        />

        {/* Version badge */}
        <div
          className="font-mono"
          style={{
            fontSize: "min(3cqmin, 14px)",
            letterSpacing: "0.35em",
            color: `${accent}cc`,
          }}
        >
          V 2.0
        </div>

        {/* Tagline */}
        <div
          className="font-mono"
          style={{
            fontSize: "min(2.5cqmin, 11px)",
            letterSpacing: "0.14em",
            color: `${accent}66`,
            marginTop: "min(1.5cqmin, 6px)",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          PROFESSIONAL<br />SYNTHESIZER
        </div>

        {/* Bottom divider */}
        <div
          style={{
            width: "70%", height: 1,
            background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
            marginTop: "min(2.5cqmin, 10px)",
          }}
        />
      </div>
    </div>
  )
}
