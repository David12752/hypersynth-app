"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SeqArpPanel } from "@/components/synth/SeqArpPanel"

const KEYBOARD_MAP: Record<string, number> = {
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

const WHITE_PATTERN = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PATTERN = [1, 3, 6, 8, 10]

export default function KeyboardPage() {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const pressedNotesRef = useRef<Set<number>>(new Set())
  const [octave, setOctave] = useState(3)
  const [velocity, setVelocity] = useState(100)
  const [pressedNotes, setPressedNotes] = useState<number[]>([])
  const [bpm, setBpm] = useState(120)

  const baseMidiNote = octave * 12
  const whiteKeys = useMemo(
    () => Array.from({ length: 14 }, (_, index) => baseMidiNote + WHITE_PATTERN[index % 7] + Math.floor(index / 7) * 12),
    [baseMidiNote]
  )
  const blackKeys = useMemo(
    () => Array.from({ length: 10 }, (_, index) => baseMidiNote + BLACK_PATTERN[index % 5] + Math.floor(index / 5) * 12),
    [baseMidiNote]
  )

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      channelRef.current = new BroadcastChannel("hypersynth-midi")
    }

    const releaseAllNotes = () => {
      for (const note of pressedNotesRef.current) {
        channelRef.current?.postMessage({ type: "noteOff", note })
      }
      pressedNotesRef.current.clear()
      setPressedNotes([])
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const offset = KEYBOARD_MAP[event.key.toLowerCase()]
      if (offset === undefined || event.repeat) return
      const note = baseMidiNote + offset
      triggerNoteOn(note)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      const offset = KEYBOARD_MAP[event.key.toLowerCase()]
      if (offset === undefined) return
      const note = baseMidiNote + offset
      triggerNoteOff(note)
    }

    const triggerNoteOn = (note: number) => {
      if (pressedNotesRef.current.has(note)) return
      pressedNotesRef.current.add(note)
      setPressedNotes(Array.from(pressedNotesRef.current.values()))
      channelRef.current?.postMessage({ type: "noteOn", note, velocity: velocity / 100 })
    }

    const triggerNoteOff = (note: number) => {
      if (!pressedNotesRef.current.has(note)) return
      pressedNotesRef.current.delete(note)
      setPressedNotes(Array.from(pressedNotesRef.current.values()))
      channelRef.current?.postMessage({ type: "noteOff", note })
    }

    ;(window as any).__hypersynthKeyboardOn = triggerNoteOn
    ;(window as any).__hypersynthKeyboardOff = triggerNoteOff

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", releaseAllNotes)
    window.addEventListener("beforeunload", releaseAllNotes)

    return () => {
      releaseAllNotes()
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", releaseAllNotes)
      window.removeEventListener("beforeunload", releaseAllNotes)
      channelRef.current?.close()
      channelRef.current = null
    }
  }, [baseMidiNote, velocity])

  const triggerMouseNoteOn = (note: number) => {
    ;(window as any).__hypersynthKeyboardOn?.(note)
  }

  const triggerMouseNoteOff = (note: number) => {
    ;(window as any).__hypersynthKeyboardOff?.(note)
  }

  const seqArpNoteOn = useCallback((note: number, vel: number) => {
    channelRef.current?.postMessage({ type: "noteOn", note, velocity: vel })
  }, [])

  const seqArpNoteOff = useCallback((note: number) => {
    channelRef.current?.postMessage({ type: "noteOff", note })
  }, [])

  return (
    <div className="w-full min-h-screen flex items-center justify-center panel-texture" style={{ padding: 16 }}>
      <div className="panel-raised w-full max-w-6xl" style={{ borderRadius: 8, overflow: "hidden" }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: "linear-gradient(180deg, #dfe2e8 0%, #d0d4dc 100%)", borderBottom: "1px solid var(--panel-shadow)" }}
        >
          <div className="grid">
            <span className="font-mono" style={{ fontSize: 12, color: "#5865f2", letterSpacing: "2px" }}>
              HYPERSYNTH KEYBOARD
            </span>
            <span className="font-mono uppercase" style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "1.5px" }}>
              Focus this window and play with A W S E D F T G Y H U J K
            </span>
          </div>

          <div className="flex items-center gap-3">
            <ControlButton label="OCT -" onClick={() => setOctave((value) => Math.max(0, value - 1))} />
            <div className="panel-recessed px-3 py-1 font-mono" style={{ fontSize: 9, color: "var(--text-display)" }}>
              OCT {octave}
            </div>
            <ControlButton label="OCT +" onClick={() => setOctave((value) => Math.min(7, value + 1))} />
            <div className="panel-recessed px-3 py-1 font-mono" style={{ fontSize: 9, color: "var(--text-display)" }}>
              VEL {velocity}
            </div>
            <input
              type="range"
              min={1}
              max={127}
              value={velocity}
              onChange={(event) => setVelocity(Number(event.target.value))}
              style={{ width: 120 }}
            />
          </div>
        </div>

        <div className="px-4 py-4 grid gap-3">
          <div className="panel-recessed px-3 py-2 font-mono" style={{ fontSize: 8, color: "var(--text-display)" }}>
            Active notes: {pressedNotes.length === 0 ? "none" : pressedNotes.join(", ")}
          </div>

          <SeqArpPanel
            bpm={bpm}
            onBpmChange={setBpm}
            heldNotes={pressedNotes}
            onNoteOn={seqArpNoteOn}
            onNoteOff={seqArpNoteOff}
          />

          <div style={{ position: "relative", height: 220, userSelect: "none" }}>
            <div className="flex h-full">
              {whiteKeys.map((note) => (
                <button
                  key={note}
                  onMouseDown={() => triggerMouseNoteOn(note)}
                  onMouseUp={() => triggerMouseNoteOff(note)}
                  onMouseLeave={() => triggerMouseNoteOff(note)}
                  className="flex-1 flex flex-col justify-end items-center pb-3 font-mono"
                  style={{
                    border: "1px solid #a8acb4",
                    background: pressedNotes.includes(note) ? "linear-gradient(180deg, #cdd6ff 0%, #b2bfff 100%)" : "linear-gradient(180deg, #fafbff 0%, #e7ebf4 100%)",
                    color: "#1e2035",
                    fontSize: 9,
                  }}
                >
                  {note}
                </button>
              ))}
            </div>

            {blackKeys.map((note, index) => {
              const patternIndex = index % 5
              const octaveOffset = Math.floor(index / 5) * 7
              const leftMap = [0.72, 1.72, 3.72, 4.72, 5.72]
              const left = `calc(${((leftMap[patternIndex] + octaveOffset) / 14) * 100}% - 18px)`

              return (
                <button
                  key={note}
                  onMouseDown={() => triggerMouseNoteOn(note)}
                  onMouseUp={() => triggerMouseNoteOff(note)}
                  onMouseLeave={() => triggerMouseNoteOff(note)}
                  className="absolute top-0 flex items-end justify-center pb-3 font-mono"
                  style={{
                    left,
                    width: 36,
                    height: 140,
                    border: "1px solid #0b1024",
                    background: pressedNotes.includes(note) ? "linear-gradient(180deg, #4d5cc8 0%, #27316d 100%)" : "linear-gradient(180deg, #2b3154 0%, #0f1428 100%)",
                    color: "#eef2ff",
                    fontSize: 8,
                    zIndex: 2,
                  }}
                >
                  {note}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function ControlButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="px-3 py-1 font-mono uppercase"
      style={{
        fontSize: 8,
        letterSpacing: "1px",
        background: "rgba(255,255,255,0.55)",
        color: "var(--text-section)",
        border: "1px solid var(--panel-shadow)",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}