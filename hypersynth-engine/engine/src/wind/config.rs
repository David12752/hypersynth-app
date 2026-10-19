//! Wind controller parameter configuration.
//!
//! All user-tunable wind controller parameters are defined here as stable
//! numeric IDs (500–599), together with their value ranges, defaults, and units.
//!
//! These IDs are used with `HyperSynthEngine::set_param_by_id()` to route
//! parameter changes to the correct sub-processor. They are intentionally
//! **separate** from the main `ParamId` enum so that adding new wind parameters
//! does not require updating the exhaustive match statements in `EngineParams`.
//!
//! # Parameter Table
//!
//! | ID  | Constant              | Range          | Default | Unit     |
//! |-----|-----------------------|----------------|---------|----------|
//! | 500 | WIND_ENABLED          | 0–1 (bool)     | 0       | —        |
//! | 501 | WIND_RESPONSE_TIME    | 1–200          | 5       | ms       |
//! | 510 | WIND_NOTE_MODE        | 0–2            | 2       | enum     |
//! | 511 | WIND_GLIDE_TIME       | 0–2000         | 80      | ms       |
//! | 512 | WIND_PORTAMENTO_MODE  | 0–2            | 1       | enum     |
//! | 520 | WIND_BREATH_THRESHOLD | 0–30           | 5       | CC value |
//! | 521 | WIND_BREATH_CURVE     | 0–4            | 1       | enum     |
//! | 530 | WIND_ROUTE_AMP        | 0–1            | 1.0     | —        |
//! | 531 | WIND_ROUTE_FILTER     | 0–1            | 0.6     | —        |
//! | 532 | WIND_ROUTE_DRIVE      | 0–1            | 0.0     | —        |
//! | 533 | WIND_ROUTE_RESO       | 0–1            | 0.0     | —        |
//! | 534 | WIND_ROUTE_VIBRATO    | 0–1            | 0.0     | —        |
//! | 535 | WIND_ROUTE_PITCH      | 0–1            | 0.0     | —        |
//! | 536 | WIND_ROUTE_NOISE      | 0–1            | 0.0     | —        |
//! | 540 | WIND_BEND_RANGE       | 1–24           | 2       | semitones|
//! | 541 | WIND_BITE_MODE        | 0–3            | 0       | enum     |
//! | 542 | WIND_VIBRATO_RATE     | 1–12           | 5.5     | Hz       |
//! | 543 | WIND_VIBRATO_DEPTH    | 0–2            | 0.3     | semitones|
//! | 544 | WIND_VIBRATO_DELAY    | 0–500          | 200     | ms       |
//! | 545 | WIND_VIBRATO_SHAPE    | 0–2            | 0       | enum     |
//! | 546 | WIND_BITE_MIN         | 0–30           | 6       | CC value |
//! | 547 | WIND_BITE_MAX         | 70–127         | 110     | CC value |
//! | 550 | WIND_GROWL_CC         | 0–127          | 80      | CC #     |
//! | 551 | WIND_GROWL_FREQ       | 15–50          | 28      | Hz       |
//! | 552 | WIND_GROWL_CHAOS      | 0–1            | 0.4     | —        |
//! | 553 | WIND_FLUTTER_CC       | 0–127          | 81      | CC #     |
//! | 554 | WIND_FLUTTER_FREQ     | 10–35          | 18      | Hz       |
//!
//! # Enums
//!
//! **WIND_NOTE_MODE**: 0 = Poly, 1 = Mono, 2 = Legato (default)
//!
//! **WIND_PORTAMENTO_MODE**: 0 = Off, 1 = Fingered (default), 2 = Always
//!
//! **WIND_BREATH_CURVE**: 0 = Linear, 1 = Exponential (default), 2 = Logarithmic,
//! 3 = S-Curve, 4 = Custom
//!
//! **WIND_BITE_MODE**: 0 = PitchBend (default), 1 = VibratoDepth,
//! 2 = VibratoRate, 3 = VibratoFull
//!
//! **WIND_VIBRATO_SHAPE**: 0 = Sine (default), 1 = Triangle, 2 = Ramp

/// Stable numeric IDs for all wind controller parameters (range 500–599).
///
/// Pass these to `HyperSynthEngine::set_param_by_id(id, value)`.
pub mod wind_param_id {
    // === GLOBAL (500–509) ===

    /// Enable / disable the wind controller layer. 0.0 = off (default), 1.0 = on.
    pub const WIND_ENABLED: u16 = 500;
    /// CC smoothing time constant applied to all wind inputs.
    /// Range: 1–200 ms. Default: 5 ms.
    pub const WIND_RESPONSE_TIME: u16 = 501;

    // === NOTE MANAGER (510–519) ===

    /// Polyphony / legato mode. 0 = Poly, 1 = Mono, 2 = Legato (default).
    pub const WIND_NOTE_MODE: u16 = 510;
    /// Portamento glide time in milliseconds. Range: 0–2000. Default: 80.
    pub const WIND_GLIDE_TIME: u16 = 511;
    /// Portamento trigger mode. 0 = Off, 1 = Fingered (default), 2 = Always.
    pub const WIND_PORTAMENTO_MODE: u16 = 512;

    // === BREATH ROUTER (520–539) ===

    /// Minimum CC2 value required to open the gate (on 0–127 scale).
    /// Range: 0–30. Default: 5.
    pub const WIND_BREATH_THRESHOLD: u16 = 520;
    /// Response curve applied to CC2 before routing.
    /// 0 = Linear, 1 = Exponential (default), 2 = Logarithmic, 3 = SCurve, 4 = Custom.
    pub const WIND_BREATH_CURVE: u16 = 521;
    /// CC2 → Amplitude route amount. Range: 0–1. Default: 1.0.
    pub const WIND_ROUTE_AMP: u16 = 530;
    /// CC2 → Filter Cutoff route amount. Range: 0–1. Default: 0.6.
    pub const WIND_ROUTE_FILTER: u16 = 531;
    /// CC2 → Harmonic Drive route amount. Range: 0–1. Default: 0.0.
    pub const WIND_ROUTE_DRIVE: u16 = 532;
    /// CC2 → Filter Resonance route amount. Range: 0–1. Default: 0.0.
    pub const WIND_ROUTE_RESO: u16 = 533;
    /// CC2 → Vibrato Depth route amount. Range: 0–1. Default: 0.0.
    pub const WIND_ROUTE_VIBRATO: u16 = 534;
    /// CC2 → Pitch (subtle reed-pressure effect) route amount. Range: 0–1. Default: 0.0.
    pub const WIND_ROUTE_PITCH: u16 = 535;
    /// CC2 → Noise Level route amount. Range: 0–1. Default: 0.0.
    pub const WIND_ROUTE_NOISE: u16 = 536;

    // === PITCH PROCESSOR (540–549) ===

    /// Pitch bend range in semitones (±). Range: 1–24. Default: 2.
    pub const WIND_BEND_RANGE: u16 = 540;
    /// Bite sensor function. 0 = PitchBend (default), 1 = VibratoDepth,
    /// 2 = VibratoRate, 3 = VibratoFull.
    pub const WIND_BITE_MODE: u16 = 541;
    /// Vibrato LFO frequency in Hz. Range: 1–12. Default: 5.5.
    pub const WIND_VIBRATO_RATE: u16 = 542;
    /// Maximum vibrato depth in semitones. Range: 0–2. Default: 0.3.
    pub const WIND_VIBRATO_DEPTH: u16 = 543;
    /// Vibrato onset delay in milliseconds. Range: 0–500. Default: 200.
    pub const WIND_VIBRATO_DELAY: u16 = 544;
    /// Vibrato waveform. 0 = Sine (default), 1 = Triangle, 2 = Ramp.
    pub const WIND_VIBRATO_SHAPE: u16 = 545;
    /// Bite sensor minimum calibration (on 0–127 scale). Range: 0–30. Default: 6.
    pub const WIND_BITE_MIN: u16 = 546;
    /// Bite sensor maximum calibration (on 0–127 scale). Range: 70–127. Default: 110.
    pub const WIND_BITE_MAX: u16 = 547;

    // === ARTICULATION (550–559) ===

    /// MIDI CC number assigned to growl depth control. Range: 0–127. Default: 80.
    pub const WIND_GROWL_CC: u16 = 550;
    /// Growl modulation frequency in Hz. Range: 15–50. Default: 28.
    pub const WIND_GROWL_FREQ: u16 = 551;
    /// Growl chaos parameter (0 = pure LFO, 1 = pure noise). Range: 0–1. Default: 0.4.
    pub const WIND_GROWL_CHAOS: u16 = 552;
    /// MIDI CC number assigned to flutter depth control. Range: 0–127. Default: 81.
    pub const WIND_FLUTTER_CC: u16 = 553;
    /// Flutter modulation frequency in Hz. Range: 10–35. Default: 18.
    pub const WIND_FLUTTER_FREQ: u16 = 554;
}
