//! Wind Controller Modulator System
//!
//! A mono processing layer that sits between incoming MIDI and the synthesis
//! engine. Optimized for Akai EWI, Yamaha WX, Roland Aerophone, and
//! Berglund NuRAD wind controllers.
//!
//! # Architecture (Amendment 6)
//! `WindControllerProcessor` is a GLOBAL MONO LAYER — exactly one instance
//! in the engine. It processes MIDI input once, produces one `WindOutput` per
//! sample, and that output is applied to whichever voice is currently active.
//!
//! # Amendment 9 — Sample-accurate note events
//! Note events carry a `sample_offset` within the current processing block so
//! that fast legato passages on EWI are sample-accurate rather than snapped to
//! block boundaries.

pub mod articulation;
pub mod breath_curve;
pub mod breath_router;
pub mod config;
pub mod note_manager;
pub mod pitch_processor;
pub mod smoother;

use articulation::{ArticulationOutput, FlutterProcessor, GrowlProcessor};
use breath_router::{BreathOutput, BreathRouter};
use note_manager::{NoteEvent, NoteManager, NoteMode, PortamentoProcessor};
use pitch_processor::PitchProcessor;
use smoother::SmootherBank;

// ============================================================================
// WindOutput
// ============================================================================

/// Timestamped note event (Amendment 9).
///
/// `sample_offset` is relative to the start of the current processing block.
#[derive(Debug, Clone, Copy)]
pub struct TimestampedNoteEvent {
    pub event: NoteEvent,
    /// Sample offset within the block (0 = first sample of the block).
    pub sample_offset: u32,
}

/// All modulation values produced by `WindControllerProcessor::process_sample()`.
///
/// Consumed by the main synth engine once per sample.
#[derive(Debug, Clone, Copy)]
pub struct WindOutput {
    /// Current pitch in semitones (base note + portamento + vibrato + growl pitch).
    pub pitch: f32,
    /// Amplitude multiplier (breath × growl × flutter × gain_compensation).
    pub amplitude: f32,
    /// Filter cutoff additive offset (breath + flutter), normalized 0–1.
    pub filter_cutoff_mod: f32,
    /// Filter resonance offset from breath router.
    pub filter_resonance_mod: f32,
    /// Harmonic drive / saturation amount from breath router.
    pub harmonic_drive: f32,
    /// Noise level from breath router.
    pub noise_level: f32,
    /// True when filter coefficients should be interpolated this block.
    pub filter_needs_interpolation: bool,
    /// Pending note events (up to 4 per block, Amendment 9).
    pub note_events: [Option<TimestampedNoteEvent>; 4],
    /// Number of valid entries in `note_events`.
    pub note_event_count: usize,
    /// True when breath is above threshold and the gate is open.
    pub gate: bool,
}

impl Default for WindOutput {
    fn default() -> Self {
        Self {
            pitch: 60.0,
            amplitude: 0.0,
            filter_cutoff_mod: 0.0,
            filter_resonance_mod: 0.0,
            harmonic_drive: 0.0,
            noise_level: 0.0,
            filter_needs_interpolation: false,
            note_events: [None; 4],
            note_event_count: 0,
            gate: false,
        }
    }
}

// ============================================================================
// WindControllerProcessor
// ============================================================================

/// Top-level wind controller processing pipeline.
///
/// Call `handle_*` methods from the MIDI handler (not audio-thread tight-loop).
/// Call `process_sample()` once per audio sample inside the DSP loop.
pub struct WindControllerProcessor {
    pub smoother_bank: SmootherBank,
    pub note_manager: NoteManager,
    pub portamento: PortamentoProcessor,
    pub breath_router: BreathRouter,
    pub pitch_processor: PitchProcessor,
    pub growl: GrowlProcessor,
    pub flutter: FlutterProcessor,
    /// Global bypass — when false, pass MIDI through unchanged and use neutral values.
    pub enabled: bool,
    /// Pending note events queued until `process_sample()` drains them.
    pending_events: [Option<TimestampedNoteEvent>; 4],
    pending_event_count: usize,
    /// Current block sample counter (reset at block start if the host informs us).
    sample_counter: u32,
    /// Growl CC number (default 80).
    pub growl_cc: u8,
    /// Flutter CC number (default 81).
    pub flutter_cc: u8,
}

impl WindControllerProcessor {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            smoother_bank: SmootherBank::new(sample_rate),
            note_manager: NoteManager::new(NoteMode::Legato),
            portamento: PortamentoProcessor::new(sample_rate),
            breath_router: BreathRouter::new(),
            pitch_processor: PitchProcessor::new(sample_rate),
            growl: GrowlProcessor::new(sample_rate),
            flutter: FlutterProcessor::new(sample_rate),
            enabled: false,
            pending_events: [None; 4],
            pending_event_count: 0,
            sample_counter: 0,
            growl_cc: 80,
            flutter_cc: 81,
        }
    }

    // ---- Block boundary helpers -------------------------------------------

    /// Reset the intra-block sample counter. Call at the top of each block.
    pub fn reset_block(&mut self) {
        self.sample_counter = 0;
    }

    // ---- MIDI handlers (called from MIDI thread / event queue) -----------

    /// Handle a MIDI NoteOn message.
    pub fn handle_note_on(&mut self, note: u8, velocity: u8) {
        if !self.enabled {
            return;
        }
        let event = self.note_manager.process_note_on(note, velocity);
        self.portamento.handle_note_event(&event);
        self.pitch_processor.handle_note_event(&event);
        self.queue_event(event);
    }

    /// Handle a MIDI NoteOff message.
    pub fn handle_note_off(&mut self, note: u8) {
        if !self.enabled {
            return;
        }
        if let Some(event) = self.note_manager.process_note_off(note) {
            self.portamento.handle_note_event(&event);
            self.pitch_processor.handle_note_event(&event);
            self.queue_event(event);
        }
    }

    /// Handle a MIDI CC message. Routes to the correct smoother by CC number.
    pub fn handle_cc(&mut self, cc: u8, value: u8) {
        if !self.enabled {
            return;
        }
        let norm = value as f32 / 127.0;
        match cc {
            2 => self.smoother_bank.breath.set_target(norm),
            11 => self.smoother_bank.expression.set_target(norm),
            1 => self.smoother_bank.bite_pressure.set_target(norm),
            n if n == self.growl_cc => {
                self.smoother_bank.growl_cc.set_target(norm);
            }
            n if n == self.flutter_cc => {
                self.smoother_bank.flutter_cc.set_target(norm);
            }
            _ => {}
        }
    }

    /// Handle a 14-bit MIDI pitch bend message.
    ///
    /// `msb` (0x00–0x7F) and `lsb` (0x00–0x7F) are the raw bytes.
    /// Result is normalized to −1.0..+1.0.
    pub fn handle_pitch_bend(&mut self, msb: u8, lsb: u8) {
        if !self.enabled {
            return;
        }
        let raw = (((msb as u16) << 7) | (lsb as u16)) as i32 - 8192;
        let norm = (raw as f32) / 8192.0;
        self.smoother_bank.pitch_bend.set_target(norm.clamp(-1.0, 1.0));
    }

    /// Handle channel aftertouch (routes to bite pressure).
    pub fn handle_aftertouch(&mut self, value: u8) {
        if !self.enabled {
            return;
        }
        let norm = value as f32 / 127.0;
        self.smoother_bank.bite_pressure.set_target(norm);
    }

    // ---- Per-sample audio processing -------------------------------------

    /// Process one audio sample and return the complete modulation output.
    ///
    /// When `enabled` is false, returns a neutral passthrough `WindOutput`
    /// with zero CPU overhead beyond the gate check.
    #[inline]
    pub fn process_sample(&mut self) -> WindOutput {
        self.sample_counter = self.sample_counter.wrapping_add(1);

        if !self.enabled {
            return WindOutput::default();
        }

        // 1. Advance all smoothers.
        let smoothed_breath = self.smoother_bank.breath.next();
        let smoothed_bend = self.smoother_bank.pitch_bend.next();
        let smoothed_bite = self.smoother_bank.bite_pressure.next();
        let smoothed_growl_cc = self.smoother_bank.growl_cc.next();
        let smoothed_flutter_cc = self.smoother_bank.flutter_cc.next();
        // expression is smoothed but not yet wired to a destination (future use).
        let _ = self.smoother_bank.expression.next();

        // 2. Breath routing → amplitude + filter + drive etc.
        let breath: BreathOutput = self.breath_router.process(smoothed_breath);

        // 3. Portamento → current pitch in semitones.
        let base_pitch = self.portamento.next();

        // 4. Pitch bend + vibrato.
        let pitch_offset = self.pitch_processor.process(
            smoothed_bend,
            smoothed_bite,
            breath.pitch_offset,
        );

        // 5. Articulation.
        self.growl.depth = smoothed_growl_cc;
        self.flutter.depth = smoothed_flutter_cc;
        let growl_out: ArticulationOutput = self.growl.process();
        let flutter_out: ArticulationOutput = self.flutter.process();

        // 6. Combine all modulation.
        let amplitude = (breath.amplitude
            * growl_out.amplitude_mod
            * flutter_out.amplitude_mod
            * growl_out.gain_compensation)
            .clamp(0.0, 2.0);

        // Drain pending events.
        let (events, count) = self.drain_events();

        WindOutput {
            pitch: base_pitch + pitch_offset,
            amplitude,
            filter_cutoff_mod: (breath.filter_cutoff + flutter_out.filter_mod).clamp(0.0, 1.0),
            filter_resonance_mod: breath.filter_resonance,
            harmonic_drive: breath.harmonic_drive,
            noise_level: breath.noise_level,
            filter_needs_interpolation: breath.filter_needs_interpolation,
            note_events: events,
            note_event_count: count,
            gate: self.breath_router.gate_open(),
        }
    }

    // ---- Custom curve passthrough ------------------------------------------

    /// Update the custom breath response curve (128 normalised f32 values).
    /// Called from the WASM bridge UI path, NOT the audio thread.
    pub fn set_custom_curve(&mut self, table: &[f32; 128]) {
        self.breath_router.set_custom_curve(table);
    }

    // ---- Parameter routing (numeric ID) ------------------------------------

    /// Route a wind parameter change by raw numeric ID (500–599).
    ///
    /// IDs are defined in `wind::config::wind_param_id`. Returns `true` on
    /// success, `false` for unknown IDs.
    pub fn set_param_by_raw_id(&mut self, id: u16, value: f32) -> bool {
        use crate::wind::config::wind_param_id as WP;
        use crate::wind::breath_curve::BreathCurve;
        use crate::wind::breath_router::BreathDestination;
        use crate::wind::note_manager::{NoteMode, PortamentoMode};
        use crate::wind::pitch_processor::{BiteMode, VibratoWave};

        match id {
            // --- Global ---
            WP::WIND_ENABLED => {
                self.enabled = value >= 0.5;
            }
            WP::WIND_RESPONSE_TIME => {
                let ms = value.clamp(1.0, 200.0);
                self.smoother_bank.breath.set_time_constant(ms);
                self.smoother_bank.expression.set_time_constant(ms);
                self.smoother_bank.pitch_bend.set_time_constant(ms);
                self.smoother_bank.bite_pressure.set_time_constant(ms);
            }
            // --- Note manager ---
            WP::WIND_NOTE_MODE => {
                let mode = match value as u8 {
                    0 => NoteMode::Poly,
                    1 => NoteMode::Mono,
                    _ => NoteMode::Legato,
                };
                self.note_manager.set_mode(mode);
            }
            WP::WIND_GLIDE_TIME => {
                self.portamento.set_glide_time(value.clamp(0.0, 2000.0));
            }
            WP::WIND_PORTAMENTO_MODE => {
                self.portamento.mode = match value as u8 {
                    0 => PortamentoMode::Off,
                    2 => PortamentoMode::Always,
                    _ => PortamentoMode::Fingered,
                };
            }
            // --- Breath router ---
            WP::WIND_BREATH_THRESHOLD => {
                self.breath_router.set_threshold(value.clamp(0.0, 30.0));
            }
            WP::WIND_BREATH_CURVE => {
                let curve = match value as u8 {
                    0 => BreathCurve::Linear,
                    1 => BreathCurve::Exponential,
                    2 => BreathCurve::Logarithmic,
                    3 => BreathCurve::SCurve,
                    _ => BreathCurve::Custom,
                };
                self.breath_router.set_all_route_curves(curve);
            }
            WP::WIND_ROUTE_AMP => {
                self.breath_router.set_route_amount(BreathDestination::Amplitude, value);
            }
            WP::WIND_ROUTE_FILTER => {
                self.breath_router.set_route_amount(BreathDestination::FilterCutoff, value);
            }
            WP::WIND_ROUTE_DRIVE => {
                self.breath_router.set_route_amount(BreathDestination::HarmonicDrive, value);
            }
            WP::WIND_ROUTE_RESO => {
                self.breath_router.set_route_amount(BreathDestination::FilterResonance, value);
            }
            WP::WIND_ROUTE_VIBRATO => {
                self.breath_router.set_route_amount(BreathDestination::VibratoDepth, value);
            }
            WP::WIND_ROUTE_PITCH => {
                self.breath_router.set_route_amount(BreathDestination::PitchBend, value);
            }
            WP::WIND_ROUTE_NOISE => {
                self.breath_router.set_route_amount(BreathDestination::NoiseLevel, value);
            }
            // --- Pitch processor ---
            WP::WIND_BEND_RANGE => {
                self.pitch_processor.bend_range = value.clamp(1.0, 24.0);
            }
            WP::WIND_BITE_MODE => {
                self.pitch_processor.bite_mode = match value as u8 {
                    0 => BiteMode::PitchBend,
                    1 => BiteMode::VibratoDepth,
                    2 => BiteMode::VibratoRate,
                    _ => BiteMode::VibratoFull,
                };
            }
            WP::WIND_VIBRATO_RATE => {
                self.pitch_processor.vibrato.frequency = value.clamp(1.0, 12.0);
            }
            WP::WIND_VIBRATO_DEPTH => {
                let depth = value.clamp(0.0, 2.0);
                self.pitch_processor.vibrato.depth = depth;
                self.pitch_processor.bite_depth_amount = depth;
            }
            WP::WIND_VIBRATO_DELAY => {
                self.pitch_processor.vibrato.set_delay(value.clamp(0.0, 500.0));
            }
            WP::WIND_VIBRATO_SHAPE => {
                self.pitch_processor.vibrato.waveform = match value as u8 {
                    0 => VibratoWave::Sine,
                    1 => VibratoWave::Triangle,
                    _ => VibratoWave::Ramp,
                };
            }
            WP::WIND_BITE_MIN => {
                self.pitch_processor.calibration.min = value.clamp(0.0, 30.0) / 127.0;
            }
            WP::WIND_BITE_MAX => {
                self.pitch_processor.calibration.max = value.clamp(70.0, 127.0) / 127.0;
            }
            // --- Articulation ---
            WP::WIND_GROWL_CC => {
                self.growl_cc = value.clamp(0.0, 127.0) as u8;
            }
            WP::WIND_GROWL_FREQ => {
                self.growl.frequency = value.clamp(15.0, 50.0);
            }
            WP::WIND_GROWL_CHAOS => {
                self.growl.chaos = value.clamp(0.0, 1.0);
            }
            WP::WIND_FLUTTER_CC => {
                self.flutter_cc = value.clamp(0.0, 127.0) as u8;
            }
            WP::WIND_FLUTTER_FREQ => {
                self.flutter.frequency = value.clamp(10.0, 35.0);
            }
            _ => return false,
        }
        true
    }

    // ---- Internal helpers --------------------------------------------------

    fn queue_event(&mut self, event: NoteEvent) {
        if self.pending_event_count < 4 {
            self.pending_events[self.pending_event_count] = Some(TimestampedNoteEvent {
                event,
                sample_offset: self.sample_counter,
            });
            self.pending_event_count += 1;
        }
    }

    fn drain_events(&mut self) -> ([Option<TimestampedNoteEvent>; 4], usize) {
        let events = self.pending_events;
        let count = self.pending_event_count;
        self.pending_events = [None; 4];
        self.pending_event_count = 0;
        (events, count)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 44_100.0;

    fn make_enabled_proc() -> WindControllerProcessor {
        let mut p = WindControllerProcessor::new(SR);
        p.enabled = true;
        // snap all smoothers so first process_sample sees
        // the initial targets (all 0.0) immediately.
        p.smoother_bank.snap_all();
        p
    }

    /// When disabled, process_sample returns default (neutral) output.
    #[test]
    fn disabled_returns_neutral() {
        let mut p = WindControllerProcessor::new(SR);
        p.enabled = false;
        let out = p.process_sample();
        assert_eq!(out.amplitude, 0.0);
        assert_eq!(out.gate, false);
        assert_eq!(out.note_event_count, 0);
    }

    /// CC2 above threshold → gate opens and amplitude is non-zero.
    #[test]
    fn breath_opens_gate() {
        let mut p = make_enabled_proc();
        p.handle_cc(2, 100);
        p.smoother_bank.breath.snap();
        let out = p.process_sample();
        assert!(out.gate, "Gate should open with breath CC=100");
        assert!(out.amplitude > 0.0);
    }

    /// NoteOn/Off in legato mode generates correct NoteEvent sequence.
    #[test]
    fn legato_note_sequence_generates_events() {
        let mut p = make_enabled_proc();
        // Send breath so gate is open.
        p.handle_cc(2, 100);
        p.smoother_bank.breath.snap();
        // First note → NewNote
        p.handle_note_on(60, 100);
        let out1 = p.process_sample();
        assert_eq!(out1.note_event_count, 1);
        if let Some(ev) = out1.note_events[0] {
            assert_eq!(ev.event, NoteEvent::NewNote { note: 60, velocity: 100 });
        }
        // Second note overlapping → LegatoSlide
        p.handle_note_on(64, 90);
        let out2 = p.process_sample();
        assert_eq!(out2.note_event_count, 1);
        if let Some(ev) = out2.note_events[0] {
            assert_eq!(
                ev.event,
                NoteEvent::LegatoSlide { from_note: 60, to_note: 64, velocity: 90 }
            );
        }
    }

    /// Pitch bend via bite (BiteMode::PitchBend is the default EWI behavior —
    /// the mouthpiece bite sensor IS the pitch bend source, not the MIDI wheel).
    #[test]
    fn pitch_bend_produces_offset() {
        let mut p = make_enabled_proc();
        p.handle_cc(2, 100); // open gate
        p.smoother_bank.breath.snap();
        // BiteMode::PitchBend → full bite pressure = full bend range
        p.handle_aftertouch(127); // full bite
        p.smoother_bank.bite_pressure.set_target(1.0);
        p.smoother_bank.bite_pressure.snap();
        p.handle_note_on(60, 100);
        p.smoother_bank.snap_all();

        let out = p.process_sample();
        // With full bite and default bend_range=2, should be ~2 semitones up.
        assert!(out.pitch > 60.0, "Expected positive pitch offset, got {}", out.pitch);
    }

    /// Aftertouch routes to bite pressure smoother.
    #[test]
    fn aftertouch_routes_to_bite() {
        let mut p = make_enabled_proc();
        p.handle_aftertouch(127);
        // Verify the target was updated.
        assert!(
            (p.smoother_bank.bite_pressure.target() - 1.0).abs() < 1e-4,
            "Bite target not updated"
        );
    }
}

// Phase 4 – pitch_processor
// Phase 5 – articulation
