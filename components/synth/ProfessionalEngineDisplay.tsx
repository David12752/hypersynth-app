"use client"

import { useEffect, useRef } from "react"
import { getScopeFrame } from "@/lib/audio/AudioBridge"

type EngineDisplayMode = "VA" | "GRAN" | "MODAL" | "ADD" | "SAMP"

interface ProfessionalEngineDisplayProps {
  mode: EngineDisplayMode
  accentColor?: string
  height?: number | string
  vaWaveform?: "sine" | "tri" | "saw" | "square" | "noise"
  vaPulseWidth?: number
  vaBright?: number
  vaSubOsc?: "off" | "sub1sin" | "sub1sq" | "sub2sin"
  vaSubLevel?: number
  granSize?: number
  granDensity?: number
  granPosition?: number
  granSpray?: number
  granPitchRandom?: number
  granWindow?: "hann" | "gauss" | "trapez" | "rect"
  modalBody?: "string" | "bar" | "membrane" | "plate" | "tube" | "bell"
  modalDecay?: number
  modalBrightness?: number
  addHarmonicCount?: number
  addMorph?: number
  sampMode?: "oneshot" | "loop" | "pingpong" | "susloop"
  sampStart?: number
  sampEnd?: number
  sampPitch?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  size: number
}

interface MotionState {
  particles: Particle[]
  playhead: number
  direction: 1 | -1
}

const MODAL_RATIOS: Record<string, number[]> = {
  string: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
  bar: [1.0, 2.756, 5.404, 8.933, 13.344, 18.64],
  membrane: [1.0, 1.593, 2.136, 2.296, 2.653, 3.156],
  plate: [1.0, 1.732, 2.0, 2.646, 3.0, 3.317, 3.6],
  tube: [1.0, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0],
  bell: [1.0, 1.183, 1.571, 1.972, 2.0, 2.843, 3.378],
}

const WINDOW_LABELS: Record<string, string> = {
  hann: "HANN",
  gauss: "GAUSS",
  trapez: "TRAPEZ",
  rect: "RECT",
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function rgba(hex: string, alpha: number) {
  const sanitized = hex.replace("#", "")
  const normalized = sanitized.length === 3
    ? sanitized.split("").map((value) => value + value).join("")
    : sanitized
  const r = parseInt(normalized.slice(0, 2), 16) || 88
  const g = parseInt(normalized.slice(2, 4), 16) || 101
  const b = parseInt(normalized.slice(4, 6), 16) || 242
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function waveformSample(
  waveform: ProfessionalEngineDisplayProps["vaWaveform"],
  phase: number,
  pulseWidth: number,
) {
  const wrapped = phase - Math.floor(phase)
  switch (waveform) {
    case "sine":
      return Math.sin(wrapped * Math.PI * 2)
    case "tri":
      return 1 - 4 * Math.abs(wrapped - 0.5)
    case "saw":
      return wrapped * 2 - 1
    case "square":
      return wrapped < pulseWidth ? 1 : -1
    case "noise":
      return Math.sin(phase * 191.731) * 0.6 + Math.sin(phase * 613.17) * 0.25
    default:
      return Math.sin(wrapped * Math.PI * 2)
  }
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  x: number,
  y: number,
  text: string,
  fill: string,
  stroke: string,
  textColor: string,
) {
  ctx.font = `600 ${7 * dpr}px monospace`
  const width = ctx.measureText(text).width + 10 * dpr
  const height = 14 * dpr
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = dpr
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, 4 * dpr)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = textColor
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(text, x + 5 * dpr, y + height / 2 + 0.5 * dpr)
}

function drawLiveScope(
  ctx: CanvasRenderingContext2D,
  samples: number[],
  width: number,
  centerY: number,
  amplitude: number,
  color: string,
  dpr: number,
) {
  if (samples.length === 0) {
    return
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.15 * dpr
  ctx.beginPath()
  for (let x = 0; x < width; x++) {
    const index = Math.min(
      samples.length - 1,
      Math.floor((x / Math.max(1, width - 1)) * (samples.length - 1)),
    )
    const y = centerY - (samples[index] ?? 0) * amplitude
    if (x === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}

function drawScopeRibbon(
  ctx: CanvasRenderingContext2D,
  samples: number[],
  width: number,
  height: number,
  color: string,
  dpr: number,
) {
  const ribbonHeight = Math.max(10 * dpr, height * 0.18)
  const top = height - ribbonHeight

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)"
  ctx.fillRect(0, top, width, ribbonHeight)

  if (samples.length === 0) {
    return
  }

  const bars = Math.max(24, Math.floor(width / (8 * dpr)))
  const barWidth = width / bars
  for (let index = 0; index < bars; index++) {
    const sampleIndex = Math.min(
      samples.length - 1,
      Math.floor((index / Math.max(1, bars - 1)) * (samples.length - 1)),
    )
    const magnitude = Math.abs(samples[sampleIndex] ?? 0)
    const barHeight = magnitude * (ribbonHeight - 4 * dpr)
    const x = index * barWidth
    const y = height - 2 * dpr - barHeight
    const gradient = ctx.createLinearGradient(0, y, 0, height)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, "rgba(0, 224, 255, 0.04)")
    ctx.fillStyle = gradient
    ctx.fillRect(x + dpr, y, Math.max(dpr, barWidth - dpr * 1.5), barHeight)
  }
}

export function ProfessionalEngineDisplay({
  mode,
  accentColor = "#5865f2",
  height = "100%",
  vaWaveform = "saw",
  vaPulseWidth = 50,
  vaBright = 50,
  vaSubOsc = "off",
  vaSubLevel = 0,
  granSize = 80,
  granDensity = 40,
  granPosition = 50,
  granSpray = 0,
  granPitchRandom = 0,
  granWindow = "hann",
  modalBody = "string",
  modalDecay = 2,
  modalBrightness = 60,
  addHarmonicCount = 16,
  addMorph = 0,
  sampMode = "loop",
  sampStart = 0,
  sampEnd = 100,
  sampPitch = 0,
}: ProfessionalEngineDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const motionRef = useRef<MotionState>({ particles: [], playhead: 0, direction: 1 })
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) {
      return
    }

    const context = canvas.getContext("2d", { alpha: false })
    if (!context) {
      return
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width * dpr))
      const heightPx = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== heightPx) {
        canvas.width = width
        canvas.height = heightPx
      }

      timeRef.current += 0.016

      const accentSoft = rgba(accentColor, 0.16)
      const accentMid = rgba(accentColor, 0.45)
      const accentStrong = rgba(accentColor, 0.95)
      const liveSamples = getScopeFrame().samples
      const innerWidth = width - 28 * dpr
      const innerHeight = heightPx - 28 * dpr
      const left = 14 * dpr
      const top = 14 * dpr
      const centerY = top + innerHeight * 0.45

      const background = context.createLinearGradient(0, 0, 0, heightPx)
      background.addColorStop(0, "#11162f")
      background.addColorStop(0.4, "#090b14")
      background.addColorStop(1, "#05070d")
      context.fillStyle = background
      context.fillRect(0, 0, width, heightPx)

      const glow = context.createRadialGradient(width * 0.5, heightPx * 0.42, 0, width * 0.5, heightPx * 0.42, width * 0.55)
      glow.addColorStop(0, rgba(accentColor, 0.12))
      glow.addColorStop(1, "rgba(0, 0, 0, 0)")
      context.fillStyle = glow
      context.fillRect(0, 0, width, heightPx)

      context.strokeStyle = "rgba(113, 136, 192, 0.10)"
      context.lineWidth = 0.8 * dpr
      for (let index = 0; index <= 5; index++) {
        const y = top + (innerHeight / 5) * index
        context.beginPath()
        context.moveTo(left, y)
        context.lineTo(width - left, y)
        context.stroke()
      }
      for (let index = 0; index <= 12; index++) {
        const x = left + (innerWidth / 12) * index
        context.beginPath()
        context.moveTo(x, top)
        context.lineTo(x, heightPx - top)
        context.stroke()
      }

      context.strokeStyle = "rgba(180, 200, 255, 0.18)"
      context.lineWidth = dpr
      context.beginPath()
      context.moveTo(left, centerY)
      context.lineTo(width - left, centerY)
      context.stroke()

      drawBadge(context, dpr, left, 8 * dpr, mode, rgba(accentColor, 0.18), rgba(accentColor, 0.55), "#eaf3ff")

      if (mode === "VA") {
        const pulseWidth = clamp(vaPulseWidth / 100, 0.08, 0.92)
        const brightness = 0.7 + vaBright / 250
        const subMix = vaSubOsc === "off" ? 0 : vaSubLevel / 100
        const lineAmplitude = innerHeight * 0.62

        const fillGradient = context.createLinearGradient(0, top, 0, centerY + lineAmplitude)
        fillGradient.addColorStop(0, rgba(accentColor, 0.28))
        fillGradient.addColorStop(1, rgba(accentColor, 0.02))

        context.beginPath()
        context.moveTo(left, centerY)
        for (let px = 0; px <= innerWidth; px++) {
          const phase = px / Math.max(1, innerWidth)
          let sample = waveformSample(vaWaveform, phase, pulseWidth) * brightness
          if (subMix > 0) {
            const subDivisor = vaSubOsc === "sub2sin" ? 4 : 2
            const subShape = vaSubOsc === "sub1sq" ? "square" : "sine"
            sample += waveformSample(subShape as ProfessionalEngineDisplayProps["vaWaveform"], phase / subDivisor, 0.5) * subMix * 0.55
          }
          const x = left + px
          const y = centerY - sample * lineAmplitude
          context.lineTo(x, y)
        }
        context.lineTo(width - left, centerY)
        context.closePath()
        context.fillStyle = fillGradient
        context.fill()

        context.save()
        context.shadowColor = accentColor
        context.shadowBlur = 12 * dpr
        context.strokeStyle = accentStrong
        context.lineWidth = 2.2 * dpr
        context.beginPath()
        for (let px = 0; px <= innerWidth; px++) {
          const phase = px / Math.max(1, innerWidth)
          let sample = waveformSample(vaWaveform, phase, pulseWidth) * brightness
          if (subMix > 0) {
            const subDivisor = vaSubOsc === "sub2sin" ? 4 : 2
            const subShape = vaSubOsc === "sub1sq" ? "square" : "sine"
            sample += waveformSample(subShape as ProfessionalEngineDisplayProps["vaWaveform"], phase / subDivisor, 0.5) * subMix * 0.55
          }
          const x = left + px
          const y = centerY - sample * lineAmplitude
          if (px === 0) {
            context.moveTo(x, y)
          } else {
            context.lineTo(x, y)
          }
        }
        context.stroke()
        context.restore()

        drawBadge(context, dpr, width - left - 48 * dpr, 8 * dpr, vaWaveform.toUpperCase(), rgba(accentColor, 0.14), rgba(accentColor, 0.4), "#cfe2ff")
      }

      if (mode === "GRAN") {
        const position = clamp(granPosition / 100, 0, 1)
        const density = granDensity / 100
        const spray = clamp(granSpray / 100, 0, 1)
        const pitchRandom = clamp(granPitchRandom / 100, 0, 1)
        const markerX = left + innerWidth * position
        const windowWidth = Math.max(18 * dpr, (granSize / 500) * innerWidth * 0.28)
        const sprayWidth = windowWidth * (0.55 + spray * 3.2)
        const pitchScatter = innerHeight * (0.18 + pitchRandom * 0.55)
        const baseY = centerY

        context.strokeStyle = rgba(accentColor, 0.32)
        context.lineWidth = 1.6 * dpr
        context.beginPath()
        for (let px = 0; px <= innerWidth; px++) {
          const t = px / Math.max(1, innerWidth)
          const sample = Math.sin(t * Math.PI * 6) * 0.35 + Math.sin((t + position * 0.2) * Math.PI * 14) * 0.16
          const y = baseY - sample * innerHeight * 0.25
          if (px === 0) {
            context.moveTo(left + px, y)
          } else {
            context.lineTo(left + px, y)
          }
        }
        context.stroke()

        context.fillStyle = rgba(accentColor, 0.06 + spray * 0.08)
        context.fillRect(markerX - sprayWidth / 2, top, sprayWidth, innerHeight)
        context.fillStyle = rgba(accentColor, 0.10)
        context.fillRect(markerX - windowWidth / 2, top, windowWidth, innerHeight)
        context.strokeStyle = accentStrong
        context.lineWidth = 1.5 * dpr
        context.setLineDash([5 * dpr, 4 * dpr])
        context.beginPath()
        context.moveTo(markerX, top)
        context.lineTo(markerX, heightPx - top)
        context.stroke()
        context.setLineDash([])

        const particleBudget = Math.max(1, Math.round(density * 4))
        for (let index = 0; index < particleBudget; index++) {
          if (Math.random() < density * 0.12) {
            motionRef.current.particles.push({
              x: markerX + (Math.random() - 0.5) * sprayWidth,
              y: baseY + (Math.random() - 0.5) * pitchScatter,
              vx: (Math.random() - 0.5) * 1.8 * dpr,
              vy: -Math.random() * 1.6 * dpr,
              life: 1,
              size: (2 + Math.random() * 3) * dpr,
            })
          }
        }

        motionRef.current.particles = motionRef.current.particles.filter((particle) => {
          particle.x += particle.vx
          particle.y += particle.vy
          particle.life -= 0.022
          if (particle.life <= 0) {
            return false
          }
          context.fillStyle = rgba(accentColor, particle.life * 0.7)
          context.beginPath()
          context.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2)
          context.fill()
          return true
        })

        drawBadge(context, dpr, width - left - 58 * dpr, 8 * dpr, WINDOW_LABELS[granWindow], rgba(accentColor, 0.14), rgba(accentColor, 0.4), "#cfe2ff")
        drawBadge(context, dpr, left + 6 * dpr, 8 * dpr, `SPR ${Math.round(granSpray)}`, rgba(accentColor, 0.10), rgba(accentColor, 0.28), "#cfe2ff")
        drawBadge(context, dpr, left + 64 * dpr, 8 * dpr, `PCH ${Math.round(granPitchRandom)}`, rgba(accentColor, 0.10), rgba(accentColor, 0.28), "#cfe2ff")
      }

      if (mode === "MODAL") {
        const ratios = MODAL_RATIOS[modalBody] ?? MODAL_RATIOS.string
        const brightness = clamp(modalBrightness / 100, 0, 1)
        const barAreaTop = top + innerHeight * 0.16
        const barAreaHeight = innerHeight * 0.62
        const barWidth = innerWidth / Math.max(1, ratios.length)

        for (let index = 0; index < ratios.length; index++) {
          const ratio = ratios[index]
          const animated = 0.92 + Math.sin(timeRef.current * 2.4 + index * 0.9) * 0.08
          const decayShape = Math.exp(-ratio / Math.max(0.5, modalDecay + 0.4))
          const heightScale = decayShape * (0.55 + brightness * 0.7) * animated
          const barHeight = barAreaHeight * clamp(heightScale, 0.08, 1)
          const x = left + index * barWidth + barWidth * 0.18
          const y = barAreaTop + barAreaHeight - barHeight
          const gradient = context.createLinearGradient(0, y, 0, y + barHeight)
          gradient.addColorStop(0, rgba(accentColor, 0.92))
          gradient.addColorStop(1, rgba(accentColor, 0.14))
          context.fillStyle = gradient
          context.fillRect(x, y, barWidth * 0.64, barHeight)

          context.fillStyle = "rgba(255,255,255,0.10)"
          context.fillRect(x, y, barWidth * 0.64, Math.max(dpr, barHeight * 0.08))
        }

        context.strokeStyle = rgba(accentColor, 0.38)
        context.lineWidth = 1.2 * dpr
        context.beginPath()
        for (let px = 0; px <= innerWidth; px++) {
          const t = px / Math.max(1, innerWidth)
          const profile = Math.exp(-t * (2.2 + modalDecay * 0.25))
          const shimmer = Math.sin(t * Math.PI * 14 + timeRef.current * 4.2) * 0.06
          const y = top + innerHeight * 0.18 + (1 - profile - shimmer * brightness) * innerHeight * 0.36
          if (px === 0) {
            context.moveTo(left + px, y)
          } else {
            context.lineTo(left + px, y)
          }
        }
        context.stroke()

        drawBadge(context, dpr, width - left - 60 * dpr, 8 * dpr, modalBody.toUpperCase(), rgba(accentColor, 0.14), rgba(accentColor, 0.4), "#cfe2ff")
      }

      if (mode === "ADD") {
        const harmonicCount = Math.max(1, addHarmonicCount)
        const morph = clamp(addMorph / 100, 0, 1)
        const displayed = Math.min(harmonicCount, 32)
        const barWidth = innerWidth / displayed
        const baseline = top + innerHeight * 0.8

        for (let index = 0; index < displayed; index++) {
          const harmonic = 1 + Math.floor((index / displayed) * harmonicCount)
          const saw = 1 / harmonic
          const square = harmonic % 2 === 1 ? 1 / harmonic : 0
          const amplitude = saw * (1 - morph) + square * morph
          const barHeight = amplitude * innerHeight * 0.6
          const x = left + index * barWidth + barWidth * 0.14
          const y = baseline - barHeight
          const gradient = context.createLinearGradient(0, y, 0, baseline)
          gradient.addColorStop(0, rgba(accentColor, 0.92))
          gradient.addColorStop(1, rgba(accentColor, 0.16))
          context.fillStyle = gradient
          context.fillRect(x, y, Math.max(dpr, barWidth * 0.72), barHeight)
        }

        context.strokeStyle = accentStrong
        context.lineWidth = 1.6 * dpr
        context.beginPath()
        for (let px = 0; px <= innerWidth; px++) {
          const phase = (px / Math.max(1, innerWidth)) * Math.PI * 2
          let sample = 0
          for (let harmonic = 1; harmonic <= Math.min(harmonicCount, 48); harmonic++) {
            const saw = Math.sin(phase * harmonic) / harmonic
            const square = harmonic % 2 === 1 ? Math.sin(phase * harmonic) / harmonic : 0
            sample += saw * (1 - morph) + square * morph
          }
          const y = top + innerHeight * 0.18 - sample * innerHeight * 0.08
          if (px === 0) {
            context.moveTo(left + px, y)
          } else {
            context.lineTo(left + px, y)
          }
        }
        context.stroke()

        drawBadge(context, dpr, width - left - 66 * dpr, 8 * dpr, `${harmonicCount} PART`, rgba(accentColor, 0.14), rgba(accentColor, 0.4), "#cfe2ff")
      }

      if (mode === "SAMP") {
        const normalizedStart = clamp(sampStart / 100, 0, 0.99)
        const normalizedEnd = clamp(Math.max(sampEnd / 100, normalizedStart + 0.02), normalizedStart + 0.02, 1)
        const startX = left + innerWidth * normalizedStart
        const endX = left + innerWidth * normalizedEnd
        const center = centerY
        const waveAmplitude = innerHeight * 0.36

        context.strokeStyle = rgba(accentColor, 0.34)
        context.lineWidth = 1.5 * dpr
        context.beginPath()
        for (let px = 0; px <= innerWidth; px++) {
          const t = px / Math.max(1, innerWidth)
          const envelope = 0.55 + Math.sin(t * Math.PI * 1.5) * 0.18 + Math.sin(t * Math.PI * 11) * 0.05
          const sample = Math.sin(t * Math.PI * 7) * envelope + Math.sin(t * Math.PI * 41) * 0.14
          const y = center - sample * waveAmplitude
          if (px === 0) {
            context.moveTo(left + px, y)
          } else {
            context.lineTo(left + px, y)
          }
        }
        context.stroke()

        context.fillStyle = rgba(accentColor, 0.12)
        context.fillRect(startX, top, endX - startX, innerHeight)

        context.strokeStyle = accentStrong
        context.lineWidth = 1.8 * dpr
        context.beginPath()
        context.moveTo(startX, top)
        context.lineTo(startX, heightPx - top)
        context.moveTo(endX, top)
        context.lineTo(endX, heightPx - top)
        context.stroke()

        const normalizedRegion = Math.max(0.02, normalizedEnd - normalizedStart)
        const speed = 0.0026 * (1 + Math.abs(sampPitch) / 12)
        const motion = motionRef.current
        if (sampMode === "pingpong") {
          motion.playhead += speed * motion.direction
          if (motion.playhead >= 1) {
            motion.playhead = 1
            motion.direction = -1
          }
          if (motion.playhead <= 0) {
            motion.playhead = 0
            motion.direction = 1
          }
        } else if (sampMode === "oneshot") {
          motion.playhead = Math.min(1, motion.playhead + speed)
        } else {
          motion.playhead = (motion.playhead + speed) % 1
        }

        const playheadX = startX + normalizedRegion * innerWidth * motion.playhead
        context.strokeStyle = "rgba(170, 245, 255, 0.95)"
        context.lineWidth = 1.4 * dpr
        context.beginPath()
        context.moveTo(playheadX, top)
        context.lineTo(playheadX, heightPx - top)
        context.stroke()

        drawBadge(context, dpr, width - left - 68 * dpr, 8 * dpr, sampMode.toUpperCase(), rgba(accentColor, 0.14), rgba(accentColor, 0.4), "#cfe2ff")
      }

      drawLiveScope(context, liveSamples, width, centerY, innerHeight * 0.22, "rgba(0, 224, 255, 0.72)", dpr)
      drawScopeRibbon(context, liveSamples, width, heightPx, "rgba(0, 224, 255, 0.42)", dpr)

      context.strokeStyle = rgba(accentColor, 0.24)
      context.lineWidth = dpr
      context.strokeRect(0.5 * dpr, 0.5 * dpr, width - dpr, heightPx - dpr)

      animationRef.current = window.requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.cancelAnimationFrame(animationRef.current)
    }
  }, [
    accentColor,
    addHarmonicCount,
    addMorph,
    granDensity,
    granPitchRandom,
    granPosition,
    granSpray,
    granSize,
    granWindow,
    modalBody,
    modalBrightness,
    modalDecay,
    mode,
    sampEnd,
    sampMode,
    sampPitch,
    sampStart,
    vaBright,
    vaPulseWidth,
    vaSubLevel,
    vaSubOsc,
    vaWaveform,
  ])

  return (
    <div ref={containerRef} className="panel-recessed overflow-hidden relative" style={{ height }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  )
}