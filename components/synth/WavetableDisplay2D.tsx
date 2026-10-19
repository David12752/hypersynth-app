"use client"

import { useRef, useEffect, useCallback } from "react"

// ──────────────────────────────────────────────────────────────────────
// WavetableDisplay2D — Crisp HiDPI waveform display
//
// Key qualities:
//   • devicePixelRatio-aware canvas → pixel-perfect on Retina/HiDPI
//   • Catmull-Rom spline interpolation → smooth curves
//   • Multi-pass rendering: glow + main + highlight
//   • Dark background with subtle scan-line grid
//   • Frame scrubbing via pointer drag
// ──────────────────────────────────────────────────────────────────────

interface WavetableDisplay2DProps {
  frames: number[][]
  framePosition: number
  onFrameChange?: (position: number) => void
  color?: string
  height?: number | string
  liveSamples?: Float32Array | null
  showLabel?: boolean
}

export function WavetableDisplay2D({
  frames,
  framePosition,
  onFrameChange,
  color = "#8b5cf6",
  height = 160,
  liveSamples = null,
  showLabel = true,
}: WavetableDisplay2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const smoothedFrameRef = useRef(framePosition)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const getInterpolatedFrame = useCallback(
    (pos: number): number[] => {
      if (frames.length === 0) return []
      if (frames.length === 1) return frames[0]

      const p = Math.max(0, Math.min(1, pos))
      const scaled = p * (frames.length - 1)
      const idx = Math.min(Math.floor(scaled), frames.length - 2)
      const frac = scaled - idx

      const frameA = frames[idx]
      const frameB = frames[idx + 1] ?? frames[idx]
      const len = frameA.length
      const result: number[] = new Array(len)
      for (let i = 0; i < len; i++) {
        result[i] = frameA[i] + (frameB[i] - frameA[i]) * frac
      }
      return result
    },
    [frames]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onFrameChange) return
      isDraggingRef.current = true
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      onFrameChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [onFrameChange]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || !onFrameChange) return
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      onFrameChange(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
    },
    [onFrameChange]
  )

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    // Catmull-Rom spline lookup
    function crSample(data: number[], t: number): number {
      const n = data.length
      const pos = t * n
      const i1 = Math.floor(pos) % n
      const i0 = (i1 - 1 + n) % n
      const i2 = (i1 + 1) % n
      const i3 = (i1 + 2) % n
      const f = pos - Math.floor(pos)
      const p0 = data[i0], p1 = data[i1], p2 = data[i2], p3 = data[i3]
      return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (-p0 + 3 * p1 - 3 * p2 + p3)))
    }

    const draw = () => {
      // ── HiDPI resize ───────────────────────────────────────
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      smoothedFrameRef.current += (framePosition - smoothedFrameRef.current) * 0.18

      const cx = h / 2
      const amp = h * 0.55

      // ── Background ─────────────────────────────────────────
      ctx.fillStyle = "#08090e"
      ctx.fillRect(0, 0, w, h)

      // ── Grid ───────────────────────────────────────────────
      ctx.strokeStyle = "rgba(80, 100, 160, 0.10)"
      ctx.lineWidth = dpr * 0.5
      for (let i = 0; i <= 4; i++) {
        const y = Math.round((h / 4) * i) + 0.5
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      for (let i = 0; i <= 16; i++) {
        const x = Math.round((w / 16) * i) + 0.5
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      // Zero line
      ctx.strokeStyle = "rgba(80, 100, 160, 0.22)"
      ctx.lineWidth = dpr * 0.7
      ctx.beginPath(); ctx.moveTo(0, Math.round(cx) + 0.5); ctx.lineTo(w, Math.round(cx) + 0.5); ctx.stroke()

      // ── Waveform data ──────────────────────────────────────
      const waveData = getInterpolatedFrame(smoothedFrameRef.current)
      if (waveData.length === 0) { animationRef.current = requestAnimationFrame(draw); return }

      // Build path with Catmull-Rom interpolation
      const pts: number[] = new Array(w * 2)
      for (let px = 0; px < w; px++) {
        const t = px / w
        const s = crSample(waveData, t)
        pts[px * 2] = px
        pts[px * 2 + 1] = cx - s * amp
      }

      // ── Gradient fill ──────────────────────────────────────
      const grad = ctx.createLinearGradient(0, cx - amp, 0, cx + amp)
      grad.addColorStop(0, color + "28")
      grad.addColorStop(0.45, color + "06")
      grad.addColorStop(0.55, color + "06")
      grad.addColorStop(1, color + "28")

      ctx.beginPath()
      ctx.moveTo(0, cx)
      for (let i = 0; i < w; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
      ctx.lineTo(w, cx)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // ── Glow pass ──────────────────────────────────────────
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = 10 * dpr
      ctx.strokeStyle = color + "50"
      ctx.lineWidth = 3.5 * dpr
      ctx.lineJoin = "round"
      ctx.beginPath()
      for (let i = 0; i < w; i++) {
        i === 0 ? ctx.moveTo(pts[0], pts[1]) : ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
      }
      ctx.stroke()
      ctx.restore()

      // ── Main crisp line ────────────────────────────────────
      ctx.strokeStyle = color
      ctx.lineWidth = 1.6 * dpr
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      for (let i = 0; i < w; i++) {
        i === 0 ? ctx.moveTo(pts[0], pts[1]) : ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
      }
      ctx.stroke()

      // ── Bright highlight ───────────────────────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.18)"
      ctx.lineWidth = 0.6 * dpr
      ctx.beginPath()
      for (let i = 0; i < w; i++) {
        i === 0 ? ctx.moveTo(pts[0], pts[1]) : ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
      }
      ctx.stroke()

      // ── Live audio overlay ─────────────────────────────────
      if (liveSamples && liveSamples.length > 0) {
        ctx.strokeStyle = "#10b981a0"
        ctx.lineWidth = 1 * dpr
        ctx.lineJoin = "round"
        ctx.beginPath()
        for (let px = 0; px < w; px++) {
          const idx = (px / w) * liveSamples.length
          const i0 = Math.floor(idx)
          const i1 = Math.min(i0 + 1, liveSamples.length - 1)
          const frac = idx - i0
          const s = liveSamples[i0] + (liveSamples[i1] - liveSamples[i0]) * frac
          const y = cx - s * amp
          px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y)
        }
        ctx.stroke()
      }

      // ── Frame position indicator ───────────────────────────
      if (frames.length > 1) {
        const ix = smoothedFrameRef.current * w
        ctx.strokeStyle = "#ffffff18"
        ctx.lineWidth = dpr
        ctx.setLineDash([4 * dpr, 4 * dpr])
        ctx.beginPath(); ctx.moveTo(ix, 0); ctx.lineTo(ix, h); ctx.stroke()
        ctx.setLineDash([])
      }

      // ── Label ──────────────────────────────────────────────
      if (showLabel && frames.length > 1) {
        const fi = Math.round(smoothedFrameRef.current * (frames.length - 1))
        ctx.fillStyle = "#ffffff60"
        ctx.font = `500 ${10 * dpr}px monospace`
        ctx.textAlign = "right"
        ctx.fillText(`Frame ${fi + 1}/${frames.length}`, w - 8 * dpr, 14 * dpr)
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animationRef.current)
  }, [frames, framePosition, color, getInterpolatedFrame, liveSamples, showLabel])

  return (
    <div
      ref={containerRef}
      className="panel-recessed overflow-hidden relative cursor-crosshair"
      style={{ height }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  )
}
