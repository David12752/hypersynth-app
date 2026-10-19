/// Pitch processing for wind controllers.
///
/// Combines direct pitch-bend (14-bit), a dedicated per-note vibrato LFO,
/// and bite-pressure routing (Amendment 4 calibration included).
///
/// # Design note
/// This is a GLOBAL-layer processor (one instance per engine). It is NOT
/// per-voice. Wind controllers produce one pitch stream.
use libm::sinf;
use core::f32::consts::PI;

use super::note_manager::NoteEvent;

// ============================================================================
// Vibrato LFO
// ============================================================================

/// Waveform shapes for the dedicated wind-controller vibrato LFO.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VibratoWave {
    /// Standard smooth vibrato — sine wave.
    Sine,
    /// Slightly sharper, classical woodwind feel — triangle wave.
    Triangle,
    /// Asymmetric jazz-style "scoop" — rising ramp.
    Ramp,
}

/// Dedicated vibrato LFO that is independent from the main synth LFOs.
///
/// Produces a value in ±semitones that is added to the pitch chain.
#[derive(Debug, Clone, Copy)]
pub struct VibratoLfo {
    phase: f32,
    /// LFO frequency in Hz (1–12 Hz).
    pub frequency: f32,
    /// Maximum depth in semitones.
    pub depth: f32,
    /// Waveform shape.
    pub waveform: VibratoWave,
    sample_rate: f32,
    /// Delay ramp state: 0.0 (silent) → 1.0 (full depth) after `delay_samples`.
    delay_ramp: f32,
    delay_increment: f32,
}

impl VibratoLfo {
    pub fn new(sample_rate: f32) -> Self {
        let delay_ms = 200.0_f32;
        Self {
            phase: 0.0,
            frequency: 5.5,
            depth: 0.3,
            waveform: VibratoWave::Sine,
            sample_rate,
            delay_ramp: 0.0,
            delay_increment: 1.0 / (delay_ms * 0.001 * sample_rate.max(1.0)),
        }
    }

    /// Set vibrato delay in milliseconds (0–500 ms).
    pub fn set_delay(&mut self, ms: f32) {
        let clamped = ms.clamp(0.0, 500.0);
        self.delay_increment = if clamped > 0.0 {
            1.0 / (clamped * 0.001 * self.sample_rate.max(1.0))
        } else {
            1.0 // instant — ramp fills in one sample
        };
    }

    /// Reset delay ramp on NewNote (NOT on LegatoSlide — let vibrato continue).
    pub fn on_new_note(&mut self) {
        self.delay_ramp = 0.0;
        self.phase = 0.0;
    }

    /// Generate one sample in semitones.
    #[inline]
    pub fn next(&mut self) -> f32 {
        // Advance delay ramp.
        self.delay_ramp = (self.delay_ramp + self.delay_increment).min(1.0);

        // Phase increment.
        let increment = self.frequency / self.sample_rate;
        self.phase += increment;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        let wave = match self.waveform {
            VibratoWave::Sine => sinf(self.phase * 2.0 * PI),
            VibratoWave::Triangle => {
                let t = self.phase;
                if t < 0.5 {
                    4.0 * t - 1.0
                } else {
                    3.0 - 4.0 * t
                }
            }
            VibratoWave::Ramp => 2.0 * self.phase - 1.0,
        };

        wave * self.depth * self.delay_ramp
    }
}

// ============================================================================
// BiteMode
// ============================================================================

/// How the bite/mouthpiece pressure sensor is interpreted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BiteMode {
    /// Bite controls pitch bend directly (default EWI behaviour).
    PitchBend,
    /// Bite controls vibrato depth (LFO amplitude).
    VibratoDepth,
    /// Bite controls vibrato rate (LFO frequency).
    VibratoRate,
    /// Bite controls both depth and rate simultaneously.
    VibratoFull,
}

// ============================================================================
// BiteCalibration
// ============================================================================

/// Normalizes raw bite sensor output to 0.0–1.0.
///
/// Every real wind instrument has different bite sensor ranges. Calibration
/// maps the player's physical min/max to the full processing range.
#[derive(Debug, Clone, Copy)]
pub struct BiteCalibration {
    /// Minimum normalized value. Below this = no bite detected.
    pub min: f32,  // default 0.05 (≈ CC 6)
    /// Maximum normalized value. Above this = full bite.
    pub max: f32,  // default 0.866 (≈ CC 110)
}

impl Default for BiteCalibration {
    fn default() -> Self {
        Self { min: 6.0 / 127.0, max: 110.0 / 127.0 }
    }
}

impl BiteCalibration {
    /// Map raw (0–127 CC or 0.0–1.0 normalized) bite to 0.0–1.0.
    #[inline]
    pub fn normalize(&self, raw: f32) -> f32 {
        ((raw - self.min) / (self.max - self.min)).clamp(0.0, 1.0)
    }
}

// ============================================================================
// PitchProcessor
// ============================================================================

/// Top-level pitch processing chain for a wind controller.
///
/// Combines:
/// 1. Direct pitch-bend from the bend wheel (or bite in `PitchBend` mode)
/// 2. Dedicated vibrato LFO (with delay and waveform selection)
/// 3. Subtle pitch offset from the breath router (`BreathOutput.pitch_offset`)
#[derive(Debug, Clone, Copy)]
pub struct PitchProcessor {
    /// Pitch bend range in semitones (±1 to ±24, default ±2).
    pub bend_range: f32,
    pub vibrato: VibratoLfo,
    pub bite_mode: BiteMode,
    pub calibration: BiteCalibration,
    /// Frequency range for VibratoRate mode: [min_hz, max_hz].
    pub bite_rate_min: f32,
    pub bite_rate_max: f32,
    /// Independent scaling for VibratoFull mode.
    pub bite_depth_amount: f32,
    pub bite_rate_amount: f32,
}

impl PitchProcessor {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            bend_range: 2.0,
            vibrato: VibratoLfo::new(sample_rate),
            bite_mode: BiteMode::PitchBend,
            calibration: BiteCalibration::default(),
            bite_rate_min: 3.0,
            bite_rate_max: 8.0,
            bite_depth_amount: 1.0,
            bite_rate_amount: 1.0,
        }
    }

    /// Notify about a new note event (resets vibrato delay on NewNote only).
    pub fn handle_note_event(&mut self, event: &NoteEvent) {
        if let NoteEvent::NewNote { .. } = event {
            self.vibrato.on_new_note();
        }
    }

    /// Compute the pitch offset in semitones for one sample.
    ///
    /// Arguments:
    /// - `pitch_bend_norm`: pitch-bend value normalized to −1.0..+1.0
    ///   (from `SmootherBank.pitch_bend.next()`).
    /// - `bite_raw`: raw bite sensor value 0.0–1.0 (before calibration).
    /// - `breath_pitch_offset`: subtle pitch component from `BreathOutput.pitch_offset`.
    ///
    /// Returns total pitch offset in semitones to add to the base note.
    #[inline]
    pub fn process(&mut self, pitch_bend_norm: f32, bite_raw: f32, breath_pitch_offset: f32) -> f32 {
        let bite = self.calibration.normalize(bite_raw);

        // Apply bite routing according to mode.
        match self.bite_mode {
            BiteMode::PitchBend => {
                // Bite is the pitch-bend source (overrides pitch_bend_norm from wheel).
                let bend_semitones = bite * self.bend_range;
                bend_semitones + self.vibrato.next() + breath_pitch_offset
            }
            BiteMode::VibratoDepth => {
                let direct_bend = pitch_bend_norm * self.bend_range;
                // Scale configured max depth by bite — do NOT multiply by current depth
                // (that would cause exponential decay to 0 every sample).
                self.vibrato.depth = bite * self.bite_depth_amount;
                direct_bend + self.vibrato.next() + breath_pitch_offset
            }
            BiteMode::VibratoRate => {
                self.vibrato.frequency = self.bite_rate_min
                    + bite * (self.bite_rate_max - self.bite_rate_min);
                let direct_bend = pitch_bend_norm * self.bend_range;
                direct_bend + self.vibrato.next() + breath_pitch_offset
            }
            BiteMode::VibratoFull => {
                self.vibrato.depth = bite * self.bite_depth_amount;
                self.vibrato.frequency = self.bite_rate_min
                    + bite * self.bite_rate_amount * (self.bite_rate_max - self.bite_rate_min);
                let direct_bend = pitch_bend_norm * self.bend_range;
                direct_bend + self.vibrato.next() + breath_pitch_offset
            }
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 44_100.0;

    // ---- VibratoLfo ---------------------------------------------------------

    /// LFO at 440 Hz should complete one cycle in exactly SR samples.
    /// We use this frequency to test period accuracy.
    #[test]
    fn vibrato_lfo_frequency_accuracy() {
        let freq = 5.5_f32;
        let mut lfo = VibratoLfo::new(SR);
        lfo.frequency = freq;
        lfo.set_delay(0.0); // no delay for this test
        lfo.depth = 1.0;

        let period_samples = (SR / freq) as usize;

        // After exactly one period the sine LFO should be back near zero.
        let mut last = 0.0f32;
        for _ in 0..period_samples {
            last = lfo.next();
        }
        // Sine should be near 0 again (one full cycle).
        assert!(last.abs() < 0.05, "After one period, sine LFO = {last} (expected ~0)");
    }

    /// Vibrato depth is ramped up by the delay — at t=0 output must be 0.
    #[test]
    fn vibrato_delay_starts_at_zero() {
        let mut lfo = VibratoLfo::new(SR);
        lfo.depth = 1.0;
        lfo.set_delay(200.0);
        lfo.on_new_note();
        let first = lfo.next();
        // Delay ramp is tiny after one sample — output should be near zero.
        assert!(first.abs() < 0.01, "Vibrato should start near 0: {first}");
    }

    /// After delay_ms samples the depth should have reached full.
    #[test]
    fn vibrato_delay_ramp_complete() {
        let delay_ms = 50.0_f32;
        let mut lfo = VibratoLfo::new(SR);
        lfo.frequency = 5.5;
        lfo.depth = 0.3;
        lfo.set_delay(delay_ms);
        lfo.on_new_note();

        let ramp_samples = (delay_ms * 0.001 * SR) as usize;
        for _ in 0..ramp_samples {
            lfo.next();
        }
        // delay_ramp should be 1.0 at this point, so actual output equals depth * wave.
        // We only check that the ramp is saturated (lfo.delay_ramp == 1.0).
        assert_eq!(lfo.delay_ramp, 1.0, "Delay ramp should saturate to 1.0 after {delay_ms} ms");
    }

    // ---- BiteCalibration ----------------------------------------------------

    #[test]
    fn bite_calibration_clamps_range() {
        let cal = BiteCalibration::default();
        assert_eq!(cal.normalize(0.0), 0.0);
        assert_eq!(cal.normalize(1.0), 1.0);
        let mid_raw = (cal.min + cal.max) / 2.0;
        let mid = cal.normalize(mid_raw);
        assert!((mid - 0.5).abs() < 0.01, "Midpoint should map to 0.5: {mid}");
    }

    // ---- PitchProcessor -----------------------------------------------------

    #[test]
    fn bend_range_scales_correctly() {
        let mut p = PitchProcessor::new(SR);
        p.bend_range = 12.0;
        p.bite_mode = BiteMode::PitchBend;
        // Disable vibrato for clarity.
        p.vibrato.depth = 0.0;
        p.calibration = BiteCalibration { min: 0.0, max: 1.0 };
        let offset = p.process(0.0, 1.0, 0.0); // full bite
        assert!(
            (offset - 12.0).abs() < 0.1,
            "Full bite + bend_range=12 should give ~12 semitones, got {offset}"
        );
    }
}
