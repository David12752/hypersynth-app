/* MODULAR PAGE — VCV-style modular synth environment — HYPERSYNTH PRO EDITION
   25+ analog-style modules with rich visual displays, animated signal flow,
   spectrum analyzers, oscilloscopes, XY pads, waveshapers, and more.
   Design language: Arturia / u-he hardware aesthetic with brushed-metal panels. */
"use client"

import { useRef, useEffect, useState, useCallback, useMemo } from "react"

// ─── Core types ───────────────────────────────────────────────────────────────

type SigType = "audio" | "cv" | "gate" | "clock"
type PortDir = "in" | "out"
type ModuleType =
  | "MIDI" | "VCO" | "VCO2" | "WTOSC" | "NOISE" | "VCF" | "VCF_MS20" | "VCF_SEM"
  | "VCA" | "ENV" | "ENV_MULTI" | "LFO" | "LFO_COMPLEX"
  | "MIXER" | "OUTPUT" | "DELAY" | "REVERB" | "SCOPE" | "SPECTRUM"
  | "SEQ8" | "SEQ16" | "RAND" | "ATEN" | "CHORUS" | "PHASER" | "DISTORT"
  | "WAVEFOLD" | "RINGMOD" | "SLEW" | "QUANT" | "CLOCK" | "SWITCH"
  | "LOGIC" | "SH" | "XYPAD" | "VUMETER" | "STEREO_OUT" | "COMP"
  | "EQ3" | "BITCRUSH" | "GRAINCLOUD" | "FORMANT" | "VOCODER"

interface PortDef {
  id: string; label: string; sig: SigType; dir: PortDir
}
interface ParamDef {
  id: string; label: string; min: number; max: number; def: number; unit?: string
  snap?: boolean // snap to integer
}
interface ModuleDef {
  label: string; category: string; color: string
  w: number; h: number
  ports: PortDef[]; params: ParamDef[]
  description: string
  hasDisplay?: boolean  // has special visual display
}
interface ModuleInst {
  uid: string; type: ModuleType; x: number; y: number
  params: Record<string, number>
}
interface Wire {
  id: string
  srcMod: string; srcPort: string
  dstMod: string; dstPort: string
}

// ─── Module definitions ───────────────────────────────────────────────────────

const MOD_DEFS: Record<ModuleType, ModuleDef> = {
  // ── I/O ──
  MIDI: {
    label: "MIDI IN", category: "IO", color: "#10b981",
    w: 110, h: 280, description: "MIDI to CV converter — pitch, gate, velocity, CCs",
    ports: [
      { id: "PITCH", label: "V/OCT", sig: "cv",   dir: "out" },
      { id: "GATE",  label: "GATE",  sig: "gate", dir: "out" },
      { id: "VEL",   label: "VEL",   sig: "cv",   dir: "out" },
      { id: "MOD",   label: "MOD",   sig: "cv",   dir: "out" },
      { id: "BEND",  label: "BEND",  sig: "cv",   dir: "out" },
      { id: "AFT",   label: "AFT",   sig: "cv",   dir: "out" },
    ],
    params: [
      { id: "CHAN", label: "CH", min: 1, max: 16, def: 1, snap: true },
      { id: "GLIDE", label: "GLIDE", min: 0, max: 100, def: 0, unit: "%" },
    ],
    hasDisplay: true,
  },
  OUTPUT: {
    label: "OUTPUT", category: "IO", color: "#ef4444",
    w: 100, h: 280, description: "Mono audio output with level and clip indicator",
    ports: [
      { id: "L", label: "L IN", sig: "audio", dir: "in" },
      { id: "R", label: "R IN", sig: "audio", dir: "in" },
    ],
    params: [
      { id: "LEVEL", label: "LEVEL", min: 0, max: 100, def: 80, unit: "%" },
    ],
    hasDisplay: true,
  },
  STEREO_OUT: {
    label: "STEREO OUT", category: "IO", color: "#ef4444",
    w: 140, h: 280, description: "Stereo master output with VU meters",
    ports: [
      { id: "L", label: "L", sig: "audio", dir: "in" },
      { id: "R", label: "R", sig: "audio", dir: "in" },
      { id: "SC", label: "SC", sig: "audio", dir: "in" },
    ],
    params: [
      { id: "LEVEL", label: "LEVEL", min: 0, max: 100, def: 80, unit: "%" },
      { id: "PAN", label: "PAN", min: -100, max: 100, def: 0 },
      { id: "WIDTH", label: "WIDTH", min: 0, max: 200, def: 100, unit: "%" },
    ],
    hasDisplay: true,
  },

  // ── SOUND SOURCES ──
  VCO: {
    label: "VCO", category: "SOUND", color: "#5865f2",
    w: 140, h: 280, description: "Classic analog VCO — saw, square, tri, sine with drift",
    ports: [
      { id: "PITCH", label: "V/OCT", sig: "cv",    dir: "in" },
      { id: "PWM",   label: "PWM",   sig: "cv",    dir: "in" },
      { id: "FM",    label: "FM",    sig: "cv",    dir: "in" },
      { id: "SYNC",  label: "SYNC",  sig: "gate",  dir: "in" },
      { id: "SAW",   label: "SAW",   sig: "audio", dir: "out" },
      { id: "SQR",   label: "SQR",   sig: "audio", dir: "out" },
      { id: "TRI",   label: "TRI",   sig: "audio", dir: "out" },
      { id: "SIN",   label: "SIN",   sig: "audio", dir: "out" },
    ],
    params: [
      { id: "OCT",   label: "OCT",   min: -4, max: 4,   def: 0,  snap: true },
      { id: "TUNE",  label: "TUNE",  min: -12, max: 12, def: 0,  unit: "st" },
      { id: "FINE",  label: "FINE",  min: -50, max: 50, def: 0,  unit: "ct" },
      { id: "WIDTH", label: "PW",    min: 5,  max: 95,  def: 50, unit: "%" },
      { id: "DRIFT", label: "DRIFT", min: 0,  max: 100, def: 8,  unit: "%" },
      { id: "FM_AMT",label: "FM",    min: 0,  max: 100, def: 0,  unit: "%" },
    ],
    hasDisplay: true,
  },
  VCO2: {
    label: "VCO-2", category: "SOUND", color: "#6366f1",
    w: 140, h: 280, description: "Super-saw VCO with unison detuning and stereo spread",
    ports: [
      { id: "PITCH", label: "V/OCT", sig: "cv",    dir: "in" },
      { id: "DET",   label: "DET",   sig: "cv",    dir: "in" },
      { id: "MIX",   label: "MIX",   sig: "cv",    dir: "in" },
      { id: "L",     label: "L",     sig: "audio", dir: "out" },
      { id: "R",     label: "R",     sig: "audio", dir: "out" },
      { id: "SUB",   label: "SUB",   sig: "audio", dir: "out" },
    ],
    params: [
      { id: "OCT",     label: "OCT",   min: -4, max: 4,   def: 0, snap: true },
      { id: "VOICES",  label: "VOICE", min: 1,  max: 7,   def: 5, snap: true },
      { id: "DETUNE",  label: "DET",   min: 0,  max: 100, def: 30, unit: "ct" },
      { id: "SPREAD",  label: "SPR",   min: 0,  max: 100, def: 70, unit: "%" },
      { id: "MIX",     label: "MIX",   min: 0,  max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  WTOSC: {
    label: "WAVETABLE", category: "SOUND", color: "#8b5cf6",
    w: 160, h: 280, description: "Wavetable oscillator with morphable position",
    ports: [
      { id: "PITCH", label: "V/OCT", sig: "cv",    dir: "in" },
      { id: "POS",   label: "POS",   sig: "cv",    dir: "in" },
      { id: "FM",    label: "FM",    sig: "cv",    dir: "in" },
      { id: "OUT",   label: "OUT",   sig: "audio", dir: "out" },
      { id: "SUB",   label: "SUB",   sig: "audio", dir: "out" },
    ],
    params: [
      { id: "OCT",   label: "OCT",   min: -4, max: 4,   def: 0, snap: true },
      { id: "POS",   label: "POS",   min: 0,  max: 100, def: 0, unit: "%" },
      { id: "WARP",  label: "WARP",  min: 0,  max: 100, def: 0, unit: "%" },
      { id: "TABLE", label: "TABLE", min: 0,  max: 4,   def: 0, snap: true },
    ],
    hasDisplay: true,
  },
  NOISE: {
    label: "NOISE", category: "SOUND", color: "#94a3b8",
    w: 100, h: 280, description: "Multi-color noise source — white, pink, red, blue, digital",
    ports: [
      { id: "WHITE", label: "WHT", sig: "audio", dir: "out" },
      { id: "PINK",  label: "PNK", sig: "audio", dir: "out" },
      { id: "RED",   label: "RED", sig: "audio", dir: "out" },
      { id: "CRACKLE",label:"CRK", sig: "audio", dir: "out" },
    ],
    params: [
      { id: "LEVEL", label: "LEVEL", min: 0, max: 100, def: 80, unit: "%" },
      { id: "COLOR", label: "COLOR", min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },

  // ── FILTERS ──
  VCF: {
    label: "VCF-24dB", category: "FILTER", color: "#a855f7",
    w: 140, h: 280, description: "Classic Moog-style 24dB ladder filter with self‑osc",
    ports: [
      { id: "IN",     label: "IN",    sig: "audio", dir: "in" },
      { id: "CUTOFF", label: "CUT",   sig: "cv",    dir: "in" },
      { id: "RESO",   label: "RES",   sig: "cv",    dir: "in" },
      { id: "ENV",    label: "ENV",   sig: "cv",    dir: "in" },
      { id: "LP",     label: "LP",    sig: "audio", dir: "out" },
      { id: "HP",     label: "HP",    sig: "audio", dir: "out" },
      { id: "BP",     label: "BP",    sig: "audio", dir: "out" },
    ],
    params: [
      { id: "CUTOFF",  label: "CUTOFF", min: 0, max: 100, def: 70, unit: "%" },
      { id: "RESO",    label: "RESO",   min: 0, max: 100, def: 20, unit: "%" },
      { id: "DRIVE",   label: "DRIVE",  min: 0, max: 100, def: 0,  unit: "%" },
      { id: "ENV_AMT", label: "ENV",    min: -100, max: 100, def: 50, unit: "%" },
      { id: "KEY",     label: "KEY",    min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  VCF_MS20: {
    label: "MS-20 VCF", category: "FILTER", color: "#d946ef",
    w: 130, h: 280, description: "Korg MS-20 style dual HP/LP filter — screaming resonance",
    ports: [
      { id: "IN",     label: "IN",    sig: "audio", dir: "in" },
      { id: "CUT_HP", label: "HP↑",   sig: "cv",    dir: "in" },
      { id: "CUT_LP", label: "LP↑",   sig: "cv",    dir: "in" },
      { id: "OUT",    label: "OUT",   sig: "audio", dir: "out" },
    ],
    params: [
      { id: "HP_CUT", label: "HP CUT", min: 0, max: 100, def: 0,  unit: "%" },
      { id: "LP_CUT", label: "LP CUT", min: 0, max: 100, def: 80, unit: "%" },
      { id: "HP_RES", label: "HP Q",   min: 0, max: 100, def: 10, unit: "%" },
      { id: "LP_RES", label: "LP Q",   min: 0, max: 100, def: 20, unit: "%" },
    ],
    hasDisplay: true,
  },
  VCF_SEM: {
    label: "SEM VCF", category: "FILTER", color: "#c084fc",
    w: 130, h: 280, description: "Oberheim SEM-style state-variable filter — 12dB multimode",
    ports: [
      { id: "IN",     label: "IN",    sig: "audio", dir: "in" },
      { id: "CUTOFF", label: "CUT",   sig: "cv",    dir: "in" },
      { id: "OUT",    label: "OUT",   sig: "audio", dir: "out" },
    ],
    params: [
      { id: "CUTOFF",  label: "CUTOFF", min: 0, max: 100, def: 65, unit: "%" },
      { id: "RESO",    label: "RESO",   min: 0, max: 100, def: 25, unit: "%" },
      { id: "MODE",    label: "MODE",   min: 0, max: 100, def: 0,  unit: "%" },
    ],
    hasDisplay: true,
  },

  // ── AMPLIFIERS / DYNAMICS ──
  VCA: {
    label: "VCA", category: "AMP", color: "#f59e0b",
    w: 100, h: 280, description: "Dual-input voltage controlled amplifier",
    ports: [
      { id: "IN",    label: "IN",    sig: "audio", dir: "in" },
      { id: "LEVEL", label: "LVL",   sig: "cv",    dir: "in" },
      { id: "OUT",   label: "OUT",   sig: "audio", dir: "out" },
    ],
    params: [
      { id: "LEVEL",  label: "LEVEL", min: 0, max: 100, def: 100, unit: "%" },
      { id: "RESP",   label: "RESP",  min: 0, max: 100, def: 50, unit: "%" },
    ],
  },
  COMP: {
    label: "COMPRESSOR", category: "AMP", color: "#eab308",
    w: 140, h: 280, description: "Dynamics compressor / limiter with sidechain",
    ports: [
      { id: "IN",  label: "IN",  sig: "audio", dir: "in" },
      { id: "SC",  label: "SC",  sig: "audio", dir: "in" },
      { id: "OUT", label: "OUT", sig: "audio", dir: "out" },
      { id: "ENV", label: "ENV", sig: "cv",    dir: "out" },
    ],
    params: [
      { id: "THRESH", label: "THRESH", min: -60, max: 0,   def: -20, unit: "dB" },
      { id: "RATIO",  label: "RATIO",  min: 1,   max: 20,  def: 4 },
      { id: "ATTACK", label: "ATK",    min: 0,   max: 100, def: 10, unit: "ms" },
      { id: "REL",    label: "REL",    min: 0,   max: 100, def: 40, unit: "ms" },
      { id: "GAIN",   label: "GAIN",   min: 0,   max: 30,  def: 6,  unit: "dB" },
    ],
    hasDisplay: true,
  },

  // ── MODULATORS ──
  ENV: {
    label: "ADSR ENV", category: "MODULATE", color: "#fb923c",
    w: 130, h: 280, description: "Classic ADSR envelope with curve shapes",
    ports: [
      { id: "GATE",  label: "GATE",  sig: "gate", dir: "in" },
      { id: "TRIG",  label: "TRIG",  sig: "gate", dir: "in" },
      { id: "OUT",   label: "OUT",   sig: "cv",   dir: "out" },
      { id: "INV",   label: "INV",   sig: "cv",   dir: "out" },
      { id: "EOC",   label: "EOC",   sig: "gate", dir: "out" },
    ],
    params: [
      { id: "A", label: "A", min: 0, max: 100, def: 2,  unit: "ms" },
      { id: "D", label: "D", min: 0, max: 100, def: 30, unit: "ms" },
      { id: "S", label: "S", min: 0, max: 100, def: 70, unit: "%" },
      { id: "R", label: "R", min: 0, max: 100, def: 20, unit: "ms" },
      { id: "CURVE", label: "CURVE", min: -100, max: 100, def: 0 },
    ],
    hasDisplay: true,
  },
  ENV_MULTI: {
    label: "MULTI ENV", category: "MODULATE", color: "#f97316",
    w: 160, h: 280, description: "Multi-stage envelope with 6 segments, loopable",
    ports: [
      { id: "GATE",  label: "GATE", sig: "gate", dir: "in" },
      { id: "TRIG",  label: "TRIG", sig: "gate", dir: "in" },
      { id: "OUT",   label: "OUT",  sig: "cv",   dir: "out" },
      { id: "EOC",   label: "EOC",  sig: "gate", dir: "out" },
    ],
    params: [
      { id: "T1", label: "T1", min: 0, max: 100, def: 5 },
      { id: "L1", label: "L1", min: 0, max: 100, def: 100 },
      { id: "T2", label: "T2", min: 0, max: 100, def: 15 },
      { id: "L2", label: "L2", min: 0, max: 100, def: 70 },
      { id: "T3", label: "T3", min: 0, max: 100, def: 40 },
      { id: "L3", label: "L3", min: 0, max: 100, def: 70 },
      { id: "T4", label: "T4", min: 0, max: 100, def: 30 },
      { id: "LOOP", label: "LOOP", min: 0, max: 1, def: 0, snap: true },
    ],
    hasDisplay: true,
  },
  LFO: {
    label: "LFO", category: "MODULATE", color: "#06b6d4",
    w: 130, h: 280, description: "Low frequency oscillator — sine / tri / saw / sqr / S&H",
    ports: [
      { id: "RATE",  label: "RATE",  sig: "cv",   dir: "in" },
      { id: "RST",   label: "RST",   sig: "gate", dir: "in" },
      { id: "SIN",   label: "SIN",   sig: "cv",   dir: "out" },
      { id: "TRI",   label: "TRI",   sig: "cv",   dir: "out" },
      { id: "SAW",   label: "SAW",   sig: "cv",   dir: "out" },
      { id: "SQR",   label: "SQR",   sig: "cv",   dir: "out" },
    ],
    params: [
      { id: "RATE",  label: "RATE",  min: 0, max: 100, def: 30, unit: "Hz" },
      { id: "DEPTH", label: "DEPTH", min: 0, max: 100, def: 80, unit: "%" },
      { id: "PHASE", label: "PHASE", min: 0, max: 360, def: 0,  unit: "°" },
    ],
    hasDisplay: true,
  },
  LFO_COMPLEX: {
    label: "COMPLEX LFO", category: "MODULATE", color: "#0891b2",
    w: 160, h: 280, description: "Dual-oscillator LFO with AM/FM cross-modulation",
    ports: [
      { id: "RATE",  label: "RATE", sig: "cv",   dir: "in" },
      { id: "RST",   label: "RST",  sig: "gate", dir: "in" },
      { id: "A",     label: "A",    sig: "cv",   dir: "out" },
      { id: "B",     label: "B",    sig: "cv",   dir: "out" },
      { id: "AM",    label: "A×B",  sig: "cv",   dir: "out" },
    ],
    params: [
      { id: "RATE_A", label: "RATE A", min: 0, max: 100, def: 25 },
      { id: "RATE_B", label: "RATE B", min: 0, max: 100, def: 40 },
      { id: "FM",     label: "FM",     min: 0, max: 100, def: 0,  unit: "%" },
      { id: "SHAPE",  label: "SHAPE",  min: 0, max: 100, def: 0,  unit: "%" },
    ],
    hasDisplay: true,
  },

  // ── SEQUENCERS ──
  SEQ8: {
    label: "SEQ-8", category: "SEQUENCER", color: "#fbbf24",
    w: 240, h: 280, description: "8-step CV/gate sequencer with glide per step",
    ports: [
      { id: "CLK",  label: "CLK",  sig: "clock", dir: "in" },
      { id: "RST",  label: "RST",  sig: "gate",  dir: "in" },
      { id: "CV",   label: "CV",   sig: "cv",    dir: "out" },
      { id: "GATE", label: "GATE", sig: "gate",  dir: "out" },
      { id: "EOC",  label: "EOC",  sig: "gate",  dir: "out" },
    ],
    params: [
      { id: "STEPS", label: "STEPS", min: 1, max: 8, def: 8, snap: true },
      { id: "S1", label: "1", min: 0, max: 100, def: 60 },
      { id: "S2", label: "2", min: 0, max: 100, def: 70 },
      { id: "S3", label: "3", min: 0, max: 100, def: 40 },
      { id: "S4", label: "4", min: 0, max: 100, def: 80 },
      { id: "S5", label: "5", min: 0, max: 100, def: 30 },
      { id: "S6", label: "6", min: 0, max: 100, def: 55 },
      { id: "S7", label: "7", min: 0, max: 100, def: 45 },
      { id: "S8", label: "8", min: 0, max: 100, def: 65 },
    ],
    hasDisplay: true,
  },
  SEQ16: {
    label: "SEQ-16", category: "SEQUENCER", color: "#f59e0b",
    w: 340, h: 280, description: "16-step sequencer with per-step gate length & accent",
    ports: [
      { id: "CLK",  label: "CLK",  sig: "clock", dir: "in" },
      { id: "RST",  label: "RST",  sig: "gate",  dir: "in" },
      { id: "CV",   label: "CV",   sig: "cv",    dir: "out" },
      { id: "GATE", label: "GATE", sig: "gate",  dir: "out" },
      { id: "ACC",  label: "ACC",  sig: "gate",  dir: "out" },
      { id: "EOC",  label: "EOC",  sig: "gate",  dir: "out" },
    ],
    params: [
      { id: "STEPS", label: "STEPS", min: 1, max: 16, def: 16, snap: true },
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `S${i + 1}`, label: `${i + 1}`, min: 0, max: 100, def: Math.round(30 + Math.random() * 50),
      })),
    ],
    hasDisplay: true,
  },
  CLOCK: {
    label: "CLOCK", category: "SEQUENCER", color: "#facc15",
    w: 110, h: 280, description: "Master clock with tempo, swing, divisions",
    ports: [
      { id: "EXT",   label: "EXT",  sig: "clock", dir: "in" },
      { id: "CLK",   label: "CLK",  sig: "clock", dir: "out" },
      { id: "DIV2",  label: "/2",   sig: "clock", dir: "out" },
      { id: "DIV4",  label: "/4",   sig: "clock", dir: "out" },
      { id: "DIV8",  label: "/8",   sig: "clock", dir: "out" },
      { id: "RST",   label: "RST",  sig: "gate",  dir: "out" },
    ],
    params: [
      { id: "BPM",   label: "BPM",   min: 20,  max: 300, def: 120, snap: true },
      { id: "SWING", label: "SWING", min: 0,   max: 100, def: 0, unit: "%" },
      { id: "RUN",   label: "RUN",   min: 0,   max: 1,   def: 1, snap: true },
    ],
    hasDisplay: true,
  },

  // ── EFFECTS ──
  DELAY: {
    label: "DELAY", category: "FX", color: "#f472b6",
    w: 140, h: 280, description: "Stereo ping-pong delay with tape saturation",
    ports: [
      { id: "IN",   label: "IN",   sig: "audio", dir: "in" },
      { id: "TIME", label: "TIME", sig: "cv",    dir: "in" },
      { id: "FBK",  label: "FBK",  sig: "cv",    dir: "in" },
      { id: "L",    label: "L",    sig: "audio", dir: "out" },
      { id: "R",    label: "R",    sig: "audio", dir: "out" },
    ],
    params: [
      { id: "TIME", label: "TIME", min: 0, max: 100, def: 40, unit: "%" },
      { id: "FBK",  label: "FBK",  min: 0, max: 100, def: 40, unit: "%" },
      { id: "MIX",  label: "MIX",  min: 0, max: 100, def: 30, unit: "%" },
      { id: "TONE", label: "TONE", min: 0, max: 100, def: 60, unit: "%" },
      { id: "PING", label: "PING", min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  REVERB: {
    label: "REVERB", category: "FX", color: "#22d3ee",
    w: 140, h: 280, description: "Algorithmic plate / hall reverb with shimmer",
    ports: [
      { id: "IN",   label: "IN",   sig: "audio", dir: "in" },
      { id: "SIZE", label: "SIZE", sig: "cv",    dir: "in" },
      { id: "L",    label: "L",    sig: "audio", dir: "out" },
      { id: "R",    label: "R",    sig: "audio", dir: "out" },
    ],
    params: [
      { id: "SIZE",    label: "SIZE",    min: 0, max: 100, def: 60, unit: "%" },
      { id: "DAMP",    label: "DAMP",    min: 0, max: 100, def: 40, unit: "%" },
      { id: "PREDLY",  label: "PRE",     min: 0, max: 100, def: 15, unit: "ms" },
      { id: "SHIMMER", label: "SHIMMER", min: 0, max: 100, def: 0,  unit: "%" },
      { id: "MIX",     label: "MIX",     min: 0, max: 100, def: 30, unit: "%" },
    ],
    hasDisplay: true,
  },
  CHORUS: {
    label: "CHORUS", category: "FX", color: "#c084fc",
    w: 130, h: 280, description: "Stereo chorus / ensemble with BBD-style modulation",
    ports: [
      { id: "IN",   label: "IN",   sig: "audio", dir: "in" },
      { id: "RATE", label: "RATE", sig: "cv",    dir: "in" },
      { id: "L",    label: "L",    sig: "audio", dir: "out" },
      { id: "R",    label: "R",    sig: "audio", dir: "out" },
    ],
    params: [
      { id: "RATE",  label: "RATE",  min: 0, max: 100, def: 30, unit: "%" },
      { id: "DEPTH", label: "DEPTH", min: 0, max: 100, def: 50, unit: "%" },
      { id: "VOICES",label: "VOICE", min: 1, max: 4,   def: 2, snap: true },
      { id: "MIX",   label: "MIX",   min: 0, max: 100, def: 50, unit: "%" },
    ],
  },
  PHASER: {
    label: "PHASER", category: "FX", color: "#a78bfa",
    w: 130, h: 280, description: "12-stage phaser with feedback and sync",
    ports: [
      { id: "IN",   label: "IN",   sig: "audio", dir: "in" },
      { id: "RATE", label: "RATE", sig: "cv",    dir: "in" },
      { id: "OUT",  label: "OUT",  sig: "audio", dir: "out" },
    ],
    params: [
      { id: "RATE",   label: "RATE",   min: 0, max: 100, def: 35, unit: "%" },
      { id: "DEPTH",  label: "DEPTH",  min: 0, max: 100, def: 60, unit: "%" },
      { id: "FBK",    label: "FBK",    min: 0, max: 100, def: 50, unit: "%" },
      { id: "STAGES", label: "STG",    min: 2, max: 12,  def: 6,  snap: true },
      { id: "MIX",    label: "MIX",    min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  DISTORT: {
    label: "DISTORTION", category: "FX", color: "#ef4444",
    w: 130, h: 280, description: "Multi-algorithm distortion — tube, tape, digital, fuzz",
    ports: [
      { id: "IN",  label: "IN",  sig: "audio", dir: "in" },
      { id: "DRV", label: "DRV", sig: "cv",    dir: "in" },
      { id: "OUT", label: "OUT", sig: "audio", dir: "out" },
    ],
    params: [
      { id: "DRIVE", label: "DRIVE", min: 0, max: 100, def: 40, unit: "%" },
      { id: "TONE",  label: "TONE",  min: 0, max: 100, def: 60, unit: "%" },
      { id: "ALGO",  label: "ALGO",  min: 0, max: 3,   def: 0, snap: true },
      { id: "MIX",   label: "MIX",   min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  EQ3: {
    label: "EQ-3", category: "FX", color: "#14b8a6",
    w: 130, h: 280, description: "3-band parametric EQ with frequency display",
    ports: [
      { id: "IN",  label: "IN",  sig: "audio", dir: "in" },
      { id: "OUT", label: "OUT", sig: "audio", dir: "out" },
    ],
    params: [
      { id: "LOW",  label: "LOW",  min: -15, max: 15, def: 0, unit: "dB" },
      { id: "MID",  label: "MID",  min: -15, max: 15, def: 0, unit: "dB" },
      { id: "HIGH", label: "HIGH", min: -15, max: 15, def: 0, unit: "dB" },
      { id: "MID_F",label: "FREQ", min: 0,   max: 100,def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  BITCRUSH: {
    label: "BITCRUSH", category: "FX", color: "#f43f5e",
    w: 120, h: 280, description: "Bit depth reducer + sample rate destroyer",
    ports: [
      { id: "IN",  label: "IN",  sig: "audio", dir: "in" },
      { id: "OUT", label: "OUT", sig: "audio", dir: "out" },
    ],
    params: [
      { id: "BITS",   label: "BITS",   min: 1,  max: 16, def: 12, snap: true },
      { id: "RATE",   label: "RATE",   min: 0,  max: 100,def: 100, unit: "%" },
      { id: "MIX",    label: "MIX",    min: 0,  max: 100,def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },

  // ── WAVESHAPING ──
  WAVEFOLD: {
    label: "WAVEFOLDER", category: "WAVESHAPE", color: "#e11d48",
    w: 140, h: 280, description: "Buchla-inspired wavefolding distortion",
    ports: [
      { id: "IN",    label: "IN",   sig: "audio", dir: "in" },
      { id: "FOLD",  label: "FOLD", sig: "cv",    dir: "in" },
      { id: "OUT",   label: "OUT",  sig: "audio", dir: "out" },
    ],
    params: [
      { id: "FOLD",   label: "FOLD",   min: 0, max: 100, def: 50, unit: "%" },
      { id: "SYMM",   label: "SYMM",   min: -100, max: 100, def: 0 },
      { id: "OFFSET", label: "OFFSET", min: -100, max: 100, def: 0 },
    ],
    hasDisplay: true,
  },
  RINGMOD: {
    label: "RING MOD", category: "WAVESHAPE", color: "#be123c",
    w: 120, h: 280, description: "Ring modulator / balanced modulator",
    ports: [
      { id: "CAR",  label: "CAR", sig: "audio", dir: "in" },
      { id: "MOD",  label: "MOD", sig: "audio", dir: "in" },
      { id: "OUT",  label: "OUT", sig: "audio", dir: "out" },
    ],
    params: [
      { id: "MIX",  label: "MIX",  min: 0, max: 100, def: 50, unit: "%" },
      { id: "FREQ", label: "FREQ", min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },

  // ── UTILITY ──
  MIXER: {
    label: "MIXER-4", category: "UTILITY", color: "#e2e8f0",
    w: 160, h: 280, description: "4-channel mixer with panning and mute per channel",
    ports: [
      { id: "IN1", label: "1", sig: "audio", dir: "in" },
      { id: "IN2", label: "2", sig: "audio", dir: "in" },
      { id: "IN3", label: "3", sig: "audio", dir: "in" },
      { id: "IN4", label: "4", sig: "audio", dir: "in" },
      { id: "L",   label: "L", sig: "audio", dir: "out" },
      { id: "R",   label: "R", sig: "audio", dir: "out" },
    ],
    params: [
      { id: "L1", label: "CH1", min: 0, max: 100, def: 80, unit: "%" },
      { id: "L2", label: "CH2", min: 0, max: 100, def: 80, unit: "%" },
      { id: "L3", label: "CH3", min: 0, max: 100, def: 80, unit: "%" },
      { id: "L4", label: "CH4", min: 0, max: 100, def: 80, unit: "%" },
      { id: "P1", label: "PAN1", min: -100, max: 100, def: 0 },
      { id: "P2", label: "PAN2", min: -100, max: 100, def: 0 },
    ],
    hasDisplay: true,
  },
  ATEN: {
    label: "ATTEN", category: "UTILITY", color: "#94a3b8",
    w: 110, h: 280, description: "4-channel attenuverter with offset",
    ports: [
      { id: "IN1", label: "1", sig: "cv", dir: "in" },
      { id: "IN2", label: "2", sig: "cv", dir: "in" },
      { id: "IN3", label: "3", sig: "cv", dir: "in" },
      { id: "IN4", label: "4", sig: "cv", dir: "in" },
      { id: "O1",  label: "1", sig: "cv", dir: "out" },
      { id: "O2",  label: "2", sig: "cv", dir: "out" },
      { id: "O3",  label: "3", sig: "cv", dir: "out" },
      { id: "O4",  label: "4", sig: "cv", dir: "out" },
    ],
    params: [
      { id: "A1", label: "1", min: -100, max: 100, def: 100 },
      { id: "A2", label: "2", min: -100, max: 100, def: 100 },
      { id: "A3", label: "3", min: -100, max: 100, def: 100 },
      { id: "A4", label: "4", min: -100, max: 100, def: 100 },
    ],
  },
  SLEW: {
    label: "SLEW", category: "UTILITY", color: "#64748b",
    w: 100, h: 280, description: "Slew limiter / portamento — smooth CV transitions",
    ports: [
      { id: "IN",  label: "IN",  sig: "cv", dir: "in" },
      { id: "OUT", label: "OUT", sig: "cv", dir: "out" },
    ],
    params: [
      { id: "RISE", label: "RISE", min: 0, max: 100, def: 30, unit: "%" },
      { id: "FALL", label: "FALL", min: 0, max: 100, def: 30, unit: "%" },
      { id: "SHAPE",label: "SHAPE",min: 0, max: 100, def: 50, unit: "%" },
    ],
  },
  QUANT: {
    label: "QUANTIZER", category: "UTILITY", color: "#78716c",
    w: 120, h: 280, description: "CV quantizer — chromatic, major, minor, pentatonic scales",
    ports: [
      { id: "IN",   label: "IN",   sig: "cv",   dir: "in" },
      { id: "TRIG", label: "TRIG", sig: "gate", dir: "in" },
      { id: "OUT",  label: "OUT",  sig: "cv",   dir: "out" },
      { id: "GATE", label: "GATE", sig: "gate", dir: "out" },
    ],
    params: [
      { id: "SCALE", label: "SCALE", min: 0, max: 5, def: 0, snap: true },
      { id: "ROOT",  label: "ROOT",  min: 0, max: 11,def: 0, snap: true },
    ],
    hasDisplay: true,
  },
  SWITCH: {
    label: "SWITCH", category: "UTILITY", color: "#71717a",
    w: 100, h: 280, description: "Sequential / manual signal switch — 1→4 or 4→1",
    ports: [
      { id: "IN",   label: "IN",  sig: "cv",   dir: "in" },
      { id: "CLK",  label: "CLK", sig: "gate", dir: "in" },
      { id: "A",    label: "A",   sig: "cv",   dir: "out" },
      { id: "B",    label: "B",   sig: "cv",   dir: "out" },
      { id: "C",    label: "C",   sig: "cv",   dir: "out" },
      { id: "D",    label: "D",   sig: "cv",   dir: "out" },
    ],
    params: [
      { id: "STEPS", label: "STEPS", min: 2, max: 4, def: 4, snap: true },
    ],
  },
  LOGIC: {
    label: "LOGIC", category: "UTILITY", color: "#a1a1aa",
    w: 100, h: 280, description: "Boolean logic gates — AND, OR, XOR, NOT, NAND",
    ports: [
      { id: "A",    label: "A",   sig: "gate", dir: "in" },
      { id: "B",    label: "B",   sig: "gate", dir: "in" },
      { id: "AND",  label: "AND", sig: "gate", dir: "out" },
      { id: "OR",   label: "OR",  sig: "gate", dir: "out" },
      { id: "XOR",  label: "XOR", sig: "gate", dir: "out" },
      { id: "NOT",  label: "NOT", sig: "gate", dir: "out" },
    ],
    params: [],
    hasDisplay: true,
  },
  RAND: {
    label: "RANDOM", category: "UTILITY", color: "#f87171",
    w: 100, h: 280, description: "Random voltage / sample & hold / noise source",
    ports: [
      { id: "CLK",  label: "CLK",  sig: "gate", dir: "in" },
      { id: "HOLD", label: "HOLD", sig: "gate", dir: "in" },
      { id: "OUT",  label: "OUT",  sig: "cv",   dir: "out" },
      { id: "GATE", label: "GATE", sig: "gate", dir: "out" },
      { id: "NOISE",label: "NSE",  sig: "audio",dir: "out" },
    ],
    params: [
      { id: "RATE",  label: "RATE",  min: 0, max: 100, def: 40, unit: "%" },
      { id: "RANGE", label: "RANGE", min: 0, max: 100, def: 100, unit: "%" },
      { id: "SMOOTH",label: "SMTH",  min: 0, max: 100, def: 0,  unit: "%" },
    ],
    hasDisplay: true,
  },
  SH: {
    label: "SAMPLE & HOLD", category: "UTILITY", color: "#fb7185",
    w: 100, h: 280, description: "Sample & hold with noise source",
    ports: [
      { id: "IN",  label: "IN",  sig: "cv",   dir: "in" },
      { id: "CLK", label: "CLK", sig: "gate", dir: "in" },
      { id: "OUT", label: "OUT", sig: "cv",   dir: "out" },
    ],
    params: [
      { id: "NOISE", label: "NSE", min: 0, max: 100, def: 0, unit: "%" },
      { id: "GLIDE", label: "GLIDE",min: 0, max: 100, def: 0, unit: "%" },
    ],
  },

  // ── VISUAL / MONITOR ──
  SCOPE: {
    label: "SCOPE", category: "VISUAL", color: "#34d399",
    w: 180, h: 280, description: "Dual-channel oscilloscope with time/trigger controls",
    ports: [
      { id: "CH1", label: "CH1", sig: "audio", dir: "in" },
      { id: "CH2", label: "CH2", sig: "audio", dir: "in" },
      { id: "TRIG",label: "TRIG",sig: "gate",  dir: "in" },
    ],
    params: [
      { id: "TIME", label: "TIME", min: 0, max: 100, def: 50 },
      { id: "TRIG", label: "TRIG", min: 0, max: 100, def: 0 },
      { id: "GAIN", label: "GAIN", min: 0, max: 100, def: 50 },
    ],
    hasDisplay: true,
  },
  SPECTRUM: {
    label: "SPECTRUM", category: "VISUAL", color: "#2dd4bf",
    w: 180, h: 280, description: "FFT spectrum analyzer with peak hold",
    ports: [
      { id: "IN", label: "IN", sig: "audio", dir: "in" },
    ],
    params: [
      { id: "RANGE", label: "RANGE", min: 0, max: 100, def: 80 },
      { id: "SPEED", label: "SPEED", min: 0, max: 100, def: 60 },
    ],
    hasDisplay: true,
  },
  VUMETER: {
    label: "VU METER", category: "VISUAL", color: "#4ade80",
    w: 90, h: 280, description: "Stereo VU meter with peak indicator",
    ports: [
      { id: "L", label: "L", sig: "audio", dir: "in" },
      { id: "R", label: "R", sig: "audio", dir: "in" },
    ],
    params: [],
    hasDisplay: true,
  },
  XYPAD: {
    label: "XY PAD", category: "VISUAL", color: "#a3e635",
    w: 180, h: 280, description: "2D XY pad — two CV outputs controlled by touch/mouse",
    ports: [
      { id: "X_IN", label: "X←", sig: "cv", dir: "in" },
      { id: "Y_IN", label: "Y←", sig: "cv", dir: "in" },
      { id: "X",    label: "X",  sig: "cv", dir: "out" },
      { id: "Y",    label: "Y",  sig: "cv", dir: "out" },
    ],
    params: [
      { id: "X", label: "X", min: 0, max: 100, def: 50 },
      { id: "Y", label: "Y", min: 0, max: 100, def: 50 },
    ],
    hasDisplay: true,
  },

  // ── ADVANCED / EXPERIMENTAL ──
  GRAINCLOUD: {
    label: "GRAIN CLOUD", category: "ADVANCED", color: "#ec4899",
    w: 160, h: 280, description: "Granular texture generator — freeze, scatter, spray",
    ports: [
      { id: "IN",   label: "IN",   sig: "audio", dir: "in" },
      { id: "POS",  label: "POS",  sig: "cv",    dir: "in" },
      { id: "SIZE", label: "SIZE", sig: "cv",    dir: "in" },
      { id: "L",    label: "L",    sig: "audio", dir: "out" },
      { id: "R",    label: "R",    sig: "audio", dir: "out" },
    ],
    params: [
      { id: "GRAINS", label: "GRAINS", min: 1, max: 32,  def: 8,  snap: true },
      { id: "SIZE",   label: "SIZE",   min: 0, max: 100, def: 40, unit: "ms" },
      { id: "POS",    label: "POS",    min: 0, max: 100, def: 0,  unit: "%" },
      { id: "PITCH",  label: "PITCH",  min: -24,max: 24, def: 0,  unit: "st" },
      { id: "SPREAD", label: "SPREAD", min: 0, max: 100, def: 50, unit: "%" },
      { id: "SPRAY",  label: "SPRAY",  min: 0, max: 100, def: 20, unit: "%" },
    ],
    hasDisplay: true,
  },
  FORMANT: {
    label: "FORMANT", category: "ADVANCED", color: "#f472b6",
    w: 140, h: 280, description: "Formant filter — vowel morphing A-E-I-O-U",
    ports: [
      { id: "IN",    label: "IN",   sig: "audio", dir: "in" },
      { id: "MORPH", label: "MORPH",sig: "cv",    dir: "in" },
      { id: "OUT",   label: "OUT",  sig: "audio", dir: "out" },
    ],
    params: [
      { id: "MORPH",  label: "MORPH", min: 0, max: 100, def: 0,  unit: "%" },
      { id: "SHIFT",  label: "SHIFT", min: -24,max: 24, def: 0,  unit: "st" },
      { id: "WIDTH",  label: "WIDTH", min: 0, max: 100, def: 50, unit: "%" },
    ],
    hasDisplay: true,
  },
  VOCODER: {
    label: "VOCODER", category: "ADVANCED", color: "#db2777",
    w: 170, h: 280, description: "16-band vocoder with carrier/modulator inputs",
    ports: [
      { id: "CAR",  label: "CAR",  sig: "audio", dir: "in" },
      { id: "MOD",  label: "MOD",  sig: "audio", dir: "in" },
      { id: "OUT",  label: "OUT",  sig: "audio", dir: "out" },
    ],
    params: [
      { id: "BANDS",  label: "BANDS", min: 4, max: 16, def: 12, snap: true },
      { id: "ATTACK", label: "ATK",   min: 0, max: 100, def: 10, unit: "ms" },
      { id: "REL",    label: "REL",   min: 0, max: 100, def: 40, unit: "ms" },
      { id: "SHIFT",  label: "SHIFT", min: -24,max: 24, def: 0,  unit: "st" },
    ],
    hasDisplay: true,
  },
}

// ─── Default rack patch ───────────────────────────────────────────────────────

function makeModule(uid: string, type: ModuleType, x: number, y: number): ModuleInst {
  const def = MOD_DEFS[type]
  const params: Record<string, number> = {}
  def.params.forEach(p => { params[p.id] = p.def })
  return { uid, type, x, y, params }
}

const DEFAULT_MODULES: ModuleInst[] = [
  makeModule("clock1", "CLOCK",  20,   40),
  makeModule("midi1",  "MIDI",   160,  40),
  makeModule("vco1",   "VCO",    300,  40),
  makeModule("vco2",   "VCO2",   470,  40),
  makeModule("noise1", "NOISE",  640,  40),
  makeModule("vcf1",   "VCF",    300,  370),
  makeModule("vca1",   "VCA",    470,  370),
  makeModule("mixer1", "MIXER",  600,  370),
  makeModule("out1",   "STEREO_OUT", 790, 370),
  makeModule("env1",   "ENV",    160,  370),
  makeModule("lfo1",   "LFO",    20,   370),
  makeModule("delay1", "DELAY",  970,  40),
  makeModule("reverb1","REVERB", 970,  370),
  makeModule("scope1", "SCOPE",  790,  40),
  makeModule("seq1",   "SEQ8",   1200, 40),
]

const DEFAULT_WIRES: Wire[] = [
  { id: "w1",  srcMod: "midi1",  srcPort: "PITCH", dstMod: "vco1",   dstPort: "PITCH"  },
  { id: "w2",  srcMod: "midi1",  srcPort: "GATE",  dstMod: "env1",   dstPort: "GATE"   },
  { id: "w3",  srcMod: "vco1",   srcPort: "SAW",   dstMod: "vcf1",   dstPort: "IN"     },
  { id: "w4",  srcMod: "vcf1",   srcPort: "LP",    dstMod: "vca1",   dstPort: "IN"     },
  { id: "w5",  srcMod: "vca1",   srcPort: "OUT",   dstMod: "mixer1", dstPort: "IN1"    },
  { id: "w6",  srcMod: "mixer1", srcPort: "L",     dstMod: "out1",   dstPort: "L"      },
  { id: "w7",  srcMod: "mixer1", srcPort: "R",     dstMod: "out1",   dstPort: "R"      },
  { id: "w8",  srcMod: "env1",   srcPort: "OUT",   dstMod: "vca1",   dstPort: "LEVEL"  },
  { id: "w9",  srcMod: "env1",   srcPort: "OUT",   dstMod: "vcf1",   dstPort: "ENV"    },
  { id: "w10", srcMod: "lfo1",   srcPort: "SIN",   dstMod: "vcf1",   dstPort: "CUTOFF" },
  { id: "w11", srcMod: "vco1",   srcPort: "SAW",   dstMod: "scope1", dstPort: "CH1"    },
  { id: "w12", srcMod: "env1",   srcPort: "OUT",   dstMod: "scope1", dstPort: "CH2"    },
  { id: "w13", srcMod: "midi1",  srcPort: "PITCH", dstMod: "vco2",   dstPort: "PITCH"  },
  { id: "w14", srcMod: "vco2",   srcPort: "L",     dstMod: "mixer1", dstPort: "IN2"    },
  { id: "w15", srcMod: "clock1", srcPort: "CLK",   dstMod: "seq1",   dstPort: "CLK"    },
]

// ─── Layout constants ─────────────────────────────────────────────────────────

const HDR_H    = 30
const PORT_H   = 32
const PORT_Y_OUT = HDR_H + PORT_H / 2
const PORT_Y_IN  = (h: number) => h - PORT_H / 2

// ─── Physics catenary ─────────────────────────────────────────────────────────

function catenaryPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1, dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  const sag = Math.min(Math.max(dist * 0.35 + 25, 36), 200)
  return `M ${x1} ${y1} C ${x1} ${y1 + sag} ${x2} ${y2 + sag} ${x2} ${y2}`
}

// ─── Port absolute position ───────────────────────────────────────────────────

function getPortPos(mod: ModuleInst, portId: string): { x: number; y: number } | null {
  const def = MOD_DEFS[mod.type]
  const port = def.ports.find(p => p.id === portId)
  if (!port) return null
  const row = def.ports.filter(p => p.dir === port.dir)
  const idx = row.indexOf(port)
  const N = row.length
  const px = (def.w / (N + 1)) * (idx + 1)
  const py = port.dir === "out" ? PORT_Y_OUT : PORT_Y_IN(def.h)
  return { x: mod.x + px, y: mod.y + py }
}

// ─── Wire color by signal type ────────────────────────────────────────────────

function wireColor(wire: Wire, modules: ModuleInst[]) {
  const srcMod = modules.find(m => m.uid === wire.srcMod)
  if (!srcMod) return "#f59e0b"
  const def = MOD_DEFS[srcMod.type]
  const port = def.ports.find(p => p.id === wire.srcPort)
  if (!port) return "#f59e0b"
  if (port.sig === "audio") return "#f59e0b"
  if (port.sig === "gate")  return "#e2e8f0"
  if (port.sig === "clock") return "#facc15"
  return def.color
}

// ─── Port Jack SVG ────────────────────────────────────────────────────────────

function PortJack({ sig, plugged, color, size = 16 }: {
  sig: SigType; plugged: boolean; color: string; size?: number
}) {
  const r = (size - 4) / 2
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <radialGradient id="pjg" cx="35%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#c0c0c0" />
          <stop offset="45%" stopColor="#606060" />
          <stop offset="100%" stopColor="#1a1a1a" />
        </radialGradient>
      </defs>
      {plugged && <circle cx={cx} cy={cy} r={r + 2} fill={color} opacity={0.22} />}
      <circle cx={cx} cy={cy} r={r} fill="url(#pjg)" stroke="#111" strokeWidth={0.7} />
      <circle cx={cx} cy={cy} r={r * 0.42}
        fill={plugged ? color : "#0a0a0a"}
        stroke={plugged ? color : "#060606"} strokeWidth={0.5} />
      {plugged && <circle cx={cx * 0.72} cy={cy * 0.72} r={r * 0.13} fill="rgba(255,255,255,0.55)" />}
    </svg>
  )
}

// ─── Mini knob (analog style with arc + pointer) ─────────────────────────────

function MiniKnob({ value, min, max, label, color, unit, onChange }: {
  value: number; min: number; max: number; label: string; color: string; unit?: string
  onChange: (v: number) => void
}) {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const startA = -135, endA = 135
  const angle = startA + norm * (endA - startA)
  const S = 30, r = 12, cx = 15, cy = 15
  const toXY = (a: number, rad: number) => ({
    x: cx + rad * Math.sin((a * Math.PI) / 180),
    y: cy - rad * Math.cos((a * Math.PI) / 180),
  })
  const arcPath = (fromA: number, toA: number, aR: number) => {
    const p1 = toXY(fromA, aR), p2 = toXY(toA, aR)
    const large = Math.abs(toA - fromA) > 180 ? 1 : 0
    return `M ${p1.x} ${p1.y} A ${aR} ${aR} 0 ${large} 1 ${p2.x} ${p2.y}`
  }
  const dragRef = useRef<{ startY: number; startV: number } | null>(null)

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, cursor: "ns-resize" }}
      title={`${label}: ${Math.round(value * 10) / 10}${unit ?? ""}`}
      onMouseDown={e => {
        e.preventDefault(); e.stopPropagation()
        dragRef.current = { startY: e.clientY, startV: value }
        const onMove = (ev: MouseEvent) => {
          if (!dragRef.current) return
          const delta = (dragRef.current.startY - ev.clientY) / 100
          const next = Math.max(min, Math.min(max, dragRef.current.startV + delta * (max - min)))
          onChange(Math.round(next * 10) / 10)
        }
        const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
      }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <defs>
          <radialGradient id={`kg_${label.replace(/\s/g,"")}`} cx="38%" cy="28%" r="65%">
            <stop offset="0%" stopColor="#e0e0e0" />
            <stop offset="45%" stopColor="#909090" />
            <stop offset="100%" stopColor="#2a2a2a" />
          </radialGradient>
        </defs>
        {/* Track arc */}
        <path d={arcPath(startA, endA, r + 3)} stroke="rgba(0,0,0,0.22)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {/* Value arc */}
        <path d={arcPath(startA, angle, r + 3)} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
        {/* Knob body */}
        <circle cx={cx} cy={cy} r={r} fill={`url(#kg_${label.replace(/\s/g,"")})`} stroke="#1a1a1a" strokeWidth={0.9} />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={r * 0.22} fill={color} opacity={0.35} />
        {/* Pointer */}
        {(() => { const tip = toXY(angle, r * 0.72); return <circle cx={tip.x} cy={tip.y} r={1.5} fill={color} /> })()}
      </svg>
      <span style={{ fontFamily: "monospace", fontSize: 5.5, color: "rgba(0,0,0,0.50)",
        textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1, maxWidth: 35,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
        {label}
      </span>
    </div>
  )
}

// ─── Animated display canvas helper ──────────────────────────────────────────

function useAnimCanvas(
  ref: React.RefObject<HTMLCanvasElement | null>,
  w: number, h: number,
  draw: (ctx: CanvasRenderingContext2D, phase: number) => void,
  deps: unknown[]
) {
  const phase = useRef(0)
  const raf = useRef<number>(0)
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext("2d"); if (!ctx) return
    const loop = () => {
      draw(ctx, phase.current)
      phase.current += 0.05
      raf.current = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ─── Scope display ────────────────────────────────────────────────────────────

function ScopeDisplay({ w, h, wires, modules, uid }: {
  w: number; h: number; wires: Wire[]; modules: ModuleInst[]; uid: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ch1Wire = wires.find(w2 => w2.dstMod === uid && w2.dstPort === "CH1")
  const ch2Wire = wires.find(w2 => w2.dstMod === uid && w2.dstPort === "CH2")
  const ch1Src = ch1Wire ? modules.find(m => m.uid === ch1Wire.srcMod) : null
  const ch2Src = ch2Wire ? modules.find(m => m.uid === ch2Wire.srcMod) : null

  function getWave(src: ModuleInst | null | undefined, portId: string) {
    if (!src) return "flat"
    if (src.type === "VCO" || src.type === "VCO2")
      return portId === "SAW" ? "saw" : portId === "SQR" ? "square" : portId === "TRI" ? "triangle" : "sine"
    if (src.type === "LFO" || src.type === "LFO_COMPLEX")
      return portId === "SAW" ? "saw" : portId === "SQR" ? "square" : portId === "TRI" ? "triangle" : "sine"
    if (src.type === "ENV" || src.type === "ENV_MULTI") return "env"
    if (src.type === "NOISE") return "noise"
    return "sine"
  }

  const wave1 = getWave(ch1Src, ch1Wire?.srcPort ?? "")
  const wave2 = getWave(ch2Src, ch2Wire?.srcPort ?? "")
  const col1 = ch1Src ? MOD_DEFS[ch1Src.type].color : "#34d399"
  const col2 = ch2Src ? MOD_DEFS[ch2Src.type].color : "#22d3ee"

  const drawWaveform = (ctx: CanvasRenderingContext2D, wave: string, color: string,
    yOff: number, scale: number, ph: number) => {
    ctx.save()
    ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.globalAlpha = 0.35
    ctx.strokeStyle = color; ctx.lineWidth = 4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 4 + ph
      let y = 0
      if (wave === "flat") y = 0
      else if (wave === "sine") y = Math.sin(t)
      else if (wave === "triangle") y = 2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1
      else if (wave === "saw") y = 1 - 2 * ((t / (Math.PI * 2)) % 1)
      else if (wave === "square") y = Math.sin(t) > 0 ? 1 : -1
      else if (wave === "noise") y = Math.random() * 2 - 1
      else if (wave === "env") {
        const tp = (x / w) % 1
        y = tp < 0.1 ? tp / 0.1 : tp < 0.25 ? 1 - (tp - 0.1) / 0.15 * 0.4 : tp < 0.6 ? 0.6 : tp < 0.85 ? 0.6 - (tp - 0.6) / 0.25 * 0.6 : 0
        y = y * 2 - 1
      }
      const py = yOff - y * scale
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke(); ctx.restore()
    ctx.strokeStyle = color; ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 4 + ph
      let y = 0
      if (wave === "flat") y = 0
      else if (wave === "sine") y = Math.sin(t)
      else if (wave === "triangle") y = 2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1
      else if (wave === "saw") y = 1 - 2 * ((t / (Math.PI * 2)) % 1)
      else if (wave === "square") y = Math.sin(t) > 0 ? 1 : -1
      else if (wave === "noise") y = (Math.sin(t * 13.7) * Math.sin(t * 5.3)) // deterministic noise
      else if (wave === "env") {
        const tp = (x / w) % 1
        y = tp < 0.1 ? tp / 0.1 : tp < 0.25 ? 1 - (tp - 0.1) / 0.15 * 0.4 : tp < 0.6 ? 0.6 : tp < 0.85 ? 0.6 - (tp - 0.6) / 0.25 * 0.6 : 0
        y = y * 2 - 1
      }
      const py = yOff - y * scale
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }

  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    ctx.setLineDash([])
    // Scanlines
    ctx.fillStyle = "rgba(0,0,0,0.05)"
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1)
    // Waveforms
    if (ch1Wire) drawWaveform(ctx, wave1, col1, h / 4, h / 4 - 4, ph)
    if (ch2Wire) drawWaveform(ctx, wave2, col2, (h * 3) / 4, h / 4 - 4, ph)
    if (!ch1Wire && !ch2Wire) drawWaveform(ctx, "flat", "#34d399", h / 2, 2, ph)
  }, [wave1, wave2, col1, col2, w, h, ch1Wire, ch2Wire])

  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Spectrum analyzer display ────────────────────────────────────────────────

function SpectrumDisplay({ w, h, color }: { w: number; h: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bars = useRef<number[]>(Array.from({ length: 32 }, () => Math.random() * 0.3))
  const peaks = useRef<number[]>(Array.from({ length: 32 }, () => 0))

  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let y = 0; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    // Bars
    const N = 32
    const bw = (w - 4) / N
    for (let i = 0; i < N; i++) {
      // Simulated spectrum data
      const freq = (i / N)
      const base = Math.exp(-freq * 3) * 0.8
      const variation = Math.sin(ph * 0.7 + i * 0.6) * 0.2 + Math.sin(ph * 1.3 + i * 0.3) * 0.15
      const val = Math.max(0, Math.min(1, base + variation))
      bars.current[i] += (val - bars.current[i]) * 0.15
      peaks.current[i] = Math.max(peaks.current[i] - 0.005, bars.current[i])

      const bh = bars.current[i] * (h - 4)
      const x = 2 + i * bw
      // Bar gradient
      const grad = ctx.createLinearGradient(0, h, 0, h - bh)
      grad.addColorStop(0, color + "cc")
      grad.addColorStop(0.7, color + "88")
      grad.addColorStop(1, color + "44")
      ctx.fillStyle = grad
      ctx.fillRect(x, h - 2 - bh, bw - 1, bh)
      // Peak line
      const ph2 = peaks.current[i] * (h - 4)
      ctx.fillStyle = color
      ctx.fillRect(x, h - 2 - ph2, bw - 1, 1.5)
    }
    // Scanlines
    ctx.fillStyle = "rgba(0,0,0,0.04)"
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1)
  }, [w, h, color])

  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── VU Meter display ─────────────────────────────────────────────────────────

function VUDisplay({ w, h }: { w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const levelsL = useRef(0.4)
  const levelsR = useRef(0.35)

  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)

    const barW = (w - 12) / 2
    const simL = 0.3 + Math.sin(ph * 0.8) * 0.25 + Math.sin(ph * 2.1) * 0.1
    const simR = 0.3 + Math.sin(ph * 0.8 + 0.5) * 0.25 + Math.sin(ph * 1.7 + 0.3) * 0.1
    levelsL.current += (simL - levelsL.current) * 0.12
    levelsR.current += (simR - levelsR.current) * 0.12

    const drawBar = (x: number, level: number) => {
      const segments = 24
      const segH = (h - 8) / segments
      for (let i = 0; i < segments; i++) {
        const norm = i / segments
        const active = norm <= level
        let col = "#10b981"
        if (norm > 0.75) col = "#ef4444"
        else if (norm > 0.55) col = "#f59e0b"
        const y = h - 4 - (i + 1) * segH
        ctx.fillStyle = active ? col : "rgba(255,255,255,0.06)"
        ctx.fillRect(x, y, barW, segH - 1.5)
        if (active) {
          ctx.fillStyle = col + "44"
          ctx.fillRect(x - 1, y - 0.5, barW + 2, segH)
        }
      }
    }
    drawBar(4, levelsL.current)
    drawBar(4 + barW + 4, levelsR.current)
    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.font = "6px monospace"
    ctx.fillText("L", 4 + barW / 2 - 2, h - 1)
    ctx.fillText("R", 8 + barW + barW / 2 - 2, h - 1)
  }, [w, h])

  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Envelope shape display ───────────────────────────────────────────────────

function EnvDisplay({ w, h, a, d, s, r: rel, curve, color }: {
  w: number; h: number; a: number; d: number; s: number; r: number; curve: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    // Envelope path
    const pad = 4
    const iw = w - pad * 2, ih = h - pad * 2
    const aN = a / 100, dN = d / 100, sN = s / 100, rN = rel / 100
    const total = aN + dN + 0.3 + rN
    const xA = pad + (aN / total) * iw
    const xD = xA + (dN / total) * iw
    const xS = xD + (0.3 / total) * iw
    const xR = xS + (rN / total) * iw
    const yBot = pad + ih, yTop = pad, ySus = pad + ih * (1 - sN)

    // Glow
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.globalAlpha = 0.4
    ctx.strokeStyle = color; ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(pad, yBot)
    ctx.lineTo(xA, yTop); ctx.lineTo(xD, ySus); ctx.lineTo(xS, ySus); ctx.lineTo(xR, yBot)
    ctx.stroke(); ctx.restore()
    // Sharp line
    ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(pad, yBot)
    ctx.lineTo(xA, yTop); ctx.lineTo(xD, ySus); ctx.lineTo(xS, ySus); ctx.lineTo(xR, yBot)
    ctx.stroke()
    // Phase indicator
    const loopT = (ph * 0.3) % (total + 0.5)
    let dotX = pad, dotY = yBot
    if (loopT < aN) { const t = loopT / aN; dotX = pad + t * (xA - pad); dotY = yBot + t * (yTop - yBot) }
    else if (loopT < aN + dN) { const t = (loopT - aN) / dN; dotX = xA + t * (xD - xA); dotY = yTop + t * (ySus - yTop) }
    else if (loopT < aN + dN + 0.3) { const t = (loopT - aN - dN) / 0.3; dotX = xD + t * (xS - xD); dotY = ySus }
    else if (loopT < total) { const t = (loopT - aN - dN - 0.3) / rN; dotX = xS + t * (xR - xS); dotY = ySus + t * (yBot - ySus) }
    ctx.beginPath(); ctx.arc(dotX, dotY, 3, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
    ctx.beginPath(); ctx.arc(dotX, dotY, 6, 0, Math.PI * 2)
    ctx.fillStyle = color + "33"; ctx.fill()
  }, [w, h, a, d, s, rel, curve, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── LFO display ──────────────────────────────────────────────────────────────

function LFODisplay({ w, h, rate, color }: { w: number; h: number; rate: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    ctx.setLineDash([])
    // Multiple wave shapes overlaid
    const speed = 0.02 + rate / 100 * 0.08
    const waves = [
      { fn: Math.sin, col: color, thick: 1.5, alpha: 1 },
      { fn: (t: number) => 2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1, col: color, thick: 0.8, alpha: 0.3 },
    ]
    waves.forEach(({ fn, col, thick, alpha }) => {
      ctx.save(); ctx.globalAlpha = alpha * 0.35; ctx.shadowColor = col; ctx.shadowBlur = 6
      ctx.strokeStyle = col; ctx.lineWidth = thick + 3
      ctx.beginPath()
      for (let x = 0; x <= w; x++) { const y = h / 2 - fn(x / w * Math.PI * 4 + ph * speed * 60) * (h / 2 - 4); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
      ctx.stroke(); ctx.restore()
      ctx.strokeStyle = col; ctx.lineWidth = thick; ctx.globalAlpha = alpha
      ctx.beginPath()
      for (let x = 0; x <= w; x++) { const y = h / 2 - fn(x / w * Math.PI * 4 + ph * speed * 60) * (h / 2 - 4); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y) }
      ctx.stroke(); ctx.globalAlpha = 1
    })
  }, [w, h, rate, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── XY Pad display ───────────────────────────────────────────────────────────

function XYPadDisplay({ w, h, xVal, yVal, color, onChange }: {
  w: number; h: number; xVal: number; yVal: number; color: string
  onChange: (x: number, y: number) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const trail = useRef<{ x: number; y: number }[]>([])

  useAnimCanvas(ref, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = 0; y < h; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    ctx.setLineDash([])
    // Position
    const px = (xVal / 100) * w, py = (1 - yVal / 100) * h
    trail.current.push({ x: px, y: py })
    if (trail.current.length > 40) trail.current.shift()
    // Trail
    ctx.beginPath()
    trail.current.forEach((p, i) => {
      ctx.globalAlpha = i / trail.current.length * 0.4
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
    })
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1
    // Crosshair
    ctx.strokeStyle = color + "44"; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke()
    // Dot
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2)
    ctx.fillStyle = color + "33"; ctx.fill()
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
  }, [w, h, xVal, yVal, color])

  return (
    <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }}
      onMouseDown={e => {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
        const update = (ev: MouseEvent) => {
          const nx = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
          const ny = Math.max(0, Math.min(100, (1 - (ev.clientY - rect.top) / rect.height) * 100))
          onChange(Math.round(nx), Math.round(ny))
        }
        update(e.nativeEvent)
        const onMove = (ev: MouseEvent) => update(ev)
        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
        window.addEventListener("mousemove", onMove)
        window.addEventListener("mouseup", onUp)
      }}
    />
  )
}

// ─── VCO waveform display ─────────────────────────────────────────────────────

function VCODisplay({ w, h, color, pw }: { w: number; h: number; color: string; pw: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    ctx.setLineDash([])
    // Draw saw wave with glow
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.globalAlpha = 0.35
    ctx.strokeStyle = color; ctx.lineWidth = 4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 4 + ph * 3
      const y = 1 - 2 * ((t / (Math.PI * 2)) % 1)
      const py = h / 2 - y * (h / 2 - 3)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke(); ctx.restore()
    ctx.strokeStyle = color; ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 4 + ph * 3
      const y = 1 - 2 * ((t / (Math.PI * 2)) % 1)
      const py = h / 2 - y * (h / 2 - 3)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [w, h, color, pw])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Filter frequency response display ───────────────────────────────────────

function FilterDisplay({ w, h, cutoff, reso, color }: {
  w: number; h: number; cutoff: number; reso: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    for (let y = 0; y < h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
    // Filter curve
    const fc = cutoff / 100
    const q = 0.5 + (reso / 100) * 8
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.globalAlpha = 0.35
    ctx.strokeStyle = color; ctx.lineWidth = 4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const freq = x / w
      const diff = freq - fc
      const response = 1.0 / Math.sqrt(1 + Math.pow(diff * 10, 4)) * (1 + (diff > -0.05 && diff < 0.05 ? q * Math.exp(-Math.abs(diff) * 40) : 0))
      const py = h - 4 - Math.min(1, response) * (h - 8)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke(); ctx.restore()
    // Fill
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const freq = x / w
      const diff = freq - fc
      const response = 1.0 / Math.sqrt(1 + Math.pow(diff * 10, 4)) * (1 + (diff > -0.05 && diff < 0.05 ? q * Math.exp(-Math.abs(diff) * 40) : 0))
      const py = h - 4 - Math.min(1, response) * (h - 8)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = color + "18"; ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
    // Cutoff marker
    const cx = fc * w
    ctx.strokeStyle = color + "55"; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke()
    ctx.setLineDash([])
  }, [w, h, cutoff, reso, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Wavefolder display ───────────────────────────────────────────────────────

function WavefolderDisplay({ w, h, fold, color }: {
  w: number; h: number; fold: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    ctx.setLineDash([])
    // Folded wave
    const f = 1 + fold / 100 * 4
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.globalAlpha = 0.35
    ctx.strokeStyle = color; ctx.lineWidth = 4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 3 + ph * 2
      let y = Math.sin(t) * f
      // Folding
      while (y > 1 || y < -1) { if (y > 1) y = 2 - y; if (y < -1) y = -2 - y }
      const py = h / 2 - y * (h / 2 - 4)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke(); ctx.restore()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 3 + ph * 2
      let y = Math.sin(t) * f
      while (y > 1 || y < -1) { if (y > 1) y = 2 - y; if (y < -1) y = -2 - y }
      const py = h / 2 - y * (h / 2 - 4)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [w, h, fold, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Distortion transfer curve display ────────────────────────────────────────

function DistortionDisplay({ w, h, drive, color }: {
  w: number; h: number; drive: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Diagonal reference
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke()
    ctx.setLineDash([])
    // Transfer curve
    const gain = 1 + drive / 100 * 10
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.globalAlpha = 0.35
    ctx.strokeStyle = color; ctx.lineWidth = 4
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const input = (x / w) * 2 - 1 // -1 to 1
      const saturated = Math.tanh(input * gain)
      const py = h / 2 - saturated * (h / 2 - 4)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke(); ctx.restore()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const input = (x / w) * 2 - 1
      const saturated = Math.tanh(input * gain)
      const py = h / 2 - saturated * (h / 2 - 4)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.stroke()
  }, [w, h, drive, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Delay tap visualization ──────────────────────────────────────────────────

function DelayDisplay({ w, h, time, fbk, color }: {
  w: number; h: number; time: number; fbk: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Background grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    // Delay taps as decaying pulses
    const taps = 6
    const spacing = (time / 100) * (w / 3) + 10
    for (let i = 0; i < taps; i++) {
      const decay = Math.pow(fbk / 100, i)
      if (decay < 0.05) break
      const x = 10 + i * spacing
      if (x > w) break
      const barH = decay * (h - 8)
      const alpha = 0.3 + decay * 0.5
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0")
      ctx.fillRect(x, h - 4 - barH, 6, barH)
      // Pulse wobble
      const wobble = Math.sin(ph * 2 - i * 0.5) * 3
      ctx.beginPath(); ctx.arc(x + 3, h - 4 - barH + wobble, 3, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
    }
  }, [w, h, time, fbk, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Reverb decay visualization ───────────────────────────────────────────────

function ReverbDisplay({ w, h, size, color }: {
  w: number; h: number; size: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Expanding circles (reverb decay visualization)
    const rings = 5 + Math.round(size / 100 * 8)
    const cx = w / 2, cy = h / 2
    for (let i = 0; i < rings; i++) {
      const t = ((ph * 0.3 + i * 0.4) % 3) / 3
      const r = t * Math.min(w, h) * 0.45
      const alpha = (1 - t) * 0.35
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2)
      ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0")
      ctx.lineWidth = 1.5; ctx.stroke()
    }
    // Center pulse
    const pulse = 0.5 + Math.sin(ph * 2) * 0.3
    ctx.beginPath(); ctx.arc(cx, cy, 3 + pulse * 2, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.fill()
  }, [w, h, size, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── EQ curve display ─────────────────────────────────────────────────────────

function EQDisplay({ w, h, low, mid, high, color }: {
  w: number; h: number; low: number; mid: number; high: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = "rgba(255,255,255,0.04)"; ctx.lineWidth = 0.5
    for (let x = 0; x < w; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.setLineDash([2, 2])
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke()
    ctx.setLineDash([])
    // EQ curve
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const f = x / w
      const lB = (low / 15) * Math.exp(-f * 6)
      const mB = (mid / 15) * Math.exp(-Math.pow((f - 0.4) * 5, 2))
      const hB = (high / 15) * Math.exp(-(1 - f) * 6)
      const db = lB + mB + hB
      const py = h / 2 - db * (h / 2 - 4)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = color + "18"; ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
  }, [w, h, low, mid, high, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Noise display ────────────────────────────────────────────────────────────

function NoiseDisplay({ w, h, color }: { w: number; h: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    const imgData = ctx.createImageData(w, h)
    for (let i = 0; i < imgData.data.length; i += 4) {
      const v = Math.random() * 40
      imgData.data[i] = v; imgData.data[i + 1] = v; imgData.data[i + 2] = v; imgData.data[i + 3] = 255
    }
    ctx.putImageData(imgData, 0, 0)
    // Overlay faint color
    ctx.fillStyle = color + "12"
    ctx.fillRect(0, 0, w, h)
  }, [w, h, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Grain cloud display ──────────────────────────────────────────────────────

function GrainDisplay({ w, h, grains, spread, color }: {
  w: number; h: number; grains: number; spread: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const particles = useRef<{ x: number; y: number; vx: number; vy: number; life: number }[]>([])

  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Spawn grains
    while (particles.current.length < grains) {
      particles.current.push({
        x: w / 2, y: h / 2,
        vx: (Math.random() - 0.5) * spread / 100 * 3,
        vy: (Math.random() - 0.5) * spread / 100 * 3,
        life: 1,
      })
    }
    while (particles.current.length > grains) particles.current.pop()
    // Update & draw
    particles.current.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life -= 0.008
      if (p.life <= 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
        p.x = w / 2 + (Math.random() - 0.5) * 20
        p.y = h / 2 + (Math.random() - 0.5) * 20
        p.vx = (Math.random() - 0.5) * spread / 100 * 3
        p.vy = (Math.random() - 0.5) * spread / 100 * 3
        p.life = 1
      }
      const alpha = p.life * 0.8
      ctx.beginPath(); ctx.arc(p.x, p.y, 2 + p.life * 3, 0, Math.PI * 2)
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0")
      ctx.fill()
    })
    // Center marker
    const pulse = 0.5 + Math.sin(ph * 2) * 0.3
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 4 + pulse * 2, 0, Math.PI * 2)
    ctx.strokeStyle = color + "66"; ctx.lineWidth = 1; ctx.stroke()
  }, [w, h, grains, spread, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Vocoder band display ─────────────────────────────────────────────────────

function VocoderDisplay({ w, h, bands, color }: {
  w: number; h: number; bands: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const levels = useRef<number[]>(Array.from({ length: 16 }, () => 0.3))

  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    const bw = (w - 4) / bands
    for (let i = 0; i < bands; i++) {
      const target = 0.2 + Math.sin(ph * 0.5 + i * 0.4) * 0.3 + Math.sin(ph * 1.3 + i * 0.8) * 0.2
      levels.current[i] += (target - levels.current[i]) * 0.1
      const bh = levels.current[i] * (h - 4)
      const grad = ctx.createLinearGradient(0, h, 0, h - bh)
      grad.addColorStop(0, color + "dd")
      grad.addColorStop(1, color + "33")
      ctx.fillStyle = grad
      ctx.fillRect(2 + i * bw, h - 2 - bh, bw - 1.5, bh)
    }
  }, [w, h, bands, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Formant display ──────────────────────────────────────────────────────────

function FormantDisplay({ w, h, morph, color }: {
  w: number; h: number; morph: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const vowels = ["A", "E", "I", "O", "U"]
  useAnimCanvas(ref, w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Formant peaks simulation
    const m = morph / 100 * 4 // 0-4 for A-E-I-O-U
    const formants = [
      [800, 1200, 2500], // A
      [350, 2000, 2800], // E
      [270, 2300, 3000], // I
      [450, 800, 2500],  // O
      [325, 700, 2500],  // U
    ]
    const idx = Math.floor(m)
    const frac = m - idx
    const f1 = formants[Math.min(idx, 4)]
    const f2 = formants[Math.min(idx + 1, 4)]
    const cf = f1.map((v, i) => v + (f2[i] - v) * frac)
    // Draw response
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const freq = 100 + (x / w) * 3400
      let response = 0
      cf.forEach(f => {
        response += Math.exp(-Math.pow((freq - f) / 120, 2))
      })
      const py = h - 4 - Math.min(1, response) * (h - 8)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = color + "18"; ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke()
    // Vowel label
    const vIdx = Math.round(m)
    ctx.fillStyle = color; ctx.font = "bold 12px monospace"; ctx.textAlign = "center"
    ctx.fillText(vowels[Math.min(vIdx, 4)], w / 2, 14)
  }, [w, h, morph, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Bitcrush display ─────────────────────────────────────────────────────────

function BitcrushDisplay({ w, h, bits, color }: {
  w: number; h: number; bits: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    const levels = Math.pow(2, bits)
    ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 3 + ph * 2
      let y = Math.sin(t)
      // Quantize
      y = Math.round(y * levels) / levels
      const py = h / 2 - y * (h / 2 - 4)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 4; ctx.stroke(); ctx.restore()
    ctx.stroke()
  }, [w, h, bits, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Clock display ────────────────────────────────────────────────────────────

function ClockDisplay({ w, h, bpm, color }: {
  w: number; h: number; bpm: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // BPM display
    ctx.fillStyle = color; ctx.font = "bold 16px monospace"; ctx.textAlign = "center"
    ctx.shadowColor = color; ctx.shadowBlur = 8
    ctx.fillText(`${Math.round(bpm)}`, w / 2, h / 2 - 2)
    ctx.shadowBlur = 0
    ctx.fillStyle = color + "88"; ctx.font = "6px monospace"
    ctx.fillText("BPM", w / 2, h / 2 + 10)
    // Pulse indicator
    const beatPhase = (ph * bpm / 60 * 0.05) % 1
    const pulse = beatPhase < 0.1 ? 1 - beatPhase / 0.1 : 0
    ctx.beginPath(); ctx.arc(w / 2, h - 10, 4 + pulse * 4, 0, Math.PI * 2)
    ctx.fillStyle = color + Math.round(pulse * 200 + 55).toString(16).padStart(2, "0")
    ctx.fill()
  }, [w, h, bpm, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Phaser display ───────────────────────────────────────────────────────────

function PhaserDisplay({ w, h, rate, stages, color }: {
  w: number; h: number; rate: number; stages: number; color: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useAnimCanvas(ref, w, h, (ctx, ph) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = "#020508"; ctx.fillRect(0, 0, w, h)
    // Phaser notches sweeping
    const speed = rate / 100 * 0.04
    ctx.beginPath()
    for (let x = 0; x <= w; x++) {
      const f = x / w
      let response = 1
      for (let s = 0; s < stages; s++) {
        const notch = 0.1 + s / stages * 0.8 + Math.sin(ph * speed * 60 + s * 0.3) * 0.1
        response *= 1 - 0.9 * Math.exp(-Math.pow((f - notch) * 20, 2))
      }
      const py = h - 4 - response * (h - 8)
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py)
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
    ctx.fillStyle = color + "15"; ctx.fill()
    ctx.strokeStyle = color; ctx.lineWidth = 1.5
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 4; ctx.stroke(); ctx.restore()
    ctx.stroke()
  }, [w, h, rate, stages, color])
  return <canvas ref={ref} width={w} height={h} style={{ display: "block", width: "100%", height: "100%" }} />
}

// ─── Module content renderer ──────────────────────────────────────────────────

function ModuleContent({ mod, wires, allModules, onChange }: {
  mod: ModuleInst; wires: Wire[]; allModules: ModuleInst[]
  onChange: (params: Record<string, number>) => void
}) {
  const def = MOD_DEFS[mod.type]
  const hasOut = def.ports.some(p => p.dir === "out")
  const hasIn = def.ports.some(p => p.dir === "in")
  const contentH = def.h - HDR_H - PORT_H * (hasOut ? 1 : 0) - PORT_H * (hasIn ? 1 : 0)
  const color = def.color
  const dispH = def.hasDisplay ? Math.min(contentH * 0.5, 85) : 0
  const knobH = contentH - dispH

  const knobRow = (ids: string[], cols: number) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 3, padding: "3px 5px",
      justifyItems: "center", alignItems: "start" }}>
      {ids.map(id => {
        const p = def.params.find(pp => pp.id === id)
        if (!p) return null
        return (
          <MiniKnob key={id}
            value={mod.params[id] ?? p.def}
            min={p.min} max={p.max} label={p.label} color={color} unit={p.unit}
            onChange={v => onChange({ ...mod.params, [id]: p.snap ? Math.round(v) : v })} />
        )
      })}
    </div>
  )

  const display = (content: React.ReactNode) => (
    <div style={{ height: dispH, overflow: "hidden", borderBottom: "1px solid rgba(0,0,0,0.08)",
      background: "linear-gradient(180deg,#0a0e18 0%,#050810 100%)", position: "relative" }}>
      {content}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,0.22) 100%)" }} />
    </div>
  )

  // ─── Per-module rendering ─────────────────
  if (mod.type === "SCOPE") {
    return (
      <div style={{ height: contentH }}>
        {display(<ScopeDisplay w={def.w - 4} h={dispH} wires={wires} modules={allModules} uid={mod.uid} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["TIME", "TRIG", "GAIN"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "SPECTRUM") {
    return (
      <div style={{ height: contentH }}>
        {display(<SpectrumDisplay w={def.w - 4} h={dispH} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["RANGE", "SPEED"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "VUMETER") {
    return (
      <div style={{ height: contentH }}>
        {display(<VUDisplay w={def.w - 4} h={contentH} />)}
      </div>
    )
  }

  if (mod.type === "XYPAD") {
    return (
      <div style={{ height: contentH }}>
        {display(
          <XYPadDisplay w={def.w - 4} h={dispH}
            xVal={mod.params["X"] ?? 50} yVal={mod.params["Y"] ?? 50} color={color}
            onChange={(x, y) => onChange({ ...mod.params, X: x, Y: y })} />
        )}
      </div>
    )
  }

  if (mod.type === "VCO") {
    return (
      <div style={{ height: contentH }}>
        {display(<VCODisplay w={def.w - 4} h={dispH} color={color} pw={mod.params["WIDTH"] ?? 50} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["OCT", "TUNE", "FINE", "WIDTH", "DRIFT", "FM_AMT"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "VCO2") {
    return (
      <div style={{ height: contentH }}>
        {display(<VCODisplay w={def.w - 4} h={dispH} color={color} pw={50} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["OCT", "VOICES", "DETUNE", "SPREAD", "MIX"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "WTOSC") {
    return (
      <div style={{ height: contentH }}>
        {display(<VCODisplay w={def.w - 4} h={dispH} color={color} pw={mod.params["POS"] ?? 0} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["OCT", "POS", "WARP", "TABLE"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "NOISE") {
    return (
      <div style={{ height: contentH }}>
        {display(<NoiseDisplay w={def.w - 4} h={dispH} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["LEVEL", "COLOR"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "VCF" || mod.type === "VCF_SEM") {
    return (
      <div style={{ height: contentH }}>
        {display(<FilterDisplay w={def.w - 4} h={dispH}
          cutoff={mod.params["CUTOFF"] ?? 70} reso={mod.params["RESO"] ?? 20} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(def.params.map(p => p.id), mod.type === "VCF" ? 3 : 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "VCF_MS20") {
    return (
      <div style={{ height: contentH }}>
        {display(<FilterDisplay w={def.w - 4} h={dispH}
          cutoff={mod.params["LP_CUT"] ?? 80} reso={mod.params["LP_RES"] ?? 20} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["HP_CUT", "LP_CUT", "HP_RES", "LP_RES"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "ENV") {
    return (
      <div style={{ height: contentH }}>
        {display(<EnvDisplay w={def.w - 4} h={dispH}
          a={mod.params["A"] ?? 2} d={mod.params["D"] ?? 30}
          s={mod.params["S"] ?? 70} r={mod.params["R"] ?? 20}
          curve={mod.params["CURVE"] ?? 0} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["A", "D", "S", "R", "CURVE"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "ENV_MULTI") {
    return (
      <div style={{ height: contentH }}>
        {display(<EnvDisplay w={def.w - 4} h={dispH}
          a={mod.params["T1"] ?? 5} d={mod.params["T2"] ?? 15}
          s={mod.params["L2"] ?? 70} r={mod.params["T4"] ?? 30}
          curve={0} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["T1", "L1", "T2", "L2", "T3", "L3", "T4", "LOOP"], 4)}
        </div>
      </div>
    )
  }

  if (mod.type === "LFO") {
    return (
      <div style={{ height: contentH }}>
        {display(<LFODisplay w={def.w - 4} h={dispH} rate={mod.params["RATE"] ?? 30} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["RATE", "DEPTH", "PHASE"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "LFO_COMPLEX") {
    return (
      <div style={{ height: contentH }}>
        {display(<LFODisplay w={def.w - 4} h={dispH} rate={mod.params["RATE_A"] ?? 25} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["RATE_A", "RATE_B", "FM", "SHAPE"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "WAVEFOLD") {
    return (
      <div style={{ height: contentH }}>
        {display(<WavefolderDisplay w={def.w - 4} h={dispH} fold={mod.params["FOLD"] ?? 50} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["FOLD", "SYMM", "OFFSET"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "RINGMOD") {
    return (
      <div style={{ height: contentH }}>
        {display(<WavefolderDisplay w={def.w - 4} h={dispH} fold={mod.params["MIX"] ?? 50} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["MIX", "FREQ"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "DISTORT") {
    return (
      <div style={{ height: contentH }}>
        {display(<DistortionDisplay w={def.w - 4} h={dispH} drive={mod.params["DRIVE"] ?? 40} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["DRIVE", "TONE", "ALGO", "MIX"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "DELAY") {
    return (
      <div style={{ height: contentH }}>
        {display(<DelayDisplay w={def.w - 4} h={dispH}
          time={mod.params["TIME"] ?? 40} fbk={mod.params["FBK"] ?? 40} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["TIME", "FBK", "MIX", "TONE", "PING"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "REVERB") {
    return (
      <div style={{ height: contentH }}>
        {display(<ReverbDisplay w={def.w - 4} h={dispH} size={mod.params["SIZE"] ?? 60} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["SIZE", "DAMP", "PREDLY", "SHIMMER", "MIX"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "PHASER") {
    return (
      <div style={{ height: contentH }}>
        {display(<PhaserDisplay w={def.w - 4} h={dispH}
          rate={mod.params["RATE"] ?? 35} stages={mod.params["STAGES"] ?? 6} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["RATE", "DEPTH", "FBK", "STAGES", "MIX"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "EQ3") {
    return (
      <div style={{ height: contentH }}>
        {display(<EQDisplay w={def.w - 4} h={dispH}
          low={mod.params["LOW"] ?? 0} mid={mod.params["MID"] ?? 0}
          high={mod.params["HIGH"] ?? 0} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["LOW", "MID", "HIGH", "MID_F"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "BITCRUSH") {
    return (
      <div style={{ height: contentH }}>
        {display(<BitcrushDisplay w={def.w - 4} h={dispH} bits={mod.params["BITS"] ?? 12} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["BITS", "RATE", "MIX"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "GRAINCLOUD") {
    return (
      <div style={{ height: contentH }}>
        {display(<GrainDisplay w={def.w - 4} h={dispH}
          grains={mod.params["GRAINS"] ?? 8} spread={mod.params["SPREAD"] ?? 50} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["GRAINS", "SIZE", "POS", "PITCH", "SPREAD", "SPRAY"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "FORMANT") {
    return (
      <div style={{ height: contentH }}>
        {display(<FormantDisplay w={def.w - 4} h={dispH} morph={mod.params["MORPH"] ?? 0} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["MORPH", "SHIFT", "WIDTH"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "VOCODER") {
    return (
      <div style={{ height: contentH }}>
        {display(<VocoderDisplay w={def.w - 4} h={dispH} bands={mod.params["BANDS"] ?? 12} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["BANDS", "ATTACK", "REL", "SHIFT"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "CLOCK") {
    return (
      <div style={{ height: contentH }}>
        {display(<ClockDisplay w={def.w - 4} h={dispH} bpm={mod.params["BPM"] ?? 120} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["BPM", "SWING", "RUN"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "SEQ8" || mod.type === "SEQ16") {
    const maxSteps = mod.type === "SEQ16" ? 16 : 8
    const steps = Math.round(mod.params["STEPS"] ?? maxSteps)
    return (
      <div style={{ height: contentH, display: "flex", flexDirection: "column", gap: 2, padding: "3px 5px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 6, color: "rgba(0,0,0,0.45)", textTransform: "uppercase" }}>STEPS</span>
          <input type="range" min={1} max={maxSteps} value={steps}
            onChange={e => onChange({ ...mod.params, STEPS: +e.target.value })}
            style={{ flex: 1, accentColor: color, height: 8 }} />
          <span style={{ fontFamily: "monospace", fontSize: 7, fontWeight: 700, color, width: 14, textAlign: "right" }}>{steps}</span>
        </div>
        <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "flex-end", minHeight: 0 }}>
          {Array.from({ length: maxSteps }, (_, i) => {
            const key = `S${i + 1}`
            const val = mod.params[key] ?? 50
            const active = i < steps
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1, opacity: active ? 1 : 0.2, minWidth: 0 }}>
                <div style={{ fontFamily: "monospace", fontSize: 5, color: active ? color : "rgba(0,0,0,0.3)" }}>{Math.round(val)}</div>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end",
                  background: "rgba(0,0,0,0.06)", borderRadius: 2, overflow: "hidden", minHeight: 30, position: "relative" }}
                  onMouseDown={e => {
                    e.stopPropagation()
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const doUpdate = (ev: MouseEvent) => {
                      const pct = 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
                      onChange({ ...mod.params, [key]: Math.round(pct * 100) })
                    }
                    doUpdate(e.nativeEvent)
                    const onMove = (ev: MouseEvent) => doUpdate(ev)
                    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
                    window.addEventListener("mousemove", onMove)
                    window.addEventListener("mouseup", onUp)
                  }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
                    height: `${val}%`, background: color, opacity: 0.85, borderRadius: 2,
                    boxShadow: active ? `0 0 6px ${color}` : "none" }} />
                </div>
                <div style={{ width: 5, height: 5, borderRadius: "50%",
                  background: active ? color : "rgba(0,0,0,0.15)",
                  boxShadow: active ? `0 0 4px ${color}` : "none" }} />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (mod.type === "COMP") {
    return (
      <div style={{ height: contentH }}>
        {display(<DistortionDisplay w={def.w - 4} h={dispH}
          drive={Math.abs(mod.params["THRESH"] ?? -20)} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["THRESH", "RATIO", "ATTACK", "REL", "GAIN"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "QUANT") {
    const scales = ["CHROM", "MAJOR", "MINOR", "PENTA", "BLUES", "WHOLE"]
    const scaleIdx = Math.round(mod.params["SCALE"] ?? 0)
    return (
      <div style={{ height: contentH }}>
        <div style={{ height: dispH, background: "#020508", display: "flex", alignItems: "center", justifyContent: "center",
          borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color,
            textShadow: `0 0 8px ${color}`, letterSpacing: "2px" }}>
            {scales[scaleIdx] ?? "CHROM"}
          </span>
        </div>
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["SCALE", "ROOT"], 2)}
        </div>
      </div>
    )
  }

  if (mod.type === "MIDI") {
    return (
      <div style={{ height: contentH, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px" }}>
        <div style={{ width: "100%", height: 36, background: "#020508", borderRadius: 3,
          border: "1px solid rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0,
            background: "repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,0,0,0.06) 1px,rgba(0,0,0,0.06) 2px)" }} />
          <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700,
            color, letterSpacing: "2px", textShadow: `0 0 8px ${color}` }}>MIDI</span>
        </div>
        {knobRow(["CHAN", "GLIDE"], 2)}
      </div>
    )
  }

  if (mod.type === "OUTPUT" || mod.type === "STEREO_OUT") {
    return (
      <div style={{ height: contentH }}>
        {display(<VUDisplay w={def.w - 4} h={dispH} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(def.params.map(p => p.id), mod.type === "STEREO_OUT" ? 3 : 1)}
        </div>
      </div>
    )
  }

  if (mod.type === "LOGIC") {
    return (
      <div style={{ height: contentH, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#020508", borderRadius: 3, padding: "6px 8px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px" }}>
          {["AND", "OR", "XOR", "NOT"].map(op => (
            <span key={op} style={{ fontFamily: "monospace", fontSize: 7, fontWeight: 700,
              color: color, letterSpacing: "1px", textShadow: `0 0 4px ${color}55` }}>{op}</span>
          ))}
        </div>
      </div>
    )
  }

  if (mod.type === "RAND") {
    return (
      <div style={{ height: contentH }}>
        {display(<NoiseDisplay w={def.w - 4} h={dispH} color={color} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["RATE", "RANGE", "SMOOTH"], 3)}
        </div>
      </div>
    )
  }

  if (mod.type === "MIXER") {
    return (
      <div style={{ height: contentH }}>
        {display(<VUDisplay w={def.w - 4} h={dispH} />)}
        <div style={{ height: knobH, overflow: "hidden" }}>
          {knobRow(["L1", "L2", "L3", "L4", "P1", "P2"], 3)}
        </div>
      </div>
    )
  }

  // Default: just knobs
  return (
    <div style={{ height: contentH, overflow: "hidden" }}>
      {knobRow(def.params.map(p => p.id), Math.min(def.params.length, 3))}
    </div>
  )
}

// ─── Module Card ──────────────────────────────────────────────────────────────

function ModuleCard({ mod, wires, allModules, selected, onMouseDown, onPortMouseDown, onPortMouseUp, onParamsChange }: {
  mod: ModuleInst
  wires: Wire[]
  allModules: ModuleInst[]
  selected: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onPortMouseDown: (portId: string, e: React.MouseEvent) => void
  onPortMouseUp: (portId: string) => void
  onParamsChange: (params: Record<string, number>) => void
}) {
  const def = MOD_DEFS[mod.type]
  const color = def.color

  const connectedPorts = new Set(
    wires.filter(w => w.srcMod === mod.uid || w.dstMod === mod.uid)
      .flatMap(w => [
        w.srcMod === mod.uid ? w.srcPort : null,
        w.dstMod === mod.uid ? w.dstPort : null,
      ]).filter(Boolean) as string[]
  )

  const renderPorts = (dir: PortDir) => {
    const ports = def.ports.filter(p => p.dir === dir)
    if (ports.length === 0) return null
    return (
      <div style={{
        height: PORT_H, display: "flex", alignItems: "center",
        justifyContent: ports.length === 1 ? "center" : "space-around",
        borderTop: dir === "in" ? "1px solid rgba(0,0,0,0.10)" : undefined,
        borderBottom: dir === "out" ? "1px solid rgba(0,0,0,0.10)" : undefined,
        background: dir === "out"
          ? "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)"
          : "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.06) 100%)",
        padding: "0 6px",
      }}>
        {ports.map(port => {
          const plugged = connectedPorts.has(port.id)
          const sigCol = port.sig === "audio" ? "#f59e0b" : port.sig === "gate" ? "#e2e8f0" : port.sig === "clock" ? "#facc15" : color
          return (
            <div key={port.id}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, flex: 1, cursor: "crosshair" }}
              onMouseDown={e => { e.stopPropagation(); onPortMouseDown(port.id, e) }}
              onMouseUp={() => onPortMouseUp(port.id)}>
              <PortJack sig={port.sig} plugged={plugged} color={sigCol} />
              <span style={{ fontFamily: "monospace", fontSize: 5, letterSpacing: "0.2px",
                color: plugged ? "rgba(0,0,0,0.60)" : "rgba(0,0,0,0.35)", textTransform: "uppercase" }}>
                {port.label}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div onMouseDown={onMouseDown} style={{
      width: def.w, height: def.h,
      borderRadius: 7, overflow: "hidden",
      background: "linear-gradient(180deg, #eceef3 0%, #e0e2e8 40%, #d8dae2 100%)",
      border: `1.5px solid ${selected ? color : "rgba(0,0,0,0.18)"}`,
      boxShadow: selected
        ? `0 0 22px ${color}44, 0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.85)`
        : "0 4px 16px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.80)",
      cursor: "grab", userSelect: "none", position: "relative",
      transition: "border-color 0.1s, box-shadow 0.1s",
    }}>
      {/* Brushed metal texture overlay */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(255,255,255,0.02) 1px, rgba(255,255,255,0.02) 2px)",
        zIndex: 1 }} />

      {/* Header — colored top stripe */}
      <div style={{
        height: HDR_H, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 8px", position: "relative", zIndex: 2,
        background: `linear-gradient(180deg, ${color}dd 0%, ${color}99 100%)`,
        borderBottom: "1px solid rgba(0,0,0,0.18)",
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.15)`,
      }}>
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 9,
          color: "#fff", letterSpacing: "1.5px", textTransform: "uppercase",
          textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
          {def.label}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 5, color: "rgba(255,255,255,0.55)",
          letterSpacing: "0.8px", textTransform: "uppercase" }}>
          {def.category}
        </span>
      </div>

      {/* Output port strip */}
      <div style={{ position: "relative", zIndex: 2 }}>{renderPorts("out")}</div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, overflow: "hidden",
        height: def.h - HDR_H
          - (def.ports.some(p => p.dir === "out") ? PORT_H : 0)
          - (def.ports.some(p => p.dir === "in") ? PORT_H : 0) }}>
        <ModuleContent mod={mod} wires={wires} allModules={allModules} onChange={onParamsChange} />
      </div>

      {/* Input port strip */}
      <div style={{ position: "relative", zIndex: 2 }}>{renderPorts("in")}</div>
    </div>
  )
}

// ─── Wire SVG layer ───────────────────────────────────────────────────────────

function WireLayer({ wires, modules, selectedId, onSelect, jackDrag, dragMouse, nextWireColor }: {
  wires: Wire[]; modules: ModuleInst[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  jackDrag: { modUid: string; portId: string; dir: PortDir; sig: SigType } | null
  dragMouse: { x: number; y: number } | null
  nextWireColor: string
}) {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
      pointerEvents: "none", overflow: "visible" }}>
      <defs>
        <filter id="wsel" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={5} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="wdim" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={1.5} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="wdrag" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={3} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {[false, true].flatMap(drawSel =>
        wires.filter(w => (w.id === selectedId) === drawSel).map(wire => {
          const srcMod = modules.find(m => m.uid === wire.srcMod)
          const dstMod = modules.find(m => m.uid === wire.dstMod)
          if (!srcMod || !dstMod) return null
          const sp = getPortPos(srcMod, wire.srcPort)
          const dp = getPortPos(dstMod, wire.dstPort)
          if (!sp || !dp) return null

          const col = wireColor(wire, modules)
          const isSel = wire.id === selectedId
          const srcDef = MOD_DEFS[srcMod.type]
          const srcPort = srcDef.ports.find(p => p.id === wire.srcPort)
          const sig: SigType = srcPort?.sig ?? "cv"
          const thick = sig === "audio" ? 4.5 : sig === "gate" ? 2 : sig === "clock" ? 2.5 : 3.5
          const opacity = selectedId !== null && !isSel ? 0.14 : isSel ? 1 : 0.40
          const dPath = catenaryPath(sp.x, sp.y, dp.x, dp.y)
          const dur = sig === "audio" ? "1.4s" : sig === "clock" ? "0.8s" : "2s"

          return (
            <g key={wire.id} style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={() => onSelect(isSel ? null : wire.id)}>
              <path d={dPath} stroke="transparent" strokeWidth={18} fill="none" style={{ pointerEvents: "stroke" }} />
              {/* Shadow */}
              <path d={dPath} stroke="rgba(0,0,0,0.5)" strokeWidth={thick + 3}
                fill="none" strokeLinecap="round" transform="translate(0,4)" opacity={opacity} />
              {/* Body */}
              <path d={dPath} stroke={col} strokeWidth={isSel ? thick + 1.5 : thick}
                fill="none" strokeLinecap="round"
                opacity={opacity} filter={isSel ? "url(#wsel)" : undefined} />
              {/* Specular */}
              <path d={dPath} stroke="rgba(255,255,255,0.22)" strokeWidth={0.9}
                fill="none" strokeLinecap="round" opacity={opacity * 0.85} />
              {/* Particles on selection */}
              {isSel && (
                <>
                  <circle r={4} fill={col} opacity={0.92} filter="url(#wsel)">
                    <animateMotion dur={dur} repeatCount="indefinite" path={dPath} />
                  </circle>
                  {sig === "audio" && (
                    <circle r={2.5} fill={col} opacity={0.40} filter="url(#wsel)">
                      <animateMotion dur={dur} repeatCount="indefinite" path={dPath} begin="-0.6s" />
                    </circle>
                  )}
                </>
              )}
            </g>
          )
        })
      )}

      {/* Drag preview */}
      {jackDrag && dragMouse && (() => {
        const mod = modules.find(m => m.uid === jackDrag.modUid)
        if (!mod) return null
        const sp = getPortPos(mod, jackDrag.portId)
        if (!sp) return null
        const x1 = jackDrag.dir === "out" ? sp.x : dragMouse.x
        const y1 = jackDrag.dir === "out" ? sp.y : dragMouse.y
        const x2 = jackDrag.dir === "out" ? dragMouse.x : sp.x
        const y2 = jackDrag.dir === "out" ? dragMouse.y : sp.y
        const d = catenaryPath(x1, y1, x2, y2)
        return (
          <g>
            <path d={d} stroke="rgba(0,0,0,0.4)" strokeWidth={6} fill="none" strokeLinecap="round" transform="translate(0,4)" />
            <path d={d} stroke={nextWireColor} strokeWidth={3.5} fill="none" strokeLinecap="round"
              strokeDasharray="10,5" opacity={0.88} filter="url(#wdrag)" />
            <path d={d} stroke="rgba(255,255,255,0.25)" strokeWidth={0.9} fill="none" strokeLinecap="round" />
          </g>
        )
      })()}
    </svg>
  )
}

// ─── Module library sidebar ───────────────────────────────────────────────────

const CATEGORY_ORDER = ["IO", "SOUND", "FILTER", "AMP", "MODULATE", "SEQUENCER", "FX", "WAVESHAPE", "UTILITY", "VISUAL", "ADVANCED"]
const CATEGORY_LABELS: Record<string, string> = {
  IO: "I / O", SOUND: "SOUND SOURCES", FILTER: "FILTERS", AMP: "AMPLIFIERS",
  MODULATE: "MODULATORS", SEQUENCER: "SEQUENCERS", FX: "EFFECTS",
  WAVESHAPE: "WAVESHAPING", UTILITY: "UTILITY", VISUAL: "VISUAL / MONITOR", ADVANCED: "ADVANCED",
}
const CATEGORY_COLORS: Record<string, string> = {
  IO: "#10b981", SOUND: "#5865f2", FILTER: "#a855f7", AMP: "#f59e0b",
  MODULATE: "#06b6d4", SEQUENCER: "#fbbf24", FX: "#f472b6",
  WAVESHAPE: "#e11d48", UTILITY: "#94a3b8", VISUAL: "#34d399", ADVANCED: "#ec4899",
}

function ModuleLibrary({ onAdd }: { onAdd: (type: ModuleType) => void }) {
  const [filter, setFilter] = useState("")
  return (
    <div style={{
      width: 180, flexShrink: 0, display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #e6e8ed 0%, #dcdfe6 100%)",
      borderRight: "1px solid var(--panel-shadow)",
      boxShadow: "inset -2px 0 6px rgba(0,0,0,0.08)",
    }}>
      <div style={{ padding: "7px 8px", borderBottom: "1px solid var(--panel-shadow)", flexShrink: 0 }}>
        <span style={{ fontFamily: "monospace", fontSize: 7, letterSpacing: "2px",
          color: "var(--text-section)", textTransform: "uppercase", display: "block", marginBottom: 4, fontWeight: 700 }}>
          MODULE LIBRARY
        </span>
        <input
          placeholder="Search modules..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            width: "100%", fontFamily: "monospace", fontSize: 8, padding: "4px 7px",
            background: "rgba(255,255,255,0.65)", border: "1px solid var(--panel-shadow)",
            borderRadius: 3, color: "var(--text-value)", outline: "none",
          }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 0" }}>
        {CATEGORY_ORDER.map(cat => {
          const types = (Object.entries(MOD_DEFS) as [ModuleType, ModuleDef][])
            .filter(([, d]) => d.category === cat &&
              (filter === "" || d.label.toLowerCase().includes(filter.toLowerCase()) ||
               d.description.toLowerCase().includes(filter.toLowerCase()) ||
               cat.toLowerCase().includes(filter.toLowerCase())))
          if (types.length === 0) return null
          return (
            <div key={cat}>
              <div style={{ padding: "4px 8px 2px", display: "flex", alignItems: "center", gap: 4,
                fontFamily: "monospace", fontSize: 5.5, letterSpacing: "1.5px", textTransform: "uppercase",
                color: CATEGORY_COLORS[cat] ?? "var(--text-label)", fontWeight: 700,
                borderBottom: "1px solid var(--panel-shadow)", background: "rgba(0,0,0,0.03)" }}>
                <div style={{ width: 3, height: 3, borderRadius: "50%", background: CATEGORY_COLORS[cat],
                  boxShadow: `0 0 4px ${CATEGORY_COLORS[cat]}` }} />
                {CATEGORY_LABELS[cat] ?? cat}
                <span style={{ marginLeft: "auto", fontSize: 5, color: "rgba(0,0,0,0.30)" }}>{types.length}</span>
              </div>
              {types.map(([type, def]) => (
                <div key={type}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
                    cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.40)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                  onDoubleClick={() => onAdd(type)}>
                  <div style={{ width: 4, borderRadius: 1.5, alignSelf: "stretch",
                    background: def.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 8, fontWeight: 700,
                      color: "var(--text-value)", letterSpacing: "0.3px" }}>{def.label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 5.5, color: "var(--text-label)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {def.description}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onAdd(type) }}
                    style={{ width: 18, height: 18, borderRadius: "50%", border: "none",
                      background: def.color, color: "#fff", fontSize: 11, fontWeight: 700,
                      cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center",
                      justifyContent: "center", lineHeight: 1,
                      boxShadow: `0 0 8px ${def.color}55` }}>
                    +
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Canvas ──────────────────────────────────────────────────────────────

function ModularCanvas({
  modules, wires, selectedWireId, setSelectedWireId,
  setModules, setWires,
}: {
  modules: ModuleInst[]; wires: Wire[]
  selectedWireId: string | null; setSelectedWireId: (id: string | null) => void
  setModules: React.Dispatch<React.SetStateAction<ModuleInst[]>>
  setWires: React.Dispatch<React.SetStateAction<Wire[]>>
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [cardDrag, setCardDrag] = useState<{ uid: string; ox: number; oy: number } | null>(null)
  const [jackDrag, setJackDrag] = useState<{ modUid: string; portId: string; dir: PortDir; sig: SigType } | null>(null)
  const [dragMouse, setDragMouse] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const cr = scrollRef.current?.getBoundingClientRect(); if (!cr) return
      const mx = e.clientX - cr.left + (scrollRef.current?.scrollLeft ?? 0)
      const my = e.clientY - cr.top + (scrollRef.current?.scrollTop ?? 0)
      if (cardDrag) {
        setModules(prev => prev.map(m =>
          m.uid === cardDrag.uid ? { ...m, x: Math.max(0, mx - cardDrag.ox), y: Math.max(0, my - cardDrag.oy) } : m
        ))
      }
      if (jackDrag) setDragMouse({ x: mx, y: my })
    }
    const onUp = () => {
      setCardDrag(null)
      if (jackDrag) { setJackDrag(null); setDragMouse(null) }
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
  }, [cardDrag, jackDrag, setModules])

  const startPortDrag = useCallback((modUid: string, portId: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const cr = scrollRef.current?.getBoundingClientRect(); if (!cr) return
    const mod = modules.find(m => m.uid === modUid); if (!mod) return
    const def = MOD_DEFS[mod.type]
    const port = def.ports.find(p => p.id === portId); if (!port) return
    setJackDrag({ modUid, portId, dir: port.dir, sig: port.sig })
    setDragMouse({
      x: e.clientX - cr.left + (scrollRef.current?.scrollLeft ?? 0),
      y: e.clientY - cr.top + (scrollRef.current?.scrollTop ?? 0),
    })
  }, [modules])

  const endPortDrop = useCallback((dstModUid: string, dstPortId: string) => {
    if (!jackDrag) return
    const dstMod = modules.find(m => m.uid === dstModUid); if (!dstMod) return
    const dstDef = MOD_DEFS[dstMod.type]
    const dstPort = dstDef.ports.find(p => p.id === dstPortId); if (!dstPort) return

    const srcModUid = jackDrag.dir === "out" ? jackDrag.modUid : dstModUid
    const srcPortId = jackDrag.dir === "out" ? jackDrag.portId : dstPortId
    const destModUid = jackDrag.dir === "in" ? jackDrag.modUid : dstModUid
    const destPortId = jackDrag.dir === "in" ? jackDrag.portId : dstPortId

    if (jackDrag.dir === dstPort.dir) return

    const exists = wires.find(w => w.srcMod === srcModUid && w.srcPort === srcPortId
      && w.dstMod === destModUid && w.dstPort === destPortId)
    if (!exists) {
      setWires(prev => [...prev, {
        id: `w${Date.now()}`, srcMod: srcModUid, srcPort: srcPortId,
        dstMod: destModUid, dstPort: destPortId,
      }])
    }
    setJackDrag(null); setDragMouse(null)
  }, [jackDrag, modules, wires, setWires])

  const WIRE_COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#e91e63", "#00bcd4", "#ff5722"]
  const nextWireColor = WIRE_COLORS[wires.length % WIRE_COLORS.length]

  const canvasW = Math.max(...modules.map(m => m.x + MOD_DEFS[m.type].w + 60), 1600)
  const canvasH = Math.max(...modules.map(m => m.y + MOD_DEFS[m.type].h + 80), 800)

  return (
    <div ref={scrollRef} style={{
      flex: 1, overflow: "auto", position: "relative",
      background: "radial-gradient(ellipse at 50% 30%, #0d1525 0%, #050810 100%)",
      cursor: jackDrag ? "crosshair" : cardDrag ? "grabbing" : "default",
    }}>
      <div style={{ position: "relative", width: canvasW, height: canvasH, minWidth: "100%", minHeight: "100%" }}>

        {/* Dot grid background */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <defs>
            <pattern id="mgrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="0.5" cy="0.5" r="0.6" fill="rgba(255,255,255,0.06)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mgrid)" />
        </svg>

        {/* Wires */}
        <WireLayer
          wires={wires} modules={modules}
          selectedId={selectedWireId} onSelect={setSelectedWireId}
          jackDrag={jackDrag} dragMouse={dragMouse}
          nextWireColor={nextWireColor}
        />

        {/* Module cards */}
        {modules.map(mod => (
          <div key={mod.uid} style={{ position: "absolute", left: mod.x, top: mod.y, zIndex: 5 }}>
            <ModuleCard
              mod={mod} wires={wires} allModules={modules}
              selected={wires.some(w => w.id === selectedWireId && (w.srcMod === mod.uid || w.dstMod === mod.uid))}
              onMouseDown={e => {
                if ((e.target as HTMLElement).closest("[data-port]")) return
                e.preventDefault(); e.stopPropagation()
                const cr = scrollRef.current?.getBoundingClientRect(); if (!cr) return
                setCardDrag({
                  uid: mod.uid,
                  ox: e.clientX - cr.left + (scrollRef.current?.scrollLeft ?? 0) - mod.x,
                  oy: e.clientY - cr.top + (scrollRef.current?.scrollTop ?? 0) - mod.y,
                })
                setSelectedWireId(null)
              }}
              onPortMouseDown={(portId, e) => startPortDrag(mod.uid, portId, e)}
              onPortMouseUp={portId => endPortDrop(mod.uid, portId)}
              onParamsChange={params => setModules(prev => prev.map(m => m.uid === mod.uid ? { ...m, params } : m))}
            />
          </div>
        ))}
      </div>

      {jackDrag && <div style={{ position: "fixed", inset: 0, cursor: "crosshair", zIndex: 9999, pointerEvents: "none" }} />}
    </div>
  )
}

// ─── Selected wire info bar ───────────────────────────────────────────────────

function WireInfoBar({ wire, modules, onDeselect, onRemove }: {
  wire: Wire; modules: ModuleInst[]
  onDeselect: () => void; onRemove: () => void
}) {
  const srcMod = modules.find(m => m.uid === wire.srcMod)
  const dstMod = modules.find(m => m.uid === wire.dstMod)
  const col = wireColor(wire, modules)
  const srcDef = srcMod ? MOD_DEFS[srcMod.type] : null
  const srcPort = srcDef?.ports.find(p => p.id === wire.srcPort)
  const sig: SigType = srcPort?.sig ?? "cv"
  const sigLabel = sig === "audio" ? "AUDIO" : sig === "gate" ? "GATE" : sig === "clock" ? "CLOCK" : "CV"

  return (
    <div style={{
      position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "rgba(6,10,20,0.96)", border: `1.5px solid ${col}55`,
      borderRadius: 8, padding: "8px 16px",
      boxShadow: `0 0 30px ${col}30, 0 6px 24px rgba(0,0,0,0.85)`,
      backdropFilter: "blur(14px)", zIndex: 50, whiteSpace: "nowrap", pointerEvents: "auto",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, boxShadow: `0 0 8px ${col}` }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: "monospace", fontSize: 5.5, color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase", letterSpacing: "0.8px" }}>FROM</span>
        <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700,
          color: srcDef?.color ?? "#fff", textTransform: "uppercase" }}>
          {srcMod ? MOD_DEFS[srcMod.type].label : "?"} · {wire.srcPort}
        </span>
      </div>
      <svg width={22} height={10} viewBox="0 0 22 10">
        <path d="M 0 5 L 16 5 L 12 2 M 16 5 L 12 8" stroke={col} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: "monospace", fontSize: 5.5, color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase", letterSpacing: "0.8px" }}>TO</span>
        <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700,
          color: "#e2e8f0", textTransform: "uppercase" }}>
          {dstMod ? MOD_DEFS[dstMod.type].label : "?"} · {wire.dstPort}
        </span>
      </div>
      <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.12)" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontFamily: "monospace", fontSize: 5.5, color: "rgba(255,255,255,0.35)",
          textTransform: "uppercase", letterSpacing: "0.8px" }}>TYPE</span>
        <span style={{ fontFamily: "monospace", fontSize: 8.5, fontWeight: 700, color: col }}>{sigLabel}</span>
      </div>
      <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.12)" }} />
      <button onClick={onRemove} style={{
        fontFamily: "monospace", fontSize: 8, color: "#ef4444",
        background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.28)",
        borderRadius: 4, padding: "4px 10px", cursor: "pointer", letterSpacing: "0.5px",
      }}>✕ DISCONNECT</button>
      <button onClick={onDeselect} style={{
        fontFamily: "monospace", fontSize: 8, color: "rgba(255,255,255,0.40)",
        background: "transparent", border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 4, padding: "4px 8px", cursor: "pointer",
      }}>ESC</button>
    </div>
  )
}

// ─── Main ModularPage ─────────────────────────────────────────────────────────

export function ModularPage() {
  const [modules, setModules] = useState<ModuleInst[]>(DEFAULT_MODULES)
  const [wires, setWires] = useState<Wire[]>(DEFAULT_WIRES)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  const [showLibrary, setShowLibrary] = useState(true)

  const selectedWire = wires.find(w => w.id === selectedWireId) ?? null

  const addModule = useCallback((type: ModuleType) => {
    const uid = `${type.toLowerCase()}_${Date.now()}`
    const def = MOD_DEFS[type]
    const params: Record<string, number> = {}
    def.params.forEach(p => { params[p.id] = p.def })
    setModules(prev => [...prev, {
      uid, type,
      x: 20 + (prev.length % 8) * 50,
      y: 20 + Math.floor(prev.length / 8) * 50,
      params,
    }])
  }, [])

  const resetRack = () => {
    setModules(DEFAULT_MODULES.map(m => ({ ...m, params: { ...m.params } })))
    setWires(DEFAULT_WIRES.map(w => ({ ...w })))
    setSelectedWireId(null)
  }

  // Keyboard: DEL removes selected wire, ESC deselects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedWire) {
        setWires(p => p.filter(w => w.id !== selectedWire.id))
        setSelectedWireId(null)
      }
      if (e.key === "Escape") setSelectedWireId(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedWire])

  const moduleCount = modules.length
  const wireCount = wires.length

  return (
    <div className="flex flex-col w-full h-full overflow-hidden select-none">

      {/* ─── Toolbar ─── */}
      <div style={{
        flexShrink: 0, height: 32,
        background: "linear-gradient(180deg, #e0e3e9 0%, #d2d6de 100%)",
        borderBottom: "1px solid var(--panel-shadow)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
        display: "flex", alignItems: "center", gap: 5, padding: "0 12px",
      }}>
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981",
            boxShadow: "0 0 8px #10b981", animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 9.5,
            color: "var(--text-value)", letterSpacing: "2px", textTransform: "uppercase" }}>
            MODULAR
          </span>
          <span style={{ fontFamily: "monospace", fontSize: 6, color: "var(--text-label)", letterSpacing: "1px" }}>
            PATCH BAY
          </span>
        </div>

        {/* Library toggle */}
        <button onClick={() => setShowLibrary(v => !v)}
          className="font-mono uppercase px-2"
          style={{
            height: 21, fontSize: 6.5, letterSpacing: "1px", borderRadius: 3, cursor: "pointer",
            background: showLibrary ? "rgba(88,101,242,0.15)" : "rgba(255,255,255,0.55)",
            color: showLibrary ? "#5865f2" : "var(--text-label)",
            border: `1px solid ${showLibrary ? "#5865f2" : "var(--panel-shadow)"}`,
            transition: "all 0.15s",
          }}>
          {showLibrary ? "HIDE LIBRARY" : "SHOW LIBRARY"}
        </button>

        <div style={{ width: 1, height: 16, background: "var(--panel-shadow)" }} />

        <button onClick={resetRack}
          className="font-mono uppercase px-2"
          style={{
            height: 21, fontSize: 6.5, letterSpacing: "1px", borderRadius: 3, cursor: "pointer",
            background: "rgba(255,255,255,0.55)", color: "var(--text-label)",
            border: "1px solid var(--panel-shadow)",
          }}>
          RESET RACK
        </button>

        <div style={{ flex: 1 }} />

        {/* Signal legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[
            { col: "#f59e0b", label: "AUDIO", thick: 4 },
            { col: "#5865f2", label: "CV", thick: 3 },
            { col: "#e2e8f0", label: "GATE", thick: 2 },
            { col: "#facc15", label: "CLOCK", thick: 2.5 },
          ].map(({ col, label, thick }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 16, height: thick, borderRadius: 1, background: col,
                boxShadow: `0 0 4px ${col}88` }} />
              <span style={{ fontFamily: "monospace", fontSize: 6, color: "var(--text-label)", letterSpacing: "0.5px" }}>
                {label}
              </span>
            </div>
          ))}
          <div style={{ width: 1, height: 14, background: "var(--panel-shadow)" }} />
          <span style={{ fontFamily: "monospace", fontSize: 6.5, color: "var(--text-label)", fontWeight: 600 }}>
            {moduleCount} MOD · {wireCount} WIRE
          </span>
        </div>
      </div>

      {/* ─── Body ─── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {showLibrary && <ModuleLibrary onAdd={addModule} />}

        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <ModularCanvas
            modules={modules} wires={wires}
            selectedWireId={selectedWireId} setSelectedWireId={setSelectedWireId}
            setModules={setModules} setWires={setWires}
          />

          {selectedWire && (
            <WireInfoBar
              wire={selectedWire} modules={modules}
              onDeselect={() => setSelectedWireId(null)}
              onRemove={() => {
                setWires(p => p.filter(w => w.id !== selectedWire.id))
                setSelectedWireId(null)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
