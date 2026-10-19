"use client"

import { Knob } from "../Knob"
import { ToggleButton } from "../ToggleButton"
import { FilterDisplay } from "../FilterDisplay"
import { SectionPanel } from "../SectionPanel"
import { EnvelopeDisplay } from "../EnvelopeDisplay"

interface FilterPanelProps {
  state: {
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
  onStateChange: (newState: Partial<FilterPanelProps["state"]>) => void
}

const FILTER_TYPES = ["LADDER", "SVF", "MS20", "FORMANT", "COMB"]

export function FilterPanel({ state, onStateChange }: FilterPanelProps) {
  const accentColor = "#a855f7"

  const formatFreq = (v: number) => {
    const freq = 20 * Math.pow(1000, v / 100)
    if (freq >= 1000) return `${(freq / 1000).toFixed(1)}k`
    return `${Math.round(freq)}Hz`
  }

  const formatPercent = (v: number) => `${Math.round(v)}%`
  const formatMs = (v: number) => {
    const ms = v * 10
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.round(ms)}ms`
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1"
        style={{
          background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
          borderBottom: "1px solid var(--panel-shadow)",
        }}
      >
        <span
          className="font-mono uppercase"
          style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}
        >
          ▼ FILTER
        </span>
        <div className="flex items-center gap-2">
          <div className="flex gap-px">
            {FILTER_TYPES.map((type) => (
              <ToggleButton
                key={type}
                label={type}
                active={state.filterType === type}
                accentColor={accentColor}
                onClick={() => onStateChange({ filterType: type })}
              />
            ))}
          </div>
          <div className="flex gap-px ml-2">
            <ToggleButton
              label="12dB"
              active={state.poles === 2}
              accentColor={accentColor}
              onClick={() => onStateChange({ poles: 2 })}
            />
            <ToggleButton
              label="24dB"
              active={state.poles === 4}
              accentColor={accentColor}
              onClick={() => onStateChange({ poles: 4 })}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto" style={{ minHeight: 0 }}>
        {/* Filter Response Curve */}
        <FilterDisplay
          cutoff={state.cutoff}
          resonance={state.resonance}
          filterType={state.filterMode}
          color={accentColor}
          height={140}
          onCutoffChange={(v) => onStateChange({ cutoff: v })}
          onResonanceChange={(v) => onStateChange({ resonance: v })}
        />

        {/* Main Controls */}
        <div className="flex justify-between">
          <Knob
            value={state.cutoff}
            min={0}
            max={100}
            size="large"
            label="CUTOFF"
            displayValue={formatFreq(state.cutoff)}
            accentColor={accentColor}
            onChange={(v) => onStateChange({ cutoff: v })}
          />
          <Knob
            value={state.resonance}
            min={0}
            max={100}
            size="medium"
            label="RESO"
            displayValue={formatPercent(state.resonance)}
            accentColor={accentColor}
            onChange={(v) => onStateChange({ resonance: v })}
          />
          <Knob
            value={state.drive}
            min={0}
            max={100}
            size="medium"
            label="DRIVE"
            displayValue={formatPercent(state.drive)}
            accentColor={accentColor}
            onChange={(v) => onStateChange({ drive: v })}
          />
          <Knob
            value={state.envAmount}
            min={-100}
            max={100}
            size="medium"
            label="ENV AMT"
            displayValue={formatPercent(state.envAmount)}
            accentColor={accentColor}
            onChange={(v) => onStateChange({ envAmount: v })}
          />
          <Knob
            value={state.keytrack}
            min={0}
            max={100}
            size="small"
            label="KEY"
            displayValue={formatPercent(state.keytrack)}
            accentColor={accentColor}
            onChange={(v) => onStateChange({ keytrack: v })}
          />
        </div>

        {/* Bottom Row */}
        <div className="flex gap-3">
          {/* Filter Envelope */}
          <SectionPanel title="FILTER ENVELOPE" className="flex-1">
            <EnvelopeDisplay
              attack={state.envAttack}
              decay={state.envDecay}
              sustain={state.envSustain}
              release={state.envRelease}
              color={accentColor}
              height={60}
            />
            <div className="flex justify-between mt-2">
              <Knob
                value={state.envAttack}
                min={0}
                max={100}
                size="small"
                label="ATK"
                displayValue={formatMs(state.envAttack)}
                accentColor={accentColor}
                onChange={(v) => onStateChange({ envAttack: v })}
              />
              <Knob
                value={state.envDecay}
                min={0}
                max={100}
                size="small"
                label="DCY"
                displayValue={formatMs(state.envDecay)}
                accentColor={accentColor}
                onChange={(v) => onStateChange({ envDecay: v })}
              />
              <Knob
                value={state.envSustain}
                min={0}
                max={100}
                size="small"
                label="SUS"
                displayValue={formatPercent(state.envSustain)}
                accentColor={accentColor}
                onChange={(v) => onStateChange({ envSustain: v })}
              />
              <Knob
                value={state.envRelease}
                min={0}
                max={100}
                size="small"
                label="REL"
                displayValue={formatMs(state.envRelease)}
                accentColor={accentColor}
                onChange={(v) => onStateChange({ envRelease: v })}
              />
            </div>
          </SectionPanel>

          {/* Filter Routing */}
          <SectionPanel title="FILTER ROUTING" className="w-40">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[6px] uppercase" style={{ color: "var(--text-label)" }}>
                  MODE:
                </span>
                <div className="flex gap-px">
                  {(["LP", "HP", "BP", "NOTCH"] as const).map((mode) => (
                    <ToggleButton
                      key={mode}
                      label={mode}
                      active={state.filterMode === mode}
                      accentColor={accentColor}
                      onClick={() => onStateChange({ filterMode: mode })}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[6px] uppercase" style={{ color: "var(--text-label)" }}>
                  POLES:
                </span>
                <div className="flex gap-px">
                  <ToggleButton
                    label="2"
                    active={state.poles === 2}
                    accentColor={accentColor}
                    onClick={() => onStateChange({ poles: 2 })}
                  />
                  <ToggleButton
                    label="4"
                    active={state.poles === 4}
                    accentColor={accentColor}
                    onClick={() => onStateChange({ poles: 4 })}
                  />
                </div>
              </div>
              <div className="flex gap-1 mt-1">
                <button
                  className="flex items-center gap-1 px-2 py-1"
                  style={{
                    background: state.routing === "SERIAL" ? accentColor : "var(--display-bg)",
                    border: `1px solid ${state.routing === "SERIAL" ? accentColor : "var(--panel-shadow)"}`,
                  }}
                  onClick={() => onStateChange({ routing: "SERIAL" })}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: state.routing === "SERIAL" ? "#fff" : "var(--led-off)" }}
                  />
                  <span className="font-mono text-[6px] uppercase" style={{ color: state.routing === "SERIAL" ? "#fff" : "var(--text-label)" }}>
                    SERIAL
                  </span>
                </button>
                <button
                  className="flex items-center gap-1 px-2 py-1"
                  style={{
                    background: state.routing === "PARALLEL" ? accentColor : "var(--display-bg)",
                    border: `1px solid ${state.routing === "PARALLEL" ? accentColor : "var(--panel-shadow)"}`,
                  }}
                  onClick={() => onStateChange({ routing: "PARALLEL" })}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: state.routing === "PARALLEL" ? "#fff" : "var(--led-off)" }}
                  />
                  <span className="font-mono text-[6px] uppercase" style={{ color: state.routing === "PARALLEL" ? "#fff" : "var(--text-label)" }}>
                    PARALLEL
                  </span>
                </button>
              </div>
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  )
}
