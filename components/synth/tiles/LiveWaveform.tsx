"use client"

import { useEffect, useRef } from "react"

export interface LiveWaveformProps {
  /** "sine"|"tri"|"saw"|"square"|"noise"|"pwm" */
  waveform: string
  /** 0–100 pulse width (only for square/pwm) */
  pulseWidth?: number
  /** −100..100 morph / FM feedback (unused for basic waveforms) */
  morph?: number
  /** Number of visible cycles */
  cycles?: number
  accent: string
  className?: string
  style?: React.CSSProperties
}

function generateWaveform(
  waveform: string,
  pulseWidth: number,
  samples: number,
  cycles: number
): Float32Array {
  const buf = new Float32Array(samples)
  const pw = Math.max(0.05, Math.min(0.95, pulseWidth / 100))

  for (let i = 0; i < samples; i++) {
    const phase = ((i / samples) * cycles) % 1
    switch (waveform) {
      case "sine":
        buf[i] = Math.sin(phase * Math.PI * 2)
        break
      case "tri": {
        const t = phase * 2
        buf[i] = t < 1 ? t * 2 - 1 : (2 - t) * 2 - 1
        break
      }
      case "saw":
        buf[i] = phase * 2 - 1
        break
      case "square":
      case "sq":
        buf[i] = phase < pw ? 1 : -1
        break
      case "noise":
        buf[i] = Math.random() * 2 - 1
        break
      default:
        buf[i] = Math.sin(phase * Math.PI * 2)
    }
  }
  return buf
}

export function LiveWaveform({
  waveform = "sine",
  pulseWidth = 50,
  cycles = 2,
  accent,
  className,
  style,
}: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const SAMPLES = 512

    function draw() {
      if (!canvas || !ctx) return
      const w = canvas.width
      const h = canvas.height
      if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(draw); return }

      phaseRef.current = (phaseRef.current + 0.004) % 1

      const buf = generateWaveform(waveform, pulseWidth, SAMPLES, cycles)

      ctx.clearRect(0, 0, w, h)

      // Background grid
      ctx.strokeStyle = `${accent}18`
      ctx.lineWidth = 1
      // Horizontal center
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      // Vertical quarters
      for (let i = 1; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo((w * i) / 4, 0)
        ctx.lineTo((w * i) / 4, h)
        ctx.stroke()
      }

      // Waveform fill (under the line)
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, `${accent}55`)
      grad.addColorStop(0.5, `${accent}22`)
      grad.addColorStop(1, `${accent}06`)

      const margin = h * 0.1
      const range = h - margin * 2

      ctx.beginPath()
      for (let i = 0; i < SAMPLES; i++) {
        const x = (i / (SAMPLES - 1)) * w
        const y = margin + ((1 - (buf[i] * 0.9 + 1) / 2)) * range
        if (i === 0) ctx.moveTo(x, h / 2)
        ctx.lineTo(x, y)
      }
      ctx.lineTo(w, h / 2)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // Waveform line
      const lineGrad = ctx.createLinearGradient(0, 0, w, 0)
      lineGrad.addColorStop(0, `${accent}88`)
      lineGrad.addColorStop(0.5, accent)
      lineGrad.addColorStop(1, `${accent}88`)

      ctx.beginPath()
      ctx.strokeStyle = lineGrad
      ctx.lineWidth = 1.5
      ctx.shadowColor = accent
      ctx.shadowBlur = 4

      for (let i = 0; i < SAMPLES; i++) {
        const x = (i / (SAMPLES - 1)) * w
        const y = margin + ((1 - (buf[i] * 0.9 + 1) / 2)) * range
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [waveform, pulseWidth, cycles, accent])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const obs = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    })
    obs.observe(canvas)
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    return () => obs.disconnect()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  )
}
