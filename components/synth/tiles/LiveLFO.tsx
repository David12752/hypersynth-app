"use client"

import { useEffect, useRef } from "react"

export interface LiveLFOProps {
  waveform: "sine" | "triangle" | "saw" | "square" | "sh"
  rate: number    // 0-100
  accent: string
}

export function LiveLFO({ waveform, rate, accent }: LiveLFOProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const SAMPLES = 256
    const speed = 0.003 + (rate / 100) * 0.018  // visual scroll speed

    function drawSample(phase: number): number {
      const p = phase % 1
      switch (waveform) {
        case "sine": return Math.sin(p * Math.PI * 2)
        case "triangle": return p < 0.5 ? p * 4 - 1 : (1 - p) * 4 - 1
        case "saw": return p * 2 - 1
        case "square": return p < 0.5 ? 1 : -1
        case "sh": return Math.random() < 0.005 + speed ? (Math.random() * 2 - 1) : 0
        default: return Math.sin(p * Math.PI * 2)
      }
    }

    // Store S&H values for stable rendering
    const shBuffer = new Float32Array(SAMPLES)
    let shLastVal = 0

    function draw() {
      if (!canvas || !ctx) return
      const w = canvas.width
      const h = canvas.height
      if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(draw); return }

      phaseRef.current = (phaseRef.current + speed) % 1

      ctx.clearRect(0, 0, w, h)

      // Grid
      ctx.strokeStyle = `${accent}18`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()

      const px = 2, py = h * 0.08
      const W = w - px * 2
      const H = h - py * 2
      const margin = H * 0.08

      // Generate waveform with scrolling phase offset
      ctx.beginPath()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.shadowColor = accent
      ctx.shadowBlur = 5

      const grad = ctx.createLinearGradient(0, py, 0, py + H)
      grad.addColorStop(0, `${accent}44`)
      grad.addColorStop(0.5, `${accent}22`)
      grad.addColorStop(1, `${accent}06`)

      const cycles = 3
      const yMid = py + H / 2

      // Fill path
      ctx.beginPath()
      ctx.moveTo(px, yMid)
      for (let i = 0; i < SAMPLES; i++) {
        const adjustedPhase = (phaseRef.current + (i / SAMPLES) * cycles) % 1

        let val: number
        if (waveform === "sh") {
          // stable S&H: only change value at step transitions
          const stepPhase = adjustedPhase * 16
          const step = Math.floor(stepPhase)
          if (step !== Math.floor((phaseRef.current + ((i - 1) / SAMPLES) * cycles) % 1 * 16)) {
            shLastVal = Math.random() * 2 - 1
            shBuffer[i] = shLastVal
          } else {
            shBuffer[i] = i > 0 ? shBuffer[i - 1] : shLastVal
          }
          val = shBuffer[i]
        } else {
          val = drawSample(adjustedPhase)
        }

        const x = px + (i / (SAMPLES - 1)) * W
        const y = yMid - val * (H / 2 - margin)
        if (i === 0) ctx.lineTo(x, yMid)
        ctx.lineTo(x, y)
      }
      ctx.lineTo(px + W, yMid)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // Line
      ctx.beginPath()
      ctx.strokeStyle = accent
      ctx.lineWidth = 2
      ctx.shadowColor = accent
      ctx.shadowBlur = 4

      for (let i = 0; i < SAMPLES; i++) {
        const adjustedPhase = (phaseRef.current + (i / SAMPLES) * cycles) % 1
        const val = waveform === "sh" ? (shBuffer[i] ?? 0) : drawSample(adjustedPhase)
        const x = px + (i / (SAMPLES - 1)) * W
        const y = yMid - val * (H / 2 - margin)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      // Moving cursor (playhead)
      const cursor = px + ((phaseRef.current * cycles) % 1) * W
      ctx.strokeStyle = `#ffffff66`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cursor, py); ctx.lineTo(cursor, py + H); ctx.stroke()

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [waveform, rate, accent])

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
    <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
  )
}
