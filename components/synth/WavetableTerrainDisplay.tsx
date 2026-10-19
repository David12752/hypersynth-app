"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js"
import { getWavetableDisplayData } from "@/lib/audio/AudioBridge"

// =============================================================================
//  WavetableTerrainDisplay
//
//  Renders wavetable frames as a single subdivided BufferGeometry terrain mesh.
//    X = Phase (left → right)
//    Y = Amplitude (up)
//    Z = Table-index depth (front → back)
//
//  Vertex shader:   passes amplitude + UV depth through to fragment.
//  Fragment shader: cyan/teal neon palette, additive peak glow, depth fog.
//  Post-process:    UnrealBloomPass (~1.2 strength) amplifies the emissive peaks.
//
//  External API (via ref):
//    updateWavetable(samples, frameCount)  — push new terrain data at any time
//    setFramePosition(0..frameCount-1)     — highlight / scrub a single row
//
//  Interaction:
//    Pointer drag  → orbit (yaw + pitch) with inertia
//    Hover auto-tilt → subtle passive X-rotation towards pointer
// =============================================================================

// ── Grid constants ─────────────────────────────────────────────────────────────
const TERRAIN_COLS   = 256    // Phase resolution per row
const TERRAIN_ROWS   = 64     // Number of table frames rendered
const AMPLITUDE_SCALE = 0.85  // World-unit height scale
const WORLD_W  = 5.0          // X-axis span (phase)
const WORLD_D  = 3.4          // Z-axis span (table depth)

// =============================================================================
//  VERTEX SHADER
//  Receives vertex.position from the BufferGeometry (Y=amplitude after update).
//  Outputs vAmplitude, vDepth (0=back row, 1=front row), vPhase (0=left, 1=right).
// =============================================================================
const VERT_SHADER = /* glsl */ `
  precision highp float;

  varying float vAmplitude;
  varying float vDepth;
  varying float vPhase;

  void main() {
    // uv.y maps [0..1] back-to-front after the geometry has been rotateX(-PI/2)
    vAmplitude = position.y;
    vDepth     = uv.y;
    vPhase     = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// =============================================================================
//  FRAGMENT SHADER
//  Implements layered neon glow that feeds the UnrealBloomPass.
//
//  Palette:
//    uColorBase   – near-black for silence regions
//    uColorMid    – cyan (#00d4ff) for mid-amplitude
//    uColorPeak   – white-hot (#e8fbff) for peaks
//
//  Active-frame highlighting:
//    A faint teal tint is applied to the row at uActiveDepth (0..1).
// =============================================================================
const FRAG_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3  uColorBase;
  uniform vec3  uColorMid;
  uniform vec3  uColorPeak;
  uniform float uActiveDepth;
  uniform float uTime;

  varying float vAmplitude;
  varying float vDepth;
  varying float vPhase;

  void main() {
    float absAmp = clamp(abs(vAmplitude) / ${AMPLITUDE_SCALE.toFixed(2)}, 0.0, 1.0);

    // ── Neon palette: base → cyan → white ────────────────────────────────────
    vec3 color = mix(uColorBase, uColorMid,  smoothstep(0.04, 0.52, absAmp));
         color = mix(color,     uColorPeak, smoothstep(0.48, 0.92, absAmp));

    // ── Additive emissive glow — feeds the bloom pass ─────────────────────────
    float peakGlow = pow(absAmp, 4.0) * 2.6;
    color += uColorMid  * peakGlow * 0.50;
    color += uColorPeak * pow(absAmp, 8.0) * 1.6;

    // ── Depth fog: back rows recede into darkness ─────────────────────────────
    float fog = mix(0.12, 1.0, vDepth);
    color *= fog;

    // ── Active-frame highlight (faint teal tint on selected row) ─────────────
    float frameDist    = abs(vDepth - uActiveDepth);
    float frameHighlight = smoothstep(0.04, 0.0, frameDist) * 0.55;
    color += uColorMid * frameHighlight * absAmp;

    gl_FragColor = vec4(color, 1.0);
  }
`

// ── Public ref handle ──────────────────────────────────────────────────────────
export interface TerrainHandle {
  /** Push raw flat Float32Array of wavetable samples; frameCount tells how many frames */
  updateWavetable(samples: Float32Array | number[], frameCount: number): void
  /** Move the scan-line highlight to a specific frame position (0 .. frameCount-1) */
  setFramePosition(pos: number): void
}

interface WavetableTerrainDisplayProps {
  /** 0-based frame index to highlight with the active scan-line */
  framePosition?: number
  /** Preset name to load from the audio bridge on mount */
  preset?: string
  className?: string
}

// ── Mutable scene state (never stored in React state to avoid re-renders) ──────
interface SceneData {
  framePos:   number
  samples:    Float32Array
  frameCount: number
  frameSize:  number
  dirty:      boolean
}

export const WavetableTerrainDisplay = forwardRef<TerrainHandle, WavetableTerrainDisplayProps>(
  function WavetableTerrainDisplay(
    { framePosition = 0, preset = "basic", className },
    ref,
  ) {
    const hostRef  = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<SceneData>({
      framePos:   framePosition,
      samples:    new Float32Array(0),
      frameCount: 0,
      frameSize:  0,
      dirty:      false,
    })

    // Keep framePos in sync without a React re-render
    useEffect(() => {
      sceneRef.current.framePos = framePosition
    }, [framePosition])

    // ── Imperative handle for parent components ──────────────────────────────
    useImperativeHandle(ref, () => ({
      updateWavetable(samples, frameCount) {
        const s       = sceneRef.current
        s.samples     = Float32Array.from(samples)
        s.frameCount  = frameCount
        s.frameSize   = frameCount > 0 ? Math.floor(samples.length / frameCount) : 0
        s.dirty       = true
      },
      setFramePosition(pos) {
        sceneRef.current.framePos = pos
      },
    }))

    // ── Load initial preset from AudioBridge (with sine-wave demo fallback) ───
    useEffect(() => {
      let alive = true
      void (async () => {
        try {
          const data = await getWavetableDisplayData(preset, TERRAIN_ROWS)
          if (!alive) return
          if (data?.samples?.length) {
            const s      = sceneRef.current
            s.samples     = Float32Array.from(data.samples)
            s.frameCount  = data.displayFrameCount
            s.frameSize   = data.frameSize
            s.dirty       = true
            return
          }
        } catch { /* bridge not ready */ }

        // Fallback: generate a multi-frame sine-stack so the terrain always looks alive
        if (!alive) return
        const FC = TERRAIN_ROWS
        const FS = TERRAIN_COLS
        const fallback = new Float32Array(FC * FS)
        for (let fi = 0; fi < FC; fi++) {
          const harmonics = 1 + Math.round((fi / (FC - 1)) * 7)   // 1..8 harmonics
          const amp       = 0.6 + (fi / (FC - 1)) * 0.35
          for (let si = 0; si < FS; si++) {
            const phase = (si / FS) * Math.PI * 2
            let v = 0
            for (let h = 1; h <= harmonics; h++) v += Math.sin(phase * h) / h
            fallback[fi * FS + si] = (v / harmonics) * amp
          }
        }
        const s      = sceneRef.current
        s.samples     = fallback
        s.frameCount  = FC
        s.frameSize   = FS
        s.dirty       = true
      })()
      return () => { alive = false }
    }, [preset])

    // ── Three.js scene ────────────────────────────────────────────────────────
    useEffect(() => {
      const host = hostRef.current
      if (!host) return

      // ── Renderer ────────────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha:     false,
        powerPreference: "high-performance",
      })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.setClearColor(0x04040e)
      host.appendChild(renderer.domElement)

      // ── Camera ───────────────────────────────────────────────────────────────
      const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100)

      // ── Orbit state (smooth damping) ─────────────────────────────────────────
      const orbit = {
        yaw: 0.22, pitch: 0.38, radius: 7.4,
        targetYaw: 0.22, targetPitch: 0.38,
      }

      // ── Scene ────────────────────────────────────────────────────────────────
      const scene = new THREE.Scene()
      scene.fog = new THREE.FogExp2(0x04040e, 0.055)

      // Radial-gradient background plane
      const bgMat = new THREE.ShaderMaterial({
        uniforms: {
          inner: { value: new THREE.Color("#0b1232") },
          outer: { value: new THREE.Color("#04040e") },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform vec3 inner; uniform vec3 outer; varying vec2 vUv;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            gl_FragColor = vec4(mix(inner, outer, smoothstep(0.0, 1.0, d)), 1.0);
          }
        `,
        depthWrite: false,
        side: THREE.FrontSide,
      })
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(28, 20), bgMat)
      bg.position.z = -6
      scene.add(bg)

      // Subtle floor grid
      const gridHelper = new THREE.GridHelper(7, 14, 0x0f0f28, 0x09091a)
      gridHelper.position.y = -AMPLITUDE_SCALE - 0.06
      scene.add(gridHelper)

      // ── Terrain geometry ─────────────────────────────────────────────────────
      //   PlaneGeometry creates verts in the XY plane. We rotate -90° around X
      //   so the plane lies flat (XZ) with Y pointing up = amplitude axis.
      const geo = new THREE.PlaneGeometry(
        WORLD_W, WORLD_D,
        TERRAIN_COLS - 1, TERRAIN_ROWS - 1,
      )
      geo.rotateX(-Math.PI / 2)

      // Mark the position buffer as dynamic for repeated per-frame updates
      const posBuf = geo.attributes.position as THREE.BufferAttribute
      posBuf.usage = THREE.DynamicDrawUsage

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColorBase:   { value: new THREE.Color("#02040c") },
          uColorMid:    { value: new THREE.Color("#00d4ff") },
          uColorPeak:   { value: new THREE.Color("#e4f9ff") },
          uActiveDepth: { value: 0.5 },
          uTime:        { value: 0 },
        },
        vertexShader:   VERT_SHADER,
        fragmentShader: FRAG_SHADER,
        side: THREE.FrontSide,
      })

      const mesh = new THREE.Mesh(geo, material)
      scene.add(mesh)

      // ── Active-frame scan line ────────────────────────────────────────────────
      const scanPosBuf = new Float32Array(TERRAIN_COLS * 3)
      const scanGeo    = new THREE.BufferGeometry()
      scanGeo.setAttribute("position", new THREE.BufferAttribute(scanPosBuf, 3))
      const scanMat  = new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.7,
      })
      const scanLine = new THREE.Line(scanGeo, scanMat)
      scene.add(scanLine)

      // ── Post-processing ───────────────────────────────────────────────────────
      const composer   = new EffectComposer(renderer)
      composer.addPass(new RenderPass(scene, camera))
      const bloomPass  = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.2, 0.55, 0.32)
      composer.addPass(bloomPass)

      // ── Pointer orbit ─────────────────────────────────────────────────────────
      const ptr = { active: false, x0: 0, y0: 0, yaw0: 0.22, pitch0: 0.38 }

      const onPointerDown = (e: PointerEvent) => {
        ptr.active = true
        ptr.x0     = e.clientX;  ptr.y0    = e.clientY
        ptr.yaw0   = orbit.yaw;  ptr.pitch0 = orbit.pitch
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }
      const onPointerMove = (e: PointerEvent) => {
        if (!ptr.active) return
        orbit.targetYaw   = ptr.yaw0   + (e.clientX - ptr.x0) * 0.004
        orbit.targetPitch = Math.max(0.08, Math.min(1.1,
          ptr.pitch0 + (e.clientY - ptr.y0) * 0.004))
      }
      const onPointerUp = () => { ptr.active = false }

      renderer.domElement.addEventListener("pointerdown", onPointerDown)
      renderer.domElement.addEventListener("pointermove", onPointerMove)
      renderer.domElement.addEventListener("pointerup",   onPointerUp)

      // ── Resize observer ───────────────────────────────────────────────────────
      const doResize = () => {
        const { clientWidth: w, clientHeight: h } = host
        if (!w || !h) return
        renderer.setSize(w, h)
        composer.setSize(w, h)
        bloomPass.resolution.set(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      const ro = new ResizeObserver(doResize)
      ro.observe(host)
      doResize()

      // ── Helpers: terrain vertex update ────────────────────────────────────────
      const pushTerrain = () => {
        const { samples, frameCount, frameSize } = sceneRef.current
        if (!frameCount || !frameSize) return

        for (let row = 0; row < TERRAIN_ROWS; row++) {
          const t       = row / Math.max(1, TERRAIN_ROWS - 1)
          const frameF  = t * (frameCount - 1)
          const fi0     = Math.floor(frameF)
          const fi1     = Math.min(frameCount - 1, fi0 + 1)
          const blend   = frameF - fi0

          for (let col = 0; col < TERRAIN_COLS; col++) {
            const si  = Math.floor((col / Math.max(1, TERRAIN_COLS - 1)) * (frameSize - 1))
            const s0  = samples[fi0 * frameSize + si] ?? 0
            const s1  = samples[fi1 * frameSize + si] ?? 0
            posBuf.setY(row * TERRAIN_COLS + col, (s0 + (s1 - s0) * blend) * AMPLITUDE_SCALE)
          }
        }
        posBuf.needsUpdate = true
        geo.computeVertexNormals()
        sceneRef.current.dirty = false
      }

      // ── Helpers: scan-line update ─────────────────────────────────────────────
      const pushScanLine = (activeFrac: number) => {
        const { samples, frameCount, frameSize } = sceneRef.current
        if (!frameCount || !frameSize) { scanLine.visible = false; return }
        scanLine.visible = true

        const frameF  = activeFrac * (frameCount - 1)
        const fi0     = Math.floor(frameF)
        const fi1     = Math.min(frameCount - 1, fi0 + 1)
        const blend   = frameF - fi0
        const zPos    = (activeFrac - 0.5) * WORLD_D

        for (let col = 0; col < TERRAIN_COLS; col++) {
          const si  = Math.floor((col / Math.max(1, TERRAIN_COLS - 1)) * (frameSize - 1))
          const s0  = samples[fi0 * frameSize + si] ?? 0
          const s1  = samples[fi1 * frameSize + si] ?? 0
          const amp = (s0 + (s1 - s0) * blend) * AMPLITUDE_SCALE
          const base = col * 3
          scanPosBuf[base]     = -WORLD_W / 2 + (col / (TERRAIN_COLS - 1)) * WORLD_W
          scanPosBuf[base + 1] = amp + 0.012   // float 1 cm above terrain
          scanPosBuf[base + 2] = zPos
        }
        ;(scanGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
      }

      // ── Animation loop ─────────────────────────────────────────────────────────
      let rafId = 0
      const tick = (t: number) => {
        rafId = requestAnimationFrame(tick)

        material.uniforms.uTime.value = t * 0.001

        if (sceneRef.current.dirty) pushTerrain()

        const { framePos, frameCount } = sceneRef.current
        const activeFrac = Math.max(0, Math.min(1,
          frameCount > 1 ? framePos / (frameCount - 1) : 0,
        ))
        material.uniforms.uActiveDepth.value = activeFrac
        pushScanLine(activeFrac)

        // Smooth orbit damping
        orbit.yaw   += (orbit.targetYaw   - orbit.yaw)   * 0.07
        orbit.pitch += (orbit.targetPitch - orbit.pitch) * 0.07

        camera.position.set(
          Math.sin(orbit.yaw)   * orbit.radius * Math.cos(orbit.pitch),
          Math.sin(orbit.pitch) * orbit.radius,
          Math.cos(orbit.yaw)   * orbit.radius * Math.cos(orbit.pitch),
        )
        camera.lookAt(0, 0, 0)

        composer.render()
      }
      rafId = requestAnimationFrame(tick)

      // ── Cleanup ───────────────────────────────────────────────────────────────
      return () => {
        cancelAnimationFrame(rafId)
        ro.disconnect()
        renderer.domElement.removeEventListener("pointerdown", onPointerDown)
        renderer.domElement.removeEventListener("pointermove", onPointerMove)
        renderer.domElement.removeEventListener("pointerup",   onPointerUp)
        geo.dispose()
        material.dispose()
        scanGeo.dispose()
        scanMat.dispose()
        bgMat.dispose()
        renderer.dispose()
        composer.dispose()
        if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
      }
    }, []) // scene is set up once; data changes come through refs

    return (
      <div
        ref={hostRef}
        className={className}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 220,
          position: "relative",
          overflow: "hidden",
          background: "#04040e",
        }}
      />
    )
  },
)
