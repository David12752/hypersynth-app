"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Knob } from "../Knob"
import { LED } from "../LED"

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type FXCategory = "DYNAMICS" | "TIME" | "MODULATION" | "EQ" | "DISTORTION" | "SPECTRAL" | "SPATIAL" | "UTILITY"

interface FXType {
  id: string
  name: string
  category: FXCategory
  subtypes?: string[]
  params: { key: string; label: string; min: number; max: number; unit?: string; default: number }[]
}

interface ActiveFX {
  id: string
  typeId: string
  subtype?: string
  enabled: boolean
  solo: boolean
  params: Record<string, number>
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_COLORS: Record<FXCategory, string> = {
  DYNAMICS: "#10b981",
  TIME: "#5865f2",
  MODULATION: "#a855f7",
  EQ: "#f59e0b",
  DISTORTION: "#ef4444",
  SPECTRAL: "#00d4ff",
  SPATIAL: "#eab308",
  UTILITY: "#6b7280",
}

const CATEGORY_LABELS: Record<FXCategory, string> = {
  DYNAMICS: "DYNAMICS",
  TIME: "TIME-BASED",
  MODULATION: "MODULATION",
  EQ: "FILTER & EQ",
  DISTORTION: "DISTORTION",
  SPECTRAL: "SPECTRAL",
  SPATIAL: "SPATIAL",
  UTILITY: "UTILITY",
}

const FX_TYPES: FXType[] = [
  // DYNAMICS
  { id: "comp", name: "Compressor", category: "DYNAMICS", subtypes: ["VCA", "FET", "Opto"], params: [
    { key: "thresh", label: "THRESH", min: -60, max: 0, unit: "dB", default: -18 },
    { key: "ratio", label: "RATIO", min: 1, max: 20, default: 4 },
    { key: "attack", label: "ATTACK", min: 0.1, max: 100, unit: "ms", default: 5 },
    { key: "release", label: "RELEASE", min: 10, max: 1000, unit: "ms", default: 100 },
    { key: "gain", label: "GAIN", min: -12, max: 24, unit: "dB", default: 2 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "limiter", name: "Limiter", category: "DYNAMICS", params: [
    { key: "ceiling", label: "CEILING", min: -12, max: 0, unit: "dB", default: -0.3 },
    { key: "release", label: "RELEASE", min: 10, max: 500, unit: "ms", default: 50 },
  ]},
  { id: "gate", name: "Gate", category: "DYNAMICS", params: [
    { key: "thresh", label: "THRESH", min: -80, max: 0, unit: "dB", default: -40 },
    { key: "attack", label: "ATTACK", min: 0.1, max: 50, unit: "ms", default: 1 },
    { key: "release", label: "RELEASE", min: 10, max: 500, unit: "ms", default: 50 },
  ]},
  { id: "transient", name: "Transient", category: "DYNAMICS", params: [
    { key: "attack", label: "ATTACK", min: -100, max: 100, unit: "%", default: 0 },
    { key: "sustain", label: "SUSTAIN", min: -100, max: 100, unit: "%", default: 0 },
  ]},
  
  // TIME-BASED
  { id: "reverb", name: "Reverb", category: "TIME", subtypes: ["Room", "Hall", "Plate", "Spring", "Shimmer"], params: [
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 35 },
    { key: "size", label: "SIZE", min: 0, max: 100, unit: "%", default: 60 },
    { key: "decay", label: "DECAY", min: 0.1, max: 10, unit: "s", default: 2.4 },
    { key: "damp", label: "DAMP", min: 0, max: 100, unit: "%", default: 40 },
    { key: "predelay", label: "PRE-DLY", min: 0, max: 100, unit: "ms", default: 12 },
  ]},
  { id: "delay", name: "Delay", category: "TIME", subtypes: ["Stereo", "Ping-Pong", "Tape", "Multi-tap"], params: [
    { key: "time", label: "TIME", min: 1, max: 2000, unit: "ms", default: 250 },
    { key: "feedback", label: "FDBK", min: 0, max: 100, unit: "%", default: 45 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 25 },
    { key: "spread", label: "SPREAD", min: 0, max: 100, unit: "%", default: 80 },
    { key: "filter", label: "FILTER", min: 20, max: 20000, unit: "Hz", default: 8000 },
  ]},
  { id: "echo", name: "Echo", category: "TIME", params: [
    { key: "time", label: "TIME", min: 50, max: 1000, unit: "ms", default: 300 },
    { key: "feedback", label: "FDBK", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 30 },
  ]},
  
  // MODULATION
  { id: "chorus", name: "Chorus", category: "MODULATION", params: [
    { key: "rate", label: "RATE", min: 0.1, max: 10, unit: "Hz", default: 1.5 },
    { key: "depth", label: "DEPTH", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  { id: "flanger", name: "Flanger", category: "MODULATION", params: [
    { key: "rate", label: "RATE", min: 0.01, max: 5, unit: "Hz", default: 0.5 },
    { key: "depth", label: "DEPTH", min: 0, max: 100, unit: "%", default: 70 },
    { key: "feedback", label: "FDBK", min: -100, max: 100, unit: "%", default: 60 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  { id: "phaser", name: "Phaser", category: "MODULATION", params: [
    { key: "rate", label: "RATE", min: 0.01, max: 5, unit: "Hz", default: 0.3 },
    { key: "depth", label: "DEPTH", min: 0, max: 100, unit: "%", default: 80 },
    { key: "feedback", label: "FDBK", min: -100, max: 100, unit: "%", default: 50 },
    { key: "stages", label: "STAGES", min: 2, max: 12, default: 6 },
  ]},
  { id: "tremolo", name: "Tremolo", category: "MODULATION", params: [
    { key: "rate", label: "RATE", min: 0.5, max: 20, unit: "Hz", default: 5 },
    { key: "depth", label: "DEPTH", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  { id: "vibrato", name: "Vibrato", category: "MODULATION", params: [
    { key: "rate", label: "RATE", min: 0.5, max: 15, unit: "Hz", default: 5 },
    { key: "depth", label: "DEPTH", min: 0, max: 100, unit: "%", default: 30 },
  ]},
  { id: "ringmod", name: "Ring Mod", category: "MODULATION", params: [
    { key: "freq", label: "FREQ", min: 20, max: 5000, unit: "Hz", default: 440 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  { id: "autopan", name: "Auto-Pan", category: "MODULATION", params: [
    { key: "rate", label: "RATE", min: 0.1, max: 10, unit: "Hz", default: 1 },
    { key: "width", label: "WIDTH", min: 0, max: 100, unit: "%", default: 80 },
  ]},
  { id: "rotary", name: "Rotary", category: "MODULATION", params: [
    { key: "speed", label: "SPEED", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 70 },
  ]},
  
  // EQ & FILTER
  { id: "paraeq", name: "Param EQ", category: "EQ", params: [
    { key: "loFreq", label: "LO FREQ", min: 20, max: 500, unit: "Hz", default: 100 },
    { key: "loGain", label: "LO GAIN", min: -18, max: 18, unit: "dB", default: 0 },
    { key: "midFreq", label: "MID FREQ", min: 200, max: 8000, unit: "Hz", default: 1000 },
    { key: "midGain", label: "MID GAIN", min: -18, max: 18, unit: "dB", default: 0 },
    { key: "hiFreq", label: "HI FREQ", min: 2000, max: 20000, unit: "Hz", default: 8000 },
    { key: "hiGain", label: "HI GAIN", min: -18, max: 18, unit: "dB", default: 0 },
  ]},
  { id: "graphiceq", name: "Graphic EQ", category: "EQ", params: [
    { key: "b60", label: "60", min: -12, max: 12, unit: "dB", default: 0 },
    { key: "b250", label: "250", min: -12, max: 12, unit: "dB", default: 0 },
    { key: "b1k", label: "1K", min: -12, max: 12, unit: "dB", default: 0 },
    { key: "b4k", label: "4K", min: -12, max: 12, unit: "dB", default: 0 },
    { key: "b16k", label: "16K", min: -12, max: 12, unit: "dB", default: 0 },
  ]},
  { id: "filter", name: "Filter", category: "EQ", subtypes: ["LP", "HP", "BP", "Notch"], params: [
    { key: "freq", label: "FREQ", min: 20, max: 20000, unit: "Hz", default: 1000 },
    { key: "reso", label: "RESO", min: 0, max: 100, unit: "%", default: 25 },
    { key: "drive", label: "DRIVE", min: 0, max: 100, unit: "%", default: 0 },
  ]},
  { id: "autowah", name: "Auto-Wah", category: "EQ", params: [
    { key: "sens", label: "SENS", min: 0, max: 100, unit: "%", default: 50 },
    { key: "freq", label: "FREQ", min: 200, max: 5000, unit: "Hz", default: 1000 },
    { key: "q", label: "Q", min: 0.5, max: 10, default: 2 },
  ]},
  
  // DISTORTION
  { id: "overdrive", name: "Overdrive", category: "DISTORTION", params: [
    { key: "drive", label: "DRIVE", min: 0, max: 100, unit: "%", default: 50 },
    { key: "tone", label: "TONE", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "distortion", name: "Distortion", category: "DISTORTION", params: [
    { key: "drive", label: "DRIVE", min: 0, max: 100, unit: "%", default: 60 },
    { key: "tone", label: "TONE", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "fuzz", name: "Fuzz", category: "DISTORTION", params: [
    { key: "fuzz", label: "FUZZ", min: 0, max: 100, unit: "%", default: 70 },
    { key: "tone", label: "TONE", min: 0, max: 100, unit: "%", default: 40 },
    { key: "level", label: "LEVEL", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  { id: "bitcrush", name: "Bitcrusher", category: "DISTORTION", params: [
    { key: "bits", label: "BITS", min: 1, max: 16, default: 8 },
    { key: "rate", label: "RATE", min: 100, max: 44100, unit: "Hz", default: 22050 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "waveshaper", name: "Waveshaper", category: "DISTORTION", params: [
    { key: "amount", label: "AMOUNT", min: 0, max: 100, unit: "%", default: 50 },
    { key: "curve", label: "CURVE", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "tapesat", name: "Tape Sat", category: "DISTORTION", params: [
    { key: "drive", label: "DRIVE", min: 0, max: 100, unit: "%", default: 40 },
    { key: "warmth", label: "WARMTH", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "tubesat", name: "Tube Sat", category: "DISTORTION", params: [
    { key: "drive", label: "DRIVE", min: 0, max: 100, unit: "%", default: 30 },
    { key: "bias", label: "BIAS", min: 0, max: 100, unit: "%", default: 50 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  
  // SPECTRAL
  { id: "pitchshift", name: "Pitch Shift", category: "SPECTRAL", params: [
    { key: "semitones", label: "SEMI", min: -24, max: 24, default: 0 },
    { key: "cents", label: "CENTS", min: -100, max: 100, default: 0 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 100 },
  ]},
  { id: "harmonizer", name: "Harmonizer", category: "SPECTRAL", params: [
    { key: "interval", label: "INTERVAL", min: -12, max: 12, default: 5 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  { id: "fftfreeze", name: "FFT Freeze", category: "SPECTRAL", params: [
    { key: "freeze", label: "FREEZE", min: 0, max: 1, default: 0 },
    { key: "mix", label: "MIX", min: 0, max: 100, unit: "%", default: 50 },
  ]},
  
  // SPATIAL
  { id: "stereowide", name: "Stereo Wide", category: "SPATIAL", params: [
    { key: "width", label: "WIDTH", min: 0, max: 200, unit: "%", default: 100 },
  ]},
  { id: "midsideeq", name: "M/S EQ", category: "SPATIAL", params: [
    { key: "midGain", label: "MID", min: -12, max: 12, unit: "dB", default: 0 },
    { key: "sideGain", label: "SIDE", min: -12, max: 12, unit: "dB", default: 0 },
  ]},
  { id: "haas", name: "Haas", category: "SPATIAL", params: [
    { key: "delay", label: "DELAY", min: 0, max: 40, unit: "ms", default: 20 },
    { key: "pan", label: "PAN", min: -100, max: 100, unit: "%", default: 0 },
  ]},
  
  // UTILITY
  { id: "gain", name: "Gain", category: "UTILITY", params: [
    { key: "gain", label: "GAIN", min: -24, max: 24, unit: "dB", default: 0 },
  ]},
  { id: "dcfilter", name: "DC Filter", category: "UTILITY", params: [
    { key: "freq", label: "FREQ", min: 5, max: 50, unit: "Hz", default: 20 },
  ]},
  { id: "analyzer", name: "Analyzer", category: "UTILITY", params: [] },
]

// Group FX by category
const FX_BY_CATEGORY = FX_TYPES.reduce((acc, fx) => {
  if (!acc[fx.category]) acc[fx.category] = []
  acc[fx.category].push(fx)
  return acc
}, {} as Record<FXCategory, FXType[]>)

// ═══════════════════════════════════════════════════════════════════════════════
// FX PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function FXPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Record<FXCategory, boolean>>({
    DYNAMICS: true, TIME: true, MODULATION: false, EQ: false, DISTORTION: false, SPECTRAL: false, SPATIAL: false, UTILITY: false,
  })
  const [chain, setChain] = useState<ActiveFX[]>([
    { id: "fx1", typeId: "comp", subtype: "VCA", enabled: true, solo: false, params: { thresh: -18, ratio: 4, attack: 5, release: 100, gain: 2, mix: 100 } },
    { id: "fx2", typeId: "paraeq", enabled: true, solo: false, params: { loFreq: 100, loGain: 2, midFreq: 1000, midGain: -1, hiFreq: 8000, hiGain: 1 } },
    { id: "fx3", typeId: "reverb", subtype: "Hall", enabled: true, solo: false, params: { mix: 35, size: 60, decay: 2.4, damp: 40, predelay: 12 } },
    { id: "fx4", typeId: "delay", subtype: "Ping-Pong", enabled: true, solo: false, params: { time: 250, feedback: 45, mix: 25, spread: 80, filter: 8000 } },
  ])
  const [selectedFxId, setSelectedFxId] = useState<string | null>("fx1")
  const [preFx, setPreFx] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)

  const toggleCategory = (cat: FXCategory) => {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  const addEffect = (typeId: string) => {
    const fxType = FX_TYPES.find((t) => t.id === typeId)
    if (!fxType) return
    const newId = `fx${Date.now()}`
    const params: Record<string, number> = {}
    fxType.params.forEach((p) => { params[p.key] = p.default })
    setChain((prev) => [...prev, { id: newId, typeId, subtype: fxType.subtypes?.[0], enabled: true, solo: false, params }])
    setSelectedFxId(newId)
  }

  const removeEffect = (id: string) => {
    setChain((prev) => prev.filter((fx) => fx.id !== id))
    if (selectedFxId === id) setSelectedFxId(null)
  }

  const toggleEffect = (id: string) => {
    setChain((prev) => prev.map((fx) => fx.id === id ? { ...fx, enabled: !fx.enabled } : fx))
  }

  const toggleSolo = (id: string) => {
    setChain((prev) => prev.map((fx) => fx.id === id ? { ...fx, solo: !fx.solo } : fx))
  }

  const updateParam = (id: string, key: string, value: number) => {
    setChain((prev) => prev.map((fx) => fx.id === id ? { ...fx, params: { ...fx.params, [key]: value } } : fx))
  }

  const updateSubtype = (id: string, subtype: string) => {
    setChain((prev) => prev.map((fx) => fx.id === id ? { ...fx, subtype } : fx))
  }

  const moveEffect = (fromIndex: number, toIndex: number) => {
    setChain((prev) => {
      const result = [...prev]
      const [removed] = result.splice(fromIndex, 1)
      result.splice(toIndex, 0, removed)
      return result
    })
  }

  const selectedFx = chain.find((fx) => fx.id === selectedFxId)
  const selectedFxType = selectedFx ? FX_TYPES.find((t) => t.id === selectedFx.typeId) : null

  const filteredFxTypes = searchQuery.trim()
    ? FX_TYPES.filter((fx) => fx.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : null

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: "linear-gradient(145deg, #c8ccd4 0%, #d0d4dc 100%)", minHeight: 0 }}>
      
      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden" style={{ gap: 4, padding: 4, minHeight: 0 }}>
        
        {/* ═══════ COLUMN 1: FX BROWSER ═══════ */}
        <div className="panel-raised flex flex-col overflow-hidden" style={{ width: 160, flexShrink: 0 }}>
          <div className="flex items-center px-2 py-1" style={{ background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)", borderBottom: "1px solid var(--panel-shadow)", flexShrink: 0 }}>
            <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}>FX BROWSER</span>
          </div>
          
          {/* Search */}
          <div style={{ padding: "4px 6px", flexShrink: 0 }}>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full panel-recessed px-2 py-1 font-mono"
              style={{ fontSize: 8, color: "var(--text-value)", outline: "none", border: "none" }}
            />
          </div>
          
          {/* Category tree or search results */}
          <div className="flex-1 overflow-y-auto" style={{ padding: "2px 4px" }}>
            {filteredFxTypes ? (
              // Search results
              filteredFxTypes.map((fx) => (
                <FXBrowserItem key={fx.id} fx={fx} onAdd={() => addEffect(fx.id)} />
              ))
            ) : (
              // Category tree
              (Object.keys(FX_BY_CATEGORY) as FXCategory[]).map((cat) => (
                <div key={cat}>
                  <button
                    className="w-full flex items-center gap-1 px-1 py-0.5 font-mono uppercase"
                    style={{ fontSize: 6, letterSpacing: "1px", color: CATEGORY_COLORS[cat], textAlign: "left" }}
                    onClick={() => toggleCategory(cat)}
                  >
                    <span style={{ fontSize: 8 }}>{expandedCategories[cat] ? "▼" : "▶"}</span>
                    {CATEGORY_LABELS[cat]}
                  </button>
                  {expandedCategories[cat] && (
                    <div style={{ marginLeft: 8, marginBottom: 4 }}>
                      {FX_BY_CATEGORY[cat].map((fx) => (
                        <FXBrowserItem key={fx.id} fx={fx} onAdd={() => addEffect(fx.id)} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ═══════ COLUMN 2: ACTIVE CHAIN ═══════ */}
        <div className="panel-raised flex flex-col overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center justify-between px-2 py-1" style={{ background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)", borderBottom: "1px solid var(--panel-shadow)", flexShrink: 0 }}>
            <div className="flex items-center gap-2">
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}>FX CHAIN</span>
              <div className="flex gap-px">
                <button
                  className="px-2 py-0.5 font-mono uppercase"
                  style={{ fontSize: 6, background: preFx ? "#5865f2" : "rgba(255,255,255,0.5)", color: preFx ? "#fff" : "var(--text-label)", border: `1px solid ${preFx ? "#5865f2" : "var(--panel-shadow)"}` }}
                  onClick={() => setPreFx(true)}
                >
                  <LED active={preFx} color="#5865f2" size={4} /> PRE
                </button>
                <button
                  className="px-2 py-0.5 font-mono uppercase"
                  style={{ fontSize: 6, background: !preFx ? "#ef4444" : "rgba(255,255,255,0.5)", color: !preFx ? "#fff" : "var(--text-label)", border: `1px solid ${!preFx ? "#ef4444" : "var(--panel-shadow)"}` }}
                  onClick={() => setPreFx(false)}
                >
                  <LED active={!preFx} color="#ef4444" size={4} /> POST
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono" style={{ fontSize: 7, color: "var(--text-label)" }}>CPU:</span>
              <span className="font-mono" style={{ fontSize: 8, color: "#10b981" }}>23%</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto" style={{ padding: 6, minHeight: 0 }}>
            {chain.map((fx, idx) => {
              const fxType = FX_TYPES.find((t) => t.id === fx.typeId)
              if (!fxType) return null
              return (
                <FXBlock
                  key={fx.id}
                  fx={fx}
                  fxType={fxType}
                  selected={selectedFxId === fx.id}
                  index={idx}
                  onSelect={() => setSelectedFxId(fx.id)}
                  onToggle={() => toggleEffect(fx.id)}
                  onSolo={() => toggleSolo(fx.id)}
                  onRemove={() => removeEffect(fx.id)}
                  onParamChange={(k, v) => updateParam(fx.id, k, v)}
                  onDragStart={() => setDraggedItem(fx.id)}
                  onDragEnd={() => setDraggedItem(null)}
                  onDrop={(targetIdx) => {
                    if (draggedItem) {
                      const fromIdx = chain.findIndex((f) => f.id === draggedItem)
                      if (fromIdx !== -1 && fromIdx !== targetIdx) moveEffect(fromIdx, targetIdx)
                    }
                  }}
                />
              )
            })}
            
            {/* Drop zone */}
            <div
              className="flex items-center justify-center gap-2 py-3 mt-2 transition-colors"
              style={{ border: "1px dashed var(--panel-shadow)", background: "rgba(255,255,255,0.3)", borderRadius: 3 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { /* Handle drop from browser */ }}
            >
              <span style={{ color: "var(--text-label)", fontSize: 12 }}>+</span>
              <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "var(--text-label)" }}>
                DRAG EFFECT HERE OR CLICK +
              </span>
            </div>
          </div>
        </div>

        {/* ═══════ COLUMN 3: EDITOR PANEL ═══════ */}
        <div className="panel-raised flex flex-col overflow-hidden" style={{ width: 260, flexShrink: 0 }}>
          <div className="flex items-center justify-between px-2 py-1" style={{ background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)", borderBottom: "1px solid var(--panel-shadow)", flexShrink: 0 }}>
            <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}>EDITOR</span>
            {selectedFx && (
              <button onClick={() => removeEffect(selectedFx.id)} style={{ fontSize: 7, color: "#ef4444", fontFamily: "monospace", letterSpacing: "1px" }}>DELETE</button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto" style={{ padding: 8, minHeight: 0 }}>
            {selectedFx && selectedFxType ? (
              <FXEditor fx={selectedFx} fxType={selectedFxType} onParamChange={(k, v) => updateParam(selectedFx.id, k, v)} onSubtypeChange={(s) => updateSubtype(selectedFx.id, s)} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2" style={{ opacity: 0.5 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-label)" strokeWidth="1">
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
                <span className="font-mono text-center" style={{ fontSize: 8, color: "var(--text-label)", lineHeight: 1.7 }}>
                  SELECT AN EFFECT<br />TO EDIT
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ BOTTOM: SIGNAL FLOW ═══════ */}
      <SignalFlowBar chain={chain} preFx={preFx} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function FXBrowserItem({ fx, onAdd }: { fx: FXType; onAdd: () => void }) {
  const color = CATEGORY_COLORS[fx.category]
  return (
    <button
      className="w-full flex items-center gap-1.5 px-1.5 py-1 text-left transition-colors rounded"
      style={{ background: "transparent" }}
      onDoubleClick={onAdd}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("fxTypeId", fx.id)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.5)" }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
    >
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span className="font-mono" style={{ fontSize: 8, color: "var(--text-value)" }}>{fx.name}</span>
    </button>
  )
}

function FXBlock({
  fx, fxType, selected, index, onSelect, onToggle, onSolo, onRemove, onParamChange, onDragStart, onDragEnd, onDrop,
}: {
  fx: ActiveFX
  fxType: FXType
  selected: boolean
  index: number
  onSelect: () => void
  onToggle: () => void
  onSolo: () => void
  onRemove: () => void
  onParamChange: (key: string, value: number) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: (targetIdx: number) => void
}) {
  const color = CATEGORY_COLORS[fxType.category]
  const visibleParams = fxType.params.slice(0, 5)

  return (
    <div
      className="panel-raised mb-1 transition-all cursor-pointer"
      style={{ opacity: fx.enabled ? 1 : 0.5, borderLeft: selected ? `2px solid ${color}` : "2px solid transparent" }}
      onClick={onSelect}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop(index)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1" style={{ background: "linear-gradient(180deg, #e8eaef 0%, #dcdfe6 100%)", borderBottom: "1px solid var(--panel-shadow)" }}>
        <div className="flex items-center gap-2">
          <span style={{ cursor: "grab", color: "var(--text-label)", fontSize: 10 }}>⠿</span>
          <LED active={fx.enabled} color={color} size={5} />
          <span className="font-mono uppercase" style={{ fontSize: 8, letterSpacing: "1px", color: "var(--text-value)" }}>
            {fxType.name}
          </span>
          {fx.subtype && (
            <span className="font-mono" style={{ fontSize: 7, color: "var(--text-label)" }}>- {fx.subtype}</span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            className="px-1.5 py-0.5 font-mono uppercase"
            style={{ fontSize: 6, background: fx.enabled ? color : "rgba(255,255,255,0.5)", color: fx.enabled ? "#fff" : "var(--text-label)", border: `1px solid ${fx.enabled ? color : "var(--panel-shadow)"}` }}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
          >
            {fx.enabled ? "ON" : "OFF"}
          </button>
          <button
            className="px-1.5 py-0.5 font-mono uppercase"
            style={{ fontSize: 6, background: fx.solo ? "#eab308" : "rgba(255,255,255,0.5)", color: fx.solo ? "#fff" : "var(--text-label)", border: `1px solid ${fx.solo ? "#eab308" : "var(--panel-shadow)"}` }}
            onClick={(e) => { e.stopPropagation(); onSolo() }}
          >
            S
          </button>
          <button
            className="px-1.5 py-0.5 font-mono"
            style={{ fontSize: 8, background: "rgba(255,255,255,0.5)", color: "var(--text-label)", border: "1px solid var(--panel-shadow)" }}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* Animated signal visualizer */}
      <div className="px-2 pt-1" style={{ background: "#1a1d24" }}>
        <FXMiniViz fxType={fxType.id} params={fx.params} color={color} enabled={fx.enabled} />
      </div>

      {/* Params (compact row) */}
      <div className="flex items-center gap-1 px-2 py-1">
        {visibleParams.map((param) => (
          <Knob
            key={param.key}
            value={fx.params[param.key] ?? param.default}
            min={param.min}
            max={param.max}
            size="small"
            label={param.label}
            displayValue={formatParamValue(fx.params[param.key] ?? param.default, param)}
            accentColor={color}
            onChange={(v) => onParamChange(param.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Compact animated visualizer shown inside each FXBlock ──────────────────────
function FXMiniViz({ fxType, params, color, enabled }: { fxType: string; params: Record<string, number>; color: string; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const phaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const W = canvas.width, H = canvas.height

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = "#1a1d24"
      ctx.fillRect(0, 0, W, H)

      const ph = phaseRef.current
      const alpha = enabled ? 1 : 0.3

      // ── DYNAMICS: compressor gain-reduction meter + pumping waveform ──
      if (fxType === "comp" || fxType === "limiter" || fxType === "gate" || fxType === "transient") {
        const ratio = params.ratio ?? 4
        const thresh = ((params.thresh ?? -18) + 60) / 60
        // Input wave
        ctx.strokeStyle = `rgba(80,100,80,${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const py = H / 2 - Math.sin(t) * H * 0.45
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        // Compressed output
        ctx.strokeStyle = `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const raw = Math.sin(t)
          const compressed = raw > thresh ? thresh + (raw - thresh) / ratio : raw
          const py = H / 2 - compressed * H * 0.42
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        // Threshold line
        ctx.strokeStyle = `rgba(255,255,255,0.15)`
        ctx.lineWidth = 0.5
        ctx.setLineDash([2, 3])
        const ty = H / 2 - thresh * H * 0.42
        ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke()
        ctx.setLineDash([])
      }

      // ── TIME-BASED: delay echoes ──
      else if (fxType === "delay" || fxType === "echo" || fxType === "pingpong") {
        const feedback = (params.feedback ?? 45) / 100
        const timeX = ((params.time ?? 250) / 2000) * W * 0.25 + W * 0.05
        for (let e = 0; e < 6; e++) {
          const x = timeX * (e + 1)
          const amp = Math.pow(feedback, e) * (enabled ? 1 : 0.3)
          if (x > W) break
          ctx.strokeStyle = color
          ctx.globalAlpha = amp * 0.9
          ctx.lineWidth = 1.5
          ctx.beginPath()
          for (let i = 0; i < 12; i++) {
            const bx = x + i
            const by = H / 2 - Math.sin((i / 12) * Math.PI) * amp * H * 0.45
            i === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by)
          }
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // ── REVERB: diffuse decay tail ──
      else if (fxType === "reverb" || fxType === "convolver") {
        const decay = params.decay ?? 2
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        for (let x = 0; x < W; x++) {
          const t = x / W
          const env = Math.exp(-t * 5 / decay)
          const noise = (Math.random() * 2 - 1) * env * (enabled ? 1 : 0.3)
          const py = H / 2 + noise * H * 0.42
          ctx.globalAlpha = env * (enabled ? 0.8 : 0.2)
          ctx.beginPath(); ctx.moveTo(x, H / 2); ctx.lineTo(x, py); ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      // ── MODULATION: chorus/flanger wobble ──
      else if (fxType === "chorus" || fxType === "flanger" || fxType === "phaser" || fxType === "tremolo" || fxType === "vibrato") {
        const rate = (params.rate ?? 1) / 10
        const depth = (params.depth ?? 50) / 100
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.globalAlpha = enabled ? 1 : 0.3
        // Direct signal
        ctx.strokeStyle = `rgba(80,100,80,0.5)`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const py = H / 2 - Math.sin(t) * H * 0.4
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        // Modulated signal
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const mod = Math.sin((x / W) * Math.PI * 2 * rate + ph * 0.5) * depth
          const py = H / 2 - Math.sin(t + mod) * H * 0.4
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // ── EQ: frequency curve ──
      else if (fxType === "paraeq" || fxType === "graphiceq" || fxType === "tonestack") {
        ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 0.5
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
        ctx.strokeStyle = color; ctx.lineWidth = 2
        ctx.globalAlpha = enabled ? 1 : 0.3
        const lo = (params.loGain ?? 0) / 12, hi = (params.hiGain ?? 0) / 12, mid = (params.midGain ?? 0) / 12
        ctx.beginPath()
        ctx.moveTo(0, H / 2 - lo * H * 0.38)
        ctx.bezierCurveTo(W * 0.25, H / 2 - lo * H * 0.38, W * 0.4, H / 2 - mid * H * 0.38, W / 2, H / 2 - mid * H * 0.38)
        ctx.bezierCurveTo(W * 0.6, H / 2 - mid * H * 0.38, W * 0.75, H / 2 - hi * H * 0.38, W, H / 2 - hi * H * 0.38)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // ── DISTORTION: waveshaper transfer ──
      else if (fxType === "overdrive" || fxType === "distortion" || fxType === "fuzz" || fxType === "bitcrush" || fxType === "waveshaper" || fxType === "tapesat" || fxType === "tubesat") {
        const drive = (params.drive ?? 50) / 100
        const k = 1 + drive * 3
        // Input sine
        ctx.strokeStyle = "rgba(80,100,80,0.5)"; ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const py = H / 2 - Math.sin(t) * H * 0.4
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        // Distorted output
        ctx.strokeStyle = color; ctx.lineWidth = 1.5
        ctx.globalAlpha = enabled ? 1 : 0.3
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const raw = Math.sin(t)
          let out = fxType === "distortion" ? Math.max(-1, Math.min(1, raw * k))
            : fxType === "fuzz" ? Math.sign(raw) * (1 - Math.exp(-Math.abs(raw * k)))
            : fxType === "bitcrush" ? Math.round(raw * 4) / 4
            : Math.tanh(raw * k) / Math.tanh(k)
          const py = H / 2 - out * H * 0.4
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // ── SPECTRAL: FFT-style bars ──
      else if (fxType === "spectral" || fxType === "vocoder" || fxType === "freeze") {
        const bars = 24
        const bw = (W - bars) / bars
        for (let i = 0; i < bars; i++) {
          const freq = (i / bars) * 0.5 + 0.05
          const amp = Math.pow(Math.sin(freq * Math.PI + ph * 0.4), 2) * Math.exp(-i * 0.06)
          const bh = amp * H * 0.85
          ctx.fillStyle = color
          ctx.globalAlpha = (enabled ? 0.7 : 0.2)
          ctx.fillRect(i * (bw + 1), H - bh, bw, bh)
        }
        ctx.globalAlpha = 1
      }

      // ── UTILITY / DEFAULT: clean sine pass-through ──
      else {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5
        ctx.globalAlpha = enabled ? 0.9 : 0.3
        ctx.beginPath()
        for (let x = 0; x < W; x++) {
          const t = (x / W) * Math.PI * 4 + ph
          const py = H / 2 - Math.sin(t) * H * 0.38
          x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      phaseRef.current += 0.04
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [fxType, params, color, enabled])

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={28}
      style={{ display: "block", width: "100%", height: 28 }}
    />
  )
}

function FXEditor({ fx, fxType, onParamChange, onSubtypeChange }: { fx: ActiveFX; fxType: FXType; onParamChange: (key: string, value: number) => void; onSubtypeChange: (subtype: string) => void }) {
  const color = CATEGORY_COLORS[fxType.category]

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div>
        <div className="font-mono uppercase" style={{ fontSize: 10, color, letterSpacing: "1px", fontWeight: 700 }}>{fxType.name}</div>
        {fx.subtype && (
          <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>{fx.subtype}</span>
        )}
      </div>

      {/* Subtype selector */}
      {fxType.subtypes && fxType.subtypes.length > 0 && (
        <div>
          <span className="font-mono uppercase" style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "1px" }}>TYPE</span>
          <div className="flex gap-px mt-1 flex-wrap">
            {fxType.subtypes.map((st) => (
              <button
                key={st}
                onClick={() => onSubtypeChange(st)}
                className="px-2 py-1 font-mono transition-colors"
                style={{
                  fontSize: 7,
                  background: fx.subtype === st ? color : "rgba(255,255,255,0.5)",
                  color: fx.subtype === st ? "#fff" : "var(--text-label)",
                  border: `1px solid ${fx.subtype === st ? color : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transfer Function Visualizers */}
      {fxType.id === "comp" && <CompressorTransferFunction fx={fx} color={color} />}
      {fxType.id === "filter" && <FilterTransferFunction freq={fx.params.freq ?? 1000} reso={fx.params.reso ?? 25} color={color} />}
      {fxType.id === "paraeq" && <EQCurveDisplay fx={fx} color={color} />}
      {fxType.id === "graphiceq" && <GraphicEQDisplay fx={fx} color={color} />}
      {fxType.id === "reverb" && <ReverbDecayDisplay decay={fx.params.decay ?? 2} damp={fx.params.damp ?? 40} color={color} />}
      {fxType.id === "delay" && <DelayTapDisplay time={fx.params.time ?? 250} feedback={fx.params.feedback ?? 45} color={color} />}
      {fxType.id === "echo" && <EchoPatternDisplay time={fx.params.time ?? 300} feedback={fx.params.feedback ?? 50} color={color} />}
      {(fxType.id === "chorus" || fxType.id === "flanger" || fxType.id === "phaser") && <CombFilterDisplay rate={fx.params.rate ?? 1} depth={fx.params.depth ?? 50} color={color} />}
      {fxType.id === "bitcrush" && <BitcrusherStaircase bits={fx.params.bits ?? 8} color={color} />}
      {(fxType.id === "overdrive" || fxType.id === "distortion" || fxType.id === "fuzz" || fxType.id === "waveshaper" || fxType.id === "tapesat" || fxType.id === "tubesat") && <WaveshaperTransferFunction fxType={fxType.id} drive={fx.params.drive ?? 50} color={color} />}

      {/* All parameters as knobs */}
      <div className="flex flex-wrap gap-2">
        {fxType.params.map((param) => (
          <Knob
            key={param.key}
            value={fx.params[param.key] ?? param.default}
            min={param.min}
            max={param.max}
            size="medium"
            label={param.label}
            displayValue={formatParamValue(fx.params[param.key] ?? param.default, param)}
            accentColor={color}
            onChange={(v) => onParamChange(param.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

function GainReductionMeter() {
  const [gr, setGr] = useState(-6)
  useEffect(() => {
    const interval = setInterval(() => setGr(-Math.random() * 12), 100)
    return () => clearInterval(interval)
  }, [])
  
  return (
    <div className="panel-recessed p-2" style={{ borderRadius: 2 }}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>GAIN REDUCTION</span>
        <span className="font-mono" style={{ fontSize: 8, color: "#10b981" }}>{gr.toFixed(1)} dB</span>
      </div>
      <div style={{ height: 8, background: "var(--panel-shadow)", borderRadius: 2 }}>
        <div style={{ width: `${Math.abs(gr) / 20 * 100}%`, height: "100%", background: "#10b981", borderRadius: 2, transition: "width 0.05s" }} />
      </div>
    </div>
  )
}

function EQCurveDisplay({ fx, color }: { fx: ActiveFX; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    // Draw grid
    ctx.strokeStyle = "rgba(255,255,255,0.1)"
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(0, (height / 4) * i)
      ctx.lineTo(width, (height / 4) * i)
      ctx.stroke()
    }
    
    // Draw EQ curve
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    const loGain = (fx.params.loGain ?? 0) / 18
    const midGain = (fx.params.midGain ?? 0) / 18
    const hiGain = (fx.params.hiGain ?? 0) / 18
    ctx.moveTo(0, height / 2 - loGain * height * 0.4)
    ctx.bezierCurveTo(width * 0.25, height / 2 - loGain * height * 0.4, width * 0.35, height / 2 - midGain * height * 0.4, width * 0.5, height / 2 - midGain * height * 0.4)
    ctx.bezierCurveTo(width * 0.65, height / 2 - midGain * height * 0.4, width * 0.75, height / 2 - hiGain * height * 0.4, width, height / 2 - hiGain * height * 0.4)
    ctx.stroke()
  }, [fx.params, color])
  
  return (
    <div className="panel-recessed" style={{ borderRadius: 2 }}>
      <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
    </div>
  )
}

// ── Compressor Transfer Function ───────────────────────────────────────────────
function CompressorTransferFunction({ fx, color }: { fx: ActiveFX; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.1)"
    ctx.lineWidth = 0.5
    for (let i = 1; i < 3; i++) {
      const x = (i / 3) * width
      const y = (i / 3) * height
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    
    const thresh = fx.params.thresh ?? -18
    const ratio = fx.params.ratio ?? 4
    
    // Draw threshold line
    const threshX = ((thresh + 60) / 60) * width
    ctx.strokeStyle = "rgba(255,255,255,0.3)"
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(threshX, 0)
    ctx.lineTo(threshX, height)
    ctx.stroke()
    ctx.setLineDash([])
    
    // Draw knee curve
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      const inputDb = (x / width) * 60 - 60
      let outputDb: number
      if (inputDb <= thresh) {
        outputDb = inputDb
      } else {
        const overThresh = inputDb - thresh
        outputDb = thresh + overThresh / ratio
      }
      const py = height - ((outputDb + 60) / 60) * height
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [fx.params.thresh, fx.params.ratio, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>TRANSFER FUNCTION</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={80} style={{ display: "block", width: "100%", height: 80 }} />
      </div>
    </div>
  )
}

// ── Filter Transfer Function ───────────────────────────────────────────────────
function FilterTransferFunction({ freq, reso, color }: { freq: number; reso: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    ctx.strokeStyle = "rgba(255,255,255,0.1)"
    ctx.lineWidth = 0.5
    for (let i = 1; i < 3; i++) {
      const x = (i / 3) * width
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    const q = 1 + reso / 25
    for (let x = 0; x < width; x++) {
      const f = Math.pow(2, (x / width - 0.5) * 8)
      const resp = 1 / Math.sqrt(1 + Math.pow(q * (f - freq / 10000), 2))
      const py = height - resp * height * 0.8
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [freq, reso, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>FREQUENCY RESPONSE</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
      </div>
    </div>
  )
}

// ── Graphic EQ Display ─────────────────────────────────────────────────────────
function GraphicEQDisplay({ fx, color }: { fx: ActiveFX; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    const bands = [fx.params.b60, fx.params.b250, fx.params.b1k, fx.params.b4k, fx.params.b16k].map((v) => v ?? 0)
    
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    bands.forEach((gain, i) => {
      const x = (i / (bands.length - 1)) * width
      const py = height / 2 - (gain / 12) * height * 0.4
      i === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    })
    ctx.stroke()
    
    bands.forEach((gain, i) => {
      const x = (i / (bands.length - 1)) * width
      const py = height / 2 - (gain / 12) * height * 0.4
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, py, 2, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [fx.params, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>EQ CURVE</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
      </div>
    </div>
  )
}

// ── Reverb Decay Envelope ──────────────────────────────────────────────────────
function ReverbDecayDisplay({ decay, damp, color }: { decay: number; damp: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    const dampFactor = 0.5 + (damp / 100) * 0.5
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      const t = (x / width) * decay
      const envelope = Math.exp(-t / decay) * Math.pow(dampFactor, t)
      const py = height - envelope * height * 0.9
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
    
    // RT60 marker
    const rt60X = (Math.log(0.001) / (decay * -1)) / decay * width
    if (rt60X < width) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)"
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(rt60X, 0)
      ctx.lineTo(rt60X, height)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [decay, damp, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>DECAY ENVELOPE</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
      </div>
    </div>
  )
}

// ── Delay Tap Pattern ──────────────────────────────────────────────────────────
function DelayTapDisplay({ time, feedback, color }: { time: number; feedback: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    const tap1X = time / 2000 * width * 0.8 + 20
    const fb = feedback / 100
    
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    for (let echo = 0; echo < 6; echo++) {
      const tapX = tap1X + (echo * tap1X * 0.3)
      const amp = Math.pow(fb, echo)
      if (tapX < width - 20) {
        ctx.beginPath()
        ctx.moveTo(tapX, height * 0.8)
        ctx.lineTo(tapX, height * 0.8 - amp * height * 0.6)
        ctx.stroke()
        ctx.fillStyle = color
        ctx.globalAlpha = amp
        ctx.fillRect(tapX - 1, height * 0.8 - amp * height * 0.6, 2, amp * height * 0.6)
        ctx.globalAlpha = 1
      }
    }
  }, [time, feedback, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>ECHO PATTERN</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
      </div>
    </div>
  )
}

// ── Echo Pattern Display ───────────────────────────────────────────────────────
function EchoPatternDisplay({ time, feedback, color }: { time: number; feedback: number; color: string }) {
  return <DelayTapDisplay time={time} feedback={feedback} color={color} />
}

// ── Comb Filter (Chorus/Flanger/Phaser) ────────────────────────────────────────
function CombFilterDisplay({ rate, depth, color }: { rate: number; depth: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(0)
  const animationRef = useRef<number>(0)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const draw = () => {
      const { width, height } = canvas
      ctx.fillStyle = "#1a1d24"
      ctx.fillRect(0, 0, width, height)
      
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      for (let x = 0; x < width; x += 15) {
        const notchX = x + Math.sin(phaseRef.current) * depth / 5
        const peak = height * 0.3 + Math.sin(phaseRef.current + (x / width) * Math.PI * 2) * height * 0.2
        ctx.beginPath()
        ctx.moveTo(notchX, height)
        ctx.lineTo(notchX, height - peak)
        ctx.stroke()
      }
      
      phaseRef.current = (phaseRef.current + rate / 500) % (Math.PI * 2)
      animationRef.current = requestAnimationFrame(draw)
    }
    
    draw()
    return () => cancelAnimationFrame(animationRef.current)
  }, [rate, depth, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>COMB FILTER (ANIMATED)</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
      </div>
    </div>
  )
}

// ── Bitcrusher Staircase ───────────────────────────────────────────────────────
function BitcrusherStaircase({ bits, color }: { bits: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    const steps = Math.pow(2, bits)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      const sineVal = Math.sin((x / width) * Math.PI * 2)
      const quantized = Math.round(sineVal * (steps / 2)) / (steps / 2)
      const py = height / 2 - quantized * height * 0.35
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [bits, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>QUANTIZATION ({bits} BITS)</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={60} style={{ display: "block", width: "100%", height: 60 }} />
      </div>
    </div>
  )
}

// ── Waveshaper Transfer Function (Distortion types) ────────────────────────────
function WaveshaperTransferFunction({ fxType, drive, color }: { fxType: string; drive: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const { width, height } = canvas
    ctx.fillStyle = "#1a1d24"
    ctx.fillRect(0, 0, width, height)
    
    // Diagonal reference
    ctx.strokeStyle = "rgba(255,255,255,0.1)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height)
    ctx.lineTo(width, 0)
    ctx.stroke()
    
    // Transfer function
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      const input = (x / width) * 2 - 1
      let output: number
      
      const k = 0.5 + (drive / 100) * 2
      
      switch (fxType) {
        case "distortion":
          output = Math.max(-1, Math.min(1, input * k))
          break
        case "overdrive":
          output = Math.tanh(input * k) / Math.tanh(k)
          break
        case "fuzz":
          output = Math.sign(input) * (1 - Math.exp(-Math.abs(input * k)))
          break
        case "waveshaper":
          output = Math.sin(input * Math.PI * k) / Math.sin(Math.PI * k)
          break
        case "tapesat":
          output = Math.tanh(input * k * 0.8) / Math.tanh(k * 0.8)
          break
        case "tubesat":
          output = Math.sign(input) * (1 - Math.pow(2, -Math.abs(input * k)))
          break
        default:
          output = input
      }
      
      const py = height / 2 - output * height * 0.45
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [fxType, drive, color])
  
  return (
    <div>
      <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>TRANSFER FUNCTION</span>
      <div className="panel-recessed mt-1" style={{ borderRadius: 2 }}>
        <canvas ref={canvasRef} width={240} height={80} style={{ display: "block", width: "100%", height: 80 }} />
      </div>
    </div>
  )
}

// ── Decay Tail Display (alias for ReverbDecayDisplay) ────────────────────────────
function DecayTailDisplay({ decay, color }: { decay: number; color: string }) {
  return <ReverbDecayDisplay decay={decay} damp={40} color={color} />
}

function SignalFlowBar({ chain, preFx }: { chain: ActiveFX[]; preFx: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dots, setDots] = useState<{ x: number; progress: number }[]>([])
  const animRef = useRef<number>(0)
  
  const enabledChain = chain.filter((fx) => fx.enabled)
  
  useEffect(() => {
    let lastTime = 0
    const animate = (time: number) => {
      const delta = time - lastTime
      lastTime = time
      
      setDots((prev) => {
        let updated = prev.map((d) => ({ ...d, progress: d.progress + delta * 0.0003 })).filter((d) => d.progress < 1)
        if (updated.length < 3 && Math.random() < 0.02) {
          updated = [...updated, { x: 0, progress: 0 }]
        }
        return updated
      })
      
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [])
  
  const nodes = [
    { label: "OSC1", color: "#5865f2" },
    { label: "OSC2", color: "#5865f2" },
    ...(preFx ? enabledChain.map((fx) => {
      const fxType = FX_TYPES.find((t) => t.id === fx.typeId)
      return { label: fxType?.name.slice(0, 4).toUpperCase() || "FX", color: CATEGORY_COLORS[fxType?.category || "UTILITY"] }
    }) : []),
    { label: "FLT", color: "#a855f7" },
    ...(!preFx ? enabledChain.map((fx) => {
      const fxType = FX_TYPES.find((t) => t.id === fx.typeId)
      return { label: fxType?.name.slice(0, 4).toUpperCase() || "FX", color: CATEGORY_COLORS[fxType?.category || "UTILITY"] }
    }) : []),
    { label: "OUT", color: "#10b981" },
  ]
  
  return (
    <div className="flex items-center px-3" style={{ height: 56, background: "linear-gradient(180deg, #d4d8e0 0%, #c8ccd4 100%)", borderTop: "1px solid var(--panel-shadow)", flexShrink: 0 }}>
      <svg ref={svgRef} width="100%" height={36} style={{ flex: 1 }}>
        {/* Draw nodes and connections */}
        {nodes.map((node, i) => {
          const x = 30 + (i / (nodes.length - 1)) * (svgRef.current?.clientWidth ? svgRef.current.clientWidth - 60 : 400)
          return (
            <g key={i}>
              {i > 0 && (
                <line
                  x1={30 + ((i - 1) / (nodes.length - 1)) * (svgRef.current?.clientWidth ? svgRef.current.clientWidth - 60 : 400) + 20}
                  y1={18}
                  x2={x - 20}
                  y2={18}
                  stroke="var(--panel-shadow)"
                  strokeWidth={2}
                />
              )}
              <rect x={x - 18} y={6} width={36} height={24} rx={3} fill={node.color} />
              <text x={x} y={22} textAnchor="middle" fontSize={7} fill="#fff" fontFamily="monospace">{node.label}</text>
            </g>
          )
        })}
        
        {/* Animated dots */}
        {dots.map((dot, i) => {
          const totalWidth = svgRef.current?.clientWidth ? svgRef.current.clientWidth - 60 : 400
          const dotX = 30 + dot.progress * totalWidth
          return (
            <circle key={i} cx={dotX} cy={18} r={3} fill="#10b981" style={{ filter: "drop-shadow(0 0 3px #10b981)" }} />
          )
        })}
      </svg>
      
      {/* CPU bars */}
      <div className="flex items-center gap-2" style={{ marginLeft: 16 }}>
        {enabledChain.slice(0, 4).map((fx) => {
          const fxType = FX_TYPES.find((t) => t.id === fx.typeId)
          const cpu = Math.random() * 10 + 2
          return (
            <div key={fx.id} className="flex items-center gap-1">
              <span className="font-mono" style={{ fontSize: 6, color: "var(--text-label)" }}>{fxType?.name.slice(0, 3).toUpperCase()}</span>
              <div style={{ width: 24, height: 4, background: "var(--panel-shadow)", borderRadius: 2 }}>
                <div style={{ width: `${cpu * 10}%`, height: "100%", background: CATEGORY_COLORS[fxType?.category || "UTILITY"], borderRadius: 2 }} />
              </div>
            </div>
          )
        })}
        <span className="font-mono" style={{ fontSize: 8, color: "#10b981", marginLeft: 8 }}>TOTAL: 23%</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatParamValue(value: number, param: { unit?: string; min: number; max: number }): string {
  if (param.unit === "dB") return `${value > 0 ? "+" : ""}${value.toFixed(1)}dB`
  if (param.unit === "ms") return `${Math.round(value)}ms`
  if (param.unit === "s") return `${value.toFixed(1)}s`
  if (param.unit === "Hz") return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}Hz`
  if (param.unit === "%") return `${Math.round(value)}%`
  return `${Math.round(value)}`
}
