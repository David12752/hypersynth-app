use libm::sinf;
use crate::oscillators::OscillatorEngine;

const MAX_MODES: usize = 64;
const TAU: f32 = core::f32::consts::TAU;

/// Physical body types with scientifically accurate partial ratios
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModalBody {
    String = 0,
    Bar = 1,
    Membrane = 2,
    Plate = 3,
    Tube = 4,
    Bell = 5,
}

impl ModalBody {
    pub fn from_index(i: u8) -> Self {
        match i {
            1 => Self::Bar,
            2 => Self::Membrane,
            3 => Self::Plate,
            4 => Self::Tube,
            5 => Self::Bell,
            _ => Self::String,
        }
    }

    /// Returns (frequency_ratio, relative_amplitude) for mode k (0-indexed)
    fn mode_data(self, k: usize) -> (f32, f32) {
        // Frequency ratios relative to fundamental
        let ratio = match self {
            Self::String => (k + 1) as f32,
            Self::Bar => {
                const RATIOS: [f32; 8] = [1.0, 2.756, 5.404, 8.933, 13.344, 18.637, 24.812, 31.870];
                if k < RATIOS.len() { RATIOS[k] } else { libm::powf(k as f32 + 1.0, 2.0) * 0.25 }
            }
            Self::Membrane => {
                const RATIOS: [f32; 8] = [1.0, 1.593, 2.136, 2.296, 2.653, 2.917, 3.156, 3.501];
                if k < RATIOS.len() { RATIOS[k] } else { 1.0 + k as f32 * 0.45 }
            }
            Self::Plate => {
                const RATIOS: [f32; 8] = [1.0, 1.732, 2.0, 2.646, 3.0, 3.317, 3.606, 4.0];
                if k < RATIOS.len() { RATIOS[k] } else { 1.0 + k as f32 * 0.5 }
            }
            Self::Tube => {
                // Odd harmonics only (closed tube)
                (2 * k + 1) as f32
            }
            Self::Bell => {
                const RATIOS: [f32; 8] = [1.0, 1.183, 1.571, 1.972, 2.0, 2.843, 3.429, 4.571];
                if k < RATIOS.len() { RATIOS[k] } else { 1.0 + k as f32 * 0.6 }
            }
        };

        // Higher modes start with less energy
        let amplitude = 1.0 / (1.0 + k as f32 * 0.3);

        (ratio, amplitude)
    }
}

struct ResonantMode {
    frequency_ratio: f32,
    amplitude: f32,
    decay_rate: f32,
    phase: f32,
    energy: f32,
}

pub struct ModalOscillator {
    body_type: ModalBody,
    modes: [ResonantMode; MAX_MODES],
    active_modes: usize,
    frequency: f32,
    sample_rate_cached: f32,
    decay: f32,
    brightness: f32,
    excited: bool,
}

impl ModalOscillator {
    pub fn new() -> Self {
        let mut osc = Self {
            body_type: ModalBody::String,
            modes: core::array::from_fn(|_| ResonantMode {
                frequency_ratio: 1.0,
                amplitude: 0.0,
                decay_rate: 0.9999,
                phase: 0.0,
                energy: 0.0,
            }),
            active_modes: 16,
            frequency: 440.0,
            sample_rate_cached: 48000.0,
            decay: 2.0,
            brightness: 0.6,
            excited: false,
        };
        osc.reconfigure_modes();
        osc
    }

    fn reconfigure_modes(&mut self) {
        for k in 0..self.active_modes {
            let (ratio, amp) = self.body_type.mode_data(k);
            self.modes[k].frequency_ratio = ratio;
            self.modes[k].amplitude = amp;

            // Decay rate: higher modes decay faster (brightness controls this)
            // decay is in seconds; convert to per-sample decay coefficient
            let mode_decay_time = self.decay / (1.0 + k as f32 * (1.0 - self.brightness) * 0.5);
            let decay_samples = mode_decay_time * self.sample_rate_cached;
            // We want energy to reach ~0.001 after decay_samples
            // energy *= decay_rate each sample → decay_rate = 0.001^(1/N)
            if decay_samples > 1.0 {
                self.modes[k].decay_rate = libm::powf(0.001, 1.0 / decay_samples);
            } else {
                self.modes[k].decay_rate = 0.001;
            }
        }
    }

    fn excite(&mut self) {
        for k in 0..self.active_modes {
            self.modes[k].energy = self.modes[k].amplitude;
            // Slightly randomize phase for natural attack
            self.modes[k].phase = (k as f32 * 0.37) % 1.0;
        }
        self.excited = true;
    }
}

impl OscillatorEngine for ModalOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        if sample_rate != self.sample_rate_cached {
            self.sample_rate_cached = sample_rate;
            self.reconfigure_modes();
        }

        let mut output = 0.0;
        let nyquist = sample_rate * 0.5;

        for k in 0..self.active_modes {
            let mode = &mut self.modes[k];
            if mode.energy < 1e-7 {
                continue;
            }

            let mode_freq = self.frequency * mode.frequency_ratio;
            if mode_freq >= nyquist {
                continue;
            }

            output += mode.energy * sinf(mode.phase * TAU);

            // Advance phase
            mode.phase += mode_freq / sample_rate;
            mode.phase -= libm::floorf(mode.phase);

            // Exponential decay
            mode.energy *= mode.decay_rate;
        }

        output
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq;
        // Re-excite on new note (frequency change implies new note)
        self.excite();
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "body" => {
                let new_body = ModalBody::from_index(value as u8);
                if new_body != self.body_type {
                    self.body_type = new_body;
                    self.reconfigure_modes();
                }
            }
            "decay" => {
                self.decay = value.clamp(0.05, 10.0);
                self.reconfigure_modes();
            }
            "brightness" => {
                self.brightness = value.clamp(0.0, 1.0);
                self.reconfigure_modes();
            }
            _ => {}
        }
    }

    fn reset(&mut self) {
        for k in 0..MAX_MODES {
            self.modes[k].energy = 0.0;
            self.modes[k].phase = 0.0;
        }
        self.excited = false;
    }

    fn name(&self) -> &'static str {
        "Modal"
    }
}
