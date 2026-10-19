"use client"

import { useState, useRef, useEffect } from "react"
import { Knob } from "@/components/synth/Knob"

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// MIXER PANEL - Clean light gray hardware aesthetic
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const CHANNELS = [
  { id: "osc1", label: "OSC 1", shortLabel: "O1", color: "#5865f2", defaultLevel: 80 },
  { id: "osc2", label: "OSC 2", shortLabel: "O2", color: "#5865f2", defaultLevel: 75 },
  { id: "osc3", label: "OSC 3", shortLabel: "O3", color: "#5865f2", defaultLevel: 60 },
  { id: "sub", label: "SUB", shortLabel: "SB", color: "#a855f7", defaultLevel: 50 },
  { id: "noise", label: "NOISE", shortLabel: "NS", color: "#10b981", defaultLevel: 0 },
]

interface ChannelState {
  level: number
  pan: number
  mute: boolean
  solo: boolean
  toFilter1: boolean
  toFilter2: boolean
}

export function MixerPanel() {
  const [channels, setChannels] = useState<Record<string, ChannelState>>(() => {
    const init: Record<string, ChannelState> = {}
    CHANNELS.forEach((ch) => {
      init[ch.id] = {
        level: ch.defaultLevel,
        pan: 0,
        mute: false,
        solo: false,
        toFilter1: true,
        toFilter2: false,
      }
    })
    return init
  })

  const [masterLevel, setMasterLevel] = useState(85)

  const updateChannel = (id: string, updates: Partial<ChannelState>) => {
    setChannels((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--panel-bg)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
          borderBottom: "1px solid var(--panel-shadow)",
        }}
      >
        <span className="font-mono uppercase" style={{ fontSize: 9, letterSpacing: "2px", color: "var(--text-section)" }}>
          MIXER
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono" style={{ fontSize: 6, color: "var(--text-label)" }}>
            Adjust levels and routing for each sound source
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3" style={{ minHeight: 0 }}>
        {/* Channel Strips */}
        <div className="flex gap-2 overflow-x-auto">
          {CHANNELS.map((ch) => (
            <ChannelStrip
              key={ch.id}
              channel={ch}
              state={channels[ch.id]}
              onChange={(updates) => updateChannel(ch.id, updates)}
            />
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: 2, background: "var(--panel-shadow)", margin: "8px 0" }} />

        {/* Master Section */}
        <MasterStrip level={masterLevel} onLevelChange={setMasterLevel} />

        {/* Routing Matrix */}
        <div className="flex flex-col gap-2 ml-auto" style={{ minWidth: 160 }}>
          <RoutingSection channels={channels} onToggle={updateChannel} />
          <OutputMeter level={masterLevel} />
        </div>
      </div>
    </div>
  )
}

// ── Channel Strip ──────────────────────────────────────────────────────────────

function ChannelStrip({
  channel,
  state,
  onChange,
}: {
  channel: (typeof CHANNELS)[0]
  state: ChannelState
  onChange: (updates: Partial<ChannelState>) => void
}) {
  const isActive = !state.mute && state.level > 0

  return (
    <div
      className="flex flex-col items-center panel-raised"
      style={{
        width: 64,
        padding: "8px 6px",
        gap: 8,
        opacity: state.mute ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Channel Label */}
      <div
        className="w-full text-center py-1 rounded"
        style={{
          background: `${channel.color}20`,
          border: `1px solid ${channel.color}40`,
        }}
      >
        <span
          className="font-mono uppercase font-semibold"
          style={{ fontSize: 8, letterSpacing: "0.5px", color: channel.color }}
        >
          {channel.label}
        </span>
      </div>

      {/* VU Meter */}
      <VUMeter level={isActive ? state.level : 0} color={channel.color} />

      {/* Level Knob */}
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={state.level}
          min={0}
          max={100}
          size="small"
          label=""
          displayValue=""
          accentColor={channel.color}
          onChange={(v) => onChange({ level: v })}
        />
        <span className="font-mono" style={{ fontSize: 7, color: "var(--text-display)" }}>
          {state.level === 0 ? "-∞" : `${Math.round(state.level)}%`}
        </span>
        <span className="font-mono uppercase" style={{ fontSize: 5, color: "var(--text-label)" }}>
          LEVEL
        </span>
      </div>

      {/* Pan Knob */}
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={state.pan}
          min={-100}
          max={100}
          size="mini"
          label=""
          displayValue=""
          accentColor={channel.color}
          onChange={(v) => onChange({ pan: v })}
        />
        <span className="font-mono" style={{ fontSize: 6, color: "var(--text-label)" }}>
          {state.pan === 0 ? "C" : state.pan < 0 ? `L${Math.abs(state.pan)}` : `R${state.pan}`}
        </span>
        <span className="font-mono uppercase" style={{ fontSize: 5, color: "var(--text-label)" }}>
          PAN
        </span>
      </div>

      {/* Mute / Solo Buttons */}
      <div className="flex gap-1 mt-auto">
        <button
          className="font-mono font-bold"
          style={{
            fontSize: 7,
            padding: "3px 6px",
            background: state.mute ? "#ef4444" : "rgba(255,255,255,0.6)",
            color: state.mute ? "#fff" : "var(--text-label)",
            border: `1px solid ${state.mute ? "#ef4444" : "var(--panel-shadow)"}`,
            borderRadius: 2,
            cursor: "pointer",
          }}
          onClick={() => onChange({ mute: !state.mute })}
          title="Mute this channel"
        >
          M
        </button>
        <button
          className="font-mono font-bold"
          style={{
            fontSize: 7,
            padding: "3px 6px",
            background: state.solo ? "#f59e0b" : "rgba(255,255,255,0.6)",
            color: state.solo ? "#fff" : "var(--text-label)",
            border: `1px solid ${state.solo ? "#f59e0b" : "var(--panel-shadow)"}`,
            borderRadius: 2,
            cursor: "pointer",
          }}
          onClick={() => onChange({ solo: !state.solo })}
          title="Solo this channel"
        >
          S
        </button>
      </div>
    </div>
  )
}

// ── Master Strip ───────────────────────────────────────────────────────────────

function MasterStrip({ level, onLevelChange }: { level: number; onLevelChange: (v: number) => void }) {
  return (
    <div
      className="flex flex-col items-center panel-raised"
      style={{
        width: 80,
        padding: "8px 6px",
        gap: 8,
        background: "linear-gradient(180deg, #e8eaef 0%, #dce0e8 100%)",
      }}
    >
      {/* Master Label */}
      <div
        className="w-full text-center py-1 rounded"
        style={{
          background: "#10b98120",
          border: "1px solid #10b98140",
        }}
      >
        <span
          className="font-mono uppercase font-bold"
          style={{ fontSize: 9, letterSpacing: "1px", color: "#10b981" }}
        >
          MASTER
        </span>
      </div>

      {/* Stereo VU */}
      <div className="flex gap-1">
        <VUMeter level={level * 0.95} color="#10b981" />
        <VUMeter level={level} color="#10b981" />
      </div>

      {/* Level Knob */}
      <div className="flex flex-col items-center gap-1">
        <Knob
          value={level}
          min={0}
          max={100}
          size="medium"
          label=""
          displayValue=""
          accentColor="#10b981"
          onChange={onLevelChange}
        />
        <span className="font-mono font-semibold" style={{ fontSize: 9, color: "#10b981" }}>
          {level === 0 ? "-∞ dB" : `${Math.round(20 * Math.log10(level / 100))} dB`}
        </span>
        <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)" }}>
          OUTPUT
        </span>
      </div>

      {/* Clip indicator */}
      <div className="flex items-center gap-2 mt-auto">
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: level > 95 ? "#ef4444" : "#2a2d34",
            boxShadow: level > 95 ? "0 0 6px #ef4444" : "none",
            transition: "all 0.1s",
          }}
        />
        <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)" }}>
          CLIP
        </span>
      </div>
    </div>
  )
}

// ── VU Meter ───────────────────────────────────────────────────────────────────

function VUMeter({ level, color }: { level: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animatedLevel = useRef(0)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const { width, height } = canvas

      // Smooth animation
      const target = level / 100
      animatedLevel.current += (target - animatedLevel.current) * 0.12

      // Background
      ctx.fillStyle = "#2a2d34"
      ctx.fillRect(0, 0, width, height)

      // Segments
      const segments = 10
      const segH = (height - segments + 1) / segments
      const fillLevel = animatedLevel.current

      for (let i = 0; i < segments; i++) {
        const segmentLevel = (segments - i) / segments
        const y = i * (segH + 1)

        if (fillLevel >= segmentLevel - 0.1) {
          // Lit segment - color coded
          const segColor = i < 2 ? "#ef4444" : i < 3 ? "#f59e0b" : color
          ctx.fillStyle = segColor
        } else {
          // Unlit segment
          ctx.fillStyle = "#3a3d44"
        }

        ctx.fillRect(1, y, width - 2, segH)
      }

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [level, color])

  return (
    <div className="panel-recessed" style={{ borderRadius: 2 }}>
      <canvas ref={canvasRef} width={14} height={70} style={{ display: "block" }} />
    </div>
  )
}

// ── Routing Section ────────────────────────────────────────────────────────────

function RoutingSection({
  channels,
  onToggle,
}: {
  channels: Record<string, ChannelState>
  onToggle: (id: string, updates: Partial<ChannelState>) => void
}) {
  return (
    <div className="panel-raised p-3 flex flex-col gap-2">
      <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "var(--text-section)" }}>
        FILTER ROUTING
      </span>
      <span className="font-mono" style={{ fontSize: 5, color: "var(--text-label)", marginBottom: 4 }}>
        Select which filter(s) each source routes to
      </span>

      {/* Header Row */}
      <div className="flex items-center gap-1">
        <div style={{ width: 40 }} />
        {CHANNELS.map((ch) => (
          <div key={ch.id} className="flex-1 text-center">
            <span className="font-mono font-semibold" style={{ fontSize: 6, color: ch.color }}>
              {ch.shortLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Filter 1 Row */}
      <div className="flex items-center gap-1">
        <span className="font-mono" style={{ fontSize: 6, color: "#a855f7", width: 40 }}>
          FLT 1
        </span>
        {CHANNELS.map((ch) => (
          <div key={ch.id} className="flex-1 flex justify-center">
            <button
              className="panel-recessed"
              style={{
                width: 18,
                height: 18,
                borderRadius: 2,
                background: channels[ch.id].toFilter1 ? "#a855f7" : "#3a3d44",
                border: "1px solid var(--panel-shadow)",
                cursor: "pointer",
              }}
              onClick={() => onToggle(ch.id, { toFilter1: !channels[ch.id].toFilter1 })}
              title={`Route ${ch.label} to Filter 1`}
            />
          </div>
        ))}
      </div>

      {/* Filter 2 Row */}
      <div className="flex items-center gap-1">
        <span className="font-mono" style={{ fontSize: 6, color: "#10b981", width: 40 }}>
          FLT 2
        </span>
        {CHANNELS.map((ch) => (
          <div key={ch.id} className="flex-1 flex justify-center">
            <button
              className="panel-recessed"
              style={{
                width: 18,
                height: 18,
                borderRadius: 2,
                background: channels[ch.id].toFilter2 ? "#10b981" : "#3a3d44",
                border: "1px solid var(--panel-shadow)",
                cursor: "pointer",
              }}
              onClick={() => onToggle(ch.id, { toFilter2: !channels[ch.id].toFilter2 })}
              title={`Route ${ch.label} to Filter 2`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Output Meter ───────────────────────────────────────────────────────────────

function OutputMeter({ level }: { level: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const { width, height } = canvas
      ctx.fillStyle = "#1a1d24"
      ctx.fillRect(0, 0, width, height)

      // Draw simple waveform based on level
      const amp = (level / 100) * height * 0.4
      ctx.strokeStyle = "#10b981"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let x = 0; x < width; x++) {
        const t = (x / width) * Math.PI * 4 + phaseRef.current
        const y = height / 2 - Math.sin(t) * amp
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()

      phaseRef.current += 0.05
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [level])

  return (
    <div className="panel-raised p-2 flex flex-col gap-1">
      <span className="font-mono uppercase" style={{ fontSize: 6, letterSpacing: "1px", color: "var(--text-label)" }}>
        OUTPUT
      </span>
      <div className="panel-recessed" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={140} height={50} style={{ display: "block", width: "100%" }} />
      </div>
    </div>
  )
}
