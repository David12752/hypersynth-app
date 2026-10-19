"use client"

import { useRef, useEffect, useState } from "react"
import { Knob } from "../Knob"
import { ToggleButton } from "../ToggleButton"
import { EnvelopeDisplay } from "../EnvelopeDisplay"

interface EnvelopeState {
  attack: number
  decay: number
  sustain: number
  release: number
  // Extended params
  hold?: number           // hold time at peak before decay
  delay?: number          // pre-envelope delay
  curve?: "log" | "lin" | "exp"  // slope shape
  trigger: "GATE" | "TRIG" | "LOOP"
  velocity: number
  keytrack?: number       // pitch→speed tracking
}

interface LFOState {
  waveform: "sine" | "triangle" | "saw" | "square" | "sh"
  rate: number
  amount: number
  // Extended params
  phase?: number          // start phase 0–100 → 0°–360°
  fade?: number           // fade-in time (ms)
  sync: boolean
  retrig: boolean
  bipolar?: boolean       // +/- or 0/+
  oneShot?: boolean       // single cycle
}

interface ModulatorPanelProps {
  selectedEnv: number
  envelopes: EnvelopeState[]
  lfos: LFOState[]
  onSelectEnv: (index: number) => void
  onEnvChange: (index: number, state: Partial<EnvelopeState>) => void
  onLFOChange: (index: number, state: Partial<LFOState>) => void
}

const ENV_COLORS = ["#f59e0b", "#f07c2a", "#e05050", "#a855f7", "#10b981"]
const LFO_COLORS = ["#5865f2", "#10b981", "#a855f7", "#f59e0b", "#ef4444"]

// Number tab selector
function NumberTabs({
  count,
  selected,
  colors,
  onSelect,
}: {
  count: number
  selected: number
  colors: string[]
  onSelect: (i: number) => void
}) {
  return (
    <div className="flex gap-px">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className="font-mono"
          style={{
            width: 18,
            height: 16,
            fontSize: 8,
            fontWeight: selected === i ? 700 : 400,
            background: selected === i ? colors[i] : "rgba(255,255,255,0.5)",
            color: selected === i ? "#fff" : "var(--text-label)",
            border: `1px solid ${selected === i ? colors[i] : "var(--panel-shadow)"}`,
            borderRadius: 2,
            boxShadow: selected === i ? `0 1px 4px ${colors[i]}50` : "none",
          }}
        >
          {i + 1}
        </button>
      ))}
    </div>
  )
}


export function ModulatorPanel({
  selectedEnv,
  envelopes,
  lfos,
  onSelectEnv,
  onEnvChange,
  onLFOChange,
}: ModulatorPanelProps) {
  const [selectedLfo, setSelectedLfo] = useState(0)

  // Normalize all envelopes to have optional fields filled in
  const extEnvs = (envelopes.length < 5
    ? [...envelopes, ...Array(5 - envelopes.length).fill(null)]
    : envelopes
  ).map((e) =>
    e
      ? { hold: 0, delay: 0, curve: "lin" as const, keytrack: 0, ...e }
      : { attack: 1, decay: 30, sustain: 80, release: 20, hold: 0, delay: 0, curve: "lin" as const, trigger: "GATE" as const, velocity: 100, keytrack: 0 }
  )

  const extLfos = (lfos.length < 5
    ? [...lfos, ...Array(5 - lfos.length).fill(null)]
    : lfos
  ).map((l) =>
    l
      ? { phase: 0, fade: 0, bipolar: true, oneShot: false, ...l }
      : { waveform: "sine" as const, rate: 30, amount: 50, phase: 0, fade: 0, sync: false, retrig: false, bipolar: true, oneShot: false }
  )

  const env = extEnvs[selectedEnv] ?? extEnvs[0]
  const lfo = extLfos[selectedLfo] ?? extLfos[0]
  const envColor = ENV_COLORS[selectedEnv] ?? ENV_COLORS[0]
  const lfoColor = LFO_COLORS[selectedLfo] ?? LFO_COLORS[0]

  const fmtMs  = (v: number) => { const ms = v * 10; return ms >= 1000 ? `${(ms/1000).toFixed(1)}s` : `${Math.round(ms)}ms` }
  const fmtPct = (v: number) => `${Math.round(v)}%`
  const fmtDeg = (v: number) => `${Math.round(v * 3.6)}°`
  const fmtRate = (v: number, sync: boolean) => {
    if (sync) {
      const divs = ["1/32","1/16","1/8","1/4","1/2","1","2","4","8"]
      return divs[Math.min(Math.floor((v / 100) * (divs.length - 1)), divs.length - 1)]
    }
    return `${(0.01 + (v / 100) * 20).toFixed(2)}Hz`
  }

  return (
    <div className="flex flex-col overflow-hidden panel-raised" style={{ width: 300, height: "100%", minHeight: 0 }}>

      {/* ═══════════════════════ ENVELOPE ═══════════════════════ */}
      <div style={{ flexShrink: 0 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-2"
          style={{ height: 22, background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)", borderBottom: "1px solid var(--panel-shadow)" }}>
          <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1.5px", color: "var(--text-section)" }}>
            ENVELOPE
          </span>
          <NumberTabs count={5} selected={selectedEnv} colors={ENV_COLORS} onSelect={onSelectEnv} />
        </div>

        <div style={{ padding: "5px 8px 4px" }} className="flex flex-col gap-1">
          {/* Envelope display — enlarged */}
          <EnvelopeDisplay
            attack={env.attack} decay={env.decay} sustain={env.sustain} release={env.release}
            color={envColor} height={68}
          />

          {/* Row 1: DLY · A · HLD */}
          <div className="flex justify-around">
            {([
              { k: "delay",   lb: "DLY", fmt: fmtMs  },
              { k: "attack",  lb: "A",   fmt: fmtMs  },
              { k: "hold",    lb: "HLD", fmt: fmtMs  },
            ] as { k: keyof typeof env; lb: string; fmt: (v: number) => string }[]).map(({ k, lb, fmt }) => (
              <Knob key={String(k)} value={env[k] as number} min={0} max={100} size="small"
                label={lb} displayValue={fmt(env[k] as number)} accentColor={envColor}
                onChange={(v) => onEnvChange(selectedEnv, { [k]: v } as Partial<EnvelopeState>)} />
            ))}
          </div>

          {/* Row 2: D · S · R */}
          <div className="flex justify-around">
            {([
              { k: "decay",   lb: "D", fmt: fmtMs  },
              { k: "sustain", lb: "S", fmt: fmtPct },
              { k: "release", lb: "R", fmt: fmtMs  },
            ] as { k: keyof typeof env; lb: string; fmt: (v: number) => string }[]).map(({ k, lb, fmt }) => (
              <Knob key={String(k)} value={env[k] as number} min={0} max={100} size="small"
                label={lb} displayValue={fmt(env[k] as number)} accentColor={envColor}
                onChange={(v) => onEnvChange(selectedEnv, { [k]: v } as Partial<EnvelopeState>)} />
            ))}
          </div>

          {/* Curve + VEL + KEYTRACK row */}
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>CURVE</span>
              <div className="flex gap-px">
                {(["log", "lin", "exp"] as const).map((c) => (
                  <button key={c} className="font-mono uppercase"
                    style={{
                      padding: "1px 6px", fontSize: 7, borderRadius: 2,
                      background: env.curve === c ? envColor : "rgba(255,255,255,0.55)",
                      color: env.curve === c ? "#fff" : "var(--text-label)",
                      border: `1px solid ${env.curve === c ? envColor : "var(--panel-shadow)"}`,
                      boxShadow: env.curve === c ? `0 1px 3px ${envColor}60` : "none",
                    }}
                    onClick={() => onEnvChange(selectedEnv, { curve: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 ml-auto">
              <Knob value={env.velocity} min={0} max={100} size="mini" label="VEL"
                displayValue={fmtPct(env.velocity)} accentColor={envColor}
                onChange={(v) => onEnvChange(selectedEnv, { velocity: v })} />
              <Knob value={env.keytrack as number} min={0} max={100} size="mini" label="K.TRK"
                displayValue={fmtPct(env.keytrack as number)} accentColor={envColor}
                onChange={(v) => onEnvChange(selectedEnv, { keytrack: v })} />
            </div>
          </div>

          {/* Trigger mode */}
          <div className="flex items-center gap-1.5">
            <span className="font-mono uppercase" style={{ fontSize: 6, letterSpacing: "1px", color: "var(--text-label)" }}>MODE</span>
            <div className="flex gap-px">
              {(["GATE", "TRIG", "LOOP"] as const).map((mode) => (
                <ToggleButton key={mode} label={mode} active={env.trigger === mode} accentColor={envColor}
                  onClick={() => onEnvChange(selectedEnv, { trigger: mode })} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--panel-shadow)", flexShrink: 0 }} />

      {/* ═══════════════════════ LFO ═══════════════════════ */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-2"
          style={{ height: 22, background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)", borderBottom: "1px solid var(--panel-shadow)", flexShrink: 0 }}>
          <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1.5px", color: "var(--text-section)" }}>
            LFO
          </span>
          <NumberTabs count={5} selected={selectedLfo} colors={LFO_COLORS} onSelect={setSelectedLfo} />
        </div>

        <div style={{ padding: "5px 8px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {/* Waveform shape buttons */}
          <div className="flex gap-px" style={{ flexShrink: 0 }}>
            {(["sine", "triangle", "saw", "square", "sh"] as const).map((wf) => (
              <button key={wf} className="flex-1 font-mono"
                style={{
                  padding: "2px 0", fontSize: wf === "sh" ? 7 : 11,
                  background: lfo.waveform === wf ? lfoColor : "rgba(255,255,255,0.55)",
                  color: lfo.waveform === wf ? "#fff" : "var(--text-label)",
                  border: `1px solid ${lfo.waveform === wf ? lfoColor : "var(--panel-shadow)"}`,
                  boxShadow: lfo.waveform === wf ? `0 1px 4px ${lfoColor}60` : "none",
                }}
                onClick={() => onLFOChange(selectedLfo, { waveform: wf })}>
                {{ sine: "∿", triangle: "△", saw: "⊿", square: "⊓", sh: "S&H" }[wf]}
              </button>
            ))}
          </div>

          {/* LFO canvas — fills remaining height */}
          <LFOCanvas waveform={lfo.waveform} rate={lfo.rate} color={lfoColor} bipolar={lfo.bipolar ?? true} />

          {/* Knobs: RATE · DEPTH · PHASE · FADE */}
          <div className="flex justify-around" style={{ flexShrink: 0 }}>
            <Knob value={lfo.rate} min={0} max={100} size="small" label="RATE"
              displayValue={fmtRate(lfo.rate, lfo.sync)} accentColor={lfoColor}
              onChange={(v) => onLFOChange(selectedLfo, { rate: v })} />
            <Knob value={lfo.amount} min={0} max={100} size="small" label="DEPTH"
              displayValue={fmtPct(lfo.amount)} accentColor={lfoColor}
              onChange={(v) => onLFOChange(selectedLfo, { amount: v })} />
            <Knob value={lfo.phase ?? 0} min={0} max={100} size="small" label="PHASE"
              displayValue={fmtDeg(lfo.phase ?? 0)} accentColor={lfoColor}
              onChange={(v) => onLFOChange(selectedLfo, { phase: v })} />
            <Knob value={lfo.fade ?? 0} min={0} max={100} size="small" label="FADE"
              displayValue={fmtMs(lfo.fade ?? 0)} accentColor={lfoColor}
              onChange={(v) => onLFOChange(selectedLfo, { fade: v })} />
          </div>

          {/* Toggle strip: SYNC · RETRIG · BI/UNI · 1-SHT */}
          <div className="flex gap-px" style={{ flexShrink: 0 }}>
            {([
              { k: "sync",    lb: "SYNC"  },
              { k: "retrig",  lb: "RETRIG"},
              { k: "bipolar", lb: "BIP"   },
              { k: "oneShot", lb: "1-SHT" },
            ] as { k: "sync"|"retrig"|"bipolar"|"oneShot"; lb: string }[]).map(({ k, lb }) => {
              const on = !!(lfo[k] ?? (k === "bipolar" ? true : false))
              return (
                <button key={k} className="flex-1 flex items-center justify-center gap-1 py-0.5"
                  style={{
                    background: on ? lfoColor : "rgba(255,255,255,0.5)",
                    border: `1px solid ${on ? lfoColor : "var(--panel-shadow)"}`,
                    boxShadow: on ? `0 1px 3px ${lfoColor}50` : "none",
                    borderRadius: 2,
                  }}
                  onClick={() => onLFOChange(selectedLfo, { [k]: !on } as Partial<LFOState>)}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: on ? "#fff" : "var(--led-off)",
                    boxShadow: on ? "0 0 4px #fff" : "none" }} />
                  <span className="font-mono uppercase"
                    style={{ fontSize: 6, color: on ? "#fff" : "var(--text-label)", letterSpacing: "0.5px" }}>
                    {lb}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Animated LFO Canvas — grows to fill available space via ResizeObserver
function LFOCanvas({
  waveform, rate, color, bipolar = true,
}: {
  waveform: LFOState["waveform"]
  rate: number
  color: string
  bipolar?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const animRef      = useRef<number>(0)
  const phaseRef     = useRef(0)
  const sizeRef      = useRef({ w: 284, h: 60 })

  // Keep canvas buffer in sync with rendered size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      sizeRef.current = { w: Math.max(1, Math.floor(width)), h: Math.max(1, Math.floor(height)) }
      const canvas = canvasRef.current
      if (canvas) { canvas.width = sizeRef.current.w; canvas.height = sizeRef.current.h }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.fillStyle = "#1a1d24"
      ctx.fillRect(0, 0, w, h)

      // Midline
      const baseline = bipolar ? h / 2 : h - 5
      ctx.strokeStyle = "rgba(255,255,255,0.08)"
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath(); ctx.moveTo(0, baseline); ctx.lineTo(w, baseline); ctx.stroke()
      ctx.setLineDash([])

      // Waveform
      const amplitude = bipolar ? (h / 2 - 4) : (h - 9)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      const phase = phaseRef.current
      for (let x = 0; x <= w; x++) {
        const t = (x / w) * Math.PI * 4 + phase
        let y = 0
        switch (waveform) {
          case "sine":     y = Math.sin(t); break
          case "triangle": y = 2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1; break
          case "saw":      y = 1 - 2 * ((t / (Math.PI * 2)) % 1); break
          case "square":   y = Math.sin(t) > 0 ? 1 : -1; break
          case "sh":       y = (Math.floor(t / (Math.PI / 2)) % 4 < 2) ? 0.75 : -0.75; break
        }
        const py = bipolar ? baseline - y * amplitude : baseline - ((y + 1) / 2) * amplitude
        x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
      }
      ctx.stroke()
      phaseRef.current += 0.04 * (rate / 50)
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [waveform, rate, color, bipolar])

  return (
    <div ref={containerRef} className="panel-recessed" style={{ flex: 1, minHeight: 44, borderRadius: 2, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  )
}
