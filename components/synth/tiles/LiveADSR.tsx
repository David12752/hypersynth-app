"use client"

import { useEffect, useRef } from "react"

export interface LiveADSRProps {
  attack: number   // 0-100 (time)
  decay: number    // 0-100 (time)
  sustain: number  // 0-100 (level)
  release: number  // 0-100 (time)
  accent: string
  /** 0..1 playhead position, -1 = idle */
  playhead?: number
}

export function LiveADSR({ attack, decay, sustain, release, accent, playhead = -1 }: LiveADSRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    if (w < 4 || h < 4) return

    const px = Math.max(2, w * 0.04)  // padding x
    const py = Math.max(2, h * 0.08)  // padding y
    const W = w - px * 2
    const H = h - py * 2

    const total = attack + decay + sustain + release + 20 // gate width proportional
    const a = (attack / total) * W
    const d = (decay / total) * W
    const s = (sustain / total) * W  // "gate hold" segment width
    const r = (release / total) * W
    const susY = py + H * (1 - sustain / 100)

    const pts = [
      [px, py + H],
      [px + a, py],
      [px + a + d, susY],
      [px + a + d + s, susY],
      [px + a + d + s + r, py + H],
    ] as [number, number][]

    ctx.clearRect(0, 0, w, h)

    // Grid
    ctx.strokeStyle = `${accent}18`
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, py + H * 0.5); ctx.lineTo(w, py + H * 0.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, susY); ctx.lineTo(w, susY); ctx.stroke()

    // Fill under ADSR
    const grad = ctx.createLinearGradient(0, py, 0, py + H)
    grad.addColorStop(0, `${accent}44`)
    grad.addColorStop(1, `${accent}08`)
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (const [x, y] of pts) ctx.lineTo(x, y)
    ctx.lineTo(px + a + d + s + r, py + H) // bottom-right
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // ADSR line
    ctx.beginPath()
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.shadowColor = accent
    ctx.shadowBlur = 5
    ctx.moveTo(pts[0][0], pts[0][1])
    for (const [x, y] of pts) ctx.lineTo(x, y)
    ctx.stroke()
    ctx.shadowBlur = 0

    // Handle dots
    ctx.fillStyle = accent
    for (const [x, y] of pts) {
      ctx.beginPath()
      ctx.arc(x, y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Playhead
    if (playhead >= 0 && playhead <= 1) {
      const px2 = px + playhead * W
      ctx.strokeStyle = "#ffffff88"
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 2])
      ctx.beginPath()
      ctx.moveTo(px2, py)
      ctx.lineTo(px2, py + H)
      ctx.stroke()
      ctx.setLineDash([])
    }

  }, [attack, decay, sustain, release, accent, playhead])

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
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  )
}
