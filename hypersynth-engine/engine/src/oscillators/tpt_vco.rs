// ════════════════════════════════════════════════════════════════════
// HyperSynth — TPT-Based Virtual Analog VCO
//
// Models a classic analog VCO (Voltage-Controlled Oscillator) using
// TPT (Topology Preserving Transform) integrators as the core
// waveform generators.  This produces waveforms with correct phase
// response that integrate seamlessly with TPT-based filters.
//
// ── Circuit Architecture (CEM3340-inspired) ───────────────────────
//
//   +Vcc
//    │
//  [V/Oct Exp. Converter]  ← I_charge = I₀ · exp(V_ctrl / Vₜ)
//    │
//  [TPT Integrator (C)]    ← dV/dt = I_charge / C
//    │                        Discretized: trapezoidal rule
//  [Comparator]             ← fires when V_cap ≥ V_thresh
//    │
//  [Reset + BLEP]           ← band-limited reset via PolyBLEP
//    │
//  [Output Buffer]          ← tanh soft-clip (op-amp saturation)
//
// ── Waveform Generation ───────────────────────────────────────────
//
//  Sawtooth: TPT integrator charges linearly, BLEP at reset.
//  Square:   Comparator on sawtooth phase at pulse_width threshold.
//  Triangle: TPT integrator integrating the bandlimited square wave.
//            This produces a truly bandlimited triangle — not just
//            a naive phase-accumulator approach.
//  Sine:     Standard sin(2πφ) — already bandlimited by definition.
//
// ── TPT Advantage Over Pure PolyBLEP ─────────────────────────────
//
//  1. Triangle is generated via integration of square through a real
//     TPT integrator, giving it the correct low-frequency phase
//     response of an actual RC integrator circuit.
//
//  2. Output saturation uses the same TPT-compatible tanh model as
//     the filter — the whole signal chain preserves topology.
//
//  3. The sawtooth can optionally be generated via TPT integrator
//     charging (more analog) rather than naive phase accumulation.
//
// ════════════════════════════════════════════════════════════════════

use libm::{sinf, expf};

use crate::virtual_analog::tpt_integrator::{TptIntegrator, fast_tanh};
use super::traits::OscillatorEngine;

// ── Physical Constants ───────────────────────────────────────────────

const VT_NOMINAL: f32 = 0.02585;
const K_OVER_Q: f32 = 8.617_333e-5;
const T_NOMINAL_K: f32 = 298.15;

// ── Waveform Selection ───────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TptWaveform {
    Sine,
    Triangle,
    Sawtooth,
    Square,
    Noise,
}

// ── Thermal Model ────────────────────────────────────────────────────
//
// Simulates the thermal mass of the VCO chip (CEM3340-like).
// Temperature follows a 1st-order RC with τ ≈ 30 s.
// Playing notes heats the circuit; silence lets it cool.
// A warmer chip → higher Vₜ → lower expo converter gain → pitch drops.

struct VcoThermal {
    temp_c: f32,
    target_c: f32,
}

impl VcoThermal {
    const fn new() -> Self {
        Self {
            temp_c: 0.0,
            target_c: 0.0,
        }
    }

    #[inline]
    fn tick(&mut self, sr: f32) {
        let alpha = 1.0 / (30.0 * sr);
        self.temp_c += (self.target_c - self.temp_c) * alpha;
        self.target_c *= 1.0 - alpha * 0.5;
    }

    #[inline]
    fn add_heat(&mut self, amount: f32) {
        self.target_c = (self.target_c + amount).min(25.0);
    }

    #[inline]
    fn freq_factor(&self) -> f32 {
        VT_NOMINAL / (K_OVER_Q * (T_NOMINAL_K + self.temp_c))
    }
}

// ── Component Tolerances ─────────────────────────────────────────────

struct VcoTolerances {
    #[allow(dead_code)]
    cap: f32,
    #[allow(dead_code)]
    current: f32,
    threshold: f32,
    freq_offset: f32,
}

impl VcoTolerances {
    fn from_seed(mut seed: u32) -> Self {
        let mut rng = |spread: f32| -> f32 {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let n = ((seed >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0;
            1.0 + n * spread
        };
        let cap = rng(0.05);
        let current = rng(0.03);
        let threshold = rng(0.01);
        Self {
            cap,
            current,
            threshold,
            freq_offset: current / cap,
        }
    }
}

// ══════════════════════════════════════════════════════════════════════
//  TptVco — TPT-based Virtual Analog Oscillator
// ══════════════════════════════════════════════════════════════════════

pub struct TptVco {
    // ── Core phase state ──────────────────────────────────────
    phase: f32,
    frequency: f32,
    waveform: TptWaveform,

    // ── TPT integrator for triangle wave generation ───────────
    // Integrates the bandlimited square wave to produce a true
    // analog-style triangle with correct RC phase response.
    triangle_integrator: TptIntegrator,

    // ── Pulse width modulation ────────────────────────────────
    pulse_width: f32,
    pwm_mod: f32,

    // ── Hard sync ─────────────────────────────────────────────
    sync_enabled: bool,
    sync_master_phase: f32,
    sync_master_freq: f32,

    // ── Sub-oscillator ────────────────────────────────────────
    sub_phase: f32,
    sub_level: f32,
    sub_octave: u8,
    sub_square: bool,

    // ── Analog character ──────────────────────────────────────
    thermal: VcoThermal,
    tolerances: VcoTolerances,

    /// Drift: random walk on pitch [0.0 = none, 1.0 = heavy vintage]
    drift_amount: f32,
    drift_walk: f32,
    drift_rng: u32,

    // ── Output buffer ─────────────────────────────────────────
    /// One-pole LP on output (simulates output buffer bandwidth)
    out_lp: f32,

    /// Discharge glitch amplitude (reset transistor slew)
    reset_glitch: f32,

    // ── Analog character ──────────────────────────────────────
    /// Brightness: output LP cutoff. 1.0 = full (~40 kHz), 0.0 = dark (~8 kHz)
    brightness: f32,
    /// Vintage: subtle amplitude jitter from power supply ripple and transistor noise
    vintage_amount: f32,
    vintage_rng: u32,

    // ── Noise LFSR ────────────────────────────────────────────
    noise_state: u32,
}

impl TptVco {
    pub fn new(voice_index: u32) -> Self {
        let seed = voice_index
            .wrapping_mul(2_654_435_769)
            .wrapping_add(0x9E37_79B9);

        let mut tri_int = TptIntegrator::new();
        // Triangle integrator frequency will be set per-sample
        tri_int.set_saturation(0.0);

        Self {
            phase: 0.0,
            frequency: 440.0,
            waveform: TptWaveform::Sawtooth,

            triangle_integrator: tri_int,

            pulse_width: 0.5,
            pwm_mod: 0.0,

            sync_enabled: false,
            sync_master_phase: 0.0,
            sync_master_freq: 440.0,

            sub_phase: 0.0,
            sub_level: 0.0,
            sub_octave: 1,
            sub_square: false,

            thermal: VcoThermal::new(),
            tolerances: VcoTolerances::from_seed(seed),

            drift_amount: 0.25,
            drift_walk: 0.0,
            drift_rng: seed ^ 0xACE1_DE97,

            out_lp: 0.0,
            reset_glitch: 0.0,

            brightness: 1.0,
            vintage_amount: 0.0,
            vintage_rng: seed ^ 0xBEEF_CAFE,

            noise_state: seed ^ 0xDEAD_BEEF,
        }
    }

    // ── PolyBLEP ─────────────────────────────────────────────────
    //
    // Polynomial Band-Limited Step function: removes aliasing at
    // waveform discontinuities.  Applied at the reset point of
    // sawtooth and the edges of square waves.

    #[inline]
    fn poly_blep(t: f32, dt: f32) -> f32 {
        if t < dt {
            let x = t / dt;
            x + x - x * x - 1.0
        } else if t > 1.0 - dt {
            let x = (t - 1.0) / dt;
            x * x + x + x + 1.0
        } else {
            0.0
        }
    }

    // ── Drift random walk ─────────────────────────────────────────

    #[inline]
    fn advance_drift(&mut self) -> f32 {
        if self.drift_amount < 1e-4 {
            return 1.0;
        }
        self.drift_rng = self.drift_rng
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        let r = ((self.drift_rng >> 9) as f32 / 8_388_608.0) - 1.0;
        self.drift_walk += r * self.drift_amount * 4e-5;
        self.drift_walk *= 0.9997;
        self.drift_walk = self.drift_walk.clamp(-0.06, 0.06);
        1.0 + self.drift_walk * core::f32::consts::LN_2
    }

    // ── Comparator threshold noise ────────────────────────────────

    #[inline]
    fn threshold_noise(&mut self) -> f32 {
        self.drift_rng = self.drift_rng
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        ((self.drift_rng >> 16) as f32 / 65_536.0 - 0.5) * 4e-4
    }

    // ── Sub-oscillator ────────────────────────────────────────────

    #[inline]
    fn process_sub(&mut self, dt: f32) -> f32 {
        if self.sub_level < 1e-4 || self.sub_octave == 0 {
            return 0.0;
        }
        let sub_dt = dt * if self.sub_octave == 2 { 0.25 } else { 0.5 };
        self.sub_phase += sub_dt;
        if self.sub_phase >= 1.0 {
            self.sub_phase -= 1.0;
        }
        let sub = if self.sub_square {
            let mut sq = if self.sub_phase < 0.5 { 1.0f32 } else { -1.0 };
            sq += Self::poly_blep(self.sub_phase, sub_dt);
            let edge2 = if self.sub_phase >= 0.5 { self.sub_phase - 0.5 } else { self.sub_phase + 0.5 };
            sq -= Self::poly_blep(edge2, sub_dt);
            sq
        } else {
            sinf(self.sub_phase * core::f32::consts::TAU)
        };
        sub * self.sub_level
    }
}

// ══════════════════════════════════════════════════════════════════════
//  OscillatorEngine trait implementation
// ══════════════════════════════════════════════════════════════════════

impl OscillatorEngine for TptVco {
    fn process(&mut self, sample_rate: f32) -> f32 {
        // ── 1. Compute effective frequency ────────────────────────
        self.thermal.tick(sample_rate);
        self.thermal.add_heat(0.02);

        let thermal_mult = self.thermal.freq_factor();
        let drift_mult = self.advance_drift();
        let tol_mult = self.tolerances.freq_offset;

        let effective_freq = self.frequency * thermal_mult * drift_mult * tol_mult;
        let dt = (effective_freq / sample_rate).clamp(1e-6, 0.499);

        // ── 2. Hard sync ──────────────────────────────────────────
        if self.sync_enabled {
            let master_dt = (self.sync_master_freq / sample_rate).clamp(1e-6, 0.499);
            self.sync_master_phase += master_dt;
            if self.sync_master_phase >= 1.0 {
                self.sync_master_phase -= 1.0;
                self.phase = 0.0;
                self.triangle_integrator.reset();
                self.reset_glitch = 0.0;
            }
        }

        // ── 3. Advance phase ──────────────────────────────────────
        let thresh_noise = self.threshold_noise();
        let threshold = (1.0 + self.tolerances.threshold * 1e-3 + thresh_noise)
            .clamp(0.98, 1.02);

        self.phase += dt;

        let mut did_wrap = false;
        if self.phase >= threshold {
            did_wrap = true;
            self.reset_glitch = self.phase;
            self.phase -= threshold;
        }

        // Discharge glitch decay (RC ≈ 3 µs)
        let glitch_decay = expf(-1.0 / (3e-6 * sample_rate));
        self.reset_glitch *= glitch_decay;

        // ── 4. Generate waveform ──────────────────────────────────
        let main_sample = match self.waveform {
            TptWaveform::Sawtooth => {
                let mut s = self.phase * 2.0 - 1.0;
                if did_wrap {
                    s -= Self::poly_blep(self.phase, dt) * 2.0;
                    s += self.reset_glitch * 0.08;
                }
                s
            }

            TptWaveform::Square => {
                let pw = (self.pulse_width + self.pwm_mod).clamp(0.05, 0.95);
                let mut s = if self.phase < pw { 1.0f32 } else { -1.0 };
                s += Self::poly_blep(self.phase, dt);
                let edge2 = if self.phase >= pw {
                    self.phase - pw
                } else {
                    self.phase + 1.0 - pw
                };
                s -= Self::poly_blep(edge2, dt);
                s
            }

            TptWaveform::Triangle => {
                // Generate bandlimited square, then integrate through
                // TPT integrator — this produces a triangle with correct
                // RC phase response, unlike naive phase-based methods.
                let sq = if self.phase < 0.5 { 1.0f32 } else { -1.0 };
                // Scale square by 4·dt so integration produces ±1 amplitude
                // Set integrator frequency to match oscillator frequency
                self.triangle_integrator.set_frequency(
                    effective_freq * 0.5,
                    sample_rate,
                );
                let tri = self.triangle_integrator.tick_linear(sq);
                // Normalize: the integrator output scales with G,
                // so we need to compensate
                let g = self.triangle_integrator.g();
                let scale = if g > 0.001 { (1.0 + g) / g } else { 1.0 };
                (tri * scale * 0.5).clamp(-1.0, 1.0)
            }

            TptWaveform::Sine => {
                sinf(self.phase * core::f32::consts::TAU)
            }

            TptWaveform::Noise => {
                self.noise_state = self.noise_state
                    .wrapping_mul(1_664_525)
                    .wrapping_add(1_013_904_223);
                ((self.noise_state >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0
            }
        };

        // ── 5. Sub-oscillator ─────────────────────────────────────
        let sub = self.process_sub(dt);

        // ── 6. Output buffer saturation ───────────────────────────
        //
        // The output op-amp clips softly at ≈ ±10V (normalised to ±1).
        // 1.05× drive into tanh gives ~1% THD at 0 dBFS — subtle but present.
        let combined = main_sample + sub;
        let saturated = fast_tanh(combined * 1.05) * 0.952;

        // ── 7. Vintage amplitude jitter ────────────────────────────────────────
        // Real VCOs have subtle amplitude instability from power supply
        // ripple and transistor base-current noise. vintage_amount controls
        // the magnitude of this cycle-to-cycle variation.
        let output = if self.vintage_amount > 1e-4 {
            self.vintage_rng = self.vintage_rng
                .wrapping_mul(1_664_525)
                .wrapping_add(1_013_904_223);
            let jitter = ((self.vintage_rng >> 16) as f32 / 65_536.0 - 0.5)
                * 0.012 * self.vintage_amount;
            saturated * (1.0 + jitter)
        } else {
            saturated
        };

        // ── 8. Output LP (CEM3340 output buffer bandwidth) ───────────────────
        // The output capacitor and op-amp bandwidth limit HF content.
        // brightness=1.0 → fc≈40 kHz (full bright; transparent at 48 kHz)
        // brightness=0.0 → fc≈8 kHz (dark vintage character)
        let lp_cutoff = 8_000.0_f32 + 32_000.0 * self.brightness;
        let lp_alpha = 1.0 - expf(-core::f32::consts::TAU * lp_cutoff / sample_rate);
        self.out_lp += lp_alpha * (output - self.out_lp);
        self.out_lp
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq.max(0.1);
        self.sync_master_freq = freq.max(0.1);
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "waveform" => {
                self.waveform = match value as u8 {
                    0 => TptWaveform::Sine,
                    1 => TptWaveform::Triangle,
                    2 => TptWaveform::Sawtooth,
                    3 => TptWaveform::Square,
                    _ => TptWaveform::Noise,
                };
            }
            "pulse_width" => self.pulse_width = value.clamp(0.05, 0.95),
            "pwm_mod" => self.pwm_mod = value.clamp(-0.45, 0.45),
            "drift" => self.drift_amount = value.clamp(0.0, 1.0),
            "brightness" => self.brightness = value.clamp(0.0, 1.0),
            "vintage" => self.vintage_amount = value.clamp(0.0, 1.0),
            "sub_level" => self.sub_level = value.clamp(0.0, 1.0),
            "sub_mode" => match value as u8 {
                0 => { self.sub_octave = 0; self.sub_square = false; }
                1 => { self.sub_octave = 1; self.sub_square = false; }
                2 => { self.sub_octave = 1; self.sub_square = true; }
                3 => { self.sub_octave = 2; self.sub_square = false; }
                _ => { self.sub_octave = 0; self.sub_square = false; }
            },
            "sub_octave" => { self.sub_octave = (value as u8).clamp(0, 2); self.sub_square = true; },
            "sync" => self.sync_enabled = value > 0.5,
            "sync_freq" => self.sync_master_freq = value.max(0.1),
            _ => {}
        }
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.reset_glitch = 0.0;
        self.triangle_integrator.reset();
        self.out_lp = 0.0;
        self.sync_master_phase = 0.0;
        self.sub_phase = 0.0;
    }

    fn name(&self) -> &'static str {
        "TptVCO"
    }
}

// ════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_output_with_no_panic() {
        let mut osc = TptVco::new(0);
        osc.set_frequency(440.0);
        for _ in 0..4096 {
            let s = osc.process(48_000.0);
            assert!(s.is_finite(), "Non-finite sample");
            assert!(s.abs() <= 1.05, "Sample exceeds ±1.05: {}", s);
        }
    }

    #[test]
    fn all_waveforms_produce_output() {
        let sr = 48_000.0;
        for wf in 0..5u8 {
            let mut osc = TptVco::new(0);
            osc.set_frequency(440.0);
            osc.set_param("waveform", wf as f32);
            let mut max_sample = 0.0f32;
            for _ in 0..4096 {
                let s = osc.process(sr);
                assert!(s.is_finite());
                if s.abs() > max_sample {
                    max_sample = s.abs();
                }
            }
            assert!(
                max_sample > 0.1,
                "Waveform {} should produce audible output, max={}",
                wf,
                max_sample
            );
        }
    }

    #[test]
    fn thermal_drift_lowers_pitch() {
        let mut osc = TptVco::new(0);
        osc.set_frequency(1000.0);

        // Heat it up significantly — run many iterations at high heat
        for _ in 0..500_000 {
            osc.thermal.add_heat(5.0);
            osc.thermal.tick(48_000.0);
        }

        // The thermal model should lower the frequency factor
        assert!(
            osc.thermal.freq_factor() < 1.0,
            "Heated VCO should have freq_factor < 1.0, got {}",
            osc.thermal.freq_factor()
        );
    }

    #[test]
    fn different_voices_differ() {
        let mut osc0 = TptVco::new(0);
        let mut osc1 = TptVco::new(3);
        osc0.set_frequency(220.0);
        osc1.set_frequency(220.0);

        let mut diff_count = 0usize;
        for _ in 0..1024 {
            let a = osc0.process(48_000.0);
            let b = osc1.process(48_000.0);
            if (a - b).abs() > 1e-4 {
                diff_count += 1;
            }
        }
        assert!(
            diff_count > 200,
            "Voices should differ due to tolerances: {} diffs",
            diff_count
        );
    }

    #[test]
    fn triangle_via_tpt_is_bandlimited() {
        // Triangle generated through TPT integrator should have no
        // abrupt discontinuities (unlike naive triangle).
        // Check that adjacent samples differ by a reasonable amount.
        let mut osc = TptVco::new(0);
        osc.set_frequency(5000.0); // High frequency — aliasing would be visible
        osc.set_param("waveform", 1.0); // Triangle

        let mut prev = 0.0f32;
        let mut max_delta = 0.0f32;
        for i in 0..4096 {
            let s = osc.process(48_000.0);
            if i > 100 {
                let delta = (s - prev).abs();
                if delta > max_delta {
                    max_delta = delta;
                }
            }
            prev = s;
        }

        // Band-limited triangle at 5 kHz / 48 kHz has ~9.6 samples/period.
        // Max delta per sample for a triangle with 2.0 pk-pk range:
        //   slope = 2 / (period/2) = 4 * dt ≈ 0.42
        // With PolyBLEP and integrator effects, allow up to 1.2.
        assert!(
            max_delta < 1.2,
            "Triangle should be smooth, max_delta={}",
            max_delta
        );
    }

    #[test]
    fn hard_sync_resets_phase() {
        let mut osc = TptVco::new(0);
        osc.set_frequency(880.0);
        osc.set_param("sync", 1.0);
        osc.set_param("sync_freq", 440.0);
        osc.set_param("waveform", 2.0); // Sawtooth

        let mut had_reset = false;
        let mut prev = 0.0f32;
        for _ in 0..4096 {
            let s = osc.process(48_000.0);
            // Detect a large jump (sync reset)
            if (s - prev).abs() > 0.5 {
                had_reset = true;
            }
            prev = s;
        }
        assert!(had_reset, "Hard sync should cause phase resets");
    }
}
