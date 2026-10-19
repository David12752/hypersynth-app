"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { getScopeFrame } from "@/lib/audio/AudioBridge"

// =============================================================================
//  WebGLWaveformDisplay
//
//  GPU-accelerated oscilloscope using raw WebGL (no Three.js overhead).
//
//  Technique — 1D DataTexture waveform rendering:
//    • A fullscreen TRIANGLE_STRIP quad covers the canvas
//    • Waveform samples are packed into a 512×1 RGBA texture (R channel)
//    • The fragment shader reconstructs the curve using the per-fragment
//      horizontal UV coordinate, then computes Gaussian distance-based glow
//    • Zero geometry updates per frame — only a 2 KB texture upload
//    • LINEAR filtering gives inherently smooth, anti-aliased rendering
//
//  Shader palette:
//    Neon cyan core → soft outer halo → very dark background with vignette
//    Animated RMS-based brightness pulse keeps the signal "alive"
//
//  External API (via ref):
//    pushSamples(Float32Array | number[])  — replaces current waveform buffer
// =============================================================================

const WAVEFORM_POINTS = 512   // texture width (horizontal resolution)

// =============================================================================
//  VERTEX SHADER
//  Simple fullscreen quad: aPos = [-1..1] in clip space, vUv = [0..1] in UV.
// =============================================================================
const VERT_SRC = /* glsl */ `
  attribute vec2 aPos;
  varying   vec2 vUv;

  void main() {
    vUv         = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// =============================================================================
//  FRAGMENT SHADER
//  For every fragment:
//    1. Sample the 1D texture at vUv.x to get the waveform value in [0..1]
//    2. Un-pack to [-1..1] (the texture was packed as (v*0.5+0.5)*255)
//    3. Compute the waveform curve Y in UV space
//    4. Gaussian distance-to-curve → layered glow (tight core + soft halo)
//    5. Mix neon cyan → white at peaks; dark background with vignette
// =============================================================================
const FRAG_SRC = /* glsl */ `
  precision highp float;

  uniform sampler2D uWaveform;
  uniform float     uBrightness;
  uniform float     uTime;

  varying vec2 vUv;

  float scanNoise(vec2 uv, float t) {
    float row = floor(uv.y * 200.0) / 200.0;
    return fract(sin(row * 131.7 + t * 0.5) * 43758.5) * 0.009;
  }

  void main() {
    // Sample waveform texture; unpack from UNORM [0,1] → amplitude [-1,1]
    float packed  = texture2D(uWaveform, vec2(vUv.x, 0.5)).r;
    float amp     = packed * 2.0 - 1.0;

    // Waveform curve position in UV-Y space (centred at 0.5, amplitude ±0.38)
    float curveY  = 0.5 + amp * 0.38;

    float dy      = abs(vUv.y - curveY);

    // Three-layer Gaussian glow — tight core, inner halo, outer bloom
    float core    = exp(-dy * dy * 20000.0);
    float inner   = exp(-dy * dy * 3500.0)  * 0.60;
    float outer   = exp(-dy * dy * 420.0)   * 0.20;
    float glow    = core + inner + outer;

    // Neon palette: cyan → white at the bright core
    vec3 cyan  = vec3(0.00, 0.83, 1.00);
    vec3 white = vec3(0.90, 0.98, 1.00);
    vec3 color = mix(cyan, white, clamp(core * 1.5, 0.0, 1.0));

    // Dark background with radial vignette
    vec2  cen = vUv - 0.5;
    float vig = 1.0 - dot(cen, cen) * 1.9;
    vec3  bg  = vec3(0.008, 0.012, 0.022) * max(0.0, vig);

    vec3 final = bg + color * glow * uBrightness;

    // Very subtle CRT scanline noise
    final += scanNoise(vUv, uTime);

    gl_FragColor = vec4(final, 1.0);
  }
`

// ── Public ref handle ──────────────────────────────────────────────────────────
export interface WaveformHandle {
  /** Replace the current waveform buffer with new samples (any length) */
  pushSamples(data: Float32Array | number[]): void
}

interface WebGLWaveformDisplayProps {
  height?: number
  className?: string
}

export const WebGLWaveformDisplay = forwardRef<WaveformHandle, WebGLWaveformDisplayProps>(
  function WebGLWaveformDisplay({ height = 120, className }, ref) {
    const canvasRef  = useRef<HTMLCanvasElement>(null)
    const samplesRef = useRef(new Float32Array(WAVEFORM_POINTS))

    // ── Imperative handle ──────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      pushSamples(data) {
        const src = data instanceof Float32Array ? data : Float32Array.from(data)
        const len = src.length
        for (let i = 0; i < WAVEFORM_POINTS; i++) {
          samplesRef.current[i] = src[Math.floor((i / WAVEFORM_POINTS) * len)] ?? 0
        }
      },
    }))

    // ── WebGL setup ────────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      const gl = canvas.getContext("webgl", {
        antialias: false,
        depth: false,
        powerPreference: "high-performance",
      }) as WebGLRenderingContext | null
      if (!gl) return

      // ── Compile helper ─────────────────────────────────────────────────────
      const compileShader = (type: GLenum, src: string): WebGLShader => {
        const shader = gl.createShader(type)!
        gl.shaderSource(shader, src)
        gl.compileShader(shader)
        return shader
      }

      const prog = gl.createProgram()!
      gl.attachShader(prog, compileShader(gl.VERTEX_SHADER,   VERT_SRC))
      gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FRAG_SRC))
      gl.linkProgram(prog)
      gl.useProgram(prog)

      // ── Fullscreen quad VBO ────────────────────────────────────────────────
      const vbo = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]),
        gl.STATIC_DRAW,
      )
      const posLoc = gl.getAttribLocation(prog, "aPos")
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      // ── 1D waveform texture (512×1 RGBA) ──────────────────────────────────
      const texture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE)

      // Uniform locations
      const uWaveform   = gl.getUniformLocation(prog, "uWaveform")
      const uBrightness = gl.getUniformLocation(prog, "uBrightness")
      const uTime       = gl.getUniformLocation(prog, "uTime")
      gl.uniform1i(uWaveform, 0)

      // Texture pixel buffer — packed as RGBA UNORM (R=amplitude)
      const texBuf = new Uint8Array(WAVEFORM_POINTS * 4)

      // Resize handler
      const doResize = () => {
        const dpr = window.devicePixelRatio || 1
        const w   = Math.round(canvas.clientWidth  * dpr)
        const h   = Math.round(canvas.clientHeight * dpr)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width  = w
          canvas.height = h
        }
        gl.viewport(0, 0, w, h)
      }
      const ro = new ResizeObserver(doResize)
      ro.observe(canvas)
      doResize()

      let brightness = 0.6
      let rafId = 0

      const tick = (t: number) => {
        rafId = requestAnimationFrame(tick)

        // Pull latest scope data from the engine (synchronous bridge call)
        const frame = getScopeFrame()
        if (frame?.samples?.length) {
          const src  = frame.samples
          const step = src.length / WAVEFORM_POINTS
          for (let i = 0; i < WAVEFORM_POINTS; i++) {
            samplesRef.current[i] = src[Math.floor(i * step)] ?? 0
          }
        }

        // Pack samples into RGBA UNORM texture: amplitude [-1,1] → R [0..255]
        let rms = 0
        for (let i = 0; i < WAVEFORM_POINTS; i++) {
          const v  = Math.max(-1, Math.min(1, samplesRef.current[i]))
          rms     += v * v
          const u8 = Math.round((v * 0.5 + 0.5) * 255)
          const b  = i * 4
          texBuf[b] = texBuf[b + 1] = texBuf[b + 2] = texBuf[b + 3] = u8
        }
        rms = Math.sqrt(rms / WAVEFORM_POINTS)

        // Animated brightness: base 0.6 + RMS contribution
        brightness += (Math.min(1.0, 0.55 + rms * 0.55) - brightness) * 0.10

        // Upload texture
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texImage2D(
          gl.TEXTURE_2D, 0, gl.RGBA,
          WAVEFORM_POINTS, 1, 0,
          gl.RGBA, gl.UNSIGNED_BYTE, texBuf,
        )

        gl.uniform1f(uBrightness, brightness)
        gl.uniform1f(uTime,       t * 0.001)

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      rafId = requestAnimationFrame(tick)

      return () => {
        cancelAnimationFrame(rafId)
        ro.disconnect()
        gl.deleteTexture(texture)
        gl.deleteBuffer(vbo)
        gl.deleteProgram(prog)
      }
    }, []) // runs once per mount

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ width: "100%", height, display: "block" }}
      />
    )
  },
)
