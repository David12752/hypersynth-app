"use client"

import { useRef, useEffect, useCallback } from "react"

interface EnvelopeDisplayProps {
  attack: number // 0-100
  decay: number // 0-100
  sustain: number // 0-100
  release: number // 0-100
  color?: string
  height?: number
}

export function EnvelopeDisplay({
  attack,
  decay,
  sustain,
  release,
  color = "#f5a06e",
  height = 80,
}: EnvelopeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const h = canvas.height
    const padding = 8

    // Clear
    ctx.fillStyle = "#070810"
    ctx.fillRect(0, 0, width, h)

    // Draw grid
    ctx.strokeStyle = "#1a1c2e"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const x = (width / 4) * i
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let i = 0; i <= 2; i++) {
      const y = (h / 2) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Calculate envelope points
    const totalTime = attack + decay + 100 + release // 100 = sustain duration
    const attackX = padding + (attack / totalTime) * (width - padding * 2)
    const decayX = attackX + (decay / totalTime) * (width - padding * 2)
    const sustainX = decayX + (100 / totalTime) * (width - padding * 2)
    const releaseX = width - padding

    const sustainY = padding + (1 - sustain / 100) * (h - padding * 2)
    const peakY = padding
    const bottomY = h - padding

    // Draw envelope curve
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(padding, bottomY)
    // Attack
    ctx.lineTo(attackX, peakY)
    // Decay
    ctx.lineTo(decayX, sustainY)
    // Sustain
    ctx.lineTo(sustainX, sustainY)
    // Release
    ctx.lineTo(releaseX, bottomY)
    ctx.stroke()

    // Fill under curve
    ctx.globalAlpha = 0.15
    ctx.fillStyle = color
    ctx.lineTo(padding, bottomY)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // Draw control points
    const points = [
      { x: attackX, y: peakY },
      { x: decayX, y: sustainY },
      { x: sustainX, y: sustainY },
    ]

    points.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
  }, [attack, decay, sustain, release, color])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="panel-recessed overflow-hidden" style={{ height }}>
      <canvas
        ref={canvasRef}
        width={200}
        height={height}
        className="w-full h-full"
      />
    </div>
  )
}
