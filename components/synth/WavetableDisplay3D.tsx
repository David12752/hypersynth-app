"use client"

import { useRef, useEffect, useCallback, useState } from "react"

// ──────────────────────────────────────────────────────────────────────
// WavetableDisplay3D — Crisp HiDPI 3D wavetable visualiser
//
// Key qualities:
//   • devicePixelRatio-aware → pixel-perfect lines on any screen
//   • Higher sample resolution per row (up to canvas width)
//   • Back-to-front painter's algorithm with depth fog
//   • Active frame glow + white highlight
//   • Waterfall & Surface modes
//   • Mouse drag to orbit camera
// ──────────────────────────────────────────────────────────────────────

type ViewMode = "waterfall" | "surface"

interface WavetableDisplay3DProps {
  frames: number[][]
  framePosition: number
  color?: string
  height?: number | string
  viewMode?: ViewMode
  onFrameChange?: (position: number) => void
}

interface Vec3 { x: number; y: number; z: number }
interface Vec2 { x: number; y: number }

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a)
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }
}
function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a)
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
}
function project(p: Vec3, w: number, h: number, fov: number): Vec2 {
  const d = fov / (fov + p.z)
  return { x: w / 2 + p.x * d, y: h / 2 - p.y * d }
}

export function WavetableDisplay3D({
  frames,
  framePosition,
  color = "#8b5cf6",
  height = 200,
  viewMode = "waterfall",
  onFrameChange,
}: WavetableDisplay3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const angleRef = useRef({ yaw: 0.45, pitch: 0.35 })
  const dragRef = useRef({ active: false, sx: 0, sy: 0, syaw: 0, spitch: 0 })
  const [mode, setMode] = useState<ViewMode>(viewMode)

  useEffect(() => { setMode(viewMode) }, [viewMode])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, syaw: angleRef.current.yaw, spitch: angleRef.current.pitch }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d.active) return
    angleRef.current.yaw = d.syaw + (e.clientX - d.sx) * 0.005
    angleRef.current.pitch = Math.max(-0.8, Math.min(1.2, d.spitch + (e.clientY - d.sy) * 0.005))
  }, [])
  const handlePointerUp = useCallback(() => { dragRef.current.active = false }, [])

  // Parse hex to RGB
  const rgb = useRef({ r: 139, g: 92, b: 246 })
  useEffect(() => {
    const r = parseInt(color.slice(1, 3), 16) || 139
    const g = parseInt(color.slice(3, 5), 16) || 92
    const b = parseInt(color.slice(5, 7), 16) || 246
    rgb.current = { r, g, b }
  }, [color])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.round(rect.width * dpr)
      const h = Math.round(rect.height * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)

      // ── Background ─────────────────────────────────────────
      ctx.fillStyle = "#08090e"
      ctx.fillRect(0, 0, w, h)

      if (frames.length === 0) { animationRef.current = requestAnimationFrame(draw); return }

      const yaw = angleRef.current.yaw
      const pitch = angleRef.current.pitch
      const fov = 400 * dpr
      const numFrames = frames.length
      // Use more samples per row — up to the lesser of frame length and canvas width
      const samplesPerRow = Math.min(frames[0]?.length ?? 512, Math.max(256, Math.round(w / dpr)))
      const sceneW = 200 * dpr
      const sceneD = 160 * dpr
      const sceneH = 80 * dpr
      const activeIdx = Math.round(Math.max(0, Math.min(1, framePosition)) * (numFrames - 1))
      const { r, g, b } = rgb.current

      const transform = (x3d: number, y3d: number, z3d: number): Vec2 => {
        let p: Vec3 = { x: x3d, y: y3d, z: z3d }
        p = rotateY(p, yaw)
        p = rotateX(p, pitch)
        p.z += 350 * dpr
        return project(p, w, h, fov)
      }

      if (mode === "waterfall") {
        // ── Waterfall: back to front ─────────────────────────
        for (let fi = 0; fi < numFrames; fi++) {
          const frame = frames[fi]
          const fLen = frame.length
          const isActive = fi === activeIdx

          const z = (fi / Math.max(1, numFrames - 1)) * sceneD - sceneD / 2
          const depthFade = 0.25 + 0.75 * (fi / Math.max(1, numFrames - 1))
          const alpha = isActive ? 1.0 : depthFade * 0.55

          // Line color
          const lr = Math.round(r * alpha)
          const lg = Math.round(g * alpha)
          const lb = Math.round(b * alpha)

          // Active frame: glow
          if (isActive) {
            ctx.save()
            ctx.shadowColor = color
            ctx.shadowBlur = 14 * dpr
            ctx.strokeStyle = color
            ctx.lineWidth = 2.5 * dpr
            ctx.lineJoin = "round"
            ctx.beginPath()
            for (let si = 0; si < samplesPerRow; si++) {
              const sIdx = Math.floor((si / samplesPerRow) * fLen)
              const sample = frame[sIdx] ?? 0
              const x3d = (si / samplesPerRow - 0.5) * sceneW
              const y3d = sample * sceneH * 0.5
              const p = transform(x3d, y3d, z)
              si === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            }
            ctx.stroke()
            ctx.restore()

            // White highlight on active
            ctx.strokeStyle = "rgba(255,255,255,0.5)"
            ctx.lineWidth = 0.8 * dpr
            ctx.lineJoin = "round"
            ctx.beginPath()
            for (let si = 0; si < samplesPerRow; si++) {
              const sIdx = Math.floor((si / samplesPerRow) * fLen)
              const sample = frame[sIdx] ?? 0
              const x3d = (si / samplesPerRow - 0.5) * sceneW
              const y3d = sample * sceneH * 0.5
              const p = transform(x3d, y3d, z)
              si === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            }
            ctx.stroke()
          } else {
            ctx.strokeStyle = `rgb(${lr},${lg},${lb})`
            ctx.lineWidth = (isActive ? 2.2 : 1.0) * dpr
            ctx.lineJoin = "round"
            ctx.beginPath()
            for (let si = 0; si < samplesPerRow; si++) {
              const sIdx = Math.floor((si / samplesPerRow) * fLen)
              const sample = frame[sIdx] ?? 0
              const x3d = (si / samplesPerRow - 0.5) * sceneW
              const y3d = sample * sceneH * 0.5
              const p = transform(x3d, y3d, z)
              si === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
            }
            ctx.stroke()
          }
        }
      } else {
        // ── Surface mode: filled quads ───────────────────────
        const surfaceSamples = Math.min(samplesPerRow, 128)
        for (let fi = 0; fi < numFrames - 1; fi++) {
          const fA = frames[fi], fB = frames[fi + 1]
          const fLen = fA.length
          const near = Math.abs(fi - activeIdx) <= 1

          const zA = (fi / Math.max(1, numFrames - 1)) * sceneD - sceneD / 2
          const zB = ((fi + 1) / Math.max(1, numFrames - 1)) * sceneD - sceneD / 2

          for (let si = 0; si < surfaceSamples - 1; si++) {
            const iA = Math.floor((si / surfaceSamples) * fLen)
            const iB = Math.floor(((si + 1) / surfaceSamples) * fLen)

            const sA0 = fA[iA] ?? 0, sA1 = fA[iB] ?? 0
            const sB0 = fB[iA] ?? 0, sB1 = fB[iB] ?? 0

            const x0 = (si / surfaceSamples - 0.5) * sceneW
            const x1 = ((si + 1) / surfaceSamples - 0.5) * sceneW

            const c00 = transform(x0, sA0 * sceneH * 0.5, zA)
            const c10 = transform(x1, sA1 * sceneH * 0.5, zA)
            const c11 = transform(x1, sB1 * sceneH * 0.5, zB)
            const c01 = transform(x0, sB0 * sceneH * 0.5, zB)

            const avgH = (sA0 + sA1 + sB0 + sB1) / 4
            const bright = 0.2 + Math.abs(avgH) * 0.6
            const boost = near ? 1.3 : 0.75
            const cr = Math.min(255, Math.round(r * bright * boost))
            const cg = Math.min(255, Math.round(g * bright * boost))
            const cb = Math.min(255, Math.round(b * bright * boost))

            ctx.fillStyle = `rgba(${cr},${cg},${cb},0.65)`
            ctx.beginPath()
            ctx.moveTo(c00.x, c00.y)
            ctx.lineTo(c10.x, c10.y)
            ctx.lineTo(c11.x, c11.y)
            ctx.lineTo(c01.x, c01.y)
            ctx.closePath()
            ctx.fill()
          }
        }

        // Active frame wireframe on top
        if (numFrames > 0) {
          const frame = frames[activeIdx]
          const fLen = frame.length
          const z = (activeIdx / Math.max(1, numFrames - 1)) * sceneD - sceneD / 2

          ctx.save()
          ctx.shadowColor = color
          ctx.shadowBlur = 10 * dpr
          ctx.strokeStyle = "#fff"
          ctx.lineWidth = 1.5 * dpr
          ctx.lineJoin = "round"
          ctx.beginPath()
          for (let si = 0; si < samplesPerRow; si++) {
            const sIdx = Math.floor((si / samplesPerRow) * fLen)
            const sample = frame[sIdx] ?? 0
            const x3d = (si / samplesPerRow - 0.5) * sceneW
            const y3d = sample * sceneH * 0.5
            const p = transform(x3d, y3d, z)
            si === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
          }
          ctx.stroke()
          ctx.restore()
        }
      }

      // ── Labels ─────────────────────────────────────────────
      ctx.fillStyle = "#ffffff35"
      ctx.font = `500 ${9 * dpr}px monospace`
      ctx.textAlign = "left"
      ctx.fillText(mode.toUpperCase(), 6 * dpr, 13 * dpr)
      ctx.textAlign = "right"
      ctx.fillText(`${frames.length} frames`, w - 6 * dpr, 13 * dpr)

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animationRef.current)
  }, [frames, framePosition, color, mode])

  return (
    <div
      ref={containerRef}
      className="panel-recessed overflow-hidden relative"
      style={{ height, cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {/* View mode toggle */}
      <div className="absolute top-1 right-1 flex gap-1" style={{ zIndex: 2 }}>
        {(["waterfall", "surface"] as const).map((m) => (
          <button
            key={m}
            className="px-1.5 py-0.5 font-mono uppercase transition-colors"
            style={{
              fontSize: 8,
              letterSpacing: "0.5px",
              background: mode === m ? color + "80" : "#ffffff10",
              color: mode === m ? "#fff" : "#ffffff60",
              border: "none",
              borderRadius: 2,
            }}
            onClick={(e) => { e.stopPropagation(); setMode(m) }}
          >
            {m === "waterfall" ? "WAVE" : "SURF"}
          </button>
        ))}
      </div>
    </div>
  )
}
