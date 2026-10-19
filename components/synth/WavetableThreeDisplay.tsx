"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import Stats from "three/examples/jsm/libs/stats.module.js"
import { getScopeFrame, getWavetableDisplayData } from "@/lib/audio/AudioBridge"

const DISPLAY_FRAME_COUNT = 64
const DISPLAY_POINTS = 256
const SPECTROGRAM_WIDTH = 192
const SPECTROGRAM_HEIGHT = 72
const RIBBON_UPDATE_EVERY = 4

export interface WaveDisplayHandle {
  updateFrame: (samples: Float32Array | number[]) => void
  updateWavetable: (samples: Float32Array | number[], numFrames: number) => void
}

interface WavetableThreeDisplayProps {
  framePosition: number
  preset?: string
  accentColor?: string
}

interface CachedWaveData {
  preset: string
  frameSize: number
  displayFrameCount: number
  samples: Float32Array
}

function sampleFrame(
  samples: Float32Array,
  frameCount: number,
  frameSize: number,
  frameIndex: number,
  pointIndex: number,
  pointCount: number,
) {
  const sampleIndex = Math.min(
    frameSize - 1,
    Math.floor((pointIndex / Math.max(1, pointCount - 1)) * (frameSize - 1)),
  )
  return samples[frameIndex * frameSize + sampleIndex] ?? 0
}

function applyFrameToPositions(
  target: Float32Array,
  samples: Float32Array,
  frameCount: number,
  frameSize: number,
  framePosition: number,
  pointCount: number,
  zValue: number,
  yScale: number,
  xScale: number,
) {
  const scaled = THREE.MathUtils.clamp(framePosition, 0, Math.max(0, frameCount - 1))
  const leftIndex = Math.floor(scaled)
  const rightIndex = Math.min(frameCount - 1, leftIndex + 1)
  const blend = scaled - leftIndex

  for (let index = 0; index < pointCount; index++) {
    const left = sampleFrame(samples, frameCount, frameSize, leftIndex, index, pointCount)
    const right = sampleFrame(samples, frameCount, frameSize, rightIndex, index, pointCount)
    const value = left + (right - left) * blend
    const base = index * 3
    target[base] = (index / Math.max(1, pointCount - 1) - 0.5) * xScale
    target[base + 1] = value * yScale
    target[base + 2] = zValue
  }
}

function colorFromMagnitude(value: number) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1)
  const dark = new THREE.Color("#081223")
  const cyan = new THREE.Color("#00cfff")
  const white = new THREE.Color("#f5fbff")
  const mid = dark.clone().lerp(cyan, Math.min(1, clamped * 1.4))
  return mid.lerp(white, Math.max(0, clamped - 0.65) / 0.35)
}

export const WavetableThreeDisplay = forwardRef<WaveDisplayHandle, WavetableThreeDisplayProps>(
  function WavetableThreeDisplay({ framePosition, preset = "basic", accentColor = "#5865f2" }, ref) {
    const rootRef = useRef<HTMLDivElement>(null)
    const mainHostRef = useRef<HTMLDivElement>(null)
    const ribbonHostRef = useRef<HTMLDivElement>(null)
    const latestFrameRef = useRef<Float32Array>(new Float32Array(2048))
    const waveDataRef = useRef<CachedWaveData | null>(null)
    const framePositionRef = useRef(framePosition)
    const animationRef = useRef<number>(0)
    const statsRef = useRef<Stats | null>(null)
    const cleanupRef = useRef<(() => void) | null>(null)

    useEffect(() => {
      framePositionRef.current = framePosition
    }, [framePosition])

    useImperativeHandle(ref, () => ({
      updateFrame: (samples) => {
        latestFrameRef.current = Float32Array.from(samples)
      },
      updateWavetable: (samples, numFrames) => {
        waveDataRef.current = {
          preset,
          frameSize: numFrames > 0 ? Math.floor(samples.length / numFrames) : 0,
          displayFrameCount: numFrames,
          samples: Float32Array.from(samples),
        }
      },
    }), [preset])

    useEffect(() => {
      let disposed = false

      const load = async () => {
        const data = await getWavetableDisplayData(preset, DISPLAY_FRAME_COUNT)
        if (disposed || !data || !data.samples.length) {
          return
        }
        waveDataRef.current = {
          preset: data.preset,
          frameSize: data.frameSize,
          displayFrameCount: data.displayFrameCount,
          samples: Float32Array.from(data.samples),
        }
      }

      void load()

      return () => {
        disposed = true
      }
    }, [preset])

    useEffect(() => {
      const root = rootRef.current
      const mainHost = mainHostRef.current
      const ribbonHost = ribbonHostRef.current
      if (!root || !mainHost || !ribbonHost) return

      const mainRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" })
      mainRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      mainRenderer.setClearColor("#080810")
      mainRenderer.outputColorSpace = THREE.SRGBColorSpace
      mainHost.appendChild(mainRenderer.domElement)

      const ribbonRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" })
      ribbonRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      ribbonRenderer.setClearColor("#07101d")
      ribbonRenderer.outputColorSpace = THREE.SRGBColorSpace
      ribbonHost.appendChild(ribbonRenderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
      const orbit = { yaw: 0.44, pitch: 0.42, radius: 8.4 }
      const pointer = { active: false, x: 0, y: 0, yaw: 0, pitch: 0 }

      const composer = new EffectComposer(mainRenderer)
      composer.addPass(new RenderPass(scene, camera))
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.6, 0.4))

      const background = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 18),
        new THREE.ShaderMaterial({
          uniforms: {
            innerColor: { value: new THREE.Color("#111735") },
            outerColor: { value: new THREE.Color("#080810") },
          },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
          fragmentShader: "uniform vec3 innerColor; uniform vec3 outerColor; varying vec2 vUv; void main(){ vec2 uv = vUv - 0.5; float dist = length(uv) * 1.55; vec3 color = mix(innerColor, outerColor, smoothstep(0.0, 1.0, dist)); gl_FragColor = vec4(color, 1.0); }",
          depthWrite: false,
        }),
      )
      background.position.set(0, 0, -3.6)
      scene.add(background)

      const gridGroup = new THREE.Group()
      const gridPoints: number[] = []
      for (let index = 0; index <= 8; index++) {
        const offset = -4 + index
        gridPoints.push(-4, offset, -3.1, 4, offset, -3.1)
        gridPoints.push(offset, -4, -3.1, offset, 4, -3.1)
      }
      const gridGeometry = new THREE.BufferGeometry()
      gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(gridPoints, 3))
      const gridMaterial = new THREE.LineBasicMaterial({ color: "#111122", transparent: true, opacity: 0.95 })
      gridGroup.add(new THREE.LineSegments(gridGeometry, gridMaterial))
      scene.add(gridGroup)

      const frameGroup = new THREE.Group()
      const baseFrameLines: THREE.Line[] = []
      const baseFrameArrays: Float32Array[] = []
      const frameMaterialColor = new THREE.Color(accentColor)
      for (let frameIndex = 0; frameIndex < DISPLAY_FRAME_COUNT; frameIndex++) {
        const positions = new Float32Array(DISPLAY_POINTS * 3)
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
        const depthMix = frameIndex / Math.max(1, DISPLAY_FRAME_COUNT - 1)
        const material = new THREE.LineBasicMaterial({
          color: frameMaterialColor.clone().lerp(new THREE.Color("#d7f6ff"), depthMix * 0.18),
          transparent: true,
          opacity: 0.1 + depthMix * 0.28,
        })
        const line = new THREE.Line(geometry, material)
        frameGroup.add(line)
        baseFrameLines.push(line)
        baseFrameArrays.push(positions)
      }
      scene.add(frameGroup)

      const activeFramePositions = new Float32Array(DISPLAY_POINTS * 3)
      const activeFrameGlowPositions = new Float32Array(DISPLAY_POINTS * 3)
      const activeFrameGeometry = new THREE.BufferGeometry()
      activeFrameGeometry.setAttribute("position", new THREE.BufferAttribute(activeFramePositions, 3))
      const activeFrameGlowGeometry = new THREE.BufferGeometry()
      activeFrameGlowGeometry.setAttribute("position", new THREE.BufferAttribute(activeFrameGlowPositions, 3))

      const activeGlow = new THREE.Line(
        activeFrameGlowGeometry,
        new THREE.LineBasicMaterial({ color: "#00cfff", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending }),
      )
      activeGlow.scale.set(1.01, 1.04, 1)
      const activeLine = new THREE.Line(
        activeFrameGeometry,
        new THREE.LineBasicMaterial({ color: "#b8f6ff", transparent: true, opacity: 1 }),
      )
      scene.add(activeGlow)
      scene.add(activeLine)

      const overlayPositions = new Float32Array(DISPLAY_POINTS * 3)
      const overlayGlowPositions = new Float32Array(DISPLAY_POINTS * 3)
      const overlayGeometry = new THREE.BufferGeometry()
      overlayGeometry.setAttribute("position", new THREE.BufferAttribute(overlayPositions, 3))
      const overlayGlowGeometry = new THREE.BufferGeometry()
      overlayGlowGeometry.setAttribute("position", new THREE.BufferAttribute(overlayGlowPositions, 3))
      const overlayGlow = new THREE.Line(
        overlayGlowGeometry,
        new THREE.LineBasicMaterial({ color: "#00cfff", transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending }),
      )
      overlayGlow.scale.set(1.015, 1.12, 1)
      const overlayLine = new THREE.Line(
        overlayGeometry,
        new THREE.LineBasicMaterial({ color: "#00cfff", transparent: true, opacity: 0.98 }),
      )
      scene.add(overlayGlow)
      scene.add(overlayLine)

      const ribbonScene = new THREE.Scene()
      const ribbonCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
      ribbonCamera.position.z = 1
      const spectrogramData = new Uint8Array(SPECTROGRAM_WIDTH * SPECTROGRAM_HEIGHT * 4)
      const spectrogramTexture = new THREE.DataTexture(spectrogramData, SPECTROGRAM_WIDTH, SPECTROGRAM_HEIGHT)
      spectrogramTexture.colorSpace = THREE.SRGBColorSpace
      spectrogramTexture.needsUpdate = true
      const ribbonPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: spectrogramTexture }),
      )
      ribbonScene.add(ribbonPlane)

      const updateRendererSizes = () => {
        const mainRect = mainHost.getBoundingClientRect()
        const ribbonRect = ribbonHost.getBoundingClientRect()
        if (mainRect.width > 0 && mainRect.height > 0) {
          mainRenderer.setSize(mainRect.width, mainRect.height, false)
          composer.setSize(mainRect.width, mainRect.height)
          camera.aspect = mainRect.width / mainRect.height
          camera.updateProjectionMatrix()
        }
        if (ribbonRect.width > 0 && ribbonRect.height > 0) {
          ribbonRenderer.setSize(ribbonRect.width, ribbonRect.height, false)
        }
      }

      const resizeObserver = new ResizeObserver(updateRendererSizes)
      resizeObserver.observe(mainHost)
      resizeObserver.observe(ribbonHost)
      updateRendererSizes()

      const updateCamera = () => {
        const x = Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius
        const y = Math.sin(orbit.pitch) * orbit.radius
        const z = Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius
        camera.position.set(x, y, z)
        camera.lookAt(0, 0, 0)
      }
      updateCamera()

      const handlePointerDown = (event: PointerEvent) => {
        pointer.active = true
        pointer.x = event.clientX
        pointer.y = event.clientY
        pointer.yaw = orbit.yaw
        pointer.pitch = orbit.pitch
        root.setPointerCapture?.(event.pointerId)
      }
      const handlePointerMove = (event: PointerEvent) => {
        if (!pointer.active) return
        orbit.yaw = pointer.yaw - (event.clientX - pointer.x) * 0.005
        orbit.pitch = THREE.MathUtils.clamp(pointer.pitch - (event.clientY - pointer.y) * 0.004, -0.1, 1.1)
        updateCamera()
      }
      const handlePointerUp = (event: PointerEvent) => {
        pointer.active = false
        root.releasePointerCapture?.(event.pointerId)
      }

      root.addEventListener("pointerdown", handlePointerDown)
      root.addEventListener("pointermove", handlePointerMove)
      root.addEventListener("pointerup", handlePointerUp)
      root.addEventListener("pointerleave", handlePointerUp)

      if (process.env.NODE_ENV !== "production") {
        const stats = new Stats()
        stats.dom.style.position = "absolute"
        stats.dom.style.top = "8px"
        stats.dom.style.right = "8px"
        stats.dom.style.left = "auto"
        root.appendChild(stats.dom)
        statsRef.current = stats
      }

      let ribbonFrameCounter = 0
      const render = () => {
        statsRef.current?.begin()

        const waveData = waveDataRef.current
        if (waveData) {
          for (let frameIndex = 0; frameIndex < DISPLAY_FRAME_COUNT; frameIndex++) {
            const zValue = THREE.MathUtils.lerp(-3.2, 3.2, frameIndex / Math.max(1, DISPLAY_FRAME_COUNT - 1))
            applyFrameToPositions(
              baseFrameArrays[frameIndex],
              waveData.samples,
              waveData.displayFrameCount,
              waveData.frameSize,
              frameIndex,
              DISPLAY_POINTS,
              zValue,
              1.15,
              7.2,
            )
            const attribute = baseFrameLines[frameIndex].geometry.getAttribute("position") as THREE.BufferAttribute
            attribute.needsUpdate = true
          }

          const activeFrame = THREE.MathUtils.clamp(framePositionRef.current, 0, 1) * Math.max(0, waveData.displayFrameCount - 1)
          const activeZ = THREE.MathUtils.lerp(-3.2, 3.2, THREE.MathUtils.clamp(framePositionRef.current, 0, 1))
          applyFrameToPositions(activeFramePositions, waveData.samples, waveData.displayFrameCount, waveData.frameSize, activeFrame, DISPLAY_POINTS, activeZ, 1.28, 7.2)
          applyFrameToPositions(activeFrameGlowPositions, waveData.samples, waveData.displayFrameCount, waveData.frameSize, activeFrame, DISPLAY_POINTS, activeZ, 1.28, 7.2)
          ;(activeLine.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true
          ;(activeGlow.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true
        }

        const scopeSamples = getScopeFrame().samples
        if (scopeSamples.length > 0) {
          latestFrameRef.current = Float32Array.from(scopeSamples)
        }

        const activeOverlayZ = waveData ? THREE.MathUtils.lerp(-3.2, 3.2, THREE.MathUtils.clamp(framePositionRef.current, 0, 1)) + 0.2 : 0.2
        const latest = latestFrameRef.current
        const sampleCount = latest.length
        for (let index = 0; index < DISPLAY_POINTS; index++) {
          const sampleIndex = sampleCount > 1
            ? Math.min(sampleCount - 1, Math.floor((index / Math.max(1, DISPLAY_POINTS - 1)) * (sampleCount - 1)))
            : 0
          const value = latest[sampleIndex] ?? 0
          const base = index * 3
          overlayPositions[base] = (index / Math.max(1, DISPLAY_POINTS - 1) - 0.5) * 7.4
          overlayPositions[base + 1] = value * 1.7
          overlayPositions[base + 2] = activeOverlayZ
          overlayGlowPositions[base] = overlayPositions[base]
          overlayGlowPositions[base + 1] = overlayPositions[base + 1]
          overlayGlowPositions[base + 2] = overlayPositions[base + 2]
        }
        ;(overlayLine.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true
        ;(overlayGlow.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true

        if (ribbonFrameCounter % RIBBON_UPDATE_EVERY === 0 && latest.length > 0) {
          spectrogramData.copyWithin(0, 4)
          const bins = Math.min(SPECTROGRAM_HEIGHT, 96)
          const stride = Math.max(1, Math.floor(latest.length / bins))
          for (let y = 0; y < SPECTROGRAM_HEIGHT; y++) {
            const mappedBin = Math.min(bins - 1, Math.floor((y / Math.max(1, SPECTROGRAM_HEIGHT - 1)) * (bins - 1)))
            let sum = 0
            for (let i = 0; i < stride; i++) {
              const idx = Math.min(latest.length - 1, mappedBin * stride + i)
              sum += Math.abs(latest[idx] ?? 0)
            }
            const magnitude = Math.min(1, (sum / stride) * 2.4)
            const color = colorFromMagnitude(magnitude)
            const row = SPECTROGRAM_HEIGHT - 1 - y
            const offset = (row * SPECTROGRAM_WIDTH + (SPECTROGRAM_WIDTH - 1)) * 4
            spectrogramData[offset] = Math.round(color.r * 255)
            spectrogramData[offset + 1] = Math.round(color.g * 255)
            spectrogramData[offset + 2] = Math.round(color.b * 255)
            spectrogramData[offset + 3] = 255
          }
          spectrogramTexture.needsUpdate = true
        }

        ribbonFrameCounter += 1
        composer.render()
        ribbonRenderer.render(ribbonScene, ribbonCamera)
        statsRef.current?.end()
        animationRef.current = window.requestAnimationFrame(render)
      }

      animationRef.current = window.requestAnimationFrame(render)

      cleanupRef.current = () => {
        window.cancelAnimationFrame(animationRef.current)
        resizeObserver.disconnect()
        root.removeEventListener("pointerdown", handlePointerDown)
        root.removeEventListener("pointermove", handlePointerMove)
        root.removeEventListener("pointerup", handlePointerUp)
        root.removeEventListener("pointerleave", handlePointerUp)
        statsRef.current?.dom.remove()
        statsRef.current = null
        composer.dispose()
        mainRenderer.dispose()
        ribbonRenderer.dispose()
        gridGeometry.dispose()
        gridMaterial.dispose()
        background.geometry.dispose()
        ;(background.material as THREE.Material).dispose()
        spectrogramTexture.dispose()
        ;(ribbonPlane.material as THREE.Material).dispose()
        ribbonPlane.geometry.dispose()
        baseFrameLines.forEach((line) => {
          line.geometry.dispose()
          ;(line.material as THREE.Material).dispose()
        })
        activeLine.geometry.dispose()
        ;(activeLine.material as THREE.Material).dispose()
        activeGlow.geometry.dispose()
        ;(activeGlow.material as THREE.Material).dispose()
        overlayLine.geometry.dispose()
        ;(overlayLine.material as THREE.Material).dispose()
        overlayGlow.geometry.dispose()
        ;(overlayGlow.material as THREE.Material).dispose()
        if (mainRenderer.domElement.parentNode === mainHost) {
          mainHost.removeChild(mainRenderer.domElement)
        }
        if (ribbonRenderer.domElement.parentNode === ribbonHost) {
          ribbonHost.removeChild(ribbonRenderer.domElement)
        }
      }

      return () => {
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    }, [accentColor])

    return (
      <div ref={rootRef} className="panel-recessed relative h-full overflow-hidden" style={{ minHeight: 0, background: "#080810", cursor: "grab" }}>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2 pointer-events-none">
          <span className="font-mono uppercase" style={{ fontSize: 8, letterSpacing: "1.5px", color: "#d6ebff" }}>
            {preset.toUpperCase()} WT STACK
          </span>
          <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1.2px", color: "#7fb5d6" }}>
            64 FRAMES · LIVE SCOPE
          </span>
        </div>
        <div className="flex h-full flex-col">
          <div ref={mainHostRef} className="min-h-0 flex-1" />
          <div className="border-t" style={{ height: 76, borderColor: "#111a2a", flexShrink: 0 }}>
            <div ref={ribbonHostRef} className="h-full w-full" />
          </div>
        </div>
      </div>
    )
  },
)
