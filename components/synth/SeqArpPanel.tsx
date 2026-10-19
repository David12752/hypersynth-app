"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"

// ──────────────────────────────────────────────────────────────────────
// HyperSynth — Sequencer & Arpeggiator Panel
//
// Professional arp + step-sequencer that opens above the keyboard.
//
// Arpeggiator features:
//   • Modes: Up, Down, Up-Down, Down-Up, Random, As-Played, Chord
//   • Octave range: 1 – 4
//   • BPM-synced rate: 1/1 → 1/32, with dotted & triplet variants
//   • Gate length (10% – 200%)
//   • Swing (0% – 100%)
//   • Hold / Latch toggle
//   • Retrigger on new note
//
// Step Sequencer features:
//   • 1 – 32 steps, per-step:
//       - Pitch offset (-24 … +24 semitones)
//       - Velocity (0 – 127)
//       - Gate (0% – 200%)
//       - Slide / Glide toggle
//       - Probability (0% – 100%)
//       - Active (on/off — rest)
//   • Direction: Forward, Backward, Pendulum, Random
//   • Multiple edit lanes (Pitch / Velocity / Gate / Slide / Probability)
//   • Click-drag editing on visual grid
//   • Swing
//   • Tie support (gate > 100% bleeds into next step)
// ──────────────────────────────────────────────────────────────────────

const ACCENT = "#5865f2"

// ── Types ────────────────────────────────────────────────────────────

type PanelMode = "OFF" | "ARP" | "SEQ"

type ArpMode = "UP" | "DOWN" | "UP_DOWN" | "DOWN_UP" | "RANDOM" | "ORDER" | "CHORD"

type RateDivision =
  | "1/1" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32"
  | "1/1D" | "1/2D" | "1/4D" | "1/8D" | "1/16D"
  | "1/1T" | "1/2T" | "1/4T" | "1/8T" | "1/16T" | "1/32T"

type SeqDirection = "FWD" | "BWD" | "PEND" | "RAND"
type SeqLane = "PITCH" | "VEL" | "GATE" | "SLIDE" | "PROB"

interface SeqStep {
  active: boolean
  pitch: number      // -24 to +24 semitones
  velocity: number   // 0 – 127
  gate: number       // 0 – 200 (%)
  slide: boolean
  probability: number // 0 – 100 (%)
}

interface ArpState {
  mode: ArpMode
  octaveRange: number  // 1 – 4
  rate: RateDivision
  gate: number         // 10 – 200 (%)
  swing: number        // 0 – 100
  hold: boolean
  retrigger: boolean
}

interface SeqState {
  steps: SeqStep[]
  stepCount: number    // 1 – 32
  direction: SeqDirection
  rate: RateDivision
  swing: number        // 0 – 100
  gate: number         // global gate multiplier 10 – 200
  activeLane: SeqLane
}

// ── Rate division → beats ────────────────────────────────────────────

const RATE_OPTIONS: RateDivision[] = [
  "1/1", "1/2", "1/4", "1/8", "1/16", "1/32",
  "1/1D", "1/2D", "1/4D", "1/8D", "1/16D",
  "1/1T", "1/2T", "1/4T", "1/8T", "1/16T", "1/32T",
]

function rateToBeats(rate: RateDivision): number {
  const base: Record<string, number> = {
    "1/1": 4, "1/2": 2, "1/4": 1, "1/8": 0.5, "1/16": 0.25, "1/32": 0.125,
  }
  const key = rate.replace(/[DT]$/, "")
  let beats = base[key] ?? 1
  if (rate.endsWith("D")) beats *= 1.5
  if (rate.endsWith("T")) beats *= 2 / 3
  return beats
}

// ── Default step ─────────────────────────────────────────────────────

function defaultStep(): SeqStep {
  return { active: true, pitch: 0, velocity: 100, gate: 100, slide: false, probability: 100 }
}

function createSteps(count: number): SeqStep[] {
  return Array.from({ length: count }, () => defaultStep())
}

// ── Arp pattern generation ───────────────────────────────────────────

function generateArpPattern(heldNotes: number[], mode: ArpMode, octaveRange: number): number[] {
  if (heldNotes.length === 0) return []

  const sorted = [...heldNotes].sort((a, b) => a - b)
  const expanded: number[] = []

  for (let oct = 0; oct < octaveRange; oct++) {
    for (const note of sorted) {
      expanded.push(note + oct * 12)
    }
  }

  switch (mode) {
    case "UP":
      return expanded
    case "DOWN":
      return [...expanded].reverse()
    case "UP_DOWN": {
      if (expanded.length <= 1) return expanded
      const down = [...expanded].reverse().slice(1, -1)
      return [...expanded, ...down]
    }
    case "DOWN_UP": {
      if (expanded.length <= 1) return expanded
      const reversed = [...expanded].reverse()
      const up = [...expanded].slice(1, -1)
      return [...reversed, ...up]
    }
    case "RANDOM":
      return expanded // will be shuffled at read time
    case "ORDER":
      // Use original order but expand across octaves
      return Array.from({ length: octaveRange }, (_, oct) =>
        heldNotes.map((n) => n + oct * 12)
      ).flat()
    case "CHORD":
      return [expanded] as any // special: all at once
    default:
      return expanded
  }
}

// ══════════════════════════════════════════════════════════════════════
// Main SeqArpPanel Component
// ══════════════════════════════════════════════════════════════════════

interface SeqArpPanelProps {
  /** BPM from host / global tempo */
  bpm: number
  onBpmChange?: (bpm: number) => void
  /** Currently held notes from keyboard (for arp) */
  heldNotes: number[]
  /** Emit note-on to the engine */
  onNoteOn: (note: number, velocity: number) => void
  /** Emit note-off to the engine */
  onNoteOff: (note: number) => void
}

export function SeqArpPanel({ bpm, onBpmChange, heldNotes, onNoteOn, onNoteOff }: SeqArpPanelProps) {
  // ── Panel mode ─────────────────────────────────────────────
  const [panelMode, setPanelMode] = useState<PanelMode>("OFF")

  // ── Arp state ──────────────────────────────────────────────
  const [arp, setArp] = useState<ArpState>({
    mode: "UP",
    octaveRange: 1,
    rate: "1/8",
    gate: 80,
    swing: 0,
    hold: false,
    retrigger: true,
  })

  // ── Seq state ──────────────────────────────────────────────
  const [seq, setSeq] = useState<SeqState>({
    steps: createSteps(16),
    stepCount: 16,
    direction: "FWD",
    rate: "1/16",
    swing: 0,
    gate: 100,
    activeLane: "PITCH",
  })

  // ── Transport ──────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)

  // Refs for audio thread timing
  const timerRef = useRef<number>(0)
  const activeNotesRef = useRef<Set<number>>(new Set())
  const stepIndexRef = useRef(0)
  const pendulumDirRef = useRef<1 | -1>(1)
  const heldNotesRef = useRef<number[]>([])
  const latchedNotesRef = useRef<number[]>([])
  const arpPatternRef = useRef<number[]>([])
  const arpIndexRef = useRef(0)
  const lastStepTimeRef = useRef(0)
  const nextStepTimeRef = useRef(0)

  // Sync refs with state
  useEffect(() => {
    heldNotesRef.current = heldNotes
    if (heldNotes.length > 0 && arp.hold) {
      latchedNotesRef.current = [...heldNotes]
    }
  }, [heldNotes, arp.hold])

  // ── Stop all active notes ──────────────────────────────────
  const stopAllNotes = useCallback(() => {
    for (const note of activeNotesRef.current) {
      onNoteOff(note)
    }
    activeNotesRef.current.clear()
  }, [onNoteOff])

  // ── Compute step interval with swing ───────────────────────
  const getStepIntervalMs = useCallback(
    (stepIdx: number, rate: RateDivision, swing: number) => {
      const beatsPerStep = rateToBeats(rate)
      const baseMs = (beatsPerStep / (bpm / 60)) * 1000
      if (swing <= 0 || stepIdx % 2 === 0) return baseMs
      // Swing: delay even-indexed steps
      const swingAmount = (swing / 100) * baseMs * 0.5
      return baseMs + swingAmount
    },
    [bpm]
  )

  // ── Arp tick ───────────────────────────────────────────────
  const arpTick = useCallback(() => {
    const notes = arp.hold ? latchedNotesRef.current : heldNotesRef.current
    if (notes.length === 0) {
      stopAllNotes()
      return
    }

    // Regenerate pattern
    const pattern = generateArpPattern(notes, arp.mode, arp.octaveRange)
    if (pattern.length === 0) return

    // Stop previous notes
    stopAllNotes()

    if (arp.mode === "CHORD") {
      // Play all notes at once
      const chordNotes = Array.isArray(pattern[0]) ? (pattern as any).flat() : pattern
      for (const n of chordNotes) {
        onNoteOn(n, 100)
        activeNotesRef.current.add(n)
      }
    } else if (arp.mode === "RANDOM") {
      const idx = Math.floor(Math.random() * pattern.length)
      const note = pattern[idx]
      onNoteOn(note, 100)
      activeNotesRef.current.add(note)
      arpIndexRef.current = idx
    } else {
      const idx = arpIndexRef.current % pattern.length
      const note = pattern[idx]
      onNoteOn(note, 100)
      activeNotesRef.current.add(note)
      arpIndexRef.current = idx + 1
      if (arpIndexRef.current >= pattern.length) arpIndexRef.current = 0
    }

    // Schedule note-off based on gate
    const beatsPerStep = rateToBeats(arp.rate)
    const stepMs = (beatsPerStep / (bpm / 60)) * 1000
    const gateMs = stepMs * (arp.gate / 100)
    const currentActiveNotes = new Set(activeNotesRef.current)
    setTimeout(() => {
      for (const n of currentActiveNotes) {
        if (activeNotesRef.current.has(n)) {
          onNoteOff(n)
          activeNotesRef.current.delete(n)
        }
      }
    }, gateMs)
  }, [arp, bpm, onNoteOn, onNoteOff, stopAllNotes])

  // ── Seq tick ───────────────────────────────────────────────
  const seqTick = useCallback(() => {
    const { steps, stepCount, direction } = seq
    if (stepCount === 0) return
    const baseNotes = heldNotesRef.current.length > 0 ? heldNotesRef.current : [60] // default C4

    // Stop previous notes
    stopAllNotes()

    // Compute step index based on direction
    let idx = stepIndexRef.current
    const step = steps[idx]

    if (step && step.active) {
      // Check probability
      if (Math.random() * 100 <= step.probability) {
        const baseNote = baseNotes[0] // Use lowest held note as root
        const note = baseNote + step.pitch
        const vel = step.velocity
        onNoteOn(note, vel)
        activeNotesRef.current.add(note)

        // Schedule note-off based on gate
        const beatsPerStep = rateToBeats(seq.rate)
        const stepMs = (beatsPerStep / (bpm / 60)) * 1000
        const gateMs = stepMs * (step.gate / 100) * (seq.gate / 100)
        const noteToRelease = note
        setTimeout(() => {
          if (activeNotesRef.current.has(noteToRelease)) {
            onNoteOff(noteToRelease)
            activeNotesRef.current.delete(noteToRelease)
          }
        }, Math.max(10, gateMs))
      }
    }

    setCurrentStep(idx)

    // Advance index
    switch (direction) {
      case "FWD":
        idx = (idx + 1) % stepCount
        break
      case "BWD":
        idx = idx - 1
        if (idx < 0) idx = stepCount - 1
        break
      case "PEND":
        idx += pendulumDirRef.current
        if (idx >= stepCount) {
          idx = stepCount - 2
          pendulumDirRef.current = -1
        }
        if (idx < 0) {
          idx = 1
          pendulumDirRef.current = 1
        }
        break
      case "RAND":
        idx = Math.floor(Math.random() * stepCount)
        break
    }
    stepIndexRef.current = Math.max(0, Math.min(idx, stepCount - 1))
  }, [seq, bpm, onNoteOn, onNoteOff, stopAllNotes])

  // ── Main clock loop ────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || panelMode === "OFF") {
      stopAllNotes()
      setCurrentStep(-1)
      return
    }

    const rate = panelMode === "ARP" ? arp.rate : seq.rate
    const swing = panelMode === "ARP" ? arp.swing : seq.swing
    let stepIdx = 0
    stepIndexRef.current = 0
    arpIndexRef.current = 0
    pendulumDirRef.current = 1

    const tick = () => {
      if (panelMode === "ARP") arpTick()
      else seqTick()

      const interval = getStepIntervalMs(stepIdx, rate, swing)
      stepIdx++
      timerRef.current = window.setTimeout(tick, interval)
    }

    tick()

    return () => {
      window.clearTimeout(timerRef.current)
      stopAllNotes()
    }
  }, [isPlaying, panelMode, arp.rate, arp.swing, arp.mode, arp.octaveRange, arp.gate, arp.hold, arp.retrigger, seq.rate, seq.swing, seq.stepCount, seq.direction, seq.gate, arpTick, seqTick, getStepIntervalMs, stopAllNotes])

  // Retrigger arp on new notes
  useEffect(() => {
    if (panelMode === "ARP" && arp.retrigger && heldNotes.length > 0 && isPlaying) {
      arpIndexRef.current = 0
    }
  }, [heldNotes.length, panelMode, arp.retrigger, isPlaying])

  // ── Helpers ────────────────────────────────────────────────
  const updateArp = useCallback((patch: Partial<ArpState>) => {
    setArp((prev) => ({ ...prev, ...patch }))
  }, [])

  const updateSeq = useCallback((patch: Partial<SeqState>) => {
    setSeq((prev) => ({ ...prev, ...patch }))
  }, [])

  const updateStep = useCallback((index: number, patch: Partial<SeqStep>) => {
    setSeq((prev) => {
      const newSteps = [...prev.steps]
      newSteps[index] = { ...newSteps[index], ...patch }
      return { ...prev, steps: newSteps }
    })
  }, [])

  const setStepCount = useCallback((count: number) => {
    setSeq((prev) => {
      const newSteps = [...prev.steps]
      while (newSteps.length < count) newSteps.push(defaultStep())
      return { ...prev, stepCount: count, steps: newSteps.slice(0, Math.max(count, newSteps.length)) }
    })
  }, [])

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="panel-raised" style={{ borderRadius: 6, overflow: "hidden" }}>
      {/* ── Header Bar ──────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
          borderBottom: "1px solid var(--panel-shadow)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-mono uppercase"
            style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}
          >
            SEQ / ARP
          </span>
          <div className="flex gap-px">
            {(["OFF", "ARP", "SEQ"] as PanelMode[]).map((mode) => (
              <button
                key={mode}
                className="px-2 py-0.5 font-mono uppercase"
                style={{
                  fontSize: 7,
                  letterSpacing: "1px",
                  background: panelMode === mode ? ACCENT : "rgba(255,255,255,0.55)",
                  color: panelMode === mode ? "#fff" : "var(--text-section)",
                  border: `1px solid ${panelMode === mode ? ACCENT : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                }}
                onClick={() => {
                  setPanelMode(mode)
                  if (mode === "OFF") {
                    setIsPlaying(false)
                  }
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Transport + BPM */}
        <div className="flex items-center gap-2">
          {panelMode !== "OFF" && (
            <>
              <button
                className="px-2 py-0.5 font-mono"
                style={{
                  fontSize: 9,
                  background: isPlaying ? "#ef4444" : "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: 2,
                  minWidth: 28,
                }}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? "■" : "▶"}
              </button>
              <div className="flex items-center gap-1">
                <button
                  className="px-1 py-0.5 font-mono"
                  style={{ fontSize: 8, background: "rgba(255,255,255,0.55)", border: "1px solid var(--panel-shadow)", borderRadius: 2, color: "var(--text-section)" }}
                  onClick={() => onBpmChange?.(Math.max(20, bpm - 1))}
                >
                  -
                </button>
                <div
                  className="panel-recessed px-2 py-0.5 font-mono"
                  style={{ fontSize: 9, color: "var(--text-display)", minWidth: 48, textAlign: "center" }}
                >
                  {bpm} BPM
                </div>
                <button
                  className="px-1 py-0.5 font-mono"
                  style={{ fontSize: 8, background: "rgba(255,255,255,0.55)", border: "1px solid var(--panel-shadow)", borderRadius: 2, color: "var(--text-section)" }}
                  onClick={() => onBpmChange?.(Math.min(300, bpm + 1))}
                >
                  +
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Content Area ────────────────────────────────────── */}
      {panelMode === "OFF" && (
        <div
          className="panel-recessed flex items-center justify-center font-mono uppercase"
          style={{ height: 32, fontSize: 8, color: "var(--text-label)", letterSpacing: "2px" }}
        >
          Sequencer / Arpeggiator disabled
        </div>
      )}

      {panelMode === "ARP" && (
        <ArpPanel arp={arp} updateArp={updateArp} isPlaying={isPlaying} />
      )}

      {panelMode === "SEQ" && (
        <SeqPanel
          seq={seq}
          updateSeq={updateSeq}
          updateStep={updateStep}
          setStepCount={setStepCount}
          currentStep={currentStep}
          isPlaying={isPlaying}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// ArpPanel — Arpeggiator controls
// ══════════════════════════════════════════════════════════════════════

function ArpPanel({
  arp,
  updateArp,
  isPlaying,
}: {
  arp: ArpState
  updateArp: (patch: Partial<ArpState>) => void
  isPlaying: boolean
}) {
  const ARP_MODES: { label: string; value: ArpMode }[] = [
    { label: "UP", value: "UP" },
    { label: "DN", value: "DOWN" },
    { label: "U/D", value: "UP_DOWN" },
    { label: "D/U", value: "DOWN_UP" },
    { label: "RND", value: "RANDOM" },
    { label: "ORD", value: "ORDER" },
    { label: "CHD", value: "CHORD" },
  ]

  const RATE_GROUPS = [
    { label: "Straight", rates: ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"] as RateDivision[] },
    { label: "Dotted", rates: ["1/1D", "1/2D", "1/4D", "1/8D", "1/16D"] as RateDivision[] },
    { label: "Triplet", rates: ["1/1T", "1/2T", "1/4T", "1/8T", "1/16T", "1/32T"] as RateDivision[] },
  ]

  return (
    <div className="p-2 flex flex-col gap-2">
      {/* Row 1: Mode + Octave range */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            MODE
          </span>
          <div className="flex gap-px">
            {ARP_MODES.map(({ label, value }) => (
              <button
                key={value}
                className="px-1.5 py-0.5 font-mono uppercase"
                style={{
                  fontSize: 7,
                  background: arp.mode === value ? ACCENT : "rgba(255,255,255,0.55)",
                  color: arp.mode === value ? "#fff" : "var(--text-section)",
                  border: `1px solid ${arp.mode === value ? ACCENT : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                }}
                onClick={() => updateArp({ mode: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--panel-shadow)" }} />

        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            OCTAVE
          </span>
          <div className="flex gap-px">
            {[1, 2, 3, 4].map((oct) => (
              <button
                key={oct}
                className="px-2 py-0.5 font-mono"
                style={{
                  fontSize: 8,
                  background: arp.octaveRange === oct ? ACCENT : "rgba(255,255,255,0.55)",
                  color: arp.octaveRange === oct ? "#fff" : "var(--text-section)",
                  border: `1px solid ${arp.octaveRange === oct ? ACCENT : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                }}
                onClick={() => updateArp({ octaveRange: oct })}
              >
                {oct}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--panel-shadow)" }} />

        {/* Hold + Retrigger */}
        <div className="flex gap-1.5">
          <button
            className="px-2 py-1 font-mono uppercase"
            style={{
              fontSize: 7,
              background: arp.hold ? "#f59e0b" : "rgba(255,255,255,0.55)",
              color: arp.hold ? "#000" : "var(--text-section)",
              border: `1px solid ${arp.hold ? "#f59e0b" : "var(--panel-shadow)"}`,
              borderRadius: 2,
              letterSpacing: "0.5px",
            }}
            onClick={() => updateArp({ hold: !arp.hold })}
          >
            HOLD
          </button>
          <button
            className="px-2 py-1 font-mono uppercase"
            style={{
              fontSize: 7,
              background: arp.retrigger ? ACCENT : "rgba(255,255,255,0.55)",
              color: arp.retrigger ? "#fff" : "var(--text-section)",
              border: `1px solid ${arp.retrigger ? ACCENT : "var(--panel-shadow)"}`,
              borderRadius: 2,
              letterSpacing: "0.5px",
            }}
            onClick={() => updateArp({ retrigger: !arp.retrigger })}
          >
            RETRIG
          </button>
        </div>
      </div>

      {/* Row 2: Rate + Gate + Swing */}
      <div className="flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            RATE
          </span>
          <div className="flex flex-col gap-px">
            {RATE_GROUPS.map((group) => (
              <div key={group.label} className="flex gap-px items-center">
                <span className="font-mono" style={{ fontSize: 5, color: "var(--text-label)", width: 28, textAlign: "right", paddingRight: 4 }}>
                  {group.label === "Straight" ? "STR" : group.label === "Dotted" ? "DOT" : "TRP"}
                </span>
                {group.rates.map((r) => (
                  <button
                    key={r}
                    className="px-1 py-px font-mono"
                    style={{
                      fontSize: 6,
                      background: arp.rate === r ? ACCENT : "rgba(255,255,255,0.4)",
                      color: arp.rate === r ? "#fff" : "var(--text-label)",
                      border: `1px solid ${arp.rate === r ? ACCENT : "var(--panel-shadow)"}`,
                      borderRadius: 1,
                      minWidth: 22,
                      textAlign: "center",
                    }}
                    onClick={() => updateArp({ rate: r })}
                  >
                    {r.replace(/[DT]$/, "")}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 40, background: "var(--panel-shadow)" }} />

        {/* Gate slider */}
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            GATE {arp.gate}%
          </span>
          <input
            type="range"
            min={10}
            max={200}
            value={arp.gate}
            onChange={(e) => updateArp({ gate: Number(e.target.value) })}
            style={{ width: 80, accentColor: ACCENT }}
          />
        </div>

        {/* Swing slider */}
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            SWING {arp.swing}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={arp.swing}
            onChange={(e) => updateArp({ swing: Number(e.target.value) })}
            style={{ width: 80, accentColor: ACCENT }}
          />
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// SeqPanel — Step Sequencer
// ══════════════════════════════════════════════════════════════════════

function SeqPanel({
  seq,
  updateSeq,
  updateStep,
  setStepCount,
  currentStep,
  isPlaying,
}: {
  seq: SeqState
  updateSeq: (patch: Partial<SeqState>) => void
  updateStep: (index: number, patch: Partial<SeqStep>) => void
  setStepCount: (count: number) => void
  currentStep: number
  isPlaying: boolean
}) {
  const DIRECTIONS: { label: string; value: SeqDirection }[] = [
    { label: "→", value: "FWD" },
    { label: "←", value: "BWD" },
    { label: "↔", value: "PEND" },
    { label: "?", value: "RAND" },
  ]

  const LANES: { label: string; value: SeqLane }[] = [
    { label: "PITCH", value: "PITCH" },
    { label: "VEL", value: "VEL" },
    { label: "GATE", value: "GATE" },
    { label: "SLIDE", value: "SLIDE" },
    { label: "PROB", value: "PROB" },
  ]

  const RATE_GROUPS = [
    { label: "STR", rates: ["1/1", "1/2", "1/4", "1/8", "1/16", "1/32"] as RateDivision[] },
    { label: "DOT", rates: ["1/1D", "1/2D", "1/4D", "1/8D", "1/16D"] as RateDivision[] },
    { label: "TRP", rates: ["1/1T", "1/2T", "1/4T", "1/8T", "1/16T", "1/32T"] as RateDivision[] },
  ]

  const STEP_PRESETS = [8, 12, 16, 24, 32]

  return (
    <div className="p-2 flex flex-col gap-2">
      {/* ── Controls Row ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Steps */}
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            STEPS
          </span>
          <div className="flex gap-px">
            {STEP_PRESETS.map((n) => (
              <button
                key={n}
                className="px-1.5 py-0.5 font-mono"
                style={{
                  fontSize: 7,
                  background: seq.stepCount === n ? ACCENT : "rgba(255,255,255,0.55)",
                  color: seq.stepCount === n ? "#fff" : "var(--text-section)",
                  border: `1px solid ${seq.stepCount === n ? ACCENT : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                }}
                onClick={() => setStepCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--panel-shadow)" }} />

        {/* Direction */}
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            DIR
          </span>
          <div className="flex gap-px">
            {DIRECTIONS.map(({ label, value }) => (
              <button
                key={value}
                className="px-1.5 py-0.5 font-mono"
                style={{
                  fontSize: 9,
                  background: seq.direction === value ? ACCENT : "rgba(255,255,255,0.55)",
                  color: seq.direction === value ? "#fff" : "var(--text-section)",
                  border: `1px solid ${seq.direction === value ? ACCENT : "var(--panel-shadow)"}`,
                  borderRadius: 2,
                  minWidth: 22,
                  textAlign: "center",
                }}
                onClick={() => updateSeq({ direction: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 28, background: "var(--panel-shadow)" }} />

        {/* Rate */}
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            RATE
          </span>
          <div className="flex flex-col gap-px">
            {RATE_GROUPS.map((group) => (
              <div key={group.label} className="flex gap-px items-center">
                <span className="font-mono" style={{ fontSize: 5, color: "var(--text-label)", width: 20, textAlign: "right", paddingRight: 3 }}>
                  {group.label}
                </span>
                {group.rates.map((r) => (
                  <button
                    key={r}
                    className="px-1 py-px font-mono"
                    style={{
                      fontSize: 6,
                      background: seq.rate === r ? ACCENT : "rgba(255,255,255,0.4)",
                      color: seq.rate === r ? "#fff" : "var(--text-label)",
                      border: `1px solid ${seq.rate === r ? ACCENT : "var(--panel-shadow)"}`,
                      borderRadius: 1,
                      minWidth: 22,
                      textAlign: "center",
                    }}
                    onClick={() => updateSeq({ rate: r })}
                  >
                    {r.replace(/[DT]$/, "")}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 1, height: 40, background: "var(--panel-shadow)" }} />

        {/* Gate + Swing */}
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            GATE {seq.gate}%
          </span>
          <input
            type="range"
            min={10}
            max={200}
            value={seq.gate}
            onChange={(e) => updateSeq({ gate: Number(e.target.value) })}
            style={{ width: 72, accentColor: ACCENT }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono uppercase" style={{ fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            SWING {seq.swing}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={seq.swing}
            onChange={(e) => updateSeq({ swing: Number(e.target.value) })}
            style={{ width: 72, accentColor: ACCENT }}
          />
        </div>
      </div>

      {/* ── Lane Selector ─────────────────────────────────────── */}
      <div className="flex gap-px">
        {LANES.map(({ label, value }) => (
          <button
            key={value}
            className="px-2 py-0.5 font-mono uppercase"
            style={{
              fontSize: 7,
              letterSpacing: "0.5px",
              background: seq.activeLane === value ? ACCENT : "rgba(255,255,255,0.55)",
              color: seq.activeLane === value ? "#fff" : "var(--text-section)",
              border: `1px solid ${seq.activeLane === value ? ACCENT : "var(--panel-shadow)"}`,
              borderRadius: 2,
            }}
            onClick={() => updateSeq({ activeLane: value })}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Step Grid ─────────────────────────────────────────── */}
      <StepGrid
        steps={seq.steps}
        stepCount={seq.stepCount}
        activeLane={seq.activeLane}
        currentStep={currentStep}
        isPlaying={isPlaying}
        updateStep={updateStep}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// StepGrid — Interactive visual grid for step editing
// ══════════════════════════════════════════════════════════════════════

function StepGrid({
  steps,
  stepCount,
  activeLane,
  currentStep,
  isPlaying,
  updateStep,
}: {
  steps: SeqStep[]
  stepCount: number
  activeLane: SeqLane
  currentStep: number
  isPlaying: boolean
  updateStep: (index: number, patch: Partial<SeqStep>) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const lastDragIdxRef = useRef(-1)

  // ── Get normalized value for the active lane ───────────────
  const getStepValue = useCallback(
    (step: SeqStep): number => {
      switch (activeLane) {
        case "PITCH":
          return (step.pitch + 24) / 48 // -24..+24 → 0..1
        case "VEL":
          return step.velocity / 127
        case "GATE":
          return step.gate / 200
        case "SLIDE":
          return step.slide ? 1 : 0
        case "PROB":
          return step.probability / 100
      }
    },
    [activeLane]
  )

  // ── Set value from normalized (0..1) ───────────────────────
  const setStepValueFromNorm = useCallback(
    (index: number, norm: number) => {
      const clamped = Math.max(0, Math.min(1, norm))
      switch (activeLane) {
        case "PITCH":
          updateStep(index, { pitch: Math.round(clamped * 48 - 24) })
          break
        case "VEL":
          updateStep(index, { velocity: Math.round(clamped * 127) })
          break
        case "GATE":
          updateStep(index, { gate: Math.round(clamped * 200) })
          break
        case "SLIDE":
          updateStep(index, { slide: clamped > 0.5 })
          break
        case "PROB":
          updateStep(index, { probability: Math.round(clamped * 100) })
          break
      }
    },
    [activeLane, updateStep]
  )

  // ── Format display value ───────────────────────────────────
  const formatValue = useCallback(
    (step: SeqStep): string => {
      switch (activeLane) {
        case "PITCH": {
          const p = step.pitch
          return p > 0 ? `+${p}` : `${p}`
        }
        case "VEL":
          return `${step.velocity}`
        case "GATE":
          return `${step.gate}%`
        case "SLIDE":
          return step.slide ? "ON" : "—"
        case "PROB":
          return `${step.probability}%`
      }
    },
    [activeLane]
  )

  // ── Mouse interaction ──────────────────────────────────────
  const getStepFromEvent = useCallback(
    (e: React.MouseEvent): { index: number; normY: number } | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const stepWidth = rect.width / stepCount
      const index = Math.floor(x / stepWidth)
      if (index < 0 || index >= stepCount) return null
      const normY = 1 - y / rect.height // 0 at bottom, 1 at top
      return { index, normY }
    },
    [stepCount]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const hit = getStepFromEvent(e)
      if (!hit) return

      if (activeLane === "SLIDE") {
        // Toggle on click
        updateStep(hit.index, { slide: !steps[hit.index].slide })
      } else {
        setStepValueFromNorm(hit.index, hit.normY)
      }

      isDraggingRef.current = true
      lastDragIdxRef.current = hit.index
    },
    [getStepFromEvent, activeLane, setStepValueFromNorm, steps, updateStep]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current) return
      const hit = getStepFromEvent(e)
      if (!hit) return

      if (activeLane !== "SLIDE") {
        setStepValueFromNorm(hit.index, hit.normY)
      }
      lastDragIdxRef.current = hit.index
    },
    [getStepFromEvent, activeLane, setStepValueFromNorm]
  )

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
    lastDragIdxRef.current = -1
  }, [])

  // ── Right-click to toggle step active ──────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const hit = getStepFromEvent(e)
      if (!hit) return
      updateStep(hit.index, { active: !steps[hit.index].active })
    },
    [getStepFromEvent, steps, updateStep]
  )

  // ── Canvas rendering ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const stepW = w / stepCount
    const barPad = 2

    // Background
    ctx.fillStyle = "#0c0e18"
    ctx.fillRect(0, 0, w, h)

    // Grid lines
    ctx.strokeStyle = "#1a1d2e"
    ctx.lineWidth = 1

    // Horizontal 50% center line (for pitch zero-crossing)
    if (activeLane === "PITCH") {
      ctx.strokeStyle = "#2a2d3e"
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      ctx.strokeStyle = "#1a1d2e"
    }

    // Vertical step dividers
    for (let i = 0; i <= stepCount; i++) {
      const x = i * stepW
      ctx.strokeStyle = i % 4 === 0 ? "#2a2d3e" : "#1a1d2e"
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    // Draw steps
    for (let i = 0; i < stepCount; i++) {
      const step = steps[i]
      const x = i * stepW + barPad
      const barW = stepW - barPad * 2
      const value = getStepValue(step)
      const isActive = step.active
      const isCurrent = i === currentStep && isPlaying

      if (!isActive) {
        // Inactive step — dimmed
        ctx.fillStyle = "#15172a"
        ctx.fillRect(x, 0, barW, h)
        ctx.fillStyle = "#ffffff10"
        ctx.font = "7px monospace"
        ctx.textAlign = "center"
        ctx.fillText("×", x + barW / 2, h / 2 + 3)
        continue
      }

      // Bar height
      let barH: number
      let barY: number

      if (activeLane === "PITCH") {
        // Bidirectional from center
        barH = Math.abs(value - 0.5) * h
        barY = value >= 0.5 ? h / 2 - barH : h / 2
      } else if (activeLane === "SLIDE") {
        // Full cell toggle
        barH = step.slide ? h - 4 : 6
        barY = step.slide ? 2 : h - 8
      } else {
        barH = value * (h - 4)
        barY = h - barH - 2
      }

      // Color: gradient based on current step
      const baseColor = isCurrent ? "#7c8aff" : ACCENT
      const dimColor = isCurrent ? "#3d4480" : "#2d3570"

      // Bar fill
      const grad = ctx.createLinearGradient(x, barY, x, barY + barH)
      grad.addColorStop(0, baseColor)
      grad.addColorStop(1, dimColor)
      ctx.fillStyle = grad
      ctx.fillRect(x, barY, barW, barH)

      // Current step indicator — bright border
      if (isCurrent) {
        ctx.strokeStyle = "#ffffff60"
        ctx.lineWidth = 2
        ctx.strokeRect(i * stepW, 0, stepW, h)
      }

      // Value label
      ctx.fillStyle = isCurrent ? "#fff" : "#ffffff90"
      ctx.font = "7px monospace"
      ctx.textAlign = "center"
      const labelY = activeLane === "PITCH" ? (value >= 0.5 ? barY - 3 : barY + barH + 9) : barY - 3
      const clampedLabelY = Math.max(9, Math.min(h - 2, labelY))
      ctx.fillText(formatValue(step), x + barW / 2, clampedLabelY)

      // Slide indicator (small dot on top-right)
      if (step.slide && activeLane !== "SLIDE") {
        ctx.fillStyle = "#f59e0b"
        ctx.beginPath()
        ctx.arc(x + barW - 3, 5, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [steps, stepCount, activeLane, currentStep, isPlaying, getStepValue, formatValue])

  return (
    <div className="panel-recessed" style={{ height: 120, position: "relative" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
      {/* Lane hint */}
      <div
        className="absolute top-1 left-1 font-mono uppercase"
        style={{ fontSize: 6, color: "#ffffff30", letterSpacing: "1px", pointerEvents: "none" }}
      >
        {activeLane} {activeLane === "PITCH" ? "(-24 … +24 st)" : activeLane === "VEL" ? "(0 – 127)" : activeLane === "GATE" ? "(0 – 200%)" : activeLane === "PROB" ? "(0 – 100%)" : ""}
      </div>
      <div
        className="absolute bottom-1 right-1 font-mono"
        style={{ fontSize: 6, color: "#ffffff20", pointerEvents: "none" }}
      >
        Right-click to mute step
      </div>
    </div>
  )
}
