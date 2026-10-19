"use client"

import { useState, useEffect, useRef, useCallback, type ComponentProps } from "react"
import { useAudioEngine } from "@/hooks/useAudioEngine"
import { SourceButton } from "@/components/synth/SourceButton"
import { Knob } from "@/components/synth/Knob"
import { VUMeter } from "@/components/synth/VUMeter"
import { WebGLWaveformDisplay } from "@/components/synth/WebGLWaveformDisplay"
import { OscillatorPanel } from "@/components/synth/panels/OscillatorPanel"
import { FilterPanel } from "@/components/synth/panels/FilterPanel"
import { FXPage } from "@/components/synth/panels/FXPage"
import { ModulatorPanel } from "@/components/synth/panels/ModulatorPanel"
import { ModulationPage } from "@/components/synth/panels/ModulationPage"
import { ModularPage } from "@/components/synth/panels/ModularPage"
import { MixerPanel } from "@/components/synth/panels/MixerPanel"
import { SettingsPage } from "@/components/synth/panels/SettingsPage"
import { SectionPanel } from "@/components/synth/SectionPanel"
import { LED } from "@/components/synth/LED"
import { WindControllerPanel } from "@/components/synth/panels/WindControllerPanel"
import { MainGrid } from "@/components/synth/layout/MainGrid"
import { windHandleCC } from "@/lib/audio/AudioBridge"

type SourceType = "WIND" | "OSC1" | "OSC2" | "OSC3" | "FLT" | "FX" | "MOD" | "MIX"
type PageType = "MAIN" | "PRESETS" | "SETTINGS"
type OscillatorUiState = ComponentProps<typeof OscillatorPanel>["state"]
type FilterUiState = {
  filterType: string
  filterMode: "LP" | "HP" | "BP" | "NOTCH"
  poles: number
  cutoff: number
  resonance: number
  drive: number
  envAmount: number
  keytrack: number
  envAttack: number
  envDecay: number
  envSustain: number
  envRelease: number
  routing: "SERIAL" | "PARALLEL"
}
type EffectUiState = { id: string; type: string; enabled: boolean; params: Record<string, number> }
type ModRouteUiState = { id: string; source: string; destination: string; amount: number; enabled: boolean }

const MAIN_KEYBOARD_BASE_NOTE = 60
const MAIN_KEYBOARD_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
}

function createOscillatorState(overrides: OscillatorUiState = {}): OscillatorUiState {
  return {
    engineType: "VA",
    octave: 0,
    semitone: 0,
    cent: 0,
    level: 100,
    pan: 0,
    phase: 0,
    randPhase: false,
    stereo: 0,
    vaWaveform: "saw",
    vaPulseWidth: 50,
    vaPWM: 0,
    vaSync: false,
    vaModel: "circuit",
    vaDrift: 0,
    vaVintage: 0,
    vaBright: 50,
    vaSubOsc: "off",
    vaSubLevel: 0,
    waveFrame: 0,
    waveMorph: 0,
    waveScan: false,
    waveScanTime: 2.0,
    wavePreset: "basic",
    fmAlgorithm: 1,
    fmSelectedOp: 1,
    fmOp1Ratio: 1,
    fmOp1Level: 100,
    fmOp2Ratio: 1,
    fmOp2Level: 75,
    fmOp3Ratio: 2,
    fmOp3Level: 75,
    fmOp4Ratio: 4,
    fmOp4Level: 75,
    fmModIndex: 100,
    fmFeedback: 0,
    granSize: 80,
    granDensity: 40,
    granPosition: 50,
    granSpray: 0,
    granPitchRandom: 0,
    granWindow: "hann",
    modalBody: "string",
    modalDecay: 2,
    modalBrightness: 60,
    addHarmonicCount: 16,
    addMorph: 0,
    sampFile: "INIT",
    sampMode: "loop",
    sampStart: 0,
    sampEnd: 100,
    sampPitch: 0,
    unisonVoices: 1,
    unisonDetune: 0,
    unisonSpread: 0,
    unisonBlend: 100,
    unisonPhaseMode: "random",
    ...overrides,
  }
}

// Icons for source buttons
const WindIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 8C3 8 7 8 10 6C13 4 14 2 17 2C19.2 2 21 3.8 21 6C21 8.2 19.2 10 17 10H3" />
    <path d="M3 14C3 14 8 14 11 16C14 18 15 20 18 20C19.7 20 21 18.7 21 17C21 15.3 19.7 14 18 14H3" strokeOpacity="0.6" />
    <circle cx="6" cy="8" r="1.5" fill="currentColor" strokeWidth={0} />
  </svg>
)

const OscIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 12C2 12 4 6 6 6C8 6 8 18 10 18C12 18 12 6 14 6C16 6 16 18 18 18C20 18 22 12 22 12" />
  </svg>
)

const FilterIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 8H14L22 16" />
    <path d="M2 16H8" strokeOpacity="0.5" />
  </svg>
)

const FXIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4V8M12 16V20M4 12H8M16 12H20" />
  </svg>
)

const ModIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="6" height="6" />
    <rect x="14" y="4" width="6" height="6" />
    <rect x="4" y="14" width="6" height="6" />
    <rect x="14" y="14" width="6" height="6" />
    <path d="M10 7H14M10 17H14M7 10V14M17 10V14" strokeOpacity="0.5" />
  </svg>
)

const AddIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2">
    <path d="M12 6V18M6 12H18" />
  </svg>
)

const ModularIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="4" width="5" height="8" rx="0.75" />
    <rect x="10" y="4" width="5" height="8" rx="0.75" />
    <rect x="17" y="4" width="4" height="8" rx="0.75" />
    <circle cx="5.5" cy="15" r="1.5" fill="currentColor" strokeWidth={0} />
    <circle cx="12.5" cy="15" r="1.5" fill="currentColor" strokeWidth={0} />
    <circle cx="19" cy="15" r="1.5" fill="currentColor" strokeWidth={0} />
    <path d="M5.5 13.5C5.5 13.5 9 18 12.5 13.5" strokeWidth="1" />
    <path d="M12.5 13.5C12.5 13.5 16 18 19 13.5" strokeWidth="1" />
  </svg>
)

const MixerIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 6V18M8 8V18M12 4V18M16 10V18M20 6V18" />
    <circle cx="4" cy="10" r="1.5" fill="currentColor" />
    <circle cx="8" cy="14" r="1.5" fill="currentColor" />
    <circle cx="12" cy="8" r="1.5" fill="currentColor" />
    <circle cx="16" cy="12" r="1.5" fill="currentColor" />
    <circle cx="20" cy="10" r="1.5" fill="currentColor" />
  </svg>
)

export default function HyperSynth() {
  const {
    isReady,
    error: audioError,
    sendParam,
    triggerNoteOn,
    triggerNoteOff,
    engineStats,
    meters,
    backendInfo,
    audioSettings,
    audioHosts,
    midiSettings,
    audioDevices,
    midiInputs,
    updateAudioSettings,
    updateMidiSettings,
    refreshAudioDevices,
    refreshMidiInputs,
  } = useAudioEngine()

  const [selectedSource, setSelectedSource] = useState<SourceType>("OSC1")
  const [currentPage, setCurrentPage] = useState<PageType>("MAIN")
  const [masterVolume, setMasterVolume] = useState(75)
  const [scopeMode, setScopeMode] = useState<"WAVE" | "FFT" | "XY">("WAVE")
  const initialEngineSyncDone = useRef(false)
  const mainPressedNotesRef = useRef<Set<number>>(new Set())

  // Oscillator states
  const [osc1State, setOsc1State] = useState<OscillatorUiState>(createOscillatorState({
    vaWaveform: "saw",
    level: 100,
  }))

  const [osc2State, setOsc2State] = useState<OscillatorUiState>(createOscillatorState({
    vaWaveform: "square",
    level: 80,
    cent: 7,
    unisonVoices: 2,
    unisonSpread: 25,
    stereo: 25,
  }))

  const [osc3State, setOsc3State] = useState<OscillatorUiState>(createOscillatorState({
    vaWaveform: "tri",
    octave: -1,
    level: 60,
    cent: -5,
  }))

  // Filter state
  const [filterState, setFilterState] = useState<FilterUiState>({
    filterType: "LADDER",
    filterMode: "LP" as const,
    poles: 4,
    cutoff: 75,
    resonance: 25,
    drive: 0,
    envAmount: 50,
    keytrack: 50,
    envAttack: 1,
    envDecay: 30,
    envSustain: 0,
    envRelease: 20,
    routing: "SERIAL" as const,
  })

  // FX state
  const [effects, setEffects] = useState<EffectUiState[]>([
    { id: "1", type: "REVERB", enabled: true, params: { mix: 30, size: 60, damp: 40, predelay: 10 } },
    { id: "2", type: "DELAY", enabled: true, params: { time: 50, feedback: 40, mix: 25 } },
    { id: "3", type: "CHORUS", enabled: false, params: { rate: 30, depth: 50, mix: 35 } },
  ])

  // Mod routes
  const [modRoutes, setModRoutes] = useState<ModRouteUiState[]>([
    { id: "1", source: "LFO 1", destination: "Filter Cutoff", amount: 65, enabled: true },
    { id: "2", source: "ENV 2", destination: "Osc 1 Pitch", amount: -30, enabled: true },
    { id: "3", source: "MOD", destination: "Filter Reso", amount: 50, enabled: false },
  ])

  // Envelope states (5 envelopes)
  const [selectedEnv, setSelectedEnv] = useState(0)
  const [envelopes, setEnvelopes] = useState([
    { attack: 1, decay: 30, sustain: 80, release: 20, trigger: "GATE" as const, velocity: 100 },
    { attack: 5, decay: 50, sustain: 60, release: 40, trigger: "GATE" as const, velocity: 100 },
    { attack: 0, decay: 20, sustain: 100, release: 10, trigger: "TRIG" as const, velocity: 50 },
    { attack: 10, decay: 40, sustain: 70, release: 30, trigger: "GATE" as const, velocity: 100 },
    { attack: 2, decay: 25, sustain: 90, release: 15, trigger: "LOOP" as const, velocity: 75 },
  ])

  // LFO states (5 LFOs)
  const [lfos, setLfos] = useState([
    { waveform: "sine" as const, rate: 30, amount: 0, sync: false, retrig: false },
    { waveform: "triangle" as const, rate: 50, amount: 30, sync: true, retrig: true },
    { waveform: "saw" as const, rate: 70, amount: 20, sync: false, retrig: false },
    { waveform: "square" as const, rate: 25, amount: 40, sync: true, retrig: false },
    { waveform: "sh" as const, rate: 45, amount: 35, sync: false, retrig: true },
  ])

  // Macros
  const [macros, setMacros] = useState([50, 50, 50, 50])

  // Wind / EWI — live breath level (0–1) updated from Web MIDI CC2
  const [breathLevel, setBreathLevel] = useState(0)

  // Listen for Web MIDI CC2 (breath) → update live meter + forward to engine
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) return
    let midiAccess: MIDIAccess | null = null
    const onMessage = (e: MIDIMessageEvent) => {
      const data = e.data
      if (!data || data.length < 3) return
      const status = data[0] ?? 0
      const cc = data[1] ?? 0
      const val = data[2] ?? 0
      if ((status & 0xf0) === 0xb0) {        // CC message
        windHandleCC(cc, val)
        if (cc === 2 || cc === 11) setBreathLevel(val / 127)  // CC2=breath, CC11=expression
      }
    }
    navigator.requestMIDIAccess({ sysex: false }).then(midi => {
      midiAccess = midi
      midi.inputs.forEach(input => { input.onmidimessage = onMessage })
      midi.onstatechange = () => {
        midi.inputs.forEach(input => { input.onmidimessage = onMessage })
      }
    }).catch(() => { /* MIDI not available */ })
    return () => {
      if (midiAccess) midiAccess.inputs.forEach(i => { i.onmidimessage = null })
    }
  }, [])

  const handleEffectToggle = (id: string) => {
    setEffects((prev) =>
      prev.map((fx) => (fx.id === id ? { ...fx, enabled: !fx.enabled } : fx))
    )
  }

  const handleEffectParamChange = (id: string, param: string, value: number) => {
    setEffects((prev) =>
      prev.map((fx) =>
        fx.id === id ? { ...fx, params: { ...fx.params, [param]: value } } : fx
      )
    )
  }

  const handleRemoveEffect = (id: string) => {
    setEffects((prev) => prev.filter((fx) => fx.id !== id))
  }

  const handleRouteToggle = (id: string) => {
    setModRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    )
  }

  const handleRouteAmountChange = (id: string, amount: number) => {
    setModRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, amount } : r))
    )
  }

  const handleRouteRemove = (id: string) => {
    setModRoutes((prev) => prev.filter((r) => r.id !== id))
  }

  const handleAddRoute = () => {
    const newId = String(Date.now())
    setModRoutes((prev) => [
      ...prev,
      { id: newId, source: "LFO 1", destination: "Filter Cutoff", amount: 0, enabled: true },
    ])
  }

  const handleEnvChange = (index: number, state: Partial<(typeof envelopes)[0]>) => {
    setEnvelopes((prev) =>
      prev.map((env, i) => (i === index ? { ...env, ...state } : env))
    )
    // Envelope 0 drives amp ADSR. Time params are log-scaled: 0→1ms, 100→8s
    if (index === 0) {
      const envT = (v: number) => 0.001 * Math.pow(8000, v / 100)
      if (state.attack  !== undefined) sendParam("amp-attack",  envT(state.attack))
      if (state.decay   !== undefined) sendParam("amp-decay",   envT(state.decay))
      if (state.sustain !== undefined) sendParam("amp-sustain", state.sustain / 100)
      if (state.release !== undefined) sendParam("amp-release", envT(state.release))
    }
  }

  const handleLFOChange = (index: number, state: Partial<(typeof lfos)[0]>) => {
    setLfos((prev) =>
      prev.map((lfo, i) => (i === index ? { ...lfo, ...state } : lfo))
    )
    // LFO 0 drives filter cutoff modulation
    if (index === 0) {
      const WF_MAP: Record<string, number> = { sine: 0, triangle: 1, saw: 2, square: 3, sh: 4 }
      if (state.rate     !== undefined) sendParam("lfo-rate",       0.01 * Math.pow(2000, state.rate / 100))
      if (state.waveform !== undefined) sendParam("lfo-waveform",   WF_MAP[state.waveform] ?? 0)
      if (state.amount   !== undefined) sendParam("lfo-mix-amount", state.amount / 100)
    }
  }

  const sendOscillatorStateToEngine = (oscNumber: 1 | 2 | 3, next: OscillatorUiState) => {
    const waveformMap: Record<string, number> = { sine: 0, tri: 1, saw: 2, square: 3, noise: 4 }
    const engineTypeMap: Record<string, number> = { VA: 0, WAVE: 1, FM: 2, GRAN: 3, MODAL: 4, ADD: 5, SAMP: 6 }
    const vaModelMap: Record<string, number> = { blep: 0, tpt: 7, circuit: 8 }
    const wavePresetMap: Record<string, number> = { basic: 0, pwm: 1, formant: 2, digital: 3, vocal: 4 }
    const granWindowMap: Record<string, number> = { hann: 0, gauss: 1, trapez: 3, rect: 4 }
    const subOscMap: Record<string, number> = { off: 0, sub1sin: 1, sub1sq: 2, sub2sin: 3 }
    const modalBodyMap: Record<string, number> = { string: 0, bar: 1, membrane: 2, plate: 3, tube: 4, bell: 5 }
    const samplerModeMap: Record<string, number> = { oneshot: 0, loop: 1, pingpong: 2, susloop: 3 }
    const prefix = `osc${oscNumber}`
    const engineIndex = (next.engineType ?? "VA") === "VA"
      ? (vaModelMap[next.vaModel ?? "circuit"] ?? 8)
      : (engineTypeMap[next.engineType ?? "VA"] ?? 0)

    sendParam(`${prefix}-level`, (next.level ?? 0) / 100)
    sendParam(`${prefix}-tune`, (next.octave ?? 0) * 12 + (next.semitone ?? 0))
    sendParam(`${prefix}-detune`, next.cent ?? 0)
    sendParam(`${prefix}-pan`, (next.pan ?? 0) / 100)
    sendParam(`${prefix}-engine-type`, engineIndex)
    sendParam(`${prefix}-waveform`, waveformMap[next.vaWaveform ?? "saw"] ?? 2)
    sendParam(`${prefix}-pulse-width`, (next.vaPulseWidth ?? 50) / 100)
    sendParam(`${prefix}-va-pwm`, (next.vaPWM ?? 0) / 100)
    sendParam(`${prefix}-va-drift`, (next.vaDrift ?? 0) / 100)
    sendParam(`${prefix}-va-vintage`, (next.vaVintage ?? 0) / 100)
    sendParam(`${prefix}-va-brightness`, (next.vaBright ?? 50) / 100)
    sendParam(`${prefix}-va-sub-mode`, subOscMap[next.vaSubOsc ?? "off"] ?? 0)
    sendParam(`${prefix}-va-sub-level`, (next.vaSubLevel ?? 0) / 100)
    sendParam(`${prefix}-va-sync`, (next.vaSync ?? false) ? 1 : 0)
    sendParam(`${prefix}-wt-frame`, (next.waveFrame ?? 0) / 255)
    sendParam(`${prefix}-wt-morph`, (next.waveMorph ?? 0) / 100)
    sendParam(`${prefix}-wt-scan`, next.waveScan ? 1 : 0)
    sendParam(`${prefix}-wt-scan-time`, next.waveScanTime ?? 2.0)
    sendParam(`${prefix}-wt-preset`, wavePresetMap[next.wavePreset ?? "basic"] ?? 0)
    sendParam(`${prefix}-fm-algorithm`, Math.max(0, (next.fmAlgorithm ?? 1) - 1))
    sendParam(`${prefix}-fm-mod-index`, (next.fmModIndex ?? 100) / 50)
    sendParam(`${prefix}-fm-feedback`, (next.fmFeedback ?? 0) / 100)
    sendParam(`${prefix}-fm-op1-ratio`, next.fmOp1Ratio ?? 1)
    sendParam(`${prefix}-fm-op2-ratio`, next.fmOp2Ratio ?? 1)
    sendParam(`${prefix}-fm-op3-ratio`, next.fmOp3Ratio ?? 2)
    sendParam(`${prefix}-fm-op4-ratio`, next.fmOp4Ratio ?? 4)
    sendParam(`${prefix}-fm-op1-level`, (next.fmOp1Level ?? 100) / 100)
    sendParam(`${prefix}-fm-op2-level`, (next.fmOp2Level ?? 75) / 100)
    sendParam(`${prefix}-fm-op3-level`, (next.fmOp3Level ?? 75) / 100)
    sendParam(`${prefix}-fm-op4-level`, (next.fmOp4Level ?? 75) / 100)
    sendParam(`${prefix}-gran-size`, next.granSize ?? 80)
    sendParam(`${prefix}-gran-density`, next.granDensity ?? 40)
    sendParam(`${prefix}-gran-position`, (next.granPosition ?? 50) / 100)
    sendParam(`${prefix}-gran-spray`, (next.granSpray ?? 0) / 100)
    sendParam(`${prefix}-gran-pitch-random`, (next.granPitchRandom ?? 0) / 100)
    sendParam(`${prefix}-gran-window`, granWindowMap[next.granWindow ?? "hann"] ?? 0)
    sendParam(`${prefix}-modal-body`, modalBodyMap[next.modalBody ?? "string"] ?? 0)
    sendParam(`${prefix}-modal-decay`, next.modalDecay ?? 2)
    sendParam(`${prefix}-modal-brightness`, (next.modalBrightness ?? 60) / 100)
    sendParam(`${prefix}-add-harmonics`, next.addHarmonicCount ?? 16)
    sendParam(`${prefix}-add-morph`, (next.addMorph ?? 0) / 100)
    sendParam(`${prefix}-samp-mode`, samplerModeMap[next.sampMode ?? "loop"] ?? 1)
    sendParam(`${prefix}-samp-start`, (next.sampStart ?? 0) / 100)
    sendParam(`${prefix}-samp-end`, (next.sampEnd ?? 100) / 100)
    sendParam(`${prefix}-samp-pitch`, next.sampPitch ?? 0)
  }

  const syncInitialUiStateToEngine = () => {
    const envT = (v: number) => 0.001 * Math.pow(8000, v / 100)
    sendOscillatorStateToEngine(1, osc1State)
    sendOscillatorStateToEngine(2, osc2State)
    sendOscillatorStateToEngine(3, osc3State)
    sendParam("filter-cutoff", (filterState.cutoff / 100) * 20000)
    sendParam("filter-reso", filterState.resonance / 100)
    sendParam("filter-drive", filterState.drive / 100)
    sendParam("filter-env-amount", (filterState.envAmount / 100) * 2 - 1)
    sendParam("filter-env-attack", envT(filterState.envAttack))
    sendParam("filter-env-decay", envT(filterState.envDecay))
    sendParam("filter-env-sustain", filterState.envSustain / 100)
    sendParam("filter-env-release", envT(filterState.envRelease))
    sendParam("amp-attack", envT(envelopes[0].attack))
    sendParam("amp-decay", envT(envelopes[0].decay))
    sendParam("amp-sustain", envelopes[0].sustain / 100)
    sendParam("amp-release", envT(envelopes[0].release))
    sendParam("lfo-rate", 0.01 * Math.pow(2000, lfos[0].rate / 100))
    sendParam("lfo-waveform", 0)
    sendParam("lfo-mix-amount", lfos[0].amount / 100)
    sendParam("master-volume", masterVolume / 100)
  }

  const auditionCurrentEngine = () => {
    // Use a note outside the main QWERTY keyboard range so the audition note-off
    // cannot cut a real held key when the user switches an engine and plays fast.
    const note = 84
    triggerNoteOn(note, 1)
    window.setTimeout(() => triggerNoteOff(note), 420)
  }

  useEffect(() => {
    if (!isReady || initialEngineSyncDone.current) return
    initialEngineSyncDone.current = true
    syncInitialUiStateToEngine()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady])

  useEffect(() => {
    const releaseAll = () => {
      for (const note of mainPressedNotesRef.current) {
        triggerNoteOff(note)
      }
      mainPressedNotesRef.current.clear()
    }

    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      if (!element) return false
      const tagName = element.tagName.toLowerCase()
      return element.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select"
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return
      const offset = MAIN_KEYBOARD_MAP[event.key.toLowerCase()]
      if (offset === undefined) return
      event.preventDefault()
      const note = MAIN_KEYBOARD_BASE_NOTE + offset
      if (mainPressedNotesRef.current.has(note)) return
      mainPressedNotesRef.current.add(note)
      triggerNoteOn(note, 1)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const offset = MAIN_KEYBOARD_MAP[event.key.toLowerCase()]
      if (offset === undefined) return
      event.preventDefault()
      const note = MAIN_KEYBOARD_BASE_NOTE + offset
      if (!mainPressedNotesRef.current.has(note)) return
      mainPressedNotesRef.current.delete(note)
      triggerNoteOff(note)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", releaseAll)

    return () => {
      releaseAll()
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", releaseAll)
    }
  }, [triggerNoteOn, triggerNoteOff])

  const applyOscillatorStateChange = (
    oscNumber: 1 | 2 | 3,
    currentState: OscillatorUiState,
    setState: (next: OscillatorUiState) => void,
    patch: OscillatorUiState,
  ) => {
    const next = { ...currentState, ...patch } as OscillatorUiState
    const waveformMap: Record<string, number> = { sine: 0, tri: 1, saw: 2, square: 3, noise: 4 }
    const engineTypeMap: Record<string, number> = { VA: 0, WAVE: 1, FM: 2, GRAN: 3, MODAL: 4, ADD: 5, SAMP: 6 }
    const vaModelMap: Record<string, number> = { blep: 0, tpt: 7, circuit: 8 }
    const wavePresetMap: Record<string, number> = { basic: 0, pwm: 1, formant: 2, digital: 3, vocal: 4 }
    const granWindowMap: Record<string, number> = { hann: 0, gauss: 1, trapez: 3, rect: 4 }
    const modalBodyMap: Record<string, number> = { string: 0, bar: 1, membrane: 2, plate: 3, tube: 4, bell: 5 }
    const samplerModeMap: Record<string, number> = { oneshot: 0, loop: 1, pingpong: 2, susloop: 3 }
    const prefix = `osc${oscNumber}`

    const engineIndexFor = () =>
      (next.engineType ?? "VA") === "VA"
        ? (vaModelMap[next.vaModel ?? "circuit"] ?? 8)
        : (engineTypeMap[next.engineType ?? "VA"] ?? 0)

    setState(next)

    const subOscMap: Record<string, number> = { off: 0, sub1sin: 1, sub1sq: 2, sub2sin: 3 }

    if (patch.level !== undefined) sendParam(`${prefix}-level`, (next.level ?? 0) / 100)
    if (patch.octave !== undefined || patch.semitone !== undefined) {
      sendParam(`${prefix}-tune`, (next.octave ?? 0) * 12 + (next.semitone ?? 0))
    }
    if (patch.cent !== undefined) sendParam(`${prefix}-detune`, next.cent ?? 0)
    if (patch.pan !== undefined) sendParam(`${prefix}-pan`, (next.pan ?? 0) / 100)
    if (patch.vaWaveform !== undefined) sendParam(`${prefix}-waveform`, waveformMap[next.vaWaveform ?? "saw"] ?? 2)
    if (patch.vaPulseWidth !== undefined) sendParam(`${prefix}-pulse-width`, (next.vaPulseWidth ?? 50) / 100)
    if (patch.vaPWM       !== undefined) sendParam(`${prefix}-va-pwm`,        (next.vaPWM       ?? 0)  / 100)
    if (patch.vaDrift     !== undefined) sendParam(`${prefix}-va-drift`,      (next.vaDrift     ?? 0)  / 100)
    if (patch.vaVintage   !== undefined) sendParam(`${prefix}-va-vintage`,    (next.vaVintage   ?? 0)  / 100)
    if (patch.vaBright    !== undefined) sendParam(`${prefix}-va-brightness`, (next.vaBright    ?? 50) / 100)
    if (patch.vaSubOsc    !== undefined) sendParam(`${prefix}-va-sub-mode`,   subOscMap[next.vaSubOsc ?? "off"] ?? 0)
    if (patch.vaSubLevel  !== undefined) sendParam(`${prefix}-va-sub-level`,  (next.vaSubLevel  ?? 0)  / 100)
    if (patch.vaSync      !== undefined) sendParam(`${prefix}-va-sync`,       (next.vaSync      ?? false) ? 1 : 0)
    if (patch.engineType !== undefined || patch.vaModel !== undefined) sendParam(`${prefix}-engine-type`, engineIndexFor())
    if (patch.waveFrame !== undefined) sendParam(`${prefix}-wt-frame`, (next.waveFrame ?? 0) / 255)
    if (patch.waveMorph !== undefined) sendParam(`${prefix}-wt-morph`, (next.waveMorph ?? 0) / 100)
    if (patch.waveScan !== undefined) sendParam(`${prefix}-wt-scan`, next.waveScan ? 1 : 0)
    if (patch.waveScanTime !== undefined) sendParam(`${prefix}-wt-scan-time`, next.waveScanTime ?? 2.0)
    if (patch.wavePreset !== undefined) sendParam(`${prefix}-wt-preset`, wavePresetMap[next.wavePreset ?? "basic"] ?? 0)
    if (patch.fmAlgorithm !== undefined) sendParam(`${prefix}-fm-algorithm`, Math.max(0, (next.fmAlgorithm ?? 1) - 1))
    if (patch.fmModIndex !== undefined) sendParam(`${prefix}-fm-mod-index`, (next.fmModIndex ?? 100) / 50)
    if (patch.fmFeedback !== undefined) sendParam(`${prefix}-fm-feedback`, (next.fmFeedback ?? 0) / 100)
    if (patch.granSize !== undefined) sendParam(`${prefix}-gran-size`, next.granSize ?? 80)
    if (patch.granDensity !== undefined) sendParam(`${prefix}-gran-density`, next.granDensity ?? 40)
    if (patch.granPosition !== undefined) sendParam(`${prefix}-gran-position`, (next.granPosition ?? 50) / 100)
    if (patch.granSpray !== undefined) sendParam(`${prefix}-gran-spray`, (next.granSpray ?? 0) / 100)
    if (patch.granPitchRandom !== undefined) sendParam(`${prefix}-gran-pitch-random`, (next.granPitchRandom ?? 0) / 100)
    if (patch.granWindow !== undefined) sendParam(`${prefix}-gran-window`, granWindowMap[next.granWindow ?? "hann"] ?? 0)
    if (patch.modalBody !== undefined) sendParam(`${prefix}-modal-body`, modalBodyMap[next.modalBody ?? "string"] ?? 0)
    if (patch.modalDecay !== undefined) sendParam(`${prefix}-modal-decay`, next.modalDecay ?? 2)
    if (patch.modalBrightness !== undefined) sendParam(`${prefix}-modal-brightness`, (next.modalBrightness ?? 60) / 100)
    if (patch.addHarmonicCount !== undefined) sendParam(`${prefix}-add-harmonics`, next.addHarmonicCount ?? 16)
    if (patch.addMorph !== undefined) sendParam(`${prefix}-add-morph`, (next.addMorph ?? 0) / 100)
    if (patch.sampMode !== undefined) sendParam(`${prefix}-samp-mode`, samplerModeMap[next.sampMode ?? "loop"] ?? 1)
    if (patch.sampStart !== undefined) sendParam(`${prefix}-samp-start`, (next.sampStart ?? 0) / 100)
    if (patch.sampEnd !== undefined) sendParam(`${prefix}-samp-end`, (next.sampEnd ?? 100) / 100)
    if (patch.sampPitch !== undefined) sendParam(`${prefix}-samp-pitch`, next.sampPitch ?? 0)

    const fmRatioKeys = ["fmOp1Ratio", "fmOp2Ratio", "fmOp3Ratio", "fmOp4Ratio"] as const
    const fmLevelKeys = ["fmOp1Level", "fmOp2Level", "fmOp3Level", "fmOp4Level"] as const

    fmRatioKeys.forEach((key, index) => {
      if (patch[key] !== undefined) {
        sendParam(`${prefix}-fm-op${index + 1}-ratio`, next[key] as number)
      }
    })
    fmLevelKeys.forEach((key, index) => {
      if (patch[key] !== undefined) {
        sendParam(`${prefix}-fm-op${index + 1}-level`, (next[key] as number) / 100)
      }
    })

    if (patch.engineType !== undefined || patch.vaModel !== undefined) {
      switch (next.engineType) {
        case "VA":
          sendParam(`${prefix}-engine-type`, engineIndexFor())
          sendParam(`${prefix}-waveform`, waveformMap[next.vaWaveform ?? "saw"] ?? 2)
          sendParam(`${prefix}-pulse-width`, (next.vaPulseWidth ?? 50) / 100)
          sendParam(`${prefix}-va-pwm`,        (next.vaPWM      ?? 0)  / 100)
          sendParam(`${prefix}-va-drift`,      (next.vaDrift    ?? 0)  / 100)
          sendParam(`${prefix}-va-vintage`,    (next.vaVintage  ?? 0)  / 100)
          sendParam(`${prefix}-va-brightness`, (next.vaBright   ?? 50) / 100)
          sendParam(`${prefix}-va-sub-mode`,   subOscMap[next.vaSubOsc ?? "off"] ?? 0)
          sendParam(`${prefix}-va-sub-level`,  (next.vaSubLevel ?? 0)  / 100)
          sendParam(`${prefix}-va-sync`,       (next.vaSync     ?? false) ? 1 : 0)
          break
        case "WAVE":
          sendParam(`${prefix}-wt-frame`, (next.waveFrame ?? 0) / 255)
          sendParam(`${prefix}-wt-morph`, (next.waveMorph ?? 0) / 100)
          sendParam(`${prefix}-wt-scan`, next.waveScan ? 1 : 0)
          sendParam(`${prefix}-wt-scan-time`, next.waveScanTime ?? 2.0)
          sendParam(`${prefix}-wt-preset`, wavePresetMap[next.wavePreset ?? "basic"] ?? 0)
          break
        case "FM":
          sendParam(`${prefix}-fm-algorithm`, Math.max(0, (next.fmAlgorithm ?? 1) - 1))
          sendParam(`${prefix}-fm-mod-index`, (next.fmModIndex ?? 100) / 50)
          sendParam(`${prefix}-fm-feedback`, (next.fmFeedback ?? 0) / 100)
          fmRatioKeys.forEach((key, index) => {
            sendParam(`${prefix}-fm-op${index + 1}-ratio`, next[key] as number)
          })
          fmLevelKeys.forEach((key, index) => {
            sendParam(`${prefix}-fm-op${index + 1}-level`, (next[key] as number) / 100)
          })
          break
        case "GRAN":
          sendParam(`${prefix}-gran-size`, next.granSize ?? 80)
          sendParam(`${prefix}-gran-density`, next.granDensity ?? 40)
          sendParam(`${prefix}-gran-position`, (next.granPosition ?? 50) / 100)
          sendParam(`${prefix}-gran-spray`, (next.granSpray ?? 0) / 100)
          sendParam(`${prefix}-gran-pitch-random`, (next.granPitchRandom ?? 0) / 100)
          sendParam(`${prefix}-gran-window`, granWindowMap[next.granWindow ?? "hann"] ?? 0)
          break
        case "MODAL":
          sendParam(`${prefix}-modal-body`, modalBodyMap[next.modalBody ?? "string"] ?? 0)
          sendParam(`${prefix}-modal-decay`, next.modalDecay ?? 2)
          sendParam(`${prefix}-modal-brightness`, (next.modalBrightness ?? 60) / 100)
          break
        case "ADD":
          sendParam(`${prefix}-add-harmonics`, next.addHarmonicCount ?? 16)
          sendParam(`${prefix}-add-morph`, (next.addMorph ?? 0) / 100)
          break
        case "SAMP":
          sendParam(`${prefix}-samp-mode`, samplerModeMap[next.sampMode ?? "loop"] ?? 1)
          sendParam(`${prefix}-samp-start`, (next.sampStart ?? 0) / 100)
          sendParam(`${prefix}-samp-end`, (next.sampEnd ?? 100) / 100)
          sendParam(`${prefix}-samp-pitch`, next.sampPitch ?? 0)
          break
      }

      auditionCurrentEngine()
    }
  }

  const renderMainPanel = () => {
    switch (selectedSource) {
      case "WIND":
        return (
          <WindControllerPanel breathLevel={breathLevel} />
        )
      case "OSC1":
        return (
          <OscillatorPanel
            oscNumber={1}
            state={osc1State}
            onStateChange={(s) => applyOscillatorStateChange(1, osc1State, setOsc1State, s)}
          />
        )
      case "OSC2":
        return (
          <OscillatorPanel
            oscNumber={2}
            state={osc2State}
            onStateChange={(s) => applyOscillatorStateChange(2, osc2State, setOsc2State, s)}
          />
        )
      case "OSC3":
        return (
          <OscillatorPanel
            oscNumber={3}
            state={osc3State}
            onStateChange={(s) => applyOscillatorStateChange(3, osc3State, setOsc3State, s)}
          />
        )
      case "FLT":
        return (
          <FilterPanel
            state={filterState}
            onStateChange={(s) => {
              setFilterState((prev) => ({ ...prev, ...s }))
              const envT = (v: number) => 0.001 * Math.pow(8000, v / 100)
              if (s.cutoff      !== undefined) sendParam("filter-cutoff",      (s.cutoff / 100) * 20000)
              if (s.resonance   !== undefined) sendParam("filter-reso",        s.resonance / 100)
              if (s.drive       !== undefined) sendParam("filter-drive",       s.drive / 100)
              if (s.envAmount   !== undefined) sendParam("filter-env-amount",  (s.envAmount / 100) * 2 - 1)
              if (s.envAttack   !== undefined) sendParam("filter-env-attack",  envT(s.envAttack))
              if (s.envDecay    !== undefined) sendParam("filter-env-decay",   envT(s.envDecay))
              if (s.envSustain  !== undefined) sendParam("filter-env-sustain", s.envSustain / 100)
              if (s.envRelease  !== undefined) sendParam("filter-env-release", envT(s.envRelease))
            }}
          />
        )
      case "FX":
        return <FXPage />
      case "MOD":
        return <ModulationPage />
      case "MIX":
        return <MixerPanel />
      default:
        return null
    }
  }

  // MODULAR mode — full-screen canvas overlay (no source selected, driven by header button)
  const [modularOpen, setModularOpen] = useState(false)

  // V2 layout is now the permanent default. Only ?layout=v1 URL param can revert.
  const [useV2Layout, setUseV2Layout] = useState(true)
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("layout") === "v1") {
      setUseV2Layout(false)
    } else {
      // Clear any old "v1" preference so V2 is shown on next load
      localStorage.removeItem("hypersynth-layout")
    }
  }, [])
  // Persist toggle choice
  const handleV2Toggle = (v: boolean | ((prev: boolean) => boolean)) => {
    setUseV2Layout(prev => {
      const next = typeof v === "function" ? v(prev) : v
      if (typeof window !== "undefined") {
        localStorage.setItem("hypersynth-layout", next ? "v2" : "v1")
      }
      return next
    })
  }

  const openKeyboardWindow = () => {
    window.open("/keyboard", "hypersynth-keyboard", "popup=yes,width=1160,height=420,resizable=yes")
  }

  const renderCurrentPage = () => {
    if (currentPage === "SETTINGS") {
      return (
        <div className="flex-1 overflow-auto p-4">
          <SettingsPage
            isReady={isReady}
            audioError={audioError}
            audioSettings={audioSettings}
            audioHosts={audioHosts}
            midiSettings={midiSettings}
            audioDevices={audioDevices}
            midiInputs={midiInputs}
            engineStats={engineStats}
            backendInfo={backendInfo}
            onAudioSettingsChange={updateAudioSettings}
            onMidiSettingsChange={updateMidiSettings}
            onRefreshAudio={refreshAudioDevices}
            onRefreshMidi={refreshMidiInputs}
            onOpenKeyboard={openKeyboardWindow}
          />
        </div>
      )
    }

    if (currentPage === "PRESETS") {
      return (
        <div className="flex-1 overflow-auto p-4">
          <SectionPanel title="PRESETS">
            <div className="panel-recessed px-4 py-4 font-mono grid gap-2" style={{ fontSize: 9, color: "var(--text-display)" }}>
              <span>Preset browser is still on the Phase 1 backlog.</span>
              <span>The audio engine and MIDI settings are now available under SETTINGS.</span>
            </div>
          </SectionPanel>
        </div>
      )
    }

    // ── V2 layout — now permanent default ─────────────────────────────────
    if (useV2Layout) {
      return (
        <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <MainGrid
            oscStates={[osc1State, osc2State, osc3State]}
            onOscChange={(idx, patch) => {
              if (idx === 0) applyOscillatorStateChange(1, osc1State, setOsc1State, patch)
              else if (idx === 1) applyOscillatorStateChange(2, osc2State, setOsc2State, patch)
              else if (idx === 2) applyOscillatorStateChange(3, osc3State, setOsc3State, patch)
            }}
            filterState={{
              filterMode: filterState.filterMode as "LP" | "HP" | "BP" | "NOTCH" | undefined,
              cutoff: filterState.cutoff,
              resonance: filterState.resonance,
              drive: filterState.drive,
              envAmount: filterState.envAmount,
              keytrack: filterState.keytrack,
            }}
            onFilterChange={(patch) => {
              setFilterState((prev) => ({ ...prev, ...patch }))
              if (patch.cutoff    !== undefined) sendParam("filter-cutoff", (patch.cutoff / 100) * 20000)
              if (patch.resonance !== undefined) sendParam("filter-reso", patch.resonance / 100)
              if (patch.drive     !== undefined) sendParam("filter-drive", patch.drive / 100)
              if (patch.envAmount !== undefined) sendParam("filter-env-amount", (patch.envAmount / 100) * 2 - 1)
            }}
            envStates={envelopes}
            onEnvChange={handleEnvChange}
            lfoStates={lfos}
            onLfoChange={handleLFOChange}
            effects={effects}
            onEffectsChange={(next) => setEffects(next as typeof effects)}
            modRoutes={modRoutes}
            onModRoutesChange={(next) => setModRoutes(next as typeof modRoutes)}
            macros={macros}
            onMacroChange={(idx, value) => setMacros((prev) => prev.map((m, i) => (i === idx ? value : m)))}
            masterVolume={masterVolume}
            onMasterVolumeChange={(value) => {
              setMasterVolume(value)
              sendParam("master-volume", value / 100)
            }}
            isReady={isReady}
            meters={meters}
          />
        </div>
      )
    }

    return (
      <>
        {/* Source Strip (Left Sidebar) */}
        <div
          className="flex flex-col"
          style={{
            width: 64,
            background: "linear-gradient(180deg, #c8ccd4 0%, #bcc0c8 100%)",
            borderRight: "1px solid var(--panel-shadow)",
            boxShadow: "inset -2px 0 4px rgba(0,0,0,0.08)",
          }}
        >
          {/* ── WIND — top of signal chain ── */}
          <SourceButton
            icon={<WindIcon />}
            label="WIND"
            active={selectedSource === "WIND"}
            accentColor="#10b981"
            onClick={() => setSelectedSource("WIND")}
          />
          <div className="mx-3 my-1" style={{ height: 1, background: "var(--panel-shadow)" }} />
          <SourceButton
            icon={<OscIcon />}
            label="OSC1"
            active={selectedSource === "OSC1"}
            accentColor="#5865f2"
            onClick={() => setSelectedSource("OSC1")}
          />
          <SourceButton
            icon={<OscIcon />}
            label="OSC2"
            active={selectedSource === "OSC2"}
            onClick={() => setSelectedSource("OSC2")}
          />
          <SourceButton
            icon={<OscIcon />}
            label="OSC3"
            active={selectedSource === "OSC3"}
            onClick={() => setSelectedSource("OSC3")}
          />
          <SourceButton
            icon={<AddIcon />}
            label="ADD"
            active={false}
            accentColor="#5865f2"
          />
          <div className="mx-3 my-1" style={{ height: 1, background: "var(--panel-shadow)" }} />
          <SourceButton
            icon={<FilterIcon />}
            label="FLT"
            active={selectedSource === "FLT"}
            accentColor="#a855f7"
            onClick={() => setSelectedSource("FLT")}
          />
          <div className="mx-3 my-1" style={{ height: 1, background: "var(--panel-shadow)" }} />
          <SourceButton
            icon={<FXIcon />}
            label="FX"
            active={selectedSource === "FX"}
            accentColor="#ef4444"
            onClick={() => setSelectedSource("FX")}
          />
          <SourceButton
            icon={<ModIcon />}
            label="MOD"
            active={selectedSource === "MOD"}
            accentColor="#10b981"
            onClick={() => setSelectedSource("MOD")}
          />
          <div className="mx-3 my-1" style={{ height: 1, background: "var(--panel-shadow)" }} />
          <SourceButton
            icon={<MixerIcon />}
            label="MIX"
            active={selectedSource === "MIX"}
            accentColor="#f59e0b"
            onClick={() => setSelectedSource("MIX")}
          />

          <div className="flex-1" />
          <div className="flex justify-between px-2 py-2">
            <PanelScrew />
            <PanelScrew />
          </div>
        </div>

        <div
          className={`flex-1 overflow-hidden${selectedSource !== "MOD" && selectedSource !== "FX" && selectedSource !== "WIND" ? " panel-raised" : ""}`}
          style={{ margin: selectedSource === "MOD" || selectedSource === "FX" || selectedSource === "WIND" ? 0 : 4, display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          {renderMainPanel()}
        </div>

        {selectedSource !== "MOD" && selectedSource !== "FX" && selectedSource !== "WIND" && (
          <div style={{ margin: 4, flexShrink: 0, height: "100%", overflow: "hidden" }}>
            <ModulatorPanel
              selectedEnv={selectedEnv}
              envelopes={envelopes}
              lfos={lfos}
              onSelectEnv={setSelectedEnv}
              onEnvChange={handleEnvChange}
              onLFOChange={handleLFOChange}
            />
          </div>
        )}
      </>
    )
  }

  return (
    <div
      className="w-full h-screen flex items-center justify-center panel-texture overflow-hidden"
      style={{ padding: 12 }}
    >
      {/* Main Synth Container - Fits viewport */}
      <div
        className="panel-raised flex flex-col"
        style={{
          width: "100%",
          maxWidth: 1400,
          height: "calc(100vh - 24px)",
          maxHeight: 800,
          boxShadow: "8px 8px 24px rgba(0,0,0,0.25), -4px -4px 12px rgba(255,255,255,0.5), inset 0 1px 0 rgba(255,255,255,0.6)",
          borderRadius: 6,
        }}
      >
        {/* Header Panel */}
        <div
          className="flex items-center justify-between px-4"
          style={{
            height: 36,
            background: "linear-gradient(180deg, #dfe2e8 0%, #d0d4dc 100%)",
            borderBottom: "1px solid var(--panel-shadow)",
            borderRadius: "6px 6px 0 0",
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span
              className="font-mono font-bold tracking-widest"
              style={{ fontSize: 14, color: "#5865f2" }}
            >
              HYPERSYNTH
            </span>
            <span
              className="font-mono uppercase"
              style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "1px" }}
            >
              v2.0
            </span>
          </div>

          {/* Preset Browser */}
          <div
            className="panel-recessed px-3 py-1 flex items-center gap-2 cursor-pointer"
            style={{ minWidth: 200 }}
          >
            <span className="font-mono text-[8px] uppercase" style={{ color: "var(--text-label)" }}>
              PRESET:
            </span>
            <span className="font-mono text-[9px]" style={{ color: "var(--text-display)" }}>
              Init - Default
            </span>
            <span className="font-mono text-[10px] ml-auto" style={{ color: "var(--text-label)" }}>
              ▼
            </span>
          </div>

          {/* Page Navigation */}
          <div className="flex gap-px">
            {(["MAIN", "PRESETS", "SETTINGS"] as const).map((page) => (
              <button
                key={page}
                className="px-3 py-1 font-mono uppercase transition-colors"
                style={{
                  fontSize: 7,
                  letterSpacing: "1.5px",
                  background: currentPage === page ? "#5865f2" : "rgba(255,255,255,0.4)",
                  color: currentPage === page ? "#fff" : "var(--text-section)",
                  border: `1px solid ${currentPage === page ? "#5865f2" : "var(--panel-shadow)"}`,
                  boxShadow: currentPage === page ? "0 2px 4px rgba(88,101,242,0.3)" : "none",
                }}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            ))}
            <a
              href="/pro"
              className="px-3 py-1 font-mono uppercase transition-colors"
              style={{
                fontSize: 7,
                letterSpacing: "1.5px",
                background: "rgba(0,212,255,0.15)",
                color: "#00d4ff",
                border: "1px solid rgba(0,212,255,0.4)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              PRO ✦
            </a>
            {/* V2 Layout toggle */}
            <button
              className="px-3 py-1 font-mono uppercase transition-colors"
              style={{
                fontSize: 7,
                letterSpacing: "1.5px",
                background: useV2Layout ? "rgba(16,185,129,0.9)" : "rgba(16,185,129,0.15)",
                color: useV2Layout ? "#fff" : "#10b981",
                border: `1px solid ${useV2Layout ? "#10b981" : "rgba(16,185,129,0.4)"}`,
                boxShadow: useV2Layout ? "0 0 8px rgba(16,185,129,0.4)" : "none",
                cursor: "pointer",
              }}
              onClick={() => handleV2Toggle(v => !v)}
              title="Toggle new resizable layout (V2)"
            >
              ⊹ V2
            </button>
            {/* MODULAR — full-canvas mode */}
            <button
              className="px-3 py-1 font-mono uppercase transition-colors"
              style={{
                fontSize: 7,
                letterSpacing: "1.5px",
                background: modularOpen ? "rgba(88,101,242,0.9)" : "rgba(88,101,242,0.15)",
                color: modularOpen ? "#fff" : "#5865f2",
                border: `1px solid ${modularOpen ? "#5865f2" : "rgba(88,101,242,0.4)"}`,
                cursor: "pointer",
              }}
              onClick={() => setModularOpen(o => !o)}
            >
              ⊞ MODULAR
            </button>
          </div>

          {/* Breath live indicator */}
          <div className="flex items-center gap-1" title="Live breath level (CC2)">
            <span className="font-mono" style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "1px" }}>🌬</span>
            <div
              style={{
                width: 48,
                height: 6,
                background: "#1a1c24",
                border: "1px solid #555",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${breathLevel * 100}%`,
                  background: breathLevel > 0.04
                    ? "linear-gradient(90deg, #10b981 0%, #00d4ff 100%)"
                    : "#333",
                  transition: "width 60ms linear",
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2" title={audioError ?? undefined}>
            <span
              className="px-3 py-1 font-mono uppercase panel-recessed rounded"
              style={{
                fontSize: 7,
                letterSpacing: "1.5px",
                color: isReady ? "#10b981" : audioError ? "#ef4444" : "#f59e0b",
              }}
            >
              {isReady ? "ENGINE ALWAYS ON" : audioError ? "ENGINE ERROR" : "ENGINE BOOTING"}
            </span>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <span
                className="px-2 py-0.5 font-mono uppercase panel-recessed rounded"
                style={{ fontSize: 7, color: "#10b981" }}
              >
                VST3
              </span>
              <span
                className="px-2 py-0.5 font-mono uppercase panel-recessed rounded"
                style={{ fontSize: 7, color: "#10b981" }}
              >
                CLAP
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[7px]" style={{ color: "var(--text-label)" }}>
                BPM
              </span>
              <span
                className="panel-recessed px-2 py-0.5 font-mono rounded"
                style={{ fontSize: 9, color: "#10b981" }}
              >
                120
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[7px]" style={{ color: "var(--text-label)" }}>
                LAT
              </span>
              <span
                className="panel-recessed px-2 py-0.5 font-mono rounded"
                style={{ fontSize: 9, color: "#10b981" }}
              >
                {backendInfo.baseLatencyMs == null ? "--" : `${backendInfo.baseLatencyMs.toFixed(1)}ms`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[7px]" style={{ color: "var(--text-label)" }}>
                VOICES
              </span>
              <span
                className="panel-recessed px-2 py-0.5 font-mono rounded"
                style={{ fontSize: 9, color: "#10b981" }}
              >
                {engineStats.activeVoices}/8
              </span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {renderCurrentPage()}
        </div>

        {/* Bottom bar removed — controls moved to MASTER tile in V2 layout */}
      </div>

      {/* ── MODULAR full-screen overlay ── */}
      {modularOpen && (
        <div
          style={{
            position:   "fixed",
            inset:       0,
            zIndex:      50,
            background:  "#04040e",
            display:     "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "6px 14px",
              background: "linear-gradient(180deg, #0e1440 0%, #06091e 100%)",
              borderBottom: "1px solid #1c2050", flexShrink: 0,
            }}
          >
            <button
              onClick={() => setModularOpen(false)}
              style={{
                padding: "3px 14px", fontSize: 8, fontFamily: "monospace", letterSpacing: "1.5px",
                textTransform: "uppercase", background: "rgba(88,101,242,0.12)",
                color: "#5865f2", border: "1px solid rgba(88,101,242,0.4)",
                borderRadius: 3, cursor: "pointer",
              }}
            >
              ← EXIT MODULAR
            </button>
            <span style={{ fontSize: 10, color: "#5865f2", letterSpacing: "0.12em", fontFamily: "monospace", textTransform: "uppercase" }}>
              HYPERSYNTH — MODULAR (VCV-style)
            </span>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <ModularPage />
          </div>
        </div>
      )}
    </div>
  )
}

// Panel screw decoration
function PanelScrew() {
  return (
    <div
      className="rounded-full"
      style={{
        width: 8,
        height: 8,
        background: "radial-gradient(circle at 30% 30%, #c0c4cc, #888c98)",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 1px rgba(255,255,255,0.5)",
      }}
    >
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ transform: "rotate(45deg)" }}
      >
        <div
          style={{
            width: 4,
            height: 1,
            background: "#6a7080",
          }}
        />
      </div>
    </div>
  )
}
