"use client"

import { useRef, useEffect } from "react"
import { getScopeFrame } from "@/lib/audio/AudioBridge"

interface OscilloscopeProps {
  mode: "WAVE" | "FFT" | "XY"
  onModeChange?: (mode: "WAVE" | "FFT" | "XY") => void
  compact?: boolean
}

export function Oscilloscope({ mode, onModeChange, compact = false }: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const width = canvas.width
      const height = canvas.height

      // CRT-style green phosphor background
      ctx.fillStyle = "#030a03"
      ctx.fillRect(0, 0, width, height)

      // Draw grid
      ctx.strokeStyle = "#0a1a0a"
      ctx.lineWidth = 1
      const cellsX = 16
      const cellsY = 4
      for (let i = 0; i <= cellsX; i++) {
        const x = (width / cellsX) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let i = 0; i <= cellsY; i++) {
        const y = (height / cellsY) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Draw waveform based on mode
      ctx.strokeStyle = "#10b981"
      ctx.lineWidth = 1.5
      const samples = getScopeFrame().samples

      if (mode === "WAVE") {
        ctx.beginPath()
        const centerY = height / 2
        const amplitude = height * 0.35

        for (let x = 0; x < width; x++) {
          const sampleIndex = samples.length > 1 ? Math.floor((x / (width - 1 || 1)) * (samples.length - 1)) : 0
          const y = samples.length > 0 ? samples[sampleIndex] : 0
          const py = centerY - y * amplitude

          if (x === 0) {
            ctx.moveTo(x, py)
          } else {
            ctx.lineTo(x, py)
          }
        }
        ctx.stroke()
      } else if (mode === "FFT") {
        const bars = 32
        const barWidth = width / bars - 2
        for (let i = 0; i < bars; i++) {
          const start = Math.floor((i / bars) * samples.length)
          const end = Math.max(start + 1, Math.floor(((i + 1) / bars) * samples.length))
          let peak = 0
          for (let idx = start; idx < end; idx++) {
            peak = Math.max(peak, Math.abs(samples[idx] ?? 0))
          }
          const barHeight = peak * height * 0.8
          const x = i * (barWidth + 2) + 1
          const y = height - barHeight

          ctx.fillStyle = "#10b981"
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      } else if (mode === "XY") {
        ctx.beginPath()
        const centerX = width / 2
        const centerY = height / 2
        const radius = Math.min(width, height) * 0.42
        const offset = Math.max(1, Math.floor(samples.length / 8))

        for (let i = 0; i < samples.length; i++) {
          const x = centerX + (samples[i] ?? 0) * radius
          const y = centerY - (samples[(i + offset) % samples.length] ?? 0) * radius

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        if (samples.length > 0) {
          ctx.stroke()
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [mode])

  if (compact) {
    return (
      <div className="relative flex h-full w-full" style={{ background: "#030a03" }}>
        {/* Mode buttons — compact vertical strip on left */}
        <div className="flex flex-col justify-center gap-px px-1" style={{ background: "#050f05", flexShrink: 0 }}>
          {(["WAVE", "FFT", "XY"] as const).map((m) => (
            <button
              key={m}
              className="font-mono uppercase"
              style={{
                fontSize: 5,
                letterSpacing: "0.5px",
                padding: "1px 3px",
                background: mode === m ? "#10b981" : "transparent",
                color: mode === m ? "#000" : "#10b981",
                border: "none",
                lineHeight: 1.4,
              }}
              onClick={() => onModeChange?.(m)}
            >
              {m}
            </button>
          ))}
        </div>
        {/* Canvas */}
        <div className="relative flex-1">
          <canvas ref={canvasRef} width={800} height={40} className="w-full h-full" style={{ display: "block" }} />
          <div className="absolute inset-0 pointer-events-none crt-scanlines" />
        </div>
        {/* Right info strip */}
        <div className="flex flex-col justify-center gap-px px-1" style={{ background: "#050f05", flexShrink: 0 }}>
          <span className="font-mono" style={{ fontSize: 5, color: "#10b981", letterSpacing: "0.5px" }}>-12dB</span>
          <span className="font-mono" style={{ fontSize: 5, color: "#4a5568", letterSpacing: "0.5px" }}>1ms</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[72px]" style={{ background: "#030a03" }}>
      {/* Mode buttons */}
      <div className="flex items-center justify-between px-2 py-1" style={{ background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)" }}>
        <div className="flex gap-1">
          {(["WAVE", "FFT", "XY"] as const).map((m) => (
            <button
              key={m}
              className="px-2 py-0.5 font-mono uppercase transition-colors"
              style={{
                fontSize: 6,
                letterSpacing: "1px",
                background: mode === m ? "#10b981" : "rgba(255,255,255,0.5)",
                color: mode === m ? "#fff" : "#10b981",
                border: `1px solid ${mode === m ? "#10b981" : "#a0a8b8"}`,
              }}
              onClick={() => onModeChange?.(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[6px] uppercase" style={{ color: "#10b981", letterSpacing: "1px" }}>
            -12dB
          </span>
          <span className="font-mono text-[6px] uppercase" style={{ color: "#6b7280", letterSpacing: "1px" }}>
            1ms/div
          </span>
        </div>
      </div>

      {/* Scope display */}
      <div className="relative flex-1">
        <canvas ref={canvasRef} width={800} height={48} className="w-full h-full" />
        {/* CRT scanline overlay */}
        <div className="absolute inset-0 pointer-events-none crt-scanlines" />
      </div>
    </div>
  )
}
