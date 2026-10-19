// ════════════════════════════════════════════════════════════════════
// HyperSynth — Physical Circuit Simulation: VCO
//
// Models the actual differential equations of a classic analog
// synthesizer oscillator at the component level.
//
// ── Circuit Architecture ──────────────────────────────────────────
//
//   Classic sawtooth VCO (e.g., CEM3340 / Roland SH/Juno family):
//
//     +Vcc
//      │
//    [Current Source]  ← exponential V/Oct converter (transistor pair)
//      │                 I_charge = I₀ · exp(V_ctrl / Vₜ)
//      │
//    [Capacitor C]     ← integrator: dV/dt = I_charge / C
//      │
//    [Comparator]      ← fires when V_cap ≥ V_thresh
//      │
//    [Reset Switch]    ← discharge transistor pulls cap to GND
//
//   Output of capacitor = rising sawtooth.
//   At comparator trip point: brief "glitch" from transistor slew.
//
// ── Analog Warmth Sources ─────────────────────────────────────────
//
//   1. Thermal voltage drift: Vₜ(T) = kT/q (26 mV at 25 °C).
//      When T rises, Vₜ rises → exponential converter gain falls →
//      oscillator runs flat. Residual tempco ~30–100 ppm/°C.
//
//   2. Component tolerances: capacitance ±5 %, current source ±3 %,
//      comparator threshold ±1 %. Gives each voice instance its own
//      unique character (slight detuning, different reset timing).
//
//   3. Reset glitch: discharge is not instantaneous (τ ≈ 3 µs).
//      Creates a brief positive spike at the sawtooth wrap point,
//      adding characteristic "edge" to the tone.
//
//   4. Residual random drift: comparator threshold noise + supply
//      ripple → implemented as a slow random walk on pitch.
//
//   5. Output buffer saturation: the last op-amp stage clips softly,
//      rounding peaks — adds even-order harmonics.
//
// ════════════════════════════════════════════════════════════════════

use libm::{sinf, tanhf, expf};

use super::traits::OscillatorEngine;

// ── Physical Constants ───────────────────────────────────────────────

/// Thermal voltage at 25 °C: Vₜ = kT/q  (k=1.381e-23 J/K, q=1.602e-19 C)
const VT_NOMINAL: f32 = 0.02585;
/// Boltzmann constant / electron charge [V/K]
const K_OVER_Q: f32 = 8.617_333e-5;
/// Nominal operating temperature [K] (25 °C)
const T_NOMINAL_K: f32 = 298.15;
/// Maximum temperature excursion modelled [°C]
const MAX_TEMP_DEV_C: f32 = 30.0;

// ── Fast Nonlinearity Helpers ────────────────────────────────────────

/// Soft clipper: tanh, clamped to avoid `libm` overflow at ±8.
#[inline(always)]
fn soft_clip(x: f32) -> f32 {
    tanhf(x.clamp(-8.0, 8.0))
}

// ── Thermal Model ────────────────────────────────────────────────────
//
//  Simulates the thermal mass of the PCB and IC package.
//  Temperature follows a first-order RC with τ ≈ 30 s.
//  Playing notes gently heats the circuit; silence lets it cool.

struct ThermalModel {
    /// Current deviation from nominal temperature [°C]
    temp_c: f32,
    /// Target temperature (driven by dissipated power, decays to 0)
    target_c: f32,
}

impl ThermalModel {
    const fn new() -> Self {
        Self { temp_c: 0.0, target_c: 0.0 }
    }

    /// Heat up slightly when a note is being produced.
    /// velocity in [0..1].
    #[inline]
    fn add_heat(&mut self, velocity: f32) {
        self.target_c = (self.target_c + velocity * 4.0).min(MAX_TEMP_DEV_C);
    }

    /// Advance thermal state by one sample.
    #[inline]
    fn tick(&mut self, sample_rate: f32) {
        // τ_thermal ≈ 30 s → α = 1/(τ·fs)
        let alpha = 1.0 / (30.0 * sample_rate);
        self.temp_c += (self.target_c - self.temp_c) * alpha;
        // Ambient cooling also pulls target back
        self.target_c *= 1.0 - alpha * 0.5;
    }

    /// Current thermal voltage [V].
    #[inline]
    fn vt(&self) -> f32 {
        K_OVER_Q * (T_NOMINAL_K + self.temp_c)
    }

    /// Frequency multiplier relative to nominal temperature.
    ///
    /// From the exponential V/Oct converter:
    ///   I ∝ exp(V_ctrl / Vₜ(T))
    /// So when Vₜ rises (warmer), the oscillator runs flat:
    ///   freq_factor ≈ VT_NOMINAL / Vₜ(T)
    #[inline]
    fn freq_factor(&self) -> f32 {
        VT_NOMINAL / self.vt()
    }
}

// ── Component Tolerances ─────────────────────────────────────────────
//
//  Real components are never exactly their nominal value.
//  These are sampled once at construction from a deterministic LCG
//  seeded by the voice index — giving each voice a unique identity.

struct ComponentTolerances {
    /// Capacitance relative deviation (nominal ±5 %)
    #[allow(dead_code)]
    cap: f32,
    /// Current source relative deviation (nominal ±3 %)
    #[allow(dead_code)]
    current: f32,
    /// Comparator threshold offset (nominal ±1 %)
    threshold: f32,
    /// Effective frequency factor = current / cap
    /// (the cap charges more slowly if C is bigger, and vice-versa)
    freq_offset: f32,
}

impl ComponentTolerances {
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

// ── Waveform Selection ───────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitWaveform {
    Sawtooth,
    Square,
    Triangle,
    Sine,
    Noise,
}

// ── CircuitOscillator ────────────────────────────────────────────────

pub struct CircuitOscillator {
    // ── Capacitor core state ──────────────────────────────────
    /// Capacitor voltage, normalised [0 .. 1].
    v_cap: f32,
    /// Discharge glitch amplitude — brief spike at reset point.
    /// Decays with a fast RC: τ ≈ 3 µs (discharge transistor).
    reset_glitch: f32,

    // ── Control inputs ────────────────────────────────────────
    frequency: f32,
    waveform: CircuitWaveform,
    /// Square / PWM: duty cycle [0.05 .. 0.95].
    pulse_width: f32,
    /// External PWM modulation (added to pulse_width per sample).
    pwm_mod: f32,

    // ── Hard sync ─────────────────────────────────────────────
    sync_enabled: bool,
    sync_master_phase: f32,
    sync_master_freq: f32,

    // ── Sub-oscillator ────────────────────────────────────────
    sub_phase: f32,
    sub_level: f32,
    sub_octave: u8,   // 1 = -1 octave, 2 = -2 octaves
    sub_square: bool, // false = sine, true = square

    // ── Thermal / tolerance models ────────────────────────────
    thermal: ThermalModel,
    tolerances: ComponentTolerances,

    // ── Residual drift (random walk on pitch) ─────────────────
    drift_rng: u32,
    drift_walk: f32,
    /// Drift strength [0 .. 1].  0.3 = subtle; 1.0 = heavy vintage wander.
    drift_amount: f32,

    // ── Output stage ─────────────────────────────────────────
    /// One-pole LP on output (smooths the output buffer bandwidth).
    out_lp: f32,
    /// Output buffer bandwidth / tone control. 1.0 = full, 0.0 = darker vintage rolloff.
    brightness: f32,
    /// Power-rail / transistor-noise amplitude jitter.
    vintage_amount: f32,
    vintage_rng: u32,
    /// Triangle integrator state.
    integrator: f32,

    // ── Noise LFSR ────────────────────────────────────────────
    noise_state: u32,

    // ── PolyBLEP residual (carry-over from previous sample) ───
    blep_carry: f32,
}

impl CircuitOscillator {
    /// Create a new oscillator with unique component tolerances seeded by `voice_index`.
    pub fn new(voice_index: u32) -> Self {
        // Mix voice_index into a decent seed
        let seed = voice_index
            .wrapping_mul(2_654_435_769)
            .wrapping_add(0x9E37_79B9);

        Self {
            v_cap: 0.0,
            reset_glitch: 0.0,

            frequency: 440.0,
            waveform: CircuitWaveform::Sawtooth,
            pulse_width: 0.5,
            pwm_mod: 0.0,

            sync_enabled: false,
            sync_master_phase: 0.0,
            sync_master_freq: 440.0,

            sub_phase: 0.0,
            sub_level: 0.0,
            sub_octave: 1,
            sub_square: false,

            thermal: ThermalModel::new(),
            tolerances: ComponentTolerances::from_seed(seed),

            drift_rng: seed ^ 0xACE1_DE97,
            drift_walk: 0.0,
            drift_amount: 0.25,

            out_lp: 0.0,
            brightness: 1.0,
            vintage_amount: 0.0,
            vintage_rng: seed ^ 0xBEEF_CAFE,
            integrator: 0.0,
            noise_state: seed ^ 0xDEAD_BEEF,
            blep_carry: 0.0,
        }
    }

    // ── PolyBLEP ─────────────────────────────────────────────────
    //
    // Degree-2 polynomial correction applied around discontinuities
    // in band-limited sawtooth and square waves.
    // This is equivalent to integrating a bandlimited impulse — it
    // removes aliasing at the waveform edges without a brick-wall filter.

    #[inline]
    fn poly_blep(t: f32, dt: f32) -> f32 {
        if t < dt {
            // Just after the discontinuity
            let x = t / dt;
            x + x - x * x - 1.0
        } else if t > 1.0 - dt {
            // Just before the next period's discontinuity
            let x = (t - 1.0) / dt;
            x * x + x + x + 1.0
        } else {
            0.0
        }
    }

    // ── Drift random walk ─────────────────────────────────────────
    //
    // Each sample, the pitch offset takes a tiny random step.
    // A soft clamping + slow decay prevents it from running away.
    // At drift_amount=1.0: ≈ ±8 cents of wander (vintage Minimoog).

    #[inline]
    fn advance_drift(&mut self) -> f32 {
        if self.drift_amount < 1e-4 {
            return 1.0;
        }
        self.drift_rng = self.drift_rng
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        let r = ((self.drift_rng >> 9) as f32 / 8_388_608.0) - 1.0;
        // Step size: amount=1.0 → ~±8 cents over time
        self.drift_walk += r * self.drift_amount * 4e-5;
        // Restoring force — prevents unbounded wander
        self.drift_walk *= 0.9997;
        self.drift_walk = self.drift_walk.clamp(-0.06, 0.06);
        // Convert to frequency multiplier: 2^(semitones/12)
        // For small offsets: approx 1 + offset * ln(2)
        1.0 + self.drift_walk * core::f32::consts::LN_2
    }

    // ── Threshold noise ───────────────────────────────────────────
    //
    // The comparator threshold has tiny noise (~0.5 mV on a 10 V swing).
    // This modulates reset timing, producing micro-jitter in the period.

    #[inline]
    fn comparator_threshold_noise(&mut self) -> f32 {
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
        if self.sub_phase >= 1.0 { self.sub_phase -= 1.0; }
        let sub = if self.sub_square {
            let mut sq = if self.sub_phase < 0.5 { 1.0f32 } else { -1.0f32 };
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

// ── OscillatorEngine Implementation ─────────────────────────────────

impl OscillatorEngine for CircuitOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        // ┌─────────────────────────────────────────────────────────
        // │ 1.  Compute effective frequency
        // │     Three physical effects combine multiplicatively:
        // │       a) thermal voltage drift of exponential converter
        // │       b) component tolerances (cap / current source ratio)
        // │       c) slow random walk (comparator noise, supply ripple)
        // └─────────────────────────────────────────────────────────
        self.thermal.tick(sample_rate);
        // Gently heat the circuit at this velocity (always-on for running VCO)
        self.thermal.add_heat(0.02);

        let thermal_mult  = self.thermal.freq_factor();
        let drift_mult    = self.advance_drift();
        let tol_mult      = self.tolerances.freq_offset;

        let effective_freq = self.frequency * thermal_mult * drift_mult * tol_mult;
        // dt = fractional phase increment per sample
        let dt = (effective_freq / sample_rate).clamp(1e-6, 0.499);

        // ┌─────────────────────────────────────────────────────────
        // │ 2.  Hard sync (master/slave)
        // └─────────────────────────────────────────────────────────
        if self.sync_enabled {
            let master_dt = (self.sync_master_freq / sample_rate).clamp(1e-6, 0.499);
            self.sync_master_phase += master_dt;
            if self.sync_master_phase >= 1.0 {
                self.sync_master_phase -= 1.0;
                // Force capacitor reset on master wrap
                self.v_cap = 0.0;
                self.integrator = 0.0;
                self.reset_glitch = 0.0;
            }
        }

        // ┌─────────────────────────────────────────────────────────
        // │ 3.  Advance capacitor voltage (integration)
        // │     V_cap += I_charge / (C · fs) = dt · tolerance_correction
        // │     The comparator threshold has a tiny noise component.
        // └─────────────────────────────────────────────────────────
        let threshold_noise = self.comparator_threshold_noise();
        let threshold = (1.0 + self.tolerances.threshold * 1e-3 + threshold_noise)
            .clamp(0.98, 1.02);

        let v_prev = self.v_cap;
        self.v_cap += dt;

        // ┌─────────────────────────────────────────────────────────
        // │ 4.  Comparator fires → discharge transistor → glitch
        // │
        // │     The discharge transistor has finite slew: τ ≈ 3 µs.
        // │     At 48 kHz (dt_time = 20.8 µs) the cap fully discharges
        // │     within one sample, but the exponential shape produces a
        // │     brief positive spike that is characteristic of real VCOs.
        // └─────────────────────────────────────────────────────────
        let mut did_wrap = false;

        if self.v_cap >= threshold {
            did_wrap = true;
            // Fractional time from sample start to threshold crossing
            // t_cross = (threshold - v_prev) / dt  (in [0..1] samples)
            let t_remaining = (self.v_cap - threshold) / dt;
            let wrap_frac = 1.0 - t_remaining.clamp(0.0, 1.0);

            // The glitch amplitude ≈ cap voltage at the moment of discharge
            // (before reset).  Models the transient from the BJT turning on.
            self.reset_glitch = v_prev + dt * wrap_frac;

            // Reset: wrap back (like phase accumulator modulo 1)
            self.v_cap -= threshold;
            self.integrator = 0.0; // reset triangle integrator at hard reset
        }

        // Discharge glitch decays with RC ≈ 3 µs
        // At 48 kHz: exp(-Δt/τ) = exp(-20.8e-6 / 3e-6) ≈ exp(-6.9) ≈ 0.001
        // So it essentially vanishes in one sample — which is correct.
        // We keep it alive across samples for oversampling compatibility.
        let glitch_decay = expf(-1.0 / (3e-6 * sample_rate));
        self.reset_glitch *= glitch_decay;

        let phase = self.v_cap;

        // ┌─────────────────────────────────────────────────────────
        // │ 5.  Generate waveform from capacitor state
        // └─────────────────────────────────────────────────────────
        let main_sample = match self.waveform {
            CircuitWaveform::Sawtooth => {
                // Capacitor output: V_out = (V_cap / V_thresh) · 2 - 1  → [-1, 1]
                let mut s = phase * 2.0 - 1.0 + self.blep_carry;
                self.blep_carry = 0.0;
                if did_wrap {
                    // PolyBLEP removes the ideal-Heaviside spectral alias
                    let correction = Self::poly_blep(phase, dt);
                    s -= correction * 2.0;
                    // The reset glitch: brief positive spike right at the edge
                    s += self.reset_glitch * 0.08;
                }
                s
            }

            CircuitWaveform::Square => {
                let pw = (self.pulse_width + self.pwm_mod).clamp(0.05, 0.95);
                let mut s = if phase < pw { 1.0f32 } else { -1.0f32 };
                // Rising edge at 0
                s += Self::poly_blep(phase, dt);
                // Falling edge at pw
                let edge2 = if phase >= pw { phase - pw } else { phase + 1.0 - pw };
                s -= Self::poly_blep(edge2, dt);
                s
            }

            CircuitWaveform::Triangle => {
                // Leaky integration of bandlimited square
                let sq = if phase < 0.5 { 1.0f32 } else { -1.0f32 };
                self.integrator += sq * dt * 4.0;
                // Leak prevents DC bias from accumulating
                self.integrator *= 1.0 - dt * 0.4;
                (self.integrator * 1.5).clamp(-1.0, 1.0)
            }

            CircuitWaveform::Sine => {
                sinf(phase * core::f32::consts::TAU)
            }

            CircuitWaveform::Noise => {
                self.noise_state = self.noise_state
                    .wrapping_mul(1_664_525)
                    .wrapping_add(1_013_904_223);
                ((self.noise_state >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0
            }
        };

        // ┌─────────────────────────────────────────────────────────
        // │ 6.  Sub-oscillator
        // └─────────────────────────────────────────────────────────
        let sub = self.process_sub(dt);

        // ┌─────────────────────────────────────────────────────────
        // │ 7.  Output buffer: soft saturation
        // │
        // │     The output op-amp in real VCO chips (CEM3340 etc.)
        // │     has a ±12 V supply and clips at ≈ ±10 V.
        // │     Normalised to ±1, this is a very mild tanh at 1.05×.
        // └─────────────────────────────────────────────────────────
        let combined = main_sample + sub;
        // 1.05 drive into tanh gives ~1 % THD at 0 dBFS — subtle but present
        let mut saturated = soft_clip(combined * 1.05) * 0.952;

        if self.vintage_amount > 1e-4 {
            self.vintage_rng = self.vintage_rng
                .wrapping_mul(1_664_525)
                .wrapping_add(1_013_904_223);
            let jitter = ((self.vintage_rng >> 16) as f32 / 65_536.0 - 0.5)
                * 0.012 * self.vintage_amount;
            saturated *= 1.0 + jitter;
        }

        // ┌─────────────────────────────────────────────────────────
        // │ 8.  Output LP (CEM3340 output buffer bandwidth ~40 kHz)
        // │
        // │     The output capacitor and op-amp rolloff limits HF
        // │     content — a key part of the CEM3340 analog tone.
        // └─────────────────────────────────────────────────────────
        let lp_cutoff = 8_000.0 + 32_000.0 * self.brightness;
        let lp_alpha = 1.0 - expf(-core::f32::consts::TAU * lp_cutoff / sample_rate);
        self.out_lp += lp_alpha * (saturated - self.out_lp);
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
                    0 => CircuitWaveform::Sine,
                    1 => CircuitWaveform::Triangle,
                    2 => CircuitWaveform::Sawtooth,
                    3 => CircuitWaveform::Square,
                    _ => CircuitWaveform::Noise,
                };
            }
            "pulse_width" => self.pulse_width = value.clamp(0.05, 0.95),
            "pwm_mod"     => self.pwm_mod = value.clamp(-0.45, 0.45),
            "drift"       => self.drift_amount = value.clamp(0.0, 1.0),
            "vintage"     => self.vintage_amount = value.clamp(0.0, 1.0),
            "brightness"  => self.brightness = value.clamp(0.0, 1.0),
            "sub_level"   => self.sub_level = value.clamp(0.0, 1.0),
            "sub_mode"    => match value as u8 {
                0 => { self.sub_octave = 0; self.sub_square = false; }
                1 => { self.sub_octave = 1; self.sub_square = false; }
                2 => { self.sub_octave = 1; self.sub_square = true; }
                3 => { self.sub_octave = 2; self.sub_square = false; }
                _ => { self.sub_octave = 0; self.sub_square = false; }
            },
            "sub_octave"  => { self.sub_octave = (value as u8).clamp(0, 2); self.sub_square = true; },
            "sync"        => self.sync_enabled = value > 0.5,
            "sync_freq"   => self.sync_master_freq = value.max(0.1),
            _ => {}
        }
    }

    fn reset(&mut self) {
        self.v_cap = 0.0;
        self.reset_glitch = 0.0;
        self.integrator = 0.0;
        self.out_lp = 0.0;
        self.blep_carry = 0.0;
        self.sync_master_phase = 0.0;
        self.sub_phase = 0.0;
    }

    fn name(&self) -> &'static str {
        "CircuitVCO"
    }
}

// ════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thermal_model_drifts_in_right_direction() {
        let mut t = ThermalModel::new();
        let initial_vt = t.vt();
        let initial_factor = t.freq_factor();
        // Heat it up
        for _ in 0..50_000 {
            t.add_heat(1.0);
            t.tick(48_000.0);
        }
        // A warmer circuit should have higher thermal voltage than its initial state.
        assert!(t.vt() > initial_vt);
        // And the frequency factor should therefore drop (oscillator runs flat).
        assert!(t.freq_factor() < initial_factor);
    }

    #[test]
    fn component_tolerances_are_bounded() {
        for seed in 0..32u32 {
            let t = ComponentTolerances::from_seed(seed);
            // Cap within ±5 %
            assert!(t.cap >= 0.95 && t.cap <= 1.05,
                "cap={} for seed {}", t.cap, seed);
            // Current within ±3 %
            assert!(t.current >= 0.97 && t.current <= 1.03,
                "current={} for seed {}", t.current, seed);
        }
    }

    #[test]
    fn two_voices_have_different_tolerances() {
        let v0 = ComponentTolerances::from_seed(0);
        let v1 = ComponentTolerances::from_seed(1);
        // The probability that both land on the same value is negligible
        let different = (v0.freq_offset - v1.freq_offset).abs() > 1e-6;
        assert!(different, "Voices should have distinct tolerances");
    }

    #[test]
    fn oscillator_produces_output_without_panic() {
        let mut osc = CircuitOscillator::new(0);
        osc.set_frequency(440.0);
        for _ in 0..4096 {
            let s = osc.process(48_000.0);
            assert!(s.is_finite(), "Oscillator produced non-finite sample");
            assert!(s.abs() <= 1.05, "Sample exceeds ±1.05: {}", s);
        }
    }

    #[test]
    fn different_voices_differ_at_same_pitch() {
        let mut osc0 = CircuitOscillator::new(0);
        let mut osc1 = CircuitOscillator::new(3);
        osc0.set_frequency(220.0);
        osc1.set_frequency(220.0);

        let mut diff_count = 0usize;
        for _ in 0..1024 {
            let a = osc0.process(48_000.0);
            let b = osc1.process(48_000.0);
            if (a - b).abs() > 1e-4 { diff_count += 1; }
        }
        assert!(diff_count > 100,
            "Voices with different seeds should produce meaningfully different output");
    }

    #[test]
    fn square_wave_is_bipolar() {
        let mut osc = CircuitOscillator::new(0);
        osc.set_frequency(100.0);
        osc.set_param("waveform", 3.0); // Square
        let mut min = 1.0f32;
        let mut max = -1.0f32;
        for _ in 0..4800 {
            let s = osc.process(48_000.0);
            min = min.min(s);
            max = max.max(s);
        }
        assert!(max > 0.5, "Square max={}", max);
        assert!(min < -0.5, "Square min={}", min);
    }
}
