"use client"

import { Oscilloscope } from "@/components/synth/Oscilloscope"

const ACCENT = "#00d4ff"

type ScopeMode = "WAVE" | "FFT" | "XY"
type Meters = { peakL: number; peakR: number; rmsL: number; rmsR: number }

interface ScopeTileContentProps {
  mode: ScopeMode
  onModeChange: (mode: ScopeMode) => void
  meters?: Meters
}

function meterPercent(value?: number) {
  if (value === undefined) return 0
  return Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))
}

export function ScopeTileContent({ mode, onModeChange, meters }: ScopeTileContentProps) {
  const peak = Math.max(meterPercent(meters?.peakL), meterPercent(meters?.peakR))
  const rms = Math.max(meterPercent(meters?.rmsL), meterPercent(meters?.rmsR))

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      <div className="panel-recessed" style={{ minHeight: 0, borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <Oscilloscope mode={mode} onModeChange={onModeChange} compact />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, minHeight: 22 }}>
        {[
          { label: "PEAK", value: peak },
          { label: "RMS", value: rms },
        ].map((m) => (
          <div key={m.label} className="panel-recessed" style={{ borderRadius: 3, padding: "3px 5px", minWidth: 0 }}>
            <div className="font-mono uppercase" style={{ fontSize: "clamp(5px, 1.2cqmin, 7px)", color: "var(--text-label)", letterSpacing: "0.12em" }}>{m.label}</div>
            <div style={{ height: 5, marginTop: 3, borderRadius: 999, background: "rgba(0,0,0,0.28)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${m.value}%`, background: `linear-gradient(90deg, ${ACCENT}, #f59e0b 72%, #ef4444)` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
