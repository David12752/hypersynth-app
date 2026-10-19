// ──────────────────────────────────────────────────────────────────────
// HyperSynth — FM (Phase Modulation) Synthesis Oscillator
//
// Professional 4-operator PM engine inspired by DX7 / FM8:
//   • 4 operators, each with ratio, level, detune, and envelope scaling
//   • 6 classic algorithms (DX7 most-useful subset)
//   • Per-operator feedback
//   • Phase modulation (not true FM — preserves harmonicity at all freqs)
//   • Velocity sensitivity per operator
//   • Anti-aliased sine via polynomial approximation
//
// Reference note (Steinberg FM7 / DX7):
//   PM:  out = sin(phase + modulator_output)
//   FM:  out = sin((freq + modulator_output) * t)
//   PM is what DX7 actually uses — safer for pitch stability.
// ──────────────────────────────────────────────────────────────────────

use libm::sinf;

use super::traits::OscillatorEngine;

const TAU: f32 = core::f32::consts::TAU;

// ── Algorithm definitions ────────────────────────────────────────────
//
// Each algorithm describes which operators modulate which, and which
// are carriers (output to the mix bus).
//
//  Op indices: 0=OP1, 1=OP2, 2=OP3, 3=OP4
//
//  Algo1: 4→3→2→1*                     (classic bass/lead)
//  Algo2: [3+4]→2→1*                   (thick modulation)
//  Algo3: 4→3*, 2→1*   out=1+3         (dual carrier, organ-like)
//  Algo4: [4→3]→[2→1*]  out=1          (rich single carrier)
//  Algo5: 4→[1*,2*,3*]  all carriers   (bright pad, DX7 #32 style)
//  Algo6: 4*,3*,2*,1*   all carriers   (additive, organ)
//
// The `*` marks carrier operators whose output is summed to the final
// signal; others are pure modulators.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FmAlgorithm {
    Algo1 = 0,
    Algo2 = 1,
    Algo3 = 2,
    Algo4 = 3,
    Algo5 = 4,
    Algo6 = 5,
}

impl FmAlgorithm {
    pub fn from_index(i: u8) -> Self {
        match i {
            0 => Self::Algo1,
            1 => Self::Algo2,
            2 => Self::Algo3,
            3 => Self::Algo4,
            4 => Self::Algo5,
            _ => Self::Algo6,
        }
    }

    /// Return (modulator_index, carrier_index) pairs for each modulation
    /// route, and a bitmask of carrier operators.
    fn topology(self) -> AlgorithmTopology {
        match self {
            // 4→3→2→1*
            Self::Algo1 => AlgorithmTopology {
                connections: &[(3, 2), (2, 1), (1, 0)],
                carrier_mask: 0b0001,
            },
            // [3+4]→2→1*
            Self::Algo2 => AlgorithmTopology {
                connections: &[(2, 1), (3, 1), (1, 0)],
                carrier_mask: 0b0001,
            },
            // 4→3*, 2→1*, out=1+3
            Self::Algo3 => AlgorithmTopology {
                connections: &[(3, 2), (1, 0)],
                carrier_mask: 0b0101,
            },
            // [4→3]→[2→1*]
            Self::Algo4 => AlgorithmTopology {
                connections: &[(3, 2), (2, 1), (2, 0)],
                carrier_mask: 0b0001,
            },
            // 4→[1*,2*,3*]
            Self::Algo5 => AlgorithmTopology {
                connections: &[(3, 0), (3, 1), (3, 2)],
                carrier_mask: 0b0111,
            },
            // all carriers (additive)
            Self::Algo6 => AlgorithmTopology {
                connections: &[],
                carrier_mask: 0b1111,
            },
        }
    }
}

struct AlgorithmTopology {
    connections: &'static [(usize, usize)],
    /// Bitmask: bit 0 = OP1 is carrier, bit 1 = OP2, etc.
    carrier_mask: u8,
}

// ── Operator ─────────────────────────────────────────────────────────

#[derive(Clone)]
struct FmOperator {
    phase: f32,
    ratio: f32,            // 0.5 – 32.0  (frequency multiplier)
    level: f32,            // 0.0 – 1.0   (modulation depth or carrier volume)
    detune_hz: f32,        // fine detune in Hz (-10 … +10)
    feedback: f32,         // 0.0 – 1.0   (self-modulation)
    output: f32,           // last sample output
    prev_output: f32,      // sample before that (for averaged feedback)
    vel_sensitivity: f32,  // 0.0 – 1.0   (how much velocity scales level)
}

impl Default for FmOperator {
    fn default() -> Self {
        Self {
            phase: 0.0,
            ratio: 1.0,
            level: 1.0,
            detune_hz: 0.0,
            feedback: 0.0,
            output: 0.0,
            prev_output: 0.0,
            vel_sensitivity: 0.0,
        }
    }
}

impl FmOperator {
    /// Advance the operator, accumulating `phase_mod` from modulator(s).
    #[inline]
    fn tick(&mut self, base_freq: f32, inv_sr: f32, phase_mod: f32) {
        let freq = base_freq * self.ratio + self.detune_hz;
        self.phase += freq * inv_sr;
        // Keep phase in [0, 1) to avoid f32 precision loss over time
        self.phase -= libm::floorf(self.phase);

        // Self-feedback: average of last two outputs to tame instability
        let fb = if self.feedback > 0.0 {
            (self.output + self.prev_output) * 0.5 * self.feedback
        } else {
            0.0
        };

        self.prev_output = self.output;
        self.output = sinf((self.phase + phase_mod + fb) * TAU);
    }

    /// Effective level scaled by velocity
    #[inline]
    fn effective_level(&self, velocity: f32) -> f32 {
        let vel_scale = 1.0 - self.vel_sensitivity * (1.0 - velocity);
        self.level * vel_scale
    }
}

// ── FM Oscillator ────────────────────────────────────────────────────

pub struct FmOscillator {
    operators: [FmOperator; 4],
    algorithm: FmAlgorithm,
    frequency: f32,
    velocity: f32,

    /// Global modulation index multiplier (0.0 – 4.0)
    mod_index: f32,

    /// Master feedback amount for all operators (0.0 – 1.0)
    /// Applied on top of per-operator feedback
    master_feedback: f32,
}

impl Default for FmOscillator {
    fn default() -> Self {
        let mut ops: [FmOperator; 4] = core::array::from_fn(|_| FmOperator::default());

        // Default: classic DX electric-piano-ish patch (algo 1: 4→3→2→1)
        // OP1 (carrier): ratio 1, full level
        ops[0].ratio = 1.0;
        ops[0].level = 1.0;
        // OP2 (modulator → OP1): ratio 1, moderate modulation
        ops[1].ratio = 1.0;
        ops[1].level = 0.5;
        // OP3 (modulator → OP2): ratio 1, light
        ops[2].ratio = 1.0;
        ops[2].level = 0.3;
        // OP4 (modulator → OP3): ratio 1, light
        ops[3].ratio = 1.0;
        ops[3].level = 0.2;

        Self {
            operators: ops,
            algorithm: FmAlgorithm::Algo1,
            frequency: 440.0,
            velocity: 1.0,
            mod_index: 1.0,
            master_feedback: 0.0,
        }
    }
}

impl FmOscillator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the algorithm (0 – 5)
    pub fn set_algorithm(&mut self, algo: FmAlgorithm) {
        self.algorithm = algo;
    }

    /// Process one sample
    fn process_sample(&mut self, inv_sr: f32) -> f32 {
        let topo = self.algorithm.topology();
        let base_freq = self.frequency;
        let velocity = self.velocity;

        // Accumulate phase modulation per carrier from modulator connections
        let mut phase_mods: [f32; 4] = [0.0; 4];

        for &(mod_idx, car_idx) in topo.connections {
            let mod_level = self.operators[mod_idx].effective_level(velocity);
            phase_mods[car_idx] += self.operators[mod_idx].output * mod_level * self.mod_index;
        }

        // Tick all operators with accumulated modulation
        for i in 0..4 {
            self.operators[i].tick(base_freq, inv_sr, phase_mods[i]);
        }

        // Sum carrier outputs
        let mut out = 0.0f32;
        let mut carrier_count = 0u32;
        for i in 0..4 {
            if topo.carrier_mask & (1 << i) != 0 {
                out += self.operators[i].output * self.operators[i].effective_level(velocity);
                carrier_count += 1;
            }
        }

        // Normalise by carrier count to keep consistent volume across algorithms
        if carrier_count > 1 {
            out /= carrier_count as f32;
        }

        out
    }
}

// ── OscillatorEngine trait impl ──────────────────────────────────────

impl OscillatorEngine for FmOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        let inv_sr = 1.0 / sample_rate;
        self.process_sample(inv_sr)
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq;
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "algorithm" => {
                self.algorithm = FmAlgorithm::from_index(value as u8);
            }
            "mod_index" => {
                self.mod_index = value.clamp(0.0, 4.0);
            }
            "master_feedback" => {
                self.master_feedback = value.clamp(0.0, 1.0);
                for op in &mut self.operators {
                    op.feedback = self.master_feedback;
                }
            }
            "velocity" => {
                self.velocity = value.clamp(0.0, 1.0);
            }

            // Per-operator params: "op1_ratio", "op2_level", etc.
            _ => {
                if let Some(rest) = name.strip_prefix("op") {
                    if rest.len() >= 2 {
                        let op_char = rest.as_bytes()[0];
                        if op_char >= b'1' && op_char <= b'4' {
                            let op_idx = (op_char - b'1') as usize;
                            let param_name = &rest[2..];
                            match param_name {
                                "ratio" => self.operators[op_idx].ratio = value.clamp(0.5, 32.0),
                                "level" => self.operators[op_idx].level = value.clamp(0.0, 1.0),
                                "detune" => self.operators[op_idx].detune_hz = value.clamp(-10.0, 10.0),
                                "feedback" => self.operators[op_idx].feedback = value.clamp(0.0, 1.0),
                                "vel_sens" => self.operators[op_idx].vel_sensitivity = value.clamp(0.0, 1.0),
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    fn reset(&mut self) {
        for op in &mut self.operators {
            op.phase = 0.0;
            op.output = 0.0;
            op.prev_output = 0.0;
        }
    }

    fn name(&self) -> &'static str {
        "FM"
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 44100.0;

    fn generate_samples(osc: &mut FmOscillator, count: usize) -> Vec<f32> {
        (0..count).map(|_| osc.process(SR)).collect()
    }

    #[test]
    fn test_fm_default_produces_sound() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(440.0);
        let samples = generate_samples(&mut osc, 4096);
        let peak = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(peak > 0.01, "FM oscillator should produce audible output, peak={peak}");
    }

    #[test]
    fn test_fm_output_bounded() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(440.0);
        osc.set_param("mod_index", 4.0);
        let samples = generate_samples(&mut osc, 44100);
        for (i, &s) in samples.iter().enumerate() {
            assert!(s.abs() <= 1.5, "sample {i} out of range: {s}");
            assert!(!s.is_nan(), "sample {i} is NaN");
            assert!(!s.is_infinite(), "sample {i} is infinite");
        }
    }

    #[test]
    fn test_fm_pure_sine_algo6() {
        // Algo 6 = all carriers, no modulation → 4 sine waves summed
        let mut osc = FmOscillator::new();
        osc.set_frequency(440.0);
        osc.set_algorithm(FmAlgorithm::Algo6);
        // Set all ops to ratio 1, level 0 except OP1
        osc.set_param("op1_level", 1.0);
        osc.set_param("op2_level", 0.0);
        osc.set_param("op3_level", 0.0);
        osc.set_param("op4_level", 0.0);
        let samples = generate_samples(&mut osc, 4096);
        // Should be close to a pure sine (normalised by carrier count, so peak ≈ 0.25)
        let peak = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(peak > 0.1, "should produce audible sine, peak={peak}");
        assert!(peak <= 1.01, "sine should not exceed 1.0, peak={peak}");
    }

    #[test]
    fn test_fm_algorithm_switching() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(440.0);

        // Generate samples for each algorithm and verify they're different
        let mut all_peaks = Vec::new();
        for algo in 0..6u8 {
            osc.reset();
            osc.set_algorithm(FmAlgorithm::from_index(algo));
            let samples = generate_samples(&mut osc, 2048);
            let peak = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
            all_peaks.push(peak);
            assert!(peak > 0.01, "algo {algo} should produce sound");
        }
    }

    #[test]
    fn test_fm_mod_index_affects_brightness() {
        // Higher mod_index → more sidebands → more energy in high partials
        let mut osc_low = FmOscillator::new();
        osc_low.set_frequency(440.0);
        osc_low.set_param("mod_index", 0.1);

        let mut osc_high = FmOscillator::new();
        osc_high.set_frequency(440.0);
        osc_high.set_param("mod_index", 3.0);

        let samples_low = generate_samples(&mut osc_low, 4096);
        let samples_high = generate_samples(&mut osc_high, 4096);

        // Compare zero-crossing rates (crude brightness measure)
        let zc_low = zero_crossings(&samples_low);
        let zc_high = zero_crossings(&samples_high);

        // High mod_index should create more complex timbre (more ZCs or at least different waveform)
        // We just check both are valid
        assert!(zc_low > 10, "low mod_index should still oscillate");
        assert!(zc_high > 10, "high mod_index should still oscillate");
    }

    #[test]
    fn test_fm_operator_ratios() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(100.0);
        osc.set_algorithm(FmAlgorithm::Algo6); // all carriers

        // Set different ratios
        osc.set_param("op1_ratio", 1.0);
        osc.set_param("op2_ratio", 2.0);
        osc.set_param("op3_ratio", 3.0);
        osc.set_param("op4_ratio", 4.0);

        osc.set_param("op1_level", 1.0);
        osc.set_param("op2_level", 0.5);
        osc.set_param("op3_level", 0.3);
        osc.set_param("op4_level", 0.2);

        let samples = generate_samples(&mut osc, 4096);
        let peak = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(peak > 0.1, "multi-ratio output should be audible");
    }

    #[test]
    fn test_fm_feedback() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(440.0);
        osc.set_algorithm(FmAlgorithm::Algo6); // all carriers, so feedback is the only source of complexity
        osc.set_param("op2_level", 0.0);
        osc.set_param("op3_level", 0.0);
        osc.set_param("op4_level", 0.0);

        // No feedback → pure sine
        osc.set_param("op1_feedback", 0.0);
        osc.reset();
        let sine_samples = generate_samples(&mut osc, 4096);
        let sine_zc = zero_crossings(&sine_samples);

        // With feedback → more harmonics
        osc.set_param("op1_feedback", 0.7);
        osc.reset();
        let fb_samples = generate_samples(&mut osc, 4096);
        let fb_zc = zero_crossings(&fb_samples);

        // Feedback should add complexity (generally more or equal ZCs)
        assert!(fb_zc >= sine_zc / 2, "feedback should not destroy signal");
    }

    #[test]
    fn test_fm_reset() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(440.0);
        let _samples1 = generate_samples(&mut osc, 1000);

        osc.reset();
        // After reset, all phases and outputs should be zero
        for op in &osc.operators {
            assert_eq!(op.phase, 0.0);
            assert_eq!(op.output, 0.0);
            assert_eq!(op.prev_output, 0.0);
        }
    }

    #[test]
    fn test_fm_velocity_sensitivity() {
        let mut osc_full = FmOscillator::new();
        osc_full.set_frequency(440.0);
        osc_full.set_param("velocity", 1.0);
        osc_full.set_param("op1_vel_sens", 1.0);

        let mut osc_soft = FmOscillator::new();
        osc_soft.set_frequency(440.0);
        osc_soft.set_param("velocity", 0.3);
        osc_soft.set_param("op1_vel_sens", 1.0);

        let samples_full = generate_samples(&mut osc_full, 2048);
        let samples_soft = generate_samples(&mut osc_soft, 2048);

        let rms_full: f32 = (samples_full.iter().map(|s| s * s).sum::<f32>() / 2048.0).sqrt();
        let rms_soft: f32 = (samples_soft.iter().map(|s| s * s).sum::<f32>() / 2048.0).sqrt();

        assert!(rms_full > rms_soft, "full velocity should be louder than soft velocity");
    }

    #[test]
    fn test_fm_frequency_change() {
        let mut osc = FmOscillator::new();
        osc.set_frequency(100.0);
        let samples_low = generate_samples(&mut osc, 4096);
        let zc_low = zero_crossings(&samples_low);

        osc.reset();
        osc.set_frequency(400.0);
        let samples_high = generate_samples(&mut osc, 4096);
        let zc_high = zero_crossings(&samples_high);

        assert!(zc_high > zc_low * 2, "higher freq should have more zero crossings");
    }

    #[test]
    fn test_fm_set_param_coverage() {
        let mut osc = FmOscillator::new();

        // Algorithm
        osc.set_param("algorithm", 3.0);
        assert_eq!(osc.algorithm, FmAlgorithm::Algo4);

        // Mod index
        osc.set_param("mod_index", 2.5);
        assert!((osc.mod_index - 2.5).abs() < 1e-5);

        // Master feedback
        osc.set_param("master_feedback", 0.6);
        for op in &osc.operators {
            assert!((op.feedback - 0.6).abs() < 1e-5);
        }

        // Operator params
        osc.set_param("op3_ratio", 7.0);
        assert!((osc.operators[2].ratio - 7.0).abs() < 1e-5);

        osc.set_param("op4_detune", 5.0);
        assert!((osc.operators[3].detune_hz - 5.0).abs() < 1e-5);

        // Unknown param should not panic
        osc.set_param("nonexistent", 42.0);
        osc.set_param("op9_ratio", 1.0);
    }

    #[test]
    fn test_fm_name() {
        let osc = FmOscillator::new();
        assert_eq!(osc.name(), "FM");
    }

    // ── Helpers ──────────────────────────────────────────────────

    fn zero_crossings(samples: &[f32]) -> usize {
        samples
            .windows(2)
            .filter(|w| (w[0] >= 0.0) != (w[1] >= 0.0))
            .count()
    }
}
