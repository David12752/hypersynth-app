"use client"

import { Knob } from "../Knob"
import { LED } from "../LED"

interface FXUnit {
  id: string
  type: string
  enabled: boolean
  params: Record<string, number>
}

interface FXPanelProps {
  effects: FXUnit[]
  onEffectToggle: (id: string) => void
  onEffectParamChange: (id: string, param: string, value: number) => void
  onRemoveEffect: (id: string) => void
}

const FX_CONFIGS: Record<string, { params: { key: string; label: string; min: number; max: number }[] }> = {
  REVERB: {
    params: [
      { key: "mix", label: "MIX", min: 0, max: 100 },
      { key: "size", label: "SIZE", min: 0, max: 100 },
      { key: "damp", label: "DAMP", min: 0, max: 100 },
      { key: "predelay", label: "PREDLY", min: 0, max: 100 },
    ],
  },
  DELAY: {
    params: [
      { key: "time", label: "TIME", min: 0, max: 100 },
      { key: "feedback", label: "FDBK", min: 0, max: 100 },
      { key: "mix", label: "MIX", min: 0, max: 100 },
    ],
  },
  CHORUS: {
    params: [
      { key: "rate", label: "RATE", min: 0, max: 100 },
      { key: "depth", label: "DEPTH", min: 0, max: 100 },
      { key: "mix", label: "MIX", min: 0, max: 100 },
    ],
  },
  DISTORTION: {
    params: [
      { key: "drive", label: "DRIVE", min: 0, max: 100 },
      { key: "tone", label: "TONE", min: 0, max: 100 },
      { key: "mix", label: "MIX", min: 0, max: 100 },
    ],
  },
  PHASER: {
    params: [
      { key: "rate", label: "RATE", min: 0, max: 100 },
      { key: "depth", label: "DEPTH", min: 0, max: 100 },
      { key: "feedback", label: "FDBK", min: 0, max: 100 },
    ],
  },
}

const accentColor = "#ef4444"

export function FXPanel({
  effects,
  onEffectToggle,
  onEffectParamChange,
  onRemoveEffect,
}: FXPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
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
          ▼ FX CHAIN
        </span>
        <div className="flex gap-2">
          <button
            className="font-mono uppercase px-2 py-0.5"
            style={{
              fontSize: 6,
              letterSpacing: "1px",
              background: "var(--display-bg)",
              color: "var(--text-label)",
              border: "1px solid var(--panel-shadow)",
            }}
          >
            PRE
          </button>
          <button
            className="font-mono uppercase px-2 py-0.5"
            style={{
              fontSize: 6,
              letterSpacing: "1px",
              background: accentColor,
              color: "#fff",
              border: `1px solid ${accentColor}`,
            }}
          >
            POST
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-2 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* FX Units */}
        {effects.map((fx) => {
          const config = FX_CONFIGS[fx.type]
          if (!config) return null

          return (
            <div
              key={fx.id}
              className="panel-raised"
              style={{ opacity: fx.enabled ? 1 : 0.6 }}
            >
              {/* FX Header */}
              <div
                className="flex items-center justify-between px-2 py-1"
                style={{
                  background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
                  borderBottom: "1px solid var(--panel-shadow)",
                }}
              >
                <div className="flex items-center gap-2">
                  <LED active={fx.enabled} color={accentColor} size={4} />
                  <span
                    className="font-mono uppercase"
                    style={{ fontSize: 7, letterSpacing: "1.5px", color: "var(--text-section)" }}
                  >
                    {fx.type}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    className="px-2 py-0.5 font-mono uppercase"
                    style={{
                      fontSize: 6,
                      background: fx.enabled ? accentColor : "var(--display-bg)",
                      color: fx.enabled ? "#fff" : "var(--text-label)",
                      border: `1px solid ${fx.enabled ? accentColor : "var(--panel-shadow)"}`,
                    }}
                    onClick={() => onEffectToggle(fx.id)}
                  >
                    ON
                  </button>
                  <button
                    className="px-2 py-0.5 font-mono uppercase"
                    style={{
                      fontSize: 6,
                      background: "var(--display-bg)",
                      color: "var(--text-label)",
                      border: "1px solid var(--panel-shadow)",
                    }}
                    onClick={() => onRemoveEffect(fx.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* FX Controls */}
              <div className="flex gap-3 p-2">
                {config.params.map((param) => (
                  <Knob
                    key={param.key}
                    value={fx.params[param.key] ?? 50}
                    min={param.min}
                    max={param.max}
                    size="small"
                    label={param.label}
                    displayValue={`${Math.round(fx.params[param.key] ?? 50)}%`}
                    accentColor={accentColor}
                    onChange={(v) => onEffectParamChange(fx.id, param.key, v)}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* Add Effect Button */}
        <button
          className="panel-raised flex items-center justify-center gap-2 py-3 transition-colors hover:brightness-110"
          style={{
            border: "1px dashed var(--panel-highlight)",
            background: "transparent",
          }}
        >
          <span style={{ color: "var(--text-label)", fontSize: 14 }}>+</span>
          <span
            className="font-mono uppercase"
            style={{ fontSize: 7, letterSpacing: "1.5px", color: "var(--text-label)" }}
          >
            ADD EFFECT
          </span>
        </button>

        {/* Signal Flow */}
        <div className="mt-auto pt-3">
          <div
            className="font-mono uppercase mb-2"
            style={{ fontSize: 6, letterSpacing: "1.5px", color: "var(--text-label)" }}
          >
            SIGNAL FLOW
          </div>
          <div
            className="panel-recessed p-2 flex items-center gap-1 overflow-x-auto"
            style={{ height: 32 }}
          >
            <SignalNode label="OSC1" />
            <SignalArrow />
            <SignalNode label="OSC2" />
            <SignalArrow />
            <SignalNode label="FLT" color="#a855f7" />
            {effects
              .filter((fx) => fx.enabled)
              .map((fx) => (
                <span key={fx.id} className="contents">
                  <SignalArrow />
                  <SignalNode label={fx.type.slice(0, 3)} color={accentColor} />
                </span>
              ))}
            <SignalArrow />
            <SignalNode label="OUT" color="#10b981" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SignalNode({ label, color = "#5865f2" }: { label: string; color?: string }) {
  return (
    <div
      className="px-2 py-1 font-mono uppercase"
      style={{
        fontSize: 6,
        letterSpacing: "0.5px",
        background: color,
        color: "#fff",
      }}
    >
      {label}
    </div>
  )
}

function SignalArrow() {
  return (
    <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
      →
    </span>
  )
}
