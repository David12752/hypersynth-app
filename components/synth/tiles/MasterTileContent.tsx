"use client"

import { Knob } from "@/components/synth/Knob"

const ACCENT = "#10b981"

type Meters = { peakL: number; peakR: number; rmsL: number; rmsR: number }

interface MasterTileContentProps {
  volume: number
  onVolumeChange: (value: number) => void
  isReady?: boolean
  meters?: Meters
}

function meterPercent(value?: number) {
  if (value === undefined) return 0
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))
}

function CompactMeter({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <span className="font-mono uppercase" style={{ fontSize: "clamp(5px, 1.2cqmin, 7px)", color: "var(--text-label)", width: 8 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: `linear-gradient(90deg, ${ACCENT}, #f59e0b 78%, #ef4444)` }} />
      </div>
    </div>
  )
}

export function MasterTileContent({ volume, onVolumeChange, isReady, meters }: MasterTileContentProps) {
  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      <div className="panel-recessed flex flex-col items-center justify-center" style={{ borderRadius: 3, minHeight: 0, overflow: "hidden", position: "relative", padding: 5 }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 35%, ${ACCENT}18, transparent 68%)`, pointerEvents: "none" }} />
        <div style={{ width: "min(14cqmin, 36px)", height: "min(14cqmin, 36px)", border: `1.5px solid ${ACCENT}`, borderRadius: 3, transform: "rotate(45deg)", boxShadow: `0 0 16px ${ACCENT}88`, marginBottom: "min(2cqmin, 8px)", flexShrink: 0 }} />
        <div className="font-mono" style={{ position: "relative", fontSize: "clamp(8px, 3.4cqmin, 18px)", letterSpacing: "0.28em", color: ACCENT, textShadow: `0 0 10px ${ACCENT}aa`, fontWeight: 700, lineHeight: 1, textAlign: "center" }}>
          HYPER<br />SYNTH
        </div>
        <div className="font-mono uppercase" style={{ position: "relative", marginTop: 5, fontSize: "clamp(5px, 1.3cqmin, 7px)", letterSpacing: "0.16em", color: `${ACCENT}99`, whiteSpace: "nowrap" }}>
          {isReady ? "engine online" : "engine booting"}
        </div>
      </div>

      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "minmax(36px, 0.55fr) minmax(0, 1fr)" }}>
        <div className="v2-knob-cell">
          <Knob value={volume} min={0} max={100} size="micro" accentColor={ACCENT} onChange={onVolumeChange} />
          <span>VOL</span>
        </div>
        <div className="panel-recessed" style={{ borderRadius: 3, padding: "5px 6px", display: "grid", alignContent: "center", gap: 4, minWidth: 0 }}>
          <CompactMeter label="L" value={meterPercent(meters?.peakL)} />
          <CompactMeter label="R" value={meterPercent(meters?.peakR)} />
        </div>
      </div>
    </div>
  )
}
