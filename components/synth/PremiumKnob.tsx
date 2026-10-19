"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// =============================================================================
//  PremiumKnob  —  Canvas-based metallic rotary control with LED ring
//
//  Features
//  ──────────────────────────────────────────────────────────────────────────
//  • Canvas 2D rendering: multi-stop radial gradients + specular highlights
//  • LED ring: 40 arc-dot segments, active ones glow with a radial halo
//  • Drag up/down to change value (pointer capture — works on touch too)
//  • Shift + Drag → fine-tune mode (10× slower sensitivity)
//  • Double-click   → reset to `defaultValue` (if provided)
//  • Tooltip overlay shows the current value while dragging
//  • Fully self-contained; zero runtime dependencies beyond React
//
//  Knob arc:  START_ANGLE = 220° (clockwise from 12-o'clock) = min
//             END_ANGLE   = 500° (= 140° past 12-o'clock)    = max
//             Total arc   = 280°
// =============================================================================

const LED_COUNT   = 40
const START_DEG   = 220    // clockwise from 12-o'clock
const TOTAL_ARC   = 280    // total arc span in degrees

// ── Helpers ────────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 200
  const b = parseInt(h.slice(4, 6), 16) || 255
  return [r, g, b]
}

// Convert a degree angle (clockwise from 12-o'clock) to canvas radians
function degToRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180
}

// =============================================================================
//  drawKnob  — pure Canvas 2D drawing function
//
//  Renders a single frame of the knob onto `ctx`. Called on every value/size
//  change. All dimensions are in physical pixels (CSS pixels × dpr).
// =============================================================================
function drawKnob(
  ctx: CanvasRenderingContext2D,
  physSize: number,   // canvas.width (physical pixels)
  cssSize: number,    // CSS diameter
  norm: number,       // 0..1 normalized value
  accentHex: string,
  isDragging: boolean,
) {
  ctx.clearRect(0, 0, physSize, physSize)
  const cx = physSize / 2
  const cy = physSize / 2
  const dpr = physSize / cssSize

  const R       = physSize * 0.336    // knob body radius
  const ledR    = physSize * 0.445    // LED ring centre radius
  const ledDot  = physSize * 0.026    // LED dot radius
  const [ar, ag, ab] = hexToRgb(accentHex)

  // ── LED ring ───────────────────────────────────────────────────────────────
  for (let i = 0; i < LED_COUNT; i++) {
    const t      = i / (LED_COUNT - 1)
    const angDeg = START_DEG + t * TOTAL_ARC
    const angRad = degToRad(angDeg)
    const lx     = cx + Math.cos(angRad) * ledR
    const ly     = cy + Math.sin(angRad) * ledR
    const active = t <= norm

    ctx.beginPath()
    ctx.arc(lx, ly, ledDot, 0, Math.PI * 2)

    if (active) {
      // Glowing halo behind the dot
      const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, ledDot * 2.8)
      halo.addColorStop(0,    `rgba(${ar},${ag},${ab},0.85)`)
      halo.addColorStop(0.45, `rgba(${ar},${ag},${ab},0.35)`)
      halo.addColorStop(1,    `rgba(${ar},${ag},${ab},0)`)
      ctx.fillStyle = halo
      ctx.arc(lx, ly, ledDot * 2.8, 0, Math.PI * 2)
      ctx.fill()

      // Bright dot core
      ctx.beginPath()
      ctx.arc(lx, ly, ledDot, 0, Math.PI * 2)
      ctx.fillStyle = `rgb(${ar},${ag},${ab})`
    } else {
      // Inactive: dark recess
      ctx.fillStyle = "#0e0e1a"
    }
    ctx.fill()
  }

  // ── Outer metallic rim ─────────────────────────────────────────────────────
  // Simulates a brushed-metal bevel: bright top-left, dark bottom-right
  const rim = ctx.createLinearGradient(
    cx - R * 1.12, cy - R * 1.12,
    cx + R * 1.12, cy + R * 1.12,
  )
  rim.addColorStop(0,    "#8a8a8a")
  rim.addColorStop(0.22, "#505050")
  rim.addColorStop(0.55, "#1c1c1c")
  rim.addColorStop(1,    "#080808")

  ctx.beginPath()
  ctx.arc(cx, cy, R * 1.10, 0, Math.PI * 2)
  ctx.fillStyle = rim
  ctx.fill()

  // ── Knob body ──────────────────────────────────────────────────────────────
  // Deep concave look via off-centre radial gradient
  const body = ctx.createRadialGradient(
    cx - R * 0.26, cy - R * 0.28, R * 0.04,
    cx, cy, R,
  )
  body.addColorStop(0,    isDragging ? "#5a5a5a" : "#525252")
  body.addColorStop(0.18, "#272727")
  body.addColorStop(0.55, "#0f0f0f")
  body.addColorStop(1,    "#040404")

  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = body
  ctx.fill()

  // Inner shadow (inset illusion)
  const inset = ctx.createRadialGradient(cx, cy, R * 0.68, cx, cy, R)
  inset.addColorStop(0, "rgba(0,0,0,0)")
  inset.addColorStop(1, "rgba(0,0,0,0.6)")
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = inset
  ctx.fill()

  // ── Specular highlight — glossy top-left catch-light ──────────────────────
  const spec = ctx.createRadialGradient(
    cx - R * 0.22, cy - R * 0.30, 0,
    cx - R * 0.14, cy - R * 0.22, R * 0.48,
  )
  spec.addColorStop(0, "rgba(255,255,255,0.24)")
  spec.addColorStop(1, "rgba(255,255,255,0)")
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = spec
  ctx.fill()

  // ── Indicator dot ──────────────────────────────────────────────────────────
  const indDeg = START_DEG + norm * TOTAL_ARC
  const indRad = degToRad(indDeg)
  const indLen = R * 0.52
  const indX   = cx + Math.cos(indRad) * indLen
  const indY   = cy + Math.sin(indRad) * indLen
  const dotR   = physSize * 0.022

  // White dot with glow shadow
  ctx.save()
  ctx.shadowColor = "rgba(255,255,255,0.85)"
  ctx.shadowBlur  = physSize * 0.06 * dpr
  ctx.beginPath()
  ctx.arc(indX, indY, dotR, 0, Math.PI * 2)
  ctx.fillStyle = "#ffffff"
  ctx.fill()
  ctx.restore()

  // ── Centre jewel ──────────────────────────────────────────────────────────
  const jewel = ctx.createRadialGradient(cx, cy, 0, cx, cy, physSize * 0.055)
  jewel.addColorStop(0, "#282828")
  jewel.addColorStop(1, "#0c0c0c")
  ctx.beginPath()
  ctx.arc(cx, cy, physSize * 0.050, 0, Math.PI * 2)
  ctx.fillStyle = jewel
  ctx.fill()
}

// =============================================================================
//  PremiumKnob component
// =============================================================================
interface PremiumKnobProps {
  value: number
  min?: number
  max?: number
  step?: number
  /** Value to restore on double-click */
  defaultValue?: number
  /** CSS diameter in px */
  size?: number
  label?: string
  unit?: string
  /** Override the text shown in the tooltip while dragging */
  displayValue?: string
  /** Active LED color (hex) */
  accentColor?: string
  onChange?: (value: number) => void
}

export function PremiumKnob({
  value,
  min = 0,
  max = 1,
  step,
  defaultValue,
  size = 56,
  label,
  unit = "",
  displayValue,
  accentColor = "#00d4ff",
  onChange,
}: PremiumKnobProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef   = useRef({
    active:     false,
    startY:     0,
    startValue: 0,
    fine:       false,   // shift → fine mode
  })
  const [dragging, setDragging] = useState(false)

  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)))

  // ── Redraw whenever value, size, or accent changes ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr  = window.devicePixelRatio || 1
    const phys = Math.round(size * dpr)
    if (canvas.width !== phys || canvas.height !== phys) {
      canvas.width  = phys
      canvas.height = phys
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    drawKnob(ctx, phys, size, norm, accentColor, dragging)
  }, [norm, size, accentColor, dragging])

  // ── Pointer events ─────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragRef.current = {
        active:     true,
        startY:     e.clientY,
        startValue: value,
        fine:       e.shiftKey,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setDragging(true)
    },
    [value],
  )

  // Global pointer move/up listeners (attached only while dragging)
  useEffect(() => {
    if (!dragging) return

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return
      const fine        = dragRef.current.fine || e.shiftKey
      // Normal: 200 px = full range.  Fine: 2000 px = full range (10× slower).
      const pxPerRange  = fine ? 2000 : 200
      const delta       = ((dragRef.current.startY - e.clientY) / pxPerRange) * (max - min)
      let next          = dragRef.current.startValue + delta
      if (step !== undefined) next = Math.round(next / step) * step
      onChange?.(Math.max(min, Math.min(max, next)))
    }

    const onUp = () => {
      dragRef.current.active = false
      setDragging(false)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup",   onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup",   onUp)
    }
  }, [dragging, min, max, step, onChange])

  // ── Double-click reset ─────────────────────────────────────────────────────
  const onDoubleClick = useCallback(() => {
    if (defaultValue !== undefined) onChange?.(defaultValue)
  }, [defaultValue, onChange])

  // ── Tooltip value text ─────────────────────────────────────────────────────
  const tipText =
    displayValue ??
    (step !== undefined && step < 1
      ? value.toFixed(2)
      : value.toFixed(0))

  return (
    <div
      className="flex flex-col items-center select-none"
      style={{ width: size, gap: 3 }}
    >
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{
            width:   size,
            height:  size,
            display: "block",
            cursor:  "ns-resize",
          }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />

        {/* Tooltip: shown while dragging */}
        {dragging && (
          <div
            style={{
              position:     "absolute",
              bottom:       "108%",
              left:         "50%",
              transform:    "translateX(-50%)",
              background:   "rgba(4,4,20,0.92)",
              color:        accentColor,
              border:       `1px solid ${accentColor}44`,
              borderRadius: 4,
              padding:      "2px 7px",
              fontSize:     10,
              whiteSpace:   "nowrap",
              pointerEvents:"none",
              fontFamily:   "monospace",
              letterSpacing:"0.04em",
            }}
          >
            {tipText}{unit}
          </div>
        )}
      </div>

      {label && (
        <span
          style={{
            fontSize:      9,
            color:         "#7a8fa8",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign:     "center",
            lineHeight:    1.2,
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
}
