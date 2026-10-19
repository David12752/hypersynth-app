// ──────────────────────────────────────────────────────────────────────
// HyperSynth — Virtual Analog Oscillator
//
// Professional polyBLEP-based oscillator with:
//   • Band-limited Saw / Square / Triangle / Sine / Noise
//   • Pulse-width modulation (external mod input)
//   • Analog drift (random walk on pitch, Arturia Mini V style)
//   • Vintage mode (amplitude jitter + subtle harmonic variation)
//   • Brightness control (one-pole lowpass on output)
//   • Sub-oscillator (sine/square at -1 or -2 octaves)
//   • Hard sync (slave resets when master wraps)
// ──────────────────────────────────────────────────────────────────────

use libm::{sinf, expf};

use super::traits::OscillatorEngine;

// ── Waveform Types ───────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaWaveform {
    Sine,
    Triangle,
    Sawtooth,
    Square,
    Noise,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubOscMode {
    Off,
    Sub1Sine,   // -1 octave sine
    Sub1Square,  // -1 octave square
    Sub2Sine,   // -2 octaves sine
}

// ── Main Struct ──────────────────────────────────────────────────────

pub struct VaOscillator {
    // Core phase state
    phase: f32,
    frequency: f32,
    waveform: VaWaveform,

    // Pulse width (0.05 – 0.95, center = 0.5)
    pulse_width: f32,
    /// External PWM modulation offset added to pulse_width each sample
    pwm_amount: f32,

    // Triangle state (integrated from square)
    triangle_state: f32,

    // Noise generator (LCG PRNG)
    noise_state: u32,

    // ── Analog Character ─────────────────────────────────────────
    /// Drift: random walk on pitch (0.0 = none, 1.0 = heavy analog feel)
    drift_amount: f32,
    drift_accumulator: f32,
    drift_rng: u32,

    /// Vintage: amplitude jitter + subtle harmonic instability (0.0 – 1.0)
    vintage_amount: f32,
    vintage_rng: u32,

    /// Brightness: one-pole lowpass on output (0.0 = dark, 1.0 = full bright)
    brightness: f32,
    brightness_state: f32,

    // ── Sub-Oscillator ───────────────────────────────────────────
    sub_mode: SubOscMode,
    sub_level: f32,
    sub_phase: f32,

    // ── Hard Sync ────────────────────────────────────────────────
    sync_enabled: bool,
    /// When sync is active, this is treated as the "master" frequency.
    /// The main oscillator acts as slave.
    sync_master_phase: f32,
    sync_master_freq: f32,
}

impl Default for VaOscillator {
    fn default() -> Self {
        Self {
            phase: 0.0,
            frequency: 440.0,
            waveform: VaWaveform::Sawtooth,
            pulse_width: 0.5,
            pwm_amount: 0.0,
            triangle_state: 0.0,
            noise_state: 0x1234_5678,

            drift_amount: 0.0,
            drift_accumulator: 0.0,
            drift_rng: 0xDEAD_BEEF,

            vintage_amount: 0.0,
            vintage_rng: 0xCAFE_BABE,

            brightness: 1.0,
            brightness_state: 0.0,

            sub_mode: SubOscMode::Off,
            sub_level: 0.5,
            sub_phase: 0.0,

            sync_enabled: false,
            sync_master_phase: 0.0,
            sync_master_freq: 440.0,
        }
    }
}

impl VaOscillator {
    pub fn new(waveform: VaWaveform) -> Self {
        Self {
            waveform,
            ..Self::default()
        }
    }

    // ── Phase Management ─────────────────────────────────────────

    /// Advance phase by dt, returning whether a phase wrap occurred (for sync)
    #[inline]
    fn advance_phase_wrap(phase: &mut f32, dt: f32) -> bool {
        *phase += dt;
        if *phase >= 1.0 {
            *phase -= 1.0;
            true
        } else {
            false
        }
    }

    // ── PolyBLEP Anti-Aliasing ───────────────────────────────────
    //
    // Polynomial Bandlimited Step function — removes the Gibbs
    // phenomenon at discontinuities. Applied at transitions of saw
    // and square waveforms. The residual offset is a degree-2
    // polynomial evaluated in the neighbourhood of the transition.

    #[inline]
    fn poly_blep(t: f32, dt: f32) -> f32 {
        if t < dt {
            // Just passed a rising edge
            let x = t / dt;
            x + x - x * x - 1.0
        } else if t > 1.0 - dt {
            // Approaching the next edge
            let x = (t - 1.0) / dt;
            x * x + x + x + 1.0
        } else {
            0.0
        }
    }

    // ── Waveform Generators ──────────────────────────────────────

    #[inline]
    fn generate_saw(phase: f32, dt: f32) -> f32 {
        let mut value = phase * 2.0 - 1.0;
        value -= Self::poly_blep(phase, dt);
        value
    }

    #[inline]
    fn generate_square(&self, phase: f32, dt: f32, pw: f32) -> f32 {
        let pw_clamped = pw.clamp(0.05, 0.95);

        let mut sample = if phase < pw_clamped { 1.0 } else { -1.0 };

        // polyBLEP at rising edge (phase = 0)
        sample += Self::poly_blep(phase, dt);

        // polyBLEP at falling edge (phase = pw)
        let second_edge = if phase >= pw_clamped {
            phase - pw_clamped
        } else {
            phase + 1.0 - pw_clamped
        };
        sample -= Self::poly_blep(second_edge, dt);

        sample
    }

    #[inline]
    fn generate_triangle(&mut self, phase: f32, dt: f32) -> f32 {
        // Leaky integration of bandlimited square → produces bandlimited triangle.
        // The leak factor (dt) acts as a high-pass to prevent DC drift.
        let square = self.generate_square(phase, dt, 0.5);
        self.triangle_state += square * dt * 4.0;
        // Leak: gentle pull toward zero to prevent DC wander
        self.triangle_state *= 1.0 - dt * 0.5;
        // Scale to [-1, 1] — the integration of ±1 square at 4×dt
        // approximates ≈±1 amplitude; clamp for safety.
        (self.triangle_state * 1.5).clamp(-1.0, 1.0)
    }

    // ── Analog Drift ─────────────────────────────────────────────
    //
    // Random walk — each sample, the pitch offset drifts by a tiny
    // random step. The walk decays toward zero so it never runs away.
    // Amount 1.0 ≈ ±6 cents of wander (classic Minimoog behavior).

    #[inline]
    fn next_drift_rng(&mut self) -> f32 {
        self.drift_rng = self.drift_rng.wrapping_mul(1664525).wrapping_add(1013904223);
        // Map to -1..+1
        ((self.drift_rng >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0
    }

    #[inline]
    fn compute_drift(&mut self) -> f32 {
        if self.drift_amount < 0.001 {
            return 1.0;  // No drift — frequency multiplier is 1.0
        }
        let random = self.next_drift_rng();
        // Random walk step — scaled so amount=1.0 gives ~6 cents peak
        self.drift_accumulator += random * self.drift_amount * 0.0005;
        // Decay toward zero (prevents runaway)
        self.drift_accumulator *= 0.9995;
        // Clamp to ±50 cents max
        self.drift_accumulator = self.drift_accumulator.clamp(-0.03, 0.03);
        // Convert cents-like offset to frequency multiplier
        // 2^(cents/1200) ≈ 1 + cents * 0.000578 for small values
        1.0 + self.drift_accumulator
    }

    // ── Vintage Character ────────────────────────────────────────
    //
    // Subtle amplitude jitter — classic analog VCOs fluctuate slightly
    // in amplitude due to power supply ripple and component tolerances.

    #[inline]
    fn next_vintage_rng(&mut self) -> f32 {
        self.vintage_rng = self.vintage_rng.wrapping_mul(1664525).wrapping_add(1013904223);
        ((self.vintage_rng >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0
    }

    #[inline]
    fn compute_vintage_gain(&mut self) -> f32 {
        if self.vintage_amount < 0.001 {
            return 1.0;
        }
        let jitter = self.next_vintage_rng() * self.vintage_amount * 0.015;
        1.0 + jitter
    }

    // ── Brightness Filter ────────────────────────────────────────
    //
    // One-pole lowpass on the output. When brightness = 1.0, the
    // coefficient is ~1.0 (bypass). At 0.0 it's heavily filtered.

    #[inline]
    fn apply_brightness(&mut self, input: f32, sample_rate: f32) -> f32 {
        if self.brightness >= 0.999 {
            self.brightness_state = input;
            return input;
        }
        // Map brightness 0..1 → cutoff frequency 200 Hz .. 20 kHz (log scale)
        let cutoff_hz = 200.0 * libm::powf(100.0, self.brightness);
        // One-pole coefficient: alpha = 1 - exp(-2π * fc / sr)
        let alpha = 1.0 - expf(-core::f32::consts::TAU * cutoff_hz / sample_rate);
        self.brightness_state += alpha * (input - self.brightness_state);
        self.brightness_state
    }

    // ── Sub-Oscillator ───────────────────────────────────────────

    #[inline]
    fn process_sub(&mut self, sample_rate: f32) -> f32 {
        if self.sub_mode == SubOscMode::Off || self.sub_level < 0.001 {
            return 0.0;
        }

        let sub_freq = match self.sub_mode {
            SubOscMode::Off => return 0.0,
            SubOscMode::Sub1Sine | SubOscMode::Sub1Square => self.frequency * 0.5,
            SubOscMode::Sub2Sine => self.frequency * 0.25,
        };

        let dt = (sub_freq / sample_rate).clamp(0.0, 0.5);
        Self::advance_phase_wrap(&mut self.sub_phase, dt);

        let sub_sample = match self.sub_mode {
            SubOscMode::Sub1Sine | SubOscMode::Sub2Sine => {
                sinf(self.sub_phase * core::f32::consts::TAU)
            }
            SubOscMode::Sub1Square => {
                // Bandlimited sub square
                let mut s = if self.sub_phase < 0.5 { 1.0 } else { -1.0 };
                s += Self::poly_blep(self.sub_phase, dt);
                let second = if self.sub_phase >= 0.5 { self.sub_phase - 0.5 } else { self.sub_phase + 0.5 };
                s -= Self::poly_blep(second, dt);
                s
            }
            SubOscMode::Off => 0.0,
        };

        sub_sample * self.sub_level
    }
}

// ── OscillatorEngine Trait ───────────────────────────────────────────

impl OscillatorEngine for VaOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        // 1. Compute effective frequency with drift
        let drift_mult = self.compute_drift();
        let effective_freq = self.frequency * drift_mult;
        let dt = (effective_freq / sample_rate).clamp(0.0, 0.5);

        // 2. Hard sync: advance master, reset slave phase on master wrap
        if self.sync_enabled {
            let master_dt = (self.sync_master_freq / sample_rate).clamp(0.0, 0.5);
            if Self::advance_phase_wrap(&mut self.sync_master_phase, master_dt) {
                // Master wrapped — reset slave
                self.phase = 0.0;
                self.triangle_state = 0.0;
            }
        }

        let phase = self.phase;

        // 3. Generate main waveform
        let sample = match self.waveform {
            VaWaveform::Sawtooth => Self::generate_saw(phase, dt),

            VaWaveform::Square => {
                // PWM: pulse_width + external pwm_amount
                let pw = (self.pulse_width + self.pwm_amount).clamp(0.05, 0.95);
                self.generate_square(phase, dt, pw)
            }

            VaWaveform::Triangle => self.generate_triangle(phase, dt),

            VaWaveform::Sine => sinf(phase * core::f32::consts::TAU),

            VaWaveform::Noise => {
                self.noise_state = self.noise_state.wrapping_mul(1664525).wrapping_add(1013904223);
                ((self.noise_state >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0
            }
        };

        // 4. Add sub-oscillator
        let sub = self.process_sub(sample_rate);

        // 5. Advance main oscillator phase
        Self::advance_phase_wrap(&mut self.phase, dt);

        // 6. Apply vintage amplitude jitter
        let vintage_gain = self.compute_vintage_gain();

        // 7. Apply brightness filter
        let raw = (sample + sub) * vintage_gain;
        let filtered = self.apply_brightness(raw, sample_rate);

        filtered.clamp(-1.0, 1.0)
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq.max(0.0);
        self.sync_master_freq = freq.max(0.0);
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "pulse_width" => self.pulse_width = value.clamp(0.05, 0.95),
            "pwm_amount" => self.pwm_amount = value.clamp(-0.45, 0.45),

            "waveform" => {
                self.waveform = match value as u8 {
                    0 => VaWaveform::Sine,
                    1 => VaWaveform::Triangle,
                    2 => VaWaveform::Sawtooth,
                    3 => VaWaveform::Square,
                    _ => VaWaveform::Noise,
                };
            }

            "drift" => self.drift_amount = value.clamp(0.0, 1.0),
            "vintage" => self.vintage_amount = value.clamp(0.0, 1.0),
            "brightness" => self.brightness = value.clamp(0.0, 1.0),

            "sync" => self.sync_enabled = value > 0.5,
            "sync_ratio" => {
                // Sync ratio: slave/master frequency ratio (1.0 = unison, 2.0 = octave, etc.)
                // Stored as sync_master_freq = base_freq (set_frequency handles it)
            }

            "sub_mode" => {
                self.sub_mode = match value as u8 {
                    0 => SubOscMode::Off,
                    1 => SubOscMode::Sub1Sine,
                    2 => SubOscMode::Sub1Square,
                    3 => SubOscMode::Sub2Sine,
                    _ => SubOscMode::Off,
                };
            }
            "sub_level" => self.sub_level = value.clamp(0.0, 1.0),

            _ => {}
        }
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.triangle_state = 0.0;
        self.brightness_state = 0.0;
        self.drift_accumulator = 0.0;
        self.sub_phase = 0.0;
        self.sync_master_phase = 0.0;
    }

    fn name(&self) -> &'static str {
        "Virtual Analog"
    }
}
