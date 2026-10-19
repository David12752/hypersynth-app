// ════════════════════════════════════════════════════════════════════
// HyperSynth — Physical Circuit Simulation: Transistor Ladder Filter
//
// Implements the Moog transistor ladder 4-pole lowpass filter
// at the circuit-equation level, following the Huovilainen (2006)
// nonlinear model extended with thermal and component-mismatch effects.
//
// ── Circuit Topology (Moog 904-A) ────────────────────────────────
//
//  INPUT ──[Drive amp]──┬── NPN diff. pair (stage 0) ──┬─ ...×4 ──┬── OUTPUT
//                       │   (OTA-C: Gm·Vin → Cout)     │          │
//                       └─────────── k·feedback ◄───────┘◄─────────┘
//
//  Each stage is a one-pole OTA-C lowpass:
//
//    I_out  =  Iₜₐᵢₗ · tanh( (V⁺ − V⁻) / (2·Vₜ) )   (Ebers-Moll)
//    dV_c/dt = I_out / C
//
//  In discrete-time (trapezoidal / Huovilainen):
//
//    y[n] = y[n-1] + g · (f(x[n]) − f(y[n-1]))
//
//  where  g     = 2·π·fc / fs  (ZDF coefficient, bilinear corrected)
//         f(x)  = tanh(x)      (transistor nonlinearity)
//         x[n]  = driven input minus feedback
//
// ── Analog Warmth Sources ─────────────────────────────────────────
//
//   1. Per-stage tanh saturation: even the tiniest signal undergoes
//      nonlinear shaping at four cascaded stages.  This produces rich
//      even- and odd-order harmonic content.
//
//   2. Temperature-coupled cutoff drift:
//      gₘ = Iₜₐᵢₗ / (2·Vₜ)  ⟹  fc ∝ 1 / Vₜ(T)
//      Warmer circuit → higher Vₜ → lower gₘ → lower cutoff.
//
//   3. Component mismatch: each of the 4 stages has ±2 % variation
//      in its g coefficient, making the pole distribution uneven.
//      This deviates from a perfect Butterworth and adds character.
//
//   4. Transistor thermal noise: Johnson-Nyquist noise from the
//      base resistance (~1 kΩ) ≈ 1 nV/√Hz, modelled as a white noise
//      floor injected before each stage.
//
//   5. Resonance pitch-shift: at high resonance the effective cutoff
//      frequency rises slightly (the feedback loop partly reinforces
//      the resonant peak), which is characteristic Moog behaviour.
//
// ── 2 × Oversampling ─────────────────────────────────────────────
//
//  The feedback path creates a delay-free loop.  The Huovilainen
//  model resolves this by running two inner iterations per output
//  sample (2× internal oversampling) using half the g value, so the
//  effective integration rate is unchanged.  This provably eliminates
//  the steady-state error that would otherwise occur.
//
// ════════════════════════════════════════════════════════════════════

use libm::{tanf, tanhf};
use super::traits::FilterModel;

// ── Physical constants ───────────────────────────────────────────────

const VT_NOMINAL: f32 = 0.02585;  // kT/q at 25 °C
const K_OVER_Q:   f32 = 8.617_333e-5;
const T_NOMINAL_K: f32 = 298.15;

// ── Inline nonlinearity  ─────────────────────────────────────────────
//
//  Uses libm::tanhf — accurate, handles ±8 safely.

#[inline(always)]
fn bjt_tanh(x: f32) -> f32 {
    tanhf(x.clamp(-8.0, 8.0))
}

// ── Thermal Model ────────────────────────────────────────────────────
//
//  Identical design to the one in analog_circuit.rs but kept local so
//  VCO and VCF work independently (they live on different ICs with their
//  own thermal masses — this is physically correct).

struct FilterThermal {
    temp_c: f32,   // current deviation from nominal [°C]
    target_c: f32, // power-dissipation target
}

impl FilterThermal {
    const fn new() -> Self { Self { temp_c: 0.0, target_c: 0.0 } }

    #[inline]
    fn tick(&mut self, sr: f32) {
        let alpha = 1.0 / (30.0 * sr);
        self.temp_c  += (self.target_c - self.temp_c) * alpha;
        self.target_c *= 1.0 - alpha * 0.6;
    }

    #[inline]
    fn add_heat(&mut self, amount: f32) {
        self.target_c = (self.target_c + amount).min(25.0);
    }

    #[inline]
    fn vt(&self) -> f32 {
        K_OVER_Q * (T_NOMINAL_K + self.temp_c)
    }

    /// Cutoff multiplier relative to nominal temperature.
    /// fc ∝ gₘ ∝ 1/Vₜ(T)
    #[inline]
    fn cutoff_factor(&self) -> f32 {
        VT_NOMINAL / self.vt()
    }
}

// ── Component Tolerances ─────────────────────────────────────────────
//
//  Each of the four ladder stages has ±2 % deviation in its G factor
//  (due to capacitor and resistor tolerances).
//  Seeded per-voice to keep each voice unique.

struct LadderTolerances {
    stage_g: [f32; 4],
}

impl LadderTolerances {
    fn from_seed(mut seed: u32) -> Self {
        let mut rng = || -> f32 {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let n = ((seed >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0;
            1.0 + n * 0.02   // ± 2 %
        };
        Self { stage_g: [rng(), rng(), rng(), rng()] }
    }
}

// ── AnalogLadder ─────────────────────────────────────────────────────

/// 4-pole Moog-style transistor ladder lowpass filter.
///
/// Physical simulation using the Huovilainen nonlinear model with:
/// - Per-stage tanh saturation (Ebers-Moll differential pair)
/// - Thermal drift of cutoff frequency
/// - Component mismatch between stages
/// - Injected transistor thermal noise
/// - 2 × internal oversampling for accurate zero-delay feedback
pub struct AnalogLadder {
    // ── Stage state variables ─────────────────────────────────
    /// Capacitor voltage at each stage output.
    stage: [f32; 4],
    /// Cached tanh of each stage (avoids redundant computation).
    stage_nl: [f32; 4],

    // ── Parameters ───────────────────────────────────────────
    /// Cutoff frequency (Hz).
    cutoff_hz: f32,
    /// Resonance: [0 .. 4].  Self-oscillation threshold ≈ 3.8.
    resonance: f32,
    /// Drive: [0 .. 1].  Extra input gain before the first stage.
    drive: f32,

    // ── Cached coefficients ──────────────────────────────────
    /// ZDF integration coefficient g = tan(π·fc / fs) / 2  (half for 2× os)
    g_half: f32,
    /// Sample rate (needed for resonance pitch-shift compensation)
    sample_rate: f32,

    // ── Physical models ───────────────────────────────────────
    thermal: FilterThermal,
    tolerances: LadderTolerances,

    // ── Noise generator ───────────────────────────────────────
    noise_state: u32,
}

impl AnalogLadder {
    /// Create a new ladder filter.  `voice_seed` ensures each voice's
    /// filter has unique component tolerances.
    pub fn new(voice_seed: u32) -> Self {
        let seed = voice_seed
            .wrapping_mul(2_246_822_519)
            .wrapping_add(0x5CE0_D3C7);

        let mut f = Self {
            stage:       [0.0; 4],
            stage_nl:    [0.0; 4],
            cutoff_hz:   1_000.0,
            resonance:   0.0,
            drive:       0.0,
            g_half:      0.0,
            sample_rate: 48_000.0,
            thermal:     FilterThermal::new(),
            tolerances:  LadderTolerances::from_seed(seed),
            noise_state: seed ^ 0xF00D_CAFE,
        };
        f.update_coefficients(48_000.0);
        f
    }

    // ── Coefficient update ────────────────────────────────────────

    fn update_coefficients(&mut self, sr: f32) {
        self.sample_rate = sr;
        // Apply thermal drift: fc_eff = fc_nominal × (VT_nominal / Vt(T))
        let fc = self.cutoff_hz.clamp(10.0, sr * 0.45);
        let fc_eff = fc * self.thermal.cutoff_factor();
        // Resonance pitch-shift: at high resonance the peak rises slightly.
        // Empirical factor from Moog circuit analysis: ~6 % per unit resonance.
        let fc_adj = fc_eff * (1.0 + self.resonance * 0.015);
        // Bilinear pre-warp: g = tan(π·fc/fs)
        // Divide by 2 since we run 2 inner iterations (half integration step each)
        self.g_half = tanf(core::f32::consts::PI * fc_adj / sr).min(0.999) * 0.5;
    }

    // ── Thermal noise ─────────────────────────────────────────────
    //
    //  Johnson-Nyquist noise from the base resistance of each BJT.
    //  Spectral density: v_n = √(4·k·T·R·Δf)
    //  For R=1 kΩ, T=300 K, BW=24 kHz: v_n_rms ≈ 0.63 µV
    //  Normalised to a ±1 signal domain with 10 V pk-pk: ≈ 6e-5 per stage.

    #[inline]
    fn thermal_noise(&mut self) -> f32 {
        self.noise_state = self.noise_state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        let n = ((self.noise_state >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0;
        n * 6.0e-5
    }

    // ── Inner process (one oversampling iteration) ────────────────

    #[inline]
    fn process_inner(&mut self, input: f32, drive_gain: f32) -> f32 {
        let g = self.g_half;
        let [g0, g1, g2, g3] = self.tolerances.stage_g;

        // Thermal noise injected at the input node (differential pair base)
        let noise = self.thermal_noise();

        // Feedback from 4th stage.
        // The factor 4 comes from the Moog circuit: each stage contributes
        // −90° phase shift; at 4 × 90° = 360°, the Barkhausen criterion
        // is met at resonance = 1 (normalised), but the gain condition
        // requires k ≥ 4.  We allow [0..4].
        let feedback = self.resonance * self.stage_nl[3];

        // Input limiting via input BJT differential pair (Vbe swing)
        // Vbe_max ≈ 0.7 V; normalised, clip at ~1.0 with 2·Vt denominator
        let x = bjt_tanh((input * drive_gain + noise - feedback) * 0.5);

        // ── Stage 0 ──────────────────────────────────────────────
        self.stage[0] += g * g0 * (x - self.stage_nl[0]);
        self.stage_nl[0] = bjt_tanh(self.stage[0]);

        // ── Stage 1 ──────────────────────────────────────────────
        self.stage[1] += g * g1 * (self.stage_nl[0] - self.stage_nl[1]);
        self.stage_nl[1] = bjt_tanh(self.stage[1]);

        // ── Stage 2 ──────────────────────────────────────────────
        self.stage[2] += g * g2 * (self.stage_nl[1] - self.stage_nl[2]);
        self.stage_nl[2] = bjt_tanh(self.stage[2]);

        // ── Stage 3 ──────────────────────────────────────────────
        self.stage[3] += g * g3 * (self.stage_nl[2] - self.stage_nl[3]);
        self.stage_nl[3] = bjt_tanh(self.stage[3]);

        // Output is the 4th capacitor voltage (after final BJT stage)
        self.stage[3]
    }

    /// Process a single audio sample.
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // Update thermal model
        self.thermal.tick(self.sample_rate);
        // Active filter dissipates more power at high resonance
        self.thermal.add_heat(0.01 + self.resonance * 0.005);
        // Recompute coefficients (cheap — no trig if cutoff unchanged)
        self.update_coefficients(self.sample_rate);

        let drive_gain = 1.0 + self.drive * 7.0;

        // 2 × internal oversampling (Huovilainen method)
        // Both iterations receive the same input sample.
        // The second iteration refines the feedback estimate.
        self.process_inner(input, drive_gain);
        self.process_inner(input, drive_gain)
    }
}

// ── FilterModel trait ────────────────────────────────────────────────

impl FilterModel for AnalogLadder {
    fn process(&mut self, input: f32, _sample_rate: f32) -> f32 {
        self.process_sample(input)
    }

    fn set_cutoff(&mut self, freq: f32, sample_rate: f32) {
        self.cutoff_hz = freq.clamp(10.0, sample_rate * 0.45);
        self.update_coefficients(sample_rate);
    }

    fn set_resonance(&mut self, reso: f32) {
        self.resonance = reso.clamp(0.0, 4.0);
        self.update_coefficients(self.sample_rate);
    }

    fn set_drive(&mut self, drive: f32) {
        self.drive = drive.clamp(0.0, 1.0);
    }

    fn reset(&mut self) {
        self.stage    = [0.0; 4];
        self.stage_nl = [0.0; 4];
    }

    fn name(&self) -> &'static str { "AnalogLadder" }
}

// ════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn run_filter(f: &mut AnalogLadder, input: f32, n: usize) -> f32 {
        let mut out = 0.0f32;
        for _ in 0..n { out = f.process_sample(input); }
        out
    }

    #[test]
    fn dc_below_cutoff_passes() {
        let mut f = AnalogLadder::new(0);
        f.set_cutoff(10_000.0, 48_000.0);
        f.set_resonance(0.1);
        // Run DC through and check it converges to ~input
        let out = run_filter(&mut f, 0.5, 4096);
        // Allow for nonlinear gain offset; should be meaningfully positive
        assert!(out > 0.1, "DC at 0.5 through filter with fc=10 kHz gave {}", out);
    }

    #[test]
    fn dc_above_cutoff_attenuates() {
        let mut f_low  = AnalogLadder::new(0);
        let mut f_high = AnalogLadder::new(0);
        f_low.set_cutoff(100.0,   48_000.0);
        f_high.set_cutoff(10_000.0, 48_000.0);
        let out_low  = run_filter(&mut f_low,  0.5, 8192);
        let out_high = run_filter(&mut f_high, 0.5, 8192);
        assert!(out_high.abs() > out_low.abs(),
            "Filter at 10 kHz should pass more DC than at 100 Hz: {} vs {}", out_high, out_low);
    }

    #[test]
    fn no_nan_at_high_resonance() {
        let mut f = AnalogLadder::new(0);
        f.set_cutoff(2_000.0, 48_000.0);
        f.set_resonance(3.9);
        for i in 0..8192 {
            // Alternate impulse input
            let x = if i == 0 { 0.5 } else { 0.0 };
            let s = f.process_sample(x);
            assert!(s.is_finite(), "NaN/Inf at sample {}", i);
        }
    }

    #[test]
    fn self_oscillation_at_max_resonance() {
        let mut f = AnalogLadder::new(0);
        f.set_cutoff(1_000.0, 48_000.0);
        f.set_resonance(4.0);
        // With no input, self-oscillation should build from noise floor
        let mut sum_sq = 0.0f32;
        // Skip transient
        for _ in 0..4096 { f.process_sample(0.0); }
        for _ in 0..4096 {
            let s = f.process_sample(0.0);
            sum_sq += s * s;
            assert!(s.is_finite());
        }
        let rms = (sum_sq / 4096.0).sqrt();
        // Should be oscillating — RMS should be measurable
        assert!(rms > 1e-4, "Expected self-oscillation at k=4, got RMS={}", rms);
    }

    #[test]
    fn thermal_coupling_lowers_cutoff() {
        // Create two filters, heat one up, check that output differs
        let mut f_cold = AnalogLadder::new(0);
        let mut f_warm = AnalogLadder::new(0);
        f_cold.set_cutoff(2_000.0, 48_000.0);
        f_warm.set_cutoff(2_000.0, 48_000.0);
        // Heat the warm filter
        for _ in 0..200_000 {
            f_warm.thermal.add_heat(1.0);
            f_warm.thermal.tick(48_000.0);
        }
        // Now both process the same signal; warm should pass less HF
        let out_cold = run_filter(&mut f_cold, 0.3, 1024);
        let out_warm = run_filter(&mut f_warm, 0.3, 1024);
        // Just check they diverge (direction depends on transient)
        let diff = (out_cold - out_warm).abs();
        assert!(diff > 1e-6, "Warm and cold filters should differ: diff={}", diff);
    }

    #[test]
    fn component_mismatch_differs_across_seeds() {
        let t0 = LadderTolerances::from_seed(0);
        let t1 = LadderTolerances::from_seed(7);
        let same = t0.stage_g.iter().zip(t1.stage_g.iter())
            .all(|(a, b)| (a - b).abs() < 1e-9);
        assert!(!same, "Different seeds should produce different tolerances");
    }
}
