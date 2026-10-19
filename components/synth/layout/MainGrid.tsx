"use client"

import { useState, useEffect, useRef } from "react"
import GridLayout from "react-grid-layout/legacy"
import type { LayoutItem } from "react-grid-layout/legacy"
import { Tile, type TileTab } from "./Tile"
import { OscillatorTileContent } from "../tiles/OscillatorTileContent"
import { FilterTileContent }     from "../tiles/FilterTileContent"
import { EnvelopeTileContent }   from "../tiles/EnvelopeTileContent"
import { LFOTileContent }        from "../tiles/LFOTileContent"
import { SeqTileContent }        from "../tiles/SeqTileContent"
import { FXTileContent }         from "../tiles/FXTileContent"
import { ModMatrixTileContent }  from "../tiles/ModMatrixTileContent"
import { ScopeTileContent }      from "../tiles/ScopeTileContent"
import { MasterTileContent }     from "../tiles/MasterTileContent"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"

const ACCENT = {
  osc:    "#5865f2",
  filter: "#a855f7",
  env:    "#f59e0b",
  lfo:    "#10b981",
  seq:    "#06b6d4",
  fx:     "#ef4444",
  mod:    "#ec4899",
  scope:  "#00d4ff",
  master: "#10b981",
} as const

const OSC_TABS: TileTab[] = [
  { id: "osc1", label: "OSC 1" },
  { id: "osc2", label: "OSC 2" },
  { id: "osc3", label: "OSC 3" },
]
const ENV_TABS: TileTab[] = [
  { id: "env1", label: "AMP",   routed: true },
  { id: "env2", label: "FLT",   routed: true },
  { id: "env3", label: "PITCH" },
  { id: "env4", label: "AUX" },
]
const LFO_TABS: TileTab[] = [
  { id: "lfo1", label: "LFO 1", routed: true },
  { id: "lfo2", label: "LFO 2" },
  { id: "lfo3", label: "LFO 3" },
  { id: "lfo4", label: "LFO 4" },
]

const GRID_MARGIN: [number, number] = [5, 5]
const GRID_PADDING: [number, number] = [4, 4]

const DESKTOP_COLS = 24
const DESKTOP_ROWS = 28
const COMPACT_COLS = 12
const COMPACT_ROWS = 32

// Pixel-derived V2 desktop layout from the 1362×768 Electron reference screen.
// Grid math at that size: 24 columns × 28 rows, 5px gaps, 4px padding.
// This reproduces the captured panel proportions:
// - OSC/FILTER share the top row height.
// - SCOPE occupies the upper-right display area.
// - MASTER is a narrow right-side tower below SCOPE.
// - MOD + SEQ fill the bottom span to the left of MASTER.
const DESKTOP_LAYOUT: LayoutItem[] = [
  { i: "osc",    x: 0,  y: 0,  w: 9,  h: 10, minW: 5, minH: 5 },
  { i: "filter", x: 9,  y: 0,  w: 6,  h: 10, minW: 4, minH: 4 },
  { i: "scope",  x: 15, y: 0,  w: 9,  h: 15, minW: 6, minH: 8 },
  { i: "env",    x: 0,  y: 10, w: 5,  h: 8,  minW: 4, minH: 4 },
  { i: "lfo",    x: 5,  y: 10, w: 4,  h: 8,  minW: 3, minH: 4 },
  { i: "fx",     x: 9,  y: 10, w: 6,  h: 8,  minW: 3, minH: 4 },
  { i: "mod",    x: 0,  y: 18, w: 13, h: 10, minW: 5, minH: 5 },
  { i: "seq",    x: 13, y: 18, w: 7,  h: 10, minW: 4, minH: 5 },
  { i: "master", x: 20, y: 15, w: 4,  h: 13, minW: 4, minH: 5 },
  { i: "logo",   x: 15, y: 15, w: 5,  h: 3  },  // fills gap below SCOPE, left of MASTER
]

const COMPACT_LAYOUT: LayoutItem[] = [
  { i: "osc",    x: 0,  y: 0,  w: 12, h: 7, minW: 4, minH: 5 },
  { i: "filter", x: 0,  y: 7,  w: 6,  h: 6, minW: 3, minH: 4 },
  { i: "env",    x: 6,  y: 7,  w: 6,  h: 6, minW: 3, minH: 4 },
  { i: "lfo",    x: 0,  y: 13, w: 5,  h: 5, minW: 3, minH: 4 },
  { i: "fx",     x: 5,  y: 13, w: 4,  h: 5, minW: 2, minH: 3 },
  { i: "master", x: 9,  y: 13, w: 3,  h: 5, minW: 2, minH: 3 },
  { i: "scope",  x: 0,  y: 18, w: 7,  h: 6, minW: 2, minH: 4 },
  { i: "logo",   x: 7,  y: 18, w: 5,  h: 6 },
  { i: "mod",    x: 0,  y: 24, w: 6,  h: 8, minW: 4, minH: 5 },
  { i: "seq",    x: 6,  y: 24, w: 6,  h: 8, minW: 3, minH: 5 },
]

type OscEngineType = "VA" | "WAVE" | "FM" | "GRAN" | "MODAL" | "ADD" | "SAMP"
type VaWaveform = "sine" | "tri" | "saw" | "square" | "noise"
type VaModel = "blep" | "tpt" | "circuit"
type VaSubOsc = "off" | "sub1sin" | "sub1sq" | "sub2sin"
type WavePreset = "basic" | "pwm" | "formant" | "digital" | "vocal"
type GranWindow = "hann" | "gauss" | "trapez" | "rect"
type ModalBody = "string" | "bar" | "membrane" | "plate" | "tube" | "bell"
type SamplerMode = "oneshot" | "loop" | "pingpong" | "susloop"

interface OscState {
  engineType?: OscEngineType; vaWaveform?: VaWaveform; octave?: number; semitone?: number
  cent?: number; level?: number; pan?: number; phase?: number; stereo?: number; vaPulseWidth?: number
  vaPWM?: number; vaDrift?: number; vaVintage?: number; vaBright?: number; vaSubOsc?: VaSubOsc
  vaSubLevel?: number; vaSync?: boolean; vaModel?: VaModel
  waveFrame?: number; waveMorph?: number; waveScan?: boolean; waveScanTime?: number; wavePreset?: WavePreset
  fmAlgorithm?: number; fmSelectedOp?: number; fmModIndex?: number; fmFeedback?: number
  fmOp1Ratio?: number; fmOp1Level?: number; fmOp2Ratio?: number; fmOp2Level?: number
  fmOp3Ratio?: number; fmOp3Level?: number; fmOp4Ratio?: number; fmOp4Level?: number
  granSize?: number; granDensity?: number; granPosition?: number; granSpray?: number
  granPitchRandom?: number; granWindow?: GranWindow
  modalBody?: ModalBody; modalDecay?: number; modalBrightness?: number
  addHarmonicCount?: number; addMorph?: number
  sampMode?: SamplerMode; sampStart?: number; sampEnd?: number; sampPitch?: number
}
interface FilterState {
  filterMode?: "LP" | "HP" | "BP" | "NOTCH"; cutoff?: number; resonance?: number
  drive?: number; envAmount?: number; keytrack?: number
}
interface EnvState {
  attack?: number; decay?: number; sustain?: number; release?: number; trigger?: "GATE" | "TRIG" | "LOOP"
}
interface LfoState {
  waveform?: "sine" | "triangle" | "saw" | "square" | "sh"; rate?: number; amount?: number
  sync?: boolean; retrig?: boolean
}
interface EffectState { id: string; type: string; enabled: boolean; params: Record<string, number> }
interface ModRouteState { id: string; source: string; destination: string; amount: number; enabled: boolean }
interface MeterState { peakL: number; peakR: number; rmsL: number; rmsR: number }

interface MainGridProps {
  // Oscillator state (3 OSCs, index 0-2)
  oscStates?: [OscState, OscState, OscState]
  onOscChange?: (index: number, patch: Partial<OscState>) => void
  // Filter
  filterState?: FilterState
  onFilterChange?: (patch: Partial<FilterState>) => void
  // Envelopes (array)
  envStates?: EnvState[]
  onEnvChange?: (index: number, patch: Partial<EnvState>) => void
  // LFOs
  lfoStates?: LfoState[]
  onLfoChange?: (index: number, patch: Partial<LfoState>) => void
  // V2 utility panels
  effects?: EffectState[]
  onEffectsChange?: (effects: EffectState[]) => void
  modRoutes?: ModRouteState[]
  onModRoutesChange?: (routes: ModRouteState[]) => void
  macros?: number[]
  onMacroChange?: (index: number, value: number) => void
  masterVolume?: number
  onMasterVolumeChange?: (value: number) => void
  isReady?: boolean
  meters?: MeterState
  onOpenInspector?: (
    section: "osc" | "filter" | "env" | "lfo" | "seq" | "fx" | "mod" | "scope",
    instance?: string
  ) => void
}

export function MainGrid({
  oscStates,
  onOscChange,
  filterState,
  onFilterChange,
  envStates,
  onEnvChange,
  lfoStates,
  onLfoChange,
  effects,
  onEffectsChange,
  modRoutes,
  onModRoutesChange,
  macros,
  onMacroChange,
  masterVolume = 75,
  onMasterVolumeChange,
  isReady,
  meters,
  onOpenInspector,
}: MainGridProps) {
  const [oscTab, setOscTab] = useState("osc1")
  const [envTab, setEnvTab] = useState("env1")
  const [lfoTab, setLfoTab] = useState("lfo1")
  const [scopeMode, setScopeMode] = useState<"WAVE" | "FFT" | "XY">("WAVE")
  const [containerWidth,  setContainerWidth]  = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const layoutMode = containerWidth > 0 && containerWidth < 560 ? "compact" : "desktop"
  const defaultLayout = layoutMode === "compact" ? COMPACT_LAYOUT : DESKTOP_LAYOUT
  const cols = layoutMode === "compact" ? COMPACT_COLS : DESKTOP_COLS
  const rows = layoutMode === "compact" ? COMPACT_ROWS : DESKTOP_ROWS

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const target = node.parentElement ?? node

    const updateSize = () => {
      const rect = target.getBoundingClientRect()
      setContainerWidth(Math.max(320, Math.floor(rect.width)))
      setContainerHeight(Math.max(320, Math.floor(rect.height)))
    }

    const obs = new ResizeObserver(() => {
      updateSize()
    })

    obs.observe(target)
    updateSize()

    return () => {
      obs.disconnect()
    }
  }, [])

  const verticalMarginSpace = GRID_MARGIN[1] * Math.max(0, rows - 1)
  const verticalPaddingSpace = GRID_PADDING[1] * 2
  const safeContainerHeight = Math.max(320, containerHeight)
  const availableRowSpace = safeContainerHeight - verticalMarginSpace - verticalPaddingSpace
  const rowHeight = Math.max(6, Math.floor(availableRowSpace / rows))
  const isMeasured = containerWidth > 0 && containerHeight > 0

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", minHeight: 0, minWidth: 0 }}
    >
      {isMeasured ? (
      <GridLayout
        key={layoutMode}
        layout={defaultLayout}
        cols={cols}
        rowHeight={rowHeight}
        width={containerWidth}
        margin={GRID_MARGIN}
        containerPadding={GRID_PADDING}
        isResizable={false}
        isDraggable={false}
        maxRows={rows}
        style={{ minHeight: "100%" }}
        compactType={null}
      >
        <div key="osc">
          <Tile stage={1} title="OSCILLATORS" subtitle="אוסילטורים" accent={ACCENT.osc}
            tabs={OSC_TABS} activeTab={oscTab} onTabChange={setOscTab}
            onOpenInspector={() => onOpenInspector?.("osc", oscTab)}>
            {(() => {
              const idx = parseInt(oscTab.slice(3)) - 1
              const state = oscStates?.[idx] ?? {}
              return (
                <OscillatorTileContent
                  state={state}
                  onChange={(patch) => onOscChange?.(idx, patch)}
                />
              )
            })()}
          </Tile>
        </div>
        <div key="filter">
          <Tile stage={2} title="FILTER" subtitle="מסנן" accent={ACCENT.filter}
            onOpenInspector={() => onOpenInspector?.("filter")}>
            <FilterTileContent
              state={filterState ?? {}}
              onChange={(patch) => onFilterChange?.(patch)}
            />
          </Tile>
        </div>
        <div key="env">
          <Tile stage={3} title="ENVELOPES" subtitle="מעטפות" accent={ACCENT.env}
            tabs={ENV_TABS} activeTab={envTab} onTabChange={setEnvTab}
            onOpenInspector={() => onOpenInspector?.("env", envTab)}>
            {(() => {
              const idx = envTab === "env1" ? 0 : envTab === "env2" ? 1 : envTab === "env3" ? 2 : 3
              const state = envStates?.[idx] ?? {}
              return (
                <EnvelopeTileContent
                  state={state}
                  onChange={(patch) => onEnvChange?.(idx, patch)}
                />
              )
            })()}
          </Tile>
        </div>
        <div key="lfo">
          <Tile stage={4} title="LFO" subtitle="מתנדים" accent={ACCENT.lfo}
            tabs={LFO_TABS} activeTab={lfoTab} onTabChange={setLfoTab}
            onOpenInspector={() => onOpenInspector?.("lfo", lfoTab)}>
            {(() => {
              const idx = parseInt(lfoTab.slice(3)) - 1
              const state = lfoStates?.[idx] ?? {}
              return (
                <LFOTileContent
                  state={state}
                  onChange={(patch) => onLfoChange?.(idx, patch)}
                />
              )
            })()}
          </Tile>
        </div>
        <div key="seq">
          <Tile stage={5} title="SEQ / ARP" subtitle="סיקוונסר" accent={ACCENT.seq}
            onOpenInspector={() => onOpenInspector?.("seq")}>
            <SeqTileContent />
          </Tile>
        </div>
        <div key="fx">
          <Tile stage={6} title="FX" subtitle="אפקטים" accent={ACCENT.fx}
            onOpenInspector={() => onOpenInspector?.("fx")}>
            <FXTileContent effects={effects} onChange={onEffectsChange} />
          </Tile>
        </div>
        <div key="mod">
          <Tile stage={7} title="MOD MATRIX" subtitle="מטריצת מודולציה" accent={ACCENT.mod}
            onOpenInspector={() => onOpenInspector?.("mod")}>
            <ModMatrixTileContent
              routes={modRoutes}
              onRoutesChange={onModRoutesChange}
              macros={macros}
              onMacroChange={onMacroChange}
            />
          </Tile>
        </div>
        <div key="scope">
          <Tile stage={8} title="MASTER SCOPE" subtitle="אוסצילוסקופ" accent={ACCENT.scope}
            onOpenInspector={() => onOpenInspector?.("scope")}
            headerRight={
              <div className="flex gap-px">
                {(["WAVE", "FFT", "XY"] as const).map((m) => (
                  <button key={m} className="font-mono uppercase"
                    style={{
                      fontSize: 7, letterSpacing: "1px", padding: "2px 6px",
                      background: scopeMode === m ? ACCENT.scope : "rgba(255,255,255,0.4)",
                      color: scopeMode === m ? "#fff" : "var(--text-label)",
                      border: "1px solid var(--panel-shadow)", borderRadius: 2, cursor: "pointer",
                    }}
                    onClick={() => setScopeMode(m)}>{m === "WAVE" ? "SCOPE" : m === "XY" ? "VEC" : m}
                  </button>
                ))}
              </div>
            }>
            <ScopeTileContent mode={scopeMode} onModeChange={setScopeMode} meters={meters} />
          </Tile>
        </div>
        <div key="master">
          <Tile title="MASTER" subtitle="ראשי" accent={ACCENT.master}>
            <MasterTileContent
              volume={masterVolume}
              onVolumeChange={(value) => onMasterVolumeChange?.(value)}
              isReady={isReady}
              meters={meters}
            />
          </Tile>
        </div>
        <div key="logo">
          <HyperSynthLogoStrip accent={ACCENT.master} />
        </div>
      </GridLayout>
      ) : null}
    </div>
  )
}

// Decorative logo strip that fills the gap tile in the locked layout
function HyperSynthLogoStrip({ accent = "#10b981" }: { accent?: string }) {
  return (
    <div
      className="w-full h-full panel-raised flex items-center justify-center select-none"
      style={{ borderRadius: 4, overflow: "hidden", position: "relative", containerType: "size" }}
    >
      {/* Ambient radial glow */}
      <div aria-hidden style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 90% 60% at 50% 50%, ${accent}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      {/* CRT scanlines */}
      <div aria-hidden style={{
        position: "absolute", inset: 0,
        background: "repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)",
        pointerEvents: "none",
      }} />
      {/* Accent hairline top */}
      <div aria-hidden style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 0%, ${accent} 20%, ${accent} 80%, transparent 100%)`,
        opacity: 0.6,
      }} />
      <div className="flex items-center gap-3" style={{ position: "relative" }}>
        <div style={{
          width: "min(7cqmin, 20px)",
          height: "min(7cqmin, 20px)",
          border: `1.5px solid ${accent}`,
          borderRadius: 2,
          transform: "rotate(45deg)",
          boxShadow: `0 0 12px ${accent}88, inset 0 0 6px ${accent}22`,
          flexShrink: 0,
        }} />
        <div className="flex flex-col" style={{ gap: 3 }}>
          <span className="font-mono" style={{
            fontSize: "clamp(7px, 3cqmin, 14px)",
            letterSpacing: "0.4em",
            color: accent,
            textShadow: `0 0 10px ${accent}cc`,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}>HYPERSYNTH</span>
          <span className="font-mono" style={{
            fontSize: "clamp(5px, 1.6cqmin, 7px)",
            letterSpacing: "0.22em",
            color: `${accent}77`,
            whiteSpace: "nowrap",
          }}>PROFESSIONAL SYNTHESIZER</span>
        </div>
      </div>
    </div>
  )
}