"use client"

/**
 * WindControllerPanel — EWI / Wind Controller integration panel.
 * Design language: matches the rest of HyperSynth — light-gray hardware panel,
 * panel-raised / panel-recessed classes, ToggleButton selectors, monospaced labels.
 */

import { useEffect, useCallback, useState } from "react"
import { Knob } from "@/components/synth/Knob"
import { ToggleButton } from "@/components/synth/ToggleButton"
import { LED } from "@/components/synth/LED"
import {
  windSetEnabled,
  windSetParam,
  WIND_PARAM,
} from "@/lib/audio/AudioBridge"

// ── Types ─────────────────────────────────────────────────────────────────────

interface WindState {
  enabled: boolean
  breathThreshold: number    // 0–50
  responseTime: number       // 0–100
  breathCurve: number        // 0 linear | 1 convex | 2 concave | 3 s-curve
  routeAmp: number
  routeFilter: number
  routeDrive: number
  routeReso: number
  routeVibrato: number
  routePitch: number
  routeNoise: number
  portMode: number           // 0 off | 1 auto | 2 legato
  glideTime: number
  bendRange: number
  biteMode: number           // 0 off | 1 vibrato | 2 pitchbend
  vibratoRate: number
  vibratoDepth: number
  vibratoDelay: number
  vibratoShape: number       // 0 sine | 1 tri | 2 saw | 3 sq
  biteMin: number
  biteMax: number
  growlFreq: number
  growlChaos: number
  flutterFreq: number
}

const DEFAULT: WindState = {
  enabled: false,
  breathThreshold: 5,
  responseTime: 20,
  breathCurve: 1,
  routeAmp: 100,
  routeFilter: 60,
  routeDrive: 0,
  routeReso: 0,
  routeVibrato: 40,
  routePitch: 0,
  routeNoise: 0,
  portMode: 1,
  glideTime: 15,
  bendRange: 2,
  biteMode: 1,
  vibratoRate: 35,
  vibratoDepth: 50,
  vibratoDelay: 20,
  vibratoShape: 0,
  biteMin: 10,
  biteMax: 90,
  growlFreq: 40,
  growlChaos: 20,
  flutterFreq: 50,
}

interface Props {
  breathLevel?: number   // 0–1 live value from CC2
}

// ── Shared style helpers ───────────────────────────────────────────────────────

const SECTION_HEADER: React.CSSProperties = {
  background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
  borderBottom: "1px solid var(--panel-shadow)",
  padding: "2px 8px",
  fontSize: 7,
  letterSpacing: "2px",
  color: "var(--text-section)",
  fontFamily: "monospace",
  textTransform: "uppercase" as const,
  flexShrink: 0,
}

const KNOB_COL: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 3,
  padding: "4px 6px",
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div style={SECTION_HEADER}>{children}</div>
}

function HDivider() {
  return <div style={{ height: 1, background: "var(--panel-shadow)", margin: "0 8px" }} />
}

function VDivider() {
  return <div style={{ width: 1, background: "var(--panel-shadow)", margin: "4px 0", alignSelf: "stretch" }} />
}

/** Vertical breath meter — styled like the panel (light background, recessed) */
function BreathMeter({ level, threshold }: { level: number; threshold: number }) {
  const active = level > threshold / 100
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="panel-recessed"
        style={{
          position: "relative",
          width: 10,
          height: 68,
          overflow: "hidden",
          borderRadius: 2,
        }}
      >
        {/* Threshold line */}
        <div
          style={{
            position: "absolute", left: 0, right: 0,
            bottom: `${threshold * 2}%`,    // threshold is 0–50 → maps to 0–100%
            height: 1,
            background: "#f59e0b",
            zIndex: 2,
          }}
        />
        {/* Level bar */}
        <div
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            height: `${level * 100}%`,
            background: active ? "linear-gradient(0deg, #5865f2, #10b981)" : "var(--panel-shadow)",
            transition: "height 60ms linear",
          }}
        />
      </div>
      <span
        className="font-mono"
        style={{ fontSize: 7, color: "var(--text-display)", letterSpacing: "0.5px" }}
      >
        {String(Math.round(level * 127)).padStart(3, " ")}
      </span>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function WindControllerPanel({ breathLevel = 0 }: Props) {
  const [state, setState] = useState<WindState>(DEFAULT)

  const update = useCallback((patch: Partial<WindState>) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  // Sync to engine on mount
  useEffect(() => {
    windSetEnabled(state.enabled)
    windSetParam(WIND_PARAM.BREATH_THRESHOLD, state.breathThreshold / 100)
    windSetParam(WIND_PARAM.RESPONSE_TIME,    state.responseTime / 1000 + 0.001)
    windSetParam(WIND_PARAM.BREATH_CURVE,     state.breathCurve)
    windSetParam(WIND_PARAM.ROUTE_AMP,        state.routeAmp / 100)
    windSetParam(WIND_PARAM.ROUTE_FILTER,     state.routeFilter / 100)
    windSetParam(WIND_PARAM.ROUTE_DRIVE,      state.routeDrive / 100)
    windSetParam(WIND_PARAM.ROUTE_RESO,       state.routeReso / 100)
    windSetParam(WIND_PARAM.ROUTE_VIBRATO,    state.routeVibrato / 100)
    windSetParam(WIND_PARAM.ROUTE_PITCH,      state.routePitch / 100)
    windSetParam(WIND_PARAM.ROUTE_NOISE,      state.routeNoise / 100)
    windSetParam(WIND_PARAM.PORTAMENTO_MODE,  state.portMode)
    windSetParam(WIND_PARAM.GLIDE_TIME,       state.glideTime / 50)
    windSetParam(WIND_PARAM.BEND_RANGE,       state.bendRange)
    windSetParam(WIND_PARAM.BITE_MODE,        state.biteMode)
    windSetParam(WIND_PARAM.VIBRATO_RATE,     state.vibratoRate / 10)
    windSetParam(WIND_PARAM.VIBRATO_DEPTH,    state.vibratoDepth / 100)
    windSetParam(WIND_PARAM.VIBRATO_DELAY,    state.vibratoDelay / 50)
    windSetParam(WIND_PARAM.VIBRATO_SHAPE,    state.vibratoShape)
    windSetParam(WIND_PARAM.BITE_MIN,         state.biteMin / 127)
    windSetParam(WIND_PARAM.BITE_MAX,         state.biteMax / 127)
    windSetParam(WIND_PARAM.GROWL_FREQ,       state.growlFreq / 5)
    windSetParam(WIND_PARAM.GROWL_CHAOS,      state.growlChaos / 100)
    windSetParam(WIND_PARAM.FLUTTER_FREQ,     state.flutterFreq / 5)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = (paramId: number, value: number) => windSetParam(paramId, value)

  const ROUTE_ENTRIES: [string, number, number, string, keyof WindState][] = [
    ["AMP",    state.routeAmp,     WIND_PARAM.ROUTE_AMP,     "#10b981", "routeAmp"],
    ["FILTER", state.routeFilter,  WIND_PARAM.ROUTE_FILTER,  "#a855f7", "routeFilter"],
    ["DRIVE",  state.routeDrive,   WIND_PARAM.ROUTE_DRIVE,   "#ef4444", "routeDrive"],
    ["RESO",   state.routeReso,    WIND_PARAM.ROUTE_RESO,    "#f59e0b", "routeReso"],
    ["VIB",    state.routeVibrato, WIND_PARAM.ROUTE_VIBRATO, "#00d4ff", "routeVibrato"],
    ["PITCH",  state.routePitch,   WIND_PARAM.ROUTE_PITCH,   "#5865f2", "routePitch"],
    ["NOISE",  state.routeNoise,   WIND_PARAM.ROUTE_NOISE,   "#888",    "routeNoise"],
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-3"
        style={{
          height: 28,
          background: "linear-gradient(180deg, #e4e6eb 0%, #d8dce4 100%)",
          borderBottom: "1px solid var(--panel-shadow)",
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-mono uppercase"
            style={{ fontSize: 7, letterSpacing: "2px", color: "var(--text-section)" }}
          >
            ▼ WIND CONTROLLER — EWI / BREATH INPUT
          </span>
          <LED active={state.enabled && breathLevel > state.breathThreshold / 100} color="#10b981" size={7} />
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono" style={{ fontSize: 7, color: "var(--text-label)" }}>
            SIGNAL CHAIN:
          </span>
          <span className="font-mono" style={{ fontSize: 7, color: "#10b981" }}>INPUT</span>
          <span className="font-mono" style={{ fontSize: 7, color: "var(--panel-shadow)" }}>→</span>
          <span className="font-mono" style={{ fontSize: 7, color: "#a855f7" }}>AMP · FLT · PITCH</span>
          <span className="font-mono" style={{ fontSize: 7, color: "var(--panel-shadow)" }}>→</span>
          <span className="font-mono" style={{ fontSize: 7, color: "#f59e0b" }}>ENV</span>
          <span className="font-mono" style={{ fontSize: 7, color: "var(--panel-shadow)" }}>→</span>
          <span className="font-mono" style={{ fontSize: 7, color: "#ef4444" }}>FX</span>
          <div style={{ width: 12 }} />
          <ToggleButton
            label={state.enabled ? "EWI ON" : "EWI OFF"}
            active={state.enabled}
            accentColor="#10b981"
            onClick={() => {
              const next = !state.enabled
              update({ enabled: next })
              windSetEnabled(next)
            }}
          />
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>

        {/* ── BREATH ──────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: 90, flexShrink: 0 }}>
          <SectionHeader>BREATH</SectionHeader>
          <div className="flex flex-1 items-start gap-2 px-2 pt-2">
            <BreathMeter level={breathLevel} threshold={state.breathThreshold} />
            <div className="flex flex-col gap-2">
              <Knob
                value={state.breathThreshold}
                min={0} max={50} size="mini"
                label="THRESH"
                displayValue={`${state.breathThreshold}%`}
                accentColor="#f59e0b"
                onChange={v => { update({ breathThreshold: v }); s(WIND_PARAM.BREATH_THRESHOLD, v / 100) }}
              />
              <Knob
                value={state.responseTime}
                min={0} max={100} size="mini"
                label="SMOOTH"
                displayValue={`${state.responseTime}%`}
                onChange={v => { update({ responseTime: v }); s(WIND_PARAM.RESPONSE_TIME, v / 1000 + 0.001) }}
              />
            </div>
          </div>
          <div className="px-2 pb-2">
            <span className="font-mono block" style={{ fontSize: 7, letterSpacing: "1px", color: "var(--text-label)", marginBottom: 3 }}>CURVE</span>
            <div className="flex flex-wrap gap-px">
              {(["LIN", "CVEX", "CCAV", "S"] as const).map((label, i) => (
                <ToggleButton key={label} label={label} active={state.breathCurve === i}
                  onClick={() => { update({ breathCurve: i }); s(WIND_PARAM.BREATH_CURVE, i) }} />
              ))}
            </div>
          </div>
        </div>

        <VDivider />

        {/* ── ROUTING ─────────────────────────────────── */}
        <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
          <SectionHeader>BREATH → DESTINATION</SectionHeader>
          <div className="flex flex-wrap flex-1 content-start gap-1 p-2 overflow-y-auto">
            {ROUTE_ENTRIES.map(([label, val, paramId, color, key]) => (
              <div key={key} style={KNOB_COL}>
                <Knob
                  value={val}
                  min={0} max={100} size="mini"
                  label={label}
                  displayValue={`${val}%`}
                  accentColor={color}
                  onChange={v => { update({ [key]: v } as Partial<WindState>); s(paramId, v / 100) }}
                />
              </div>
            ))}
          </div>
        </div>

        <VDivider />

        {/* ── PORTAMENTO ──────────────────────────────── */}
        <div className="flex flex-col" style={{ width: 130, flexShrink: 0 }}>
          <SectionHeader>PORTAMENTO</SectionHeader>
          <div className="p-2 flex flex-col gap-2">
            <div className="flex gap-px">
              {(["OFF", "AUTO", "LEG"] as const).map((label, i) => (
                <ToggleButton key={label} label={label} active={state.portMode === i}
                  accentColor="#5865f2"
                  onClick={() => { update({ portMode: i }); s(WIND_PARAM.PORTAMENTO_MODE, i) }} />
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              <Knob
                value={state.glideTime}
                min={0} max={100} size="mini"
                label="GLIDE"
                displayValue={`${(state.glideTime / 50).toFixed(2)}s`}
                onChange={v => { update({ glideTime: v }); s(WIND_PARAM.GLIDE_TIME, v / 50) }}
              />
              <Knob
                value={state.bendRange}
                min={0} max={24} size="mini"
                label="BEND ±"
                displayValue={`${state.bendRange}st`}
                accentColor="#5865f2"
                onChange={v => { update({ bendRange: v }); s(WIND_PARAM.BEND_RANGE, v) }}
              />
            </div>
          </div>

          <HDivider />
          <SectionHeader>BITE</SectionHeader>
          <div className="p-2 flex flex-col gap-2">
            <div className="flex gap-px flex-wrap">
              {(["OFF", "VIB", "BEND"] as const).map((label, i) => (
                <ToggleButton key={label} label={label} active={state.biteMode === i}
                  accentColor="#00d4ff"
                  onClick={() => { update({ biteMode: i }); s(WIND_PARAM.BITE_MODE, i) }} />
              ))}
            </div>
            <div className="flex gap-2 justify-center">
              <Knob
                value={state.biteMin}
                min={0} max={127} size="mini"
                label="MIN"
                displayValue={`${state.biteMin}`}
                onChange={v => { update({ biteMin: v }); s(WIND_PARAM.BITE_MIN, v / 127) }}
              />
              <Knob
                value={state.biteMax}
                min={0} max={127} size="mini"
                label="MAX"
                displayValue={`${state.biteMax}`}
                onChange={v => { update({ biteMax: v }); s(WIND_PARAM.BITE_MAX, v / 127) }}
              />
            </div>
          </div>
        </div>

        <VDivider />

        {/* ── VIBRATO ─────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: 130, flexShrink: 0 }}>
          <SectionHeader>VIBRATO</SectionHeader>
          <div className="p-2 flex flex-col gap-2">
            <div className="flex gap-px">
              {(["SIN", "TRI", "SAW", "SQ"] as const).map((label, i) => (
                <ToggleButton key={label} label={label} active={state.vibratoShape === i}
                  accentColor="#00d4ff"
                  onClick={() => { update({ vibratoShape: i }); s(WIND_PARAM.VIBRATO_SHAPE, i) }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Knob
                value={state.vibratoRate}
                min={0} max={100} size="mini"
                label="RATE"
                displayValue={`${(state.vibratoRate / 10).toFixed(1)}Hz`}
                accentColor="#00d4ff"
                onChange={v => { update({ vibratoRate: v }); s(WIND_PARAM.VIBRATO_RATE, v / 10) }}
              />
              <Knob
                value={state.vibratoDepth}
                min={0} max={100} size="mini"
                label="DEPTH"
                displayValue={`${state.vibratoDepth}%`}
                accentColor="#00d4ff"
                onChange={v => { update({ vibratoDepth: v }); s(WIND_PARAM.VIBRATO_DEPTH, v / 100) }}
              />
              <Knob
                value={state.vibratoDelay}
                min={0} max={100} size="mini"
                label="DELAY"
                displayValue={`${(state.vibratoDelay / 50).toFixed(2)}s`}
                onChange={v => { update({ vibratoDelay: v }); s(WIND_PARAM.VIBRATO_DELAY, v / 50) }}
              />
            </div>
          </div>
        </div>

        <VDivider />

        {/* ── ARTICULATION ────────────────────────────── */}
        <div className="flex flex-col" style={{ width: 120, flexShrink: 0 }}>
          <SectionHeader>GROWL</SectionHeader>
          <div className="flex gap-2 justify-center p-2">
            <Knob
              value={state.growlFreq}
              min={0} max={100} size="mini"
              label="FREQ"
              displayValue={`${(state.growlFreq / 5).toFixed(1)}Hz`}
              accentColor="#ef4444"
              onChange={v => { update({ growlFreq: v }); s(WIND_PARAM.GROWL_FREQ, v / 5) }}
            />
            <Knob
              value={state.growlChaos}
              min={0} max={100} size="mini"
              label="CHAOS"
              displayValue={`${state.growlChaos}%`}
              accentColor="#ef4444"
              onChange={v => { update({ growlChaos: v }); s(WIND_PARAM.GROWL_CHAOS, v / 100) }}
            />
          </div>
          <HDivider />
          <SectionHeader>FLUTTER</SectionHeader>
          <div className="flex justify-center p-2">
            <Knob
              value={state.flutterFreq}
              min={0} max={100} size="mini"
              label="FREQ"
              displayValue={`${(state.flutterFreq / 5).toFixed(1)}Hz`}
              accentColor="#f59e0b"
              onChange={v => { update({ flutterFreq: v }); s(WIND_PARAM.FLUTTER_FREQ, v / 5) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
