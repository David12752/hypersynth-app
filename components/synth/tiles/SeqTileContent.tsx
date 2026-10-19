"use client"

import { useMemo, useState } from "react"
import { Knob } from "@/components/synth/Knob"

const ACCENT = "#06b6d4"
const STEPS = 16

type SeqMode = "OFF" | "ARP" | "SEQ"

export function SeqTileContent() {
  const [mode, setMode] = useState<SeqMode>("SEQ")
  const [rate, setRate] = useState(50)
  const [swing, setSwing] = useState(12)
  const [gate, setGate] = useState(62)
  const [steps, setSteps] = useState(() =>
    Array.from({ length: STEPS }, (_, i) => ({
      on: [0, 3, 6, 8, 10, 13].includes(i),
      note: i % 5,
      vel: 45 + ((i * 13) % 50),
    }))
  )

  const activeCount = useMemo(() => steps.filter((s) => s.on).length, [steps])

  return (
    <div className="v2-tile-content" style={{ padding: 4, gap: 4 }}>
      <div className="flex items-center justify-between" style={{ minHeight: 18, gap: 4 }}>
        <div className="flex gap-px" style={{ minWidth: 0 }}>
          {(["OFF", "ARP", "SEQ"] as const).map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="font-mono uppercase"
                style={{
                  fontSize: "clamp(6px, 1.5cqmin, 8px)",
                  padding: "1px 6px",
                  background: active ? ACCENT : "rgba(255,255,255,0.34)",
                  color: active ? "#fff" : "var(--text-label)",
                  border: `1px solid ${active ? ACCENT : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                  lineHeight: 1.45,
                  cursor: "pointer",
                }}
              >
                {m}
              </button>
            )
          })}
        </div>
        <div className="font-mono uppercase" style={{ fontSize: "clamp(6px, 1.35cqmin, 8px)", color: ACCENT, letterSpacing: "0.12em", whiteSpace: "nowrap" }}>
          {activeCount}/16 active
        </div>
      </div>

      <div className="panel-recessed" style={{ minHeight: 0, borderRadius: 3, padding: 4, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(16, minmax(0, 1fr))",
            gridTemplateRows: "repeat(5, minmax(0, 1fr))",
            gap: 2,
            height: "100%",
            minHeight: 54,
          }}
        >
          {Array.from({ length: 5 }, (_, row) =>
            steps.map((step, col) => {
              const lit = step.on && step.note === 4 - row
              return (
                <button
                  key={`${row}-${col}`}
                  onClick={() =>
                    setSteps((prev) =>
                      prev.map((s, i) => (i === col ? { ...s, on: row === 4 - s.note ? !s.on : true, note: 4 - row } : s))
                    )
                  }
                  title={`Step ${col + 1}`}
                  style={{
                    minWidth: 0,
                    border: `1px solid ${lit ? ACCENT : "rgba(160,168,184,0.45)"}`,
                    borderRadius: 2,
                    background: lit ? `linear-gradient(180deg, ${ACCENT}, #075985)` : col % 4 === 0 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.16)",
                    boxShadow: lit ? `0 0 8px ${ACCENT}88` : "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              )
            })
          )}
        </div>
      </div>

      <div className="v2-mini-knob-row" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {[
          { label: "RATE", value: rate, onChange: setRate },
          { label: "SWING", value: swing, onChange: setSwing },
          { label: "GATE", value: gate, onChange: setGate },
        ].map((k) => (
          <div key={k.label} className="v2-knob-cell">
            <Knob value={k.value} min={0} max={100} size="micro" accentColor={ACCENT} onChange={k.onChange} />
            <span>{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
