/**
 * @generated — DO NOT EDIT BY HAND
 *
 * Numeric parameter IDs that mirror the `ParamId` enum in
 * `hypersynth-engine/engine/src/params.rs`.
 *
 * These IDs are stable across versions and are used for:
 *   • Fast WASM parameter changes (set_param_by_id)
 *   • Preset serialization / deserialization
 *   • Mod-matrix destination list
 *   • DAW automation
 *
 * Regenerate by running: `cargo run -p hypersynth-build-tools -- gen-param-map`
 * (build tool not yet written; IDs are maintained manually until then)
 */

// ── Curve / Unit constants ───────────────────────────────────────────────────

export const ParamCurve = {
  Linear:      "linear",
  Logarithmic: "logarithmic",
  Exponential: "exponential",
} as const;
export type ParamCurve = (typeof ParamCurve)[keyof typeof ParamCurve];

export const ParamUnit = {
  Hz:        "hz",
  Db:        "db",
  Percent:   "percent",
  Ms:        "ms",
  Seconds:   "seconds",
  Semitones: "semitones",
  Cents:     "cents",
  None:      "none",
} as const;
export type ParamUnit = (typeof ParamUnit)[keyof typeof ParamUnit];

// ── Descriptor type ──────────────────────────────────────────────────────────

export interface ParamDescriptor {
  id:          number;
  name:        string;
  shortName:   string;
  min:         number;
  max:         number;
  default:     number;
  curve:       ParamCurve;
  unit:        ParamUnit;
  smoothingMs: number;
}

// ── Numeric IDs ──────────────────────────────────────────────────────────────

export const P = {
  // === FILTER (0–19) ===
  FilterCutoff:    0,
  FilterResonance: 1,
  FilterDrive:     2,
  FilterEnvAmount: 3,

  // === MASTER (20–29) ===
  MasterVolume: 20,

  // === LFO 1 (30–49) ===
  Lfo1Rate:      30,
  Lfo1Waveform:  31,
  Lfo1MixAmount: 32,

  // === AMP ENVELOPE (50–59) ===
  AmpAttack:  50,
  AmpDecay:   51,
  AmpSustain: 52,
  AmpRelease: 53,

  // === FILTER ENVELOPE (60–69) ===
  FilterEnvAttack:   60,
  FilterEnvDecay:    61,
  FilterEnvSustain:  62,
  FilterEnvRelease:  63,

  // === OSC 1 (100–149) ===
  Osc1Level:      100,
  Osc1Tune:       101,
  Osc1Detune:     102,
  Osc1Pan:        103,
  Osc1Waveform:   104,
  Osc1PulseWidth: 105,

  // === OSC 2 (150–199) ===
  Osc2Level:      150,
  Osc2Tune:       151,
  Osc2Detune:     152,
  Osc2Pan:        153,
  Osc2Waveform:   154,
  Osc2PulseWidth: 155,

  // === OSC 3 (200–249) ===
  Osc3Level:      200,
  Osc3Tune:       201,
  Osc3Detune:     202,
  Osc3Pan:        203,
  Osc3Waveform:   204,
  Osc3PulseWidth: 205,
} as const;

export type PId = (typeof P)[keyof typeof P];

// ── Full descriptor table ────────────────────────────────────────────────────

export const PARAM_DESCRIPTORS: ReadonlyArray<ParamDescriptor> = [
  // Filter
  { id: P.FilterCutoff,    name: "Filter Cutoff",    shortName: "CUTOFF", min: 20,    max: 20000, default: 12000, curve: "logarithmic", unit: "hz",       smoothingMs: 5  },
  { id: P.FilterResonance, name: "Filter Resonance", shortName: "RESO",   min: 0,     max: 1,     default: 0.2,   curve: "linear",      unit: "none",     smoothingMs: 5  },
  { id: P.FilterDrive,     name: "Filter Drive",     shortName: "DRIVE",  min: 0,     max: 1,     default: 0,     curve: "linear",      unit: "none",     smoothingMs: 0  },
  { id: P.FilterEnvAmount, name: "Filter Env Amt",   shortName: "ENV",    min: -1,    max: 1,     default: 0.35,  curve: "linear",      unit: "none",     smoothingMs: 0  },
  // Master
  { id: P.MasterVolume,    name: "Master Volume",    shortName: "VOL",    min: 0,     max: 1,     default: 0.8,   curve: "linear",      unit: "none",     smoothingMs: 5  },
  // LFO
  { id: P.Lfo1Rate,        name: "LFO 1 Rate",       shortName: "RATE",   min: 0.01,  max: 20,    default: 1,     curve: "logarithmic", unit: "hz",       smoothingMs: 0  },
  { id: P.Lfo1Waveform,    name: "LFO 1 Waveform",   shortName: "WAVE",   min: 0,     max: 4,     default: 0,     curve: "linear",      unit: "none",     smoothingMs: 0  },
  { id: P.Lfo1MixAmount,   name: "LFO 1 Mix",        shortName: "MIX",    min: 0,     max: 1,     default: 0,     curve: "linear",      unit: "none",     smoothingMs: 0  },
  // Amp envelope
  { id: P.AmpAttack,       name: "Amp Attack",       shortName: "ATK",    min: 0.001, max: 10,    default: 0.01,  curve: "exponential", unit: "seconds",  smoothingMs: 0  },
  { id: P.AmpDecay,        name: "Amp Decay",        shortName: "DEC",    min: 0.001, max: 10,    default: 0.12,  curve: "exponential", unit: "seconds",  smoothingMs: 0  },
  { id: P.AmpSustain,      name: "Amp Sustain",      shortName: "SUS",    min: 0,     max: 1,     default: 0.8,   curve: "linear",      unit: "none",     smoothingMs: 0  },
  { id: P.AmpRelease,      name: "Amp Release",      shortName: "REL",    min: 0.001, max: 30,    default: 0.2,   curve: "exponential", unit: "seconds",  smoothingMs: 0  },
  // Filter envelope
  { id: P.FilterEnvAttack,  name: "Filter Env Attack",  shortName: "ATK", min: 0.001, max: 10,  default: 0.01, curve: "exponential", unit: "seconds", smoothingMs: 0 },
  { id: P.FilterEnvDecay,   name: "Filter Env Decay",   shortName: "DEC", min: 0.001, max: 10,  default: 0.2,  curve: "exponential", unit: "seconds", smoothingMs: 0 },
  { id: P.FilterEnvSustain, name: "Filter Env Sustain", shortName: "SUS", min: 0,     max: 1,   default: 0,    curve: "linear",      unit: "none",    smoothingMs: 0 },
  { id: P.FilterEnvRelease, name: "Filter Env Release", shortName: "REL", min: 0.001, max: 30,  default: 0.3,  curve: "exponential", unit: "seconds", smoothingMs: 0 },
  // Osc 1
  { id: P.Osc1Level,      name: "Osc 1 Level",    shortName: "LVL",  min: 0,    max: 1,    default: 1,   curve: "linear", unit: "none",      smoothingMs: 5 },
  { id: P.Osc1Tune,       name: "Osc 1 Tune",     shortName: "TUNE", min: -24,  max: 24,   default: 0,   curve: "linear", unit: "semitones", smoothingMs: 0 },
  { id: P.Osc1Detune,     name: "Osc 1 Detune",   shortName: "DET",  min: -100, max: 100,  default: 0,   curve: "linear", unit: "cents",     smoothingMs: 0 },
  { id: P.Osc1Pan,        name: "Osc 1 Pan",      shortName: "PAN",  min: -1,   max: 1,    default: 0,   curve: "linear", unit: "none",      smoothingMs: 5 },
  { id: P.Osc1Waveform,   name: "Osc 1 Waveform", shortName: "WAVE", min: 0,    max: 4,    default: 2,   curve: "linear", unit: "none",      smoothingMs: 0 },
  { id: P.Osc1PulseWidth, name: "Osc 1 PW",       shortName: "PW",   min: 0.1,  max: 0.9,  default: 0.5, curve: "linear", unit: "none",      smoothingMs: 0 },
  // Osc 2
  { id: P.Osc2Level,      name: "Osc 2 Level",    shortName: "LVL",  min: 0,    max: 1,    default: 0,   curve: "linear", unit: "none",      smoothingMs: 5 },
  { id: P.Osc2Tune,       name: "Osc 2 Tune",     shortName: "TUNE", min: -24,  max: 24,   default: 0,   curve: "linear", unit: "semitones", smoothingMs: 0 },
  { id: P.Osc2Detune,     name: "Osc 2 Detune",   shortName: "DET",  min: -100, max: 100,  default: 0,   curve: "linear", unit: "cents",     smoothingMs: 0 },
  { id: P.Osc2Pan,        name: "Osc 2 Pan",      shortName: "PAN",  min: -1,   max: 1,    default: 0,   curve: "linear", unit: "none",      smoothingMs: 5 },
  { id: P.Osc2Waveform,   name: "Osc 2 Waveform", shortName: "WAVE", min: 0,    max: 4,    default: 3,   curve: "linear", unit: "none",      smoothingMs: 0 },
  { id: P.Osc2PulseWidth, name: "Osc 2 PW",       shortName: "PW",   min: 0.1,  max: 0.9,  default: 0.5, curve: "linear", unit: "none",      smoothingMs: 0 },
  // Osc 3
  { id: P.Osc3Level,      name: "Osc 3 Level",    shortName: "LVL",  min: 0,    max: 1,    default: 0,   curve: "linear", unit: "none",      smoothingMs: 5 },
  { id: P.Osc3Tune,       name: "Osc 3 Tune",     shortName: "TUNE", min: -24,  max: 24,   default: 0,   curve: "linear", unit: "semitones", smoothingMs: 0 },
  { id: P.Osc3Detune,     name: "Osc 3 Detune",   shortName: "DET",  min: -100, max: 100,  default: 0,   curve: "linear", unit: "cents",     smoothingMs: 0 },
  { id: P.Osc3Pan,        name: "Osc 3 Pan",      shortName: "PAN",  min: -1,   max: 1,    default: 0,   curve: "linear", unit: "none",      smoothingMs: 5 },
  { id: P.Osc3Waveform,   name: "Osc 3 Waveform", shortName: "WAVE", min: 0,    max: 4,    default: 1,   curve: "linear", unit: "none",      smoothingMs: 0 },
  { id: P.Osc3PulseWidth, name: "Osc 3 PW",       shortName: "PW",   min: 0.1,  max: 0.9,  default: 0.5, curve: "linear", unit: "none",      smoothingMs: 0 },
];

/** Fast O(1) lookup by numeric ID. */
export const PARAM_BY_ID: ReadonlyMap<number, ParamDescriptor> = new Map(
  PARAM_DESCRIPTORS.map((d) => [d.id, d])
);

/** Look up a descriptor by its numeric ID. Returns undefined for unknown IDs. */
export function getParamDescriptor(id: number): ParamDescriptor | undefined {
  return PARAM_BY_ID.get(id);
}
