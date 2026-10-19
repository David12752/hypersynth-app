"use client"

import { useRef, useEffect, useCallback } from "react"

// ──────────────────────────────────────────────────────────────────────
// FmAlgorithmDisplay — Professional FM algorithm topology visualiser
//
// Renders the 4-operator algorithm as a node-graph diagram:
//   • Rounded-rect operator nodes with OP labels
//   • Carrier nodes have a solid accent fill
//   • Modulator nodes have a dark fill with accent border
//   • Animated signal-flow arrows between connected operators
//   • Feedback loop arcs on self-modulating operators
//   • Output bus shown as a bottom rail
//   • Click on an operator to select it
//   • HiDPI-aware canvas rendering
//
// Algorithms match the Rust FmOscillator definitions:
//   1: 4→3→2→1*
//   2: [3+4]→2→1*
//   3: 4→3*, 2→1*   out=1+3
//   4: [4→3]→[2→1*]
//   5: 4→[1*,2*,3*]
//   6: 4*,3*,2*,1*   (all carriers, additive)
// ──────────────────────────────────────────────────────────────────────

interface FmAlgorithmDisplayProps {
  /** Algorithm number 1–6 */
  algorithm: number
  /** Currently selected operator 1–4 */
  selectedOp: number
  /** Called when user clicks an operator */
  onSelectOp?: (op: number) => void
  /** Accent color */
  color?: string
  /** CSS pixel height */
  height?: number | string
}

// ── Layout data per algorithm ────────────────────────────────────────
// Each op is positioned on a conceptual grid: { col, row }
// col: horizontal position (0–3), row: vertical (0 = top, 2 = bottom/output)
// connections: [from_op, to_op] (1-indexed)
// carriers: ops whose output goes to the mix bus

interface AlgoLayout {
  ops: { col: number; row: number }[]  // index 0=OP1, 1=OP2, 2=OP3, 3=OP4
  connections: [number, number][]       // [from, to] 1-indexed
  carriers: number[]                    // 1-indexed
}

const ALGO_LAYOUTS: AlgoLayout[] = [
  // Algo 1: 4→3→2→1*   (serial chain)
  {
    ops: [
      { col: 1.5, row: 2 },  // OP1 — carrier (bottom)
      { col: 1.5, row: 1.4 },  // OP2
      { col: 1.5, row: 0.8 },  // OP3
      { col: 1.5, row: 0.2 },  // OP4 (top)
    ],
    connections: [[4, 3], [3, 2], [2, 1]],
    carriers: [1],
  },
  // Algo 2: [3+4]→2→1*
  {
    ops: [
      { col: 1.5, row: 2 },    // OP1 — carrier
      { col: 1.5, row: 1.3 },  // OP2
      { col: 0.8, row: 0.4 },  // OP3
      { col: 2.2, row: 0.4 },  // OP4
    ],
    connections: [[3, 2], [4, 2], [2, 1]],
    carriers: [1],
  },
  // Algo 3: 4→3*, 2→1*, out=1+3   (dual carrier, two stacks)
  {
    ops: [
      { col: 0.7, row: 2 },    // OP1 — carrier
      { col: 0.7, row: 0.8 },  // OP2 — modulator
      { col: 2.3, row: 2 },    // OP3 — carrier
      { col: 2.3, row: 0.8 },  // OP4 — modulator
    ],
    connections: [[2, 1], [4, 3]],
    carriers: [1, 3],
  },
  // Algo 4: [4→3]→[2→1*]  (branching)
  {
    ops: [
      { col: 1.5, row: 2 },    // OP1 — carrier
      { col: 1.5, row: 1.3 },  // OP2
      { col: 0.8, row: 0.5 },  // OP3
      { col: 2.2, row: 0.5 },  // OP4 (feeds into OP3 which feeds OP2 and OP1)
    ],
    connections: [[4, 3], [3, 2], [3, 1]],
    carriers: [1],
  },
  // Algo 5: 4→[1*,2*,3*]   (one modulator, three carriers)
  {
    ops: [
      { col: 0.5, row: 2 },    // OP1 — carrier
      { col: 1.5, row: 2 },    // OP2 — carrier
      { col: 2.5, row: 2 },    // OP3 — carrier
      { col: 1.5, row: 0.5 },  // OP4 — modulator
    ],
    connections: [[4, 1], [4, 2], [4, 3]],
    carriers: [1, 2, 3],
  },
  // Algo 6: all carriers (additive)
  {
    ops: [
      { col: 0.3, row: 1.2 },
      { col: 1.1, row: 1.2 },
      { col: 1.9, row: 1.2 },
      { col: 2.7, row: 1.2 },
    ],
    connections: [],
    carriers: [1, 2, 3, 4],
  },
]

export function FmAlgorithmDisplay({
  algorithm,
  selectedOp,
  onSelectOp,
  color = "#5865f2",
  height = "100%",
}: FmAlgorithmDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)

  // Hit-test for op click
  const opRectsRef = useRef<{ op: number; x: number; y: number; w: number; h: number }[]>([])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onSelectOp) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const mx = (e.clientX - rect.left) * dpr
      const my = (e.clientY - rect.top) * dpr

      for (const r of opRectsRef.current) {
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
          onSelectOp(r.op)
          return
        }
      }
    },
    [onSelectOp]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d", { alpha: false })
    if (!ctx) return

    // Parse accent color
    const cr = parseInt(color.slice(1, 3), 16) || 88
    const cg = parseInt(color.slice(3, 5), 16) || 101
    const cb = parseInt(color.slice(5, 7), 16) || 242

    const algoIdx = Math.max(0, Math.min(5, algorithm - 1))

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
      timeRef.current += 0.02

      const layout = ALGO_LAYOUTS[algoIdx]

      // ── Background ─────────────────────────────────────────
      ctx.fillStyle = "#08090e"
      ctx.fillRect(0, 0, w, h)

      // ── Dimensions ─────────────────────────────────────────
      const pad = 20 * dpr
      const nodeW = 38 * dpr
      const nodeH = 22 * dpr
      const nodeR = 5 * dpr  // corner radius

      // Map grid coords to pixel positions
      const gridW = 3  // cols span 0..3
      const gridH = 2.5
      const areaW = w - pad * 2 - nodeW
      const areaH = h - pad * 2 - nodeH - 12 * dpr  // leave room for output bus

      const nodePos = layout.ops.map((op) => ({
        x: pad + (op.col / gridW) * areaW,
        y: pad + (op.row / gridH) * areaH,
      }))

      // Store hit-test rects
      opRectsRef.current = nodePos.map((p, i) => ({
        op: i + 1,
        x: p.x,
        y: p.y,
        w: nodeW,
        h: nodeH,
      }))

      // ── Output bus ─────────────────────────────────────────
      const busY = h - 10 * dpr
      const busX1 = pad
      const busX2 = w - pad
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.3)`
      ctx.lineWidth = 1.5 * dpr
      ctx.setLineDash([3 * dpr, 3 * dpr])
      ctx.beginPath()
      ctx.moveTo(busX1, busY)
      ctx.lineTo(busX2, busY)
      ctx.stroke()
      ctx.setLineDash([])

      // Bus label
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.4)`
      ctx.font = `600 ${7 * dpr}px monospace`
      ctx.textAlign = "right"
      ctx.fillText("OUT", busX2, busY - 2 * dpr)

      // ── Draw connections (arrows) ──────────────────────────
      for (const [from, to] of layout.connections) {
        const fp = nodePos[from - 1]
        const tp = nodePos[to - 1]
        const fx = fp.x + nodeW / 2
        const fy = fp.y + nodeH
        const tx = tp.x + nodeW / 2
        const ty = tp.y

        // Animated dash for signal flow
        const dashOffset = (-timeRef.current * 30 * dpr) % (12 * dpr)

        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`
        ctx.lineWidth = 1.5 * dpr
        ctx.setLineDash([4 * dpr, 4 * dpr])
        ctx.lineDashOffset = dashOffset
        ctx.beginPath()
        ctx.moveTo(fx, fy)
        // Use a subtle bezier curve
        const midY = (fy + ty) / 2
        ctx.bezierCurveTo(fx, midY, tx, midY, tx, ty)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.lineDashOffset = 0

        // Arrowhead
        const arrowSize = 4 * dpr
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.6)`
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx - arrowSize, ty - arrowSize * 1.5)
        ctx.lineTo(tx + arrowSize, ty - arrowSize * 1.5)
        ctx.closePath()
        ctx.fill()
      }

      // ── Draw carrier output lines to bus ───────────────────
      for (const cop of layout.carriers) {
        const np = nodePos[cop - 1]
        const cx_ = np.x + nodeW / 2
        const cy_ = np.y + nodeH

        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.35)`
        ctx.lineWidth = 1 * dpr
        ctx.setLineDash([2 * dpr, 2 * dpr])
        ctx.beginPath()
        ctx.moveTo(cx_, cy_)
        ctx.lineTo(cx_, busY)
        ctx.stroke()
        ctx.setLineDash([])

        // Small dot on bus
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(cx_, busY, 2.5 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }

      // ── Draw operator nodes ────────────────────────────────
      for (let i = 0; i < 4; i++) {
        const opNum = i + 1
        const pos = nodePos[i]
        const isCarrier = layout.carriers.includes(opNum)
        const isSelected = selectedOp === opNum

        // Node background
        const nx = pos.x, ny = pos.y
        ctx.beginPath()
        roundRect(ctx, nx, ny, nodeW, nodeH, nodeR)

        if (isCarrier) {
          // Carrier: solid accent fill
          const grad = ctx.createLinearGradient(nx, ny, nx, ny + nodeH)
          grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.85)`)
          grad.addColorStop(1, `rgba(${Math.round(cr * 0.7)},${Math.round(cg * 0.7)},${Math.round(cb * 0.7)},0.85)`)
          ctx.fillStyle = grad
          ctx.fill()
        } else {
          // Modulator: dark fill
          ctx.fillStyle = "#12142a"
          ctx.fill()
        }

        // Border
        ctx.strokeStyle = isSelected
          ? "#ffffff"
          : isCarrier
          ? `rgba(${cr},${cg},${cb},0.9)`
          : `rgba(${cr},${cg},${cb},0.45)`
        ctx.lineWidth = (isSelected ? 2.0 : 1.2) * dpr
        ctx.stroke()

        // Selection glow
        if (isSelected) {
          ctx.save()
          ctx.shadowColor = color
          ctx.shadowBlur = 10 * dpr
          ctx.strokeStyle = color
          ctx.lineWidth = 1.5 * dpr
          ctx.beginPath()
          roundRect(ctx, nx, ny, nodeW, nodeH, nodeR)
          ctx.stroke()
          ctx.restore()
        }

        // OP label
        ctx.fillStyle = isCarrier ? "#fff" : `rgba(${cr},${cg},${cb},0.9)`
        ctx.font = `700 ${10 * dpr}px monospace`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(`OP${opNum}`, nx + nodeW / 2, ny + nodeH / 2)

        // Carrier indicator: small "C" badge
        if (isCarrier) {
          ctx.fillStyle = "rgba(255,255,255,0.5)"
          ctx.font = `600 ${6 * dpr}px monospace`
          ctx.textAlign = "right"
          ctx.textBaseline = "top"
          ctx.fillText("C", nx + nodeW - 3 * dpr, ny + 2 * dpr)
        }
      }

      // ── Algorithm label ────────────────────────────────────
      ctx.fillStyle = "#ffffff40"
      ctx.font = `500 ${8 * dpr}px monospace`
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(`ALGO ${algorithm}`, pad, 4 * dpr)

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [algorithm, selectedOp, color])

  return (
    <div
      ref={containerRef}
      className={`panel-recessed overflow-hidden relative${height == null ? " h-full" : ""}`}
      style={{ height: height != null ? height : undefined, cursor: "pointer" }}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  )
}

// Canvas 2D rounded rect helper
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
