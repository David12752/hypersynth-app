use libm::{sinf, floorf};
use crate::oscillators::OscillatorEngine;

const MAX_HARMONICS: usize = 128;
const TAU: f32 = core::f32::consts::TAU;

/// Harmonic profile presets for the additive oscillator
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AdditiveProfile {
    Saw = 0,
    Square = 1,
    Triangle = 2,
    Organ = 3,
    Vocal = 4,
}

impl AdditiveProfile {
    pub fn from_index(i: u8) -> Self {
        match i {
            1 => Self::Square,
            2 => Self::Triangle,
            3 => Self::Organ,
            4 => Self::Vocal,
            _ => Self::Saw,
        }
    }

    /// Returns the relative amplitude of the k-th harmonic (1-indexed)
    fn amplitude(self, k: usize) -> f32 {
        if k == 0 { return 0.0; }
        match self {
            Self::Saw => 1.0 / k as f32,
            Self::Square => {
                if k % 2 == 1 { 1.0 / k as f32 } else { 0.0 }
            }
            Self::Triangle => {
                if k % 2 == 1 {
                    let sign = if (k / 2) % 2 == 0 { 1.0 } else { -1.0 };
                    sign / (k as f32 * k as f32)
                } else {
                    0.0
                }
            }
            Self::Organ => {
                // Drawbar-inspired: fundamental + 2nd + 3rd + 4th + 6th + 8th
                match k {
                    1 => 1.0,
                    2 => 0.8,
                    3 => 0.6,
                    4 => 0.45,
                    6 => 0.3,
                    8 => 0.2,
                    _ => 0.0,
                }
            }
            Self::Vocal => {
                // Formant-inspired emphasis around harmonics 3-7
                match k {
                    1 => 0.7,
                    2 => 0.5,
                    3 => 1.0,
                    4 => 0.9,
                    5 => 0.85,
                    6 => 0.6,
                    7 => 0.4,
                    8 => 0.15,
                    9 => 0.1,
                    _ => 0.0,
                }
            }
        }
    }
}

pub struct AdditiveOscillator {
    phases: [f32; MAX_HARMONICS],
    amplitudes: [f32; MAX_HARMONICS],
    target_amps: [f32; MAX_HARMONICS],
    num_harmonics: usize,
    frequency: f32,
    morph: f32,
    profile_a: AdditiveProfile,
    profile_b: AdditiveProfile,
    amp_smooth_coeff: f32,
}

impl AdditiveOscillator {
    pub fn new() -> Self {
        let mut osc = Self {
            phases: [0.0; MAX_HARMONICS],
            amplitudes: [0.0; MAX_HARMONICS],
            target_amps: [0.0; MAX_HARMONICS],
            num_harmonics: 16,
            frequency: 440.0,
            morph: 0.0,
            profile_a: AdditiveProfile::Saw,
            profile_b: AdditiveProfile::Square,
            amp_smooth_coeff: 0.002,
        };
        osc.recompute_targets();
        osc
    }

    fn recompute_targets(&mut self) {
        for k in 0..self.num_harmonics {
            let harmonic = k + 1;
            let a = self.profile_a.amplitude(harmonic);
            let b = self.profile_b.amplitude(harmonic);
            self.target_amps[k] = a * (1.0 - self.morph) + b * self.morph;
        }
        // Zero out harmonics beyond num_harmonics
        for k in self.num_harmonics..MAX_HARMONICS {
            self.target_amps[k] = 0.0;
        }
    }

    fn select_profile_pair(morph: f32) -> (AdditiveProfile, AdditiveProfile, f32) {
        // morph 0..1 sweeps across 5 profiles: Saw -> Square -> Triangle -> Organ -> Vocal
        let scaled = morph * 4.0; // 0..4
        let idx = floorf(scaled) as usize;
        let frac = scaled - floorf(scaled);
        let profiles = [
            AdditiveProfile::Saw,
            AdditiveProfile::Square,
            AdditiveProfile::Triangle,
            AdditiveProfile::Organ,
            AdditiveProfile::Vocal,
        ];
        let a = profiles[idx.min(4)];
        let b = profiles[(idx + 1).min(4)];
        (a, b, frac)
    }
}

impl OscillatorEngine for AdditiveOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        let mut output = 0.0;
        let nyquist = sample_rate * 0.5;

        for k in 0..self.num_harmonics {
            // Smooth amplitude changes to avoid clicks
            self.amplitudes[k] += (self.target_amps[k] - self.amplitudes[k]) * self.amp_smooth_coeff;

            let harmonic = (k + 1) as f32;
            let harmonic_freq = self.frequency * harmonic;

            // Anti-aliasing: skip harmonics above Nyquist
            if harmonic_freq >= nyquist {
                break;
            }

            output += self.amplitudes[k] * sinf(self.phases[k] * TAU);

            // Advance phase
            self.phases[k] += harmonic_freq / sample_rate;
            self.phases[k] -= floorf(self.phases[k]);
        }

        // Normalize output to avoid excessive amplitude with many harmonics
        let norm = 1.0 / (1.0 + (self.num_harmonics as f32 - 1.0).max(0.0) * 0.05);
        output * norm
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq;
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "harmonics" => {
                self.num_harmonics = (value as usize).clamp(1, MAX_HARMONICS);
                self.recompute_targets();
            }
            "morph" => {
                self.morph = value.clamp(0.0, 1.0);
                let (a, b, frac) = Self::select_profile_pair(self.morph);
                self.profile_a = a;
                self.profile_b = b;
                // Recompute targets with interpolated profiles
                for k in 0..self.num_harmonics {
                    let harmonic = k + 1;
                    let amp_a = self.profile_a.amplitude(harmonic);
                    let amp_b = self.profile_b.amplitude(harmonic);
                    self.target_amps[k] = amp_a * (1.0 - frac) + amp_b * frac;
                }
                for k in self.num_harmonics..MAX_HARMONICS {
                    self.target_amps[k] = 0.0;
                }
            }
            _ => {}
        }
    }

    fn reset(&mut self) {
        self.phases = [0.0; MAX_HARMONICS];
        self.amplitudes = [0.0; MAX_HARMONICS];
        self.recompute_targets();
    }

    fn name(&self) -> &'static str {
        "Additive"
    }
}
