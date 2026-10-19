"use client"

import { useRef, useEffect } from "react"

interface WaveformDisplayProps {
  waveform: "sine" | "saw" | "square" | "triangle" | "noise"
  color?: string
  height?: number
  animated?: boolean
}

export function WaveformDisplay({
  waveform,
  color = "#5865f2",
  height = 140,
  animated = true,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const width = canvas.width
      const height = canvas.height
      const centerY = height / 2
      const amplitude = height * 0.35

      ctx.fillStyle = "#070810"
      ctx.fillRect(0, 0, width, height)

      // Draw subtle grid
      ctx.strokeStyle = "#1a1c2e"
      ctx.lineWidth = 1
      for (let i = 0; i <= 8; i++) {
        const x = (width / 8) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Draw waveform
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()

      const cycles = 2
      const phase = phaseRef.current

      for (let x = 0; x < width; x++) {
        const t = (x / width) * cycles * Math.PI * 2 + phase
        let y = 0

        switch (waveform) {
          case "sine":
            y = Math.sin(t)
            break
          case "saw":
            y = 1 - 2 * ((t / (Math.PI * 2)) % 1)
            break
          case "square":
            y = Math.sin(t) > 0 ? 1 : -1
            break
          case "triangle":
            y = 2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1
            break
          case "noise":
            y = Math.random() * 2 - 1
            break
        }

        const px = x
        const py = centerY - y * amplitude

        if (x === 0) {
          ctx.moveTo(px, py)
        } else {
          ctx.lineTo(px, py)
        }
      }

      ctx.stroke()

      if (animated) {
        phaseRef.current += 0.02
        animationRef.current = requestAnimationFrame(draw)
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [waveform, color, animated])

  return (
    <div className="panel-recessed overflow-hidden" style={{ height }}>
      <canvas
        ref={canvasRef}
        width={400}
        height={height}
        className="w-full h-full"
      />
    </div>
  )
}
