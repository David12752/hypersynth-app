"use client"

import { useEffect, useRef } from "react"

export interface FilterResponseProps {
  filterType?: string   // "LP" | "HP" | "BP" | "NOTCH"
  cutoff: number        // 0-100 → mapped to 20–20000 Hz
  resonance: number     // 0-100
  accent: string
}

/** Map 0–100 slider to Hz using exponential scale */
function paramToHz(val: number): number {
  return 20 * Math.pow(1000, val / 100)
}

/** Simple biquad magnitude response at normalised frequency (0..π) */
function biquadResponse(
  b0: number, b1: number, b2: number,
  a1: number, a2: number,
  omega: number
): number {
  const c1 = Math.cos(omega), c2 = Math.cos(2 * omega)
  const s1 = Math.sin(omega), s2 = Math.sin(2 * omega)
  const numR = b0 + b1 * c1 + b2 * c2
  const numI = b1 * s1 + b2 * s2
  const denR = 1 + a1 * c1 + a2 * c2
  const denI = a1 * s1 + a2 * s2
  const num = Math.sqrt(numR * numR + numI * numI)
  const den = Math.sqrt(denR * denR + denI * denI)
  return den < 1e-10 ? 0 : num / den
}

function makeLPCoeffs(fc: number, Q: number, sampleRate = 48000) {
  const omega = 2 * Math.PI * fc / sampleRate
  const alpha = Math.sin(omega) / (2 * Q)
  const b0 = (1 - Math.cos(omega)) / 2
  const b1 = 1 - Math.cos(omega)
  const b2 = b0
  const a0 = 1 + alpha
  const a1 = -2 * Math.cos(omega)
  const a2 = 1 - alpha
  return [b0/a0, b1/a0, b2/a0, a1/a0, a2/a0]
}

function makeHPCoeffs(fc: number, Q: number, sampleRate = 48000) {
  const omega = 2 * Math.PI * fc / sampleRate
  const alpha = Math.sin(omega) / (2 * Q)
  const b0 = (1 + Math.cos(omega)) / 2
  const b1 = -(1 + Math.cos(omega))
  const b2 = b0
  const a0 = 1 + alpha
  const a1 = -2 * Math.cos(omega)
  const a2 = 1 - alpha
  return [b0/a0, b1/a0, b2/a0, a1/a0, a2/a0]
}

function makeBPCoeffs(fc: number, Q: number, sampleRate = 48000) {
  const omega = 2 * Math.PI * fc / sampleRate
  const alpha = Math.sin(omega) / (2 * Q)
  const b0 = Math.sin(omega) / 2
  const b1 = 0
  const b2 = -b0
  const a0 = 1 + alpha
  const a1 = -2 * Math.cos(omega)
  const a2 = 1 - alpha
  return [b0/a0, b1/a0, b2/a0, a1/a0, a2/a0]
}

export function FilterResponse({ filterType = "LP", cutoff, resonance, accent }: FilterResponseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    if (w < 4 || h < 4) return

    const fc = paramToHz(cutoff)
    const Q = 0.5 + (resonance / 100) * 9.5  // 0.5..10
    const BINS = w
    let coeffs: number[]

    if (filterType === "HP") coeffs = makeHPCoeffs(fc, Q)
    else if (filterType === "BP") coeffs = makeBPCoeffs(fc, Q)
    else coeffs = makeLPCoeffs(fc, Q)

    const [b0, b1, b2, a1, a2] = coeffs

    // Compute magnitude for each x pixel (log freq)
    const mags = new Float32Array(BINS)
    const freqMin = Math.log10(20), freqMax = Math.log10(22000)
    for (let i = 0; i < BINS; i++) {
      const freq = Math.pow(10, freqMin + (i / (BINS - 1)) * (freqMax - freqMin))
      const omega = 2 * Math.PI * freq / 48000
      const mag = biquadResponse(b0, b1, b2, a1, a2, omega)
      mags[i] = 20 * Math.log10(Math.max(1e-6, mag))
    }

    // dB range on screen
    const dbMin = -48, dbMax = 18
    const dbRange = dbMax - dbMin
    const px = 2, py = 2
    const W = w - px * 2
    const H = h - py * 2

    ctx.clearRect(0, 0, w, h)

    // Grid lines
    ctx.strokeStyle = `${accent}18`
    ctx.lineWidth = 1
    const dBmarks = [12, 0, -12, -24, -36]
    for (const db of dBmarks) {
      const y = py + H * (1 - (db - dbMin) / dbRange)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }

    // Fill under curve
    const grad = ctx.createLinearGradient(0, py, 0, py + H)
    grad.addColorStop(0, `${accent}55`)
    grad.addColorStop(1, `${accent}08`)
    ctx.beginPath()
    ctx.moveTo(px, py + H)
    for (let i = 0; i < BINS; i++) {
      const x = px + (i / (BINS - 1)) * W
      const y = py + H * (1 - (mags[i] - dbMin) / dbRange)
      const yc = Math.max(py, Math.min(py + H, y))
      if (i === 0) ctx.lineTo(x, yc)
      else ctx.lineTo(x, yc)
    }
    ctx.lineTo(px + W, py + H)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Response curve
    ctx.beginPath()
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.shadowColor = accent
    ctx.shadowBlur = 6
    for (let i = 0; i < BINS; i++) {
      const x = px + (i / (BINS - 1)) * W
      const y = py + H * (1 - (mags[i] - dbMin) / dbRange)
      const yc = Math.max(py, Math.min(py + H, y))
      if (i === 0) ctx.moveTo(x, yc)
      else ctx.lineTo(x, yc)
    }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Cutoff marker
    const freqRatio = (Math.log10(fc) - freqMin) / (freqMax - freqMin)
    const cx = px + freqRatio * W
    ctx.strokeStyle = `${accent}cc`
    ctx.lineWidth = 1.5
    ctx.setLineDash([3, 2])
    ctx.beginPath(); ctx.moveTo(cx, py); ctx.lineTo(cx, py + H); ctx.stroke()
    ctx.setLineDash([])

  }, [filterType, cutoff, resonance, accent])

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
