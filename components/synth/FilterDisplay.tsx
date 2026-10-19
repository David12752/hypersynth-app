"use client"

import { useRef, useEffect, useCallback, useState } from "react"

interface FilterDisplayProps {
  cutoff: number // 0-100 percentage
  resonance: number // 0-100 percentage
  filterType: "LP" | "HP" | "BP" | "NOTCH"
  color?: string
  height?: number
  onCutoffChange?: (value: number) => void
  onResonanceChange?: (value: number) => void
}

export function FilterDisplay({
  cutoff,
  resonance,
  filterType,
  color = "#c080f8",
  height = 160,
  onCutoffChange,
  onResonanceChange,
}: FilterDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear
    ctx.fillStyle = "#070810"
    ctx.fillRect(0, 0, width, height)

    // Draw frequency grid (log scale approximation)
    ctx.strokeStyle = "#1a1c2e"
    ctx.lineWidth = 1
    const freqLabels = ["20", "100", "1k", "10k", "20k"]
    for (let i = 0; i < 5; i++) {
      const x = (width / 4) * i
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()

      // Frequency labels
      ctx.fillStyle = "#3a3c52"
      ctx.font = "7px monospace"
      ctx.fillText(freqLabels[i], x + 2, height - 4)
    }

    // Draw dB grid
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Calculate filter curve
    const cutoffX = (cutoff / 100) * width
    const resonancePeak = (resonance / 100) * (height * 0.4)

    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    const drawCurve = () => {
      switch (filterType) {
        case "LP":
          // Low pass curve
          ctx.moveTo(0, height * 0.25)
          ctx.lineTo(cutoffX - 20, height * 0.25)
          // Resonance bump
          ctx.quadraticCurveTo(
            cutoffX,
            height * 0.25 - resonancePeak,
            cutoffX + 20,
            height * 0.5
          )
          // Rolloff
          ctx.quadraticCurveTo(cutoffX + 60, height * 0.7, width, height * 0.9)
          break

        case "HP":
          // High pass curve
          ctx.moveTo(0, height * 0.9)
          ctx.quadraticCurveTo(cutoffX - 60, height * 0.7, cutoffX - 20, height * 0.5)
          // Resonance bump
          ctx.quadraticCurveTo(
            cutoffX,
            height * 0.25 - resonancePeak,
            cutoffX + 20,
            height * 0.25
          )
          ctx.lineTo(width, height * 0.25)
          break

        case "BP":
          // Band pass curve
          ctx.moveTo(0, height * 0.9)
          ctx.quadraticCurveTo(cutoffX - 40, height * 0.6, cutoffX - 15, height * 0.3)
          // Peak
          ctx.quadraticCurveTo(
            cutoffX,
            height * 0.15 - resonancePeak * 0.5,
            cutoffX + 15,
            height * 0.3
          )
          ctx.quadraticCurveTo(cutoffX + 40, height * 0.6, width, height * 0.9)
          break

        case "NOTCH":
          // Notch curve
          ctx.moveTo(0, height * 0.25)
          ctx.lineTo(cutoffX - 30, height * 0.25)
          // Notch dip
          ctx.quadraticCurveTo(cutoffX - 10, height * 0.25, cutoffX, height * 0.7 + resonancePeak * 0.3)
          ctx.quadraticCurveTo(cutoffX + 10, height * 0.25, cutoffX + 30, height * 0.25)
          ctx.lineTo(width, height * 0.25)
          break
      }
    }

    drawCurve()
    ctx.stroke()

    // Fill under curve
    ctx.globalAlpha = 0.1
    ctx.fillStyle = color
    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1

    // Draw cutoff handle
    const handleY = filterType === "LP" || filterType === "NOTCH" 
      ? height * 0.25 - resonancePeak 
      : height * 0.25 - resonancePeak
    ctx.beginPath()
    ctx.arc(cutoffX, handleY + resonancePeak, 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = "#fff"
    ctx.lineWidth = 1
    ctx.stroke()
  }, [cutoff, resonance, filterType, color])

  useEffect(() => {
    draw()
  }, [draw])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))

      onCutoffChange?.(x * 100)
      onResonanceChange?.((1 - y) * 100)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, onCutoffChange, onResonanceChange])

  return (
    <div
      ref={containerRef}
      className="panel-recessed overflow-hidden cursor-crosshair"
      style={{ height }}
      onMouseDown={handleMouseDown}
    >
      <canvas
        ref={canvasRef}
        width={400}
        height={height}
        className="w-full h-full"
      />
    </div>
  )
}
