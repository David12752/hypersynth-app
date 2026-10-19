/// Growl and flutter tonguing articulation processors.
///
/// These are real-time performance articulations for jazz, fusion, and world
/// music wind playing. They respond to assignable MIDI CCs.
///
/// # Amendment 8 — Gain Compensation
/// Both processors include a `gain_compensation` value in `ArticulationOutput`
/// so that extreme modulation depths don't destabilize the output level.
use libm::{sinf, tanhf};
use core::f32::consts::PI;

// ============================================================================
// ArticulationOutput
// ============================================================================

/// Combined output from `GrowlProcessor::process()` and `FlutterProcessor::process()`.
#[derive(Debug, Clone, Copy)]
pub struct ArticulationOutput {
    /// Multiply with voice amplitude (1.0 = neutral, 0.0 = silent).
    pub amplitude_mod: f32,
    /// Add to pitch in semitones (0.0 = neutral).
    pub pitch_mod: f32,
    /// Add to filter cutoff (normalized 0–1, 0.0 = neutral).
    pub filter_mod: f32,
    /// Gain compensation to maintain perceived loudness.
    /// See Amendment 8 spec: `1.0 / (1.0 + depth * 0.3)`.
    pub gain_compensation: f32,
}

impl Default for ArticulationOutput {
    fn default() -> Self {
        Self {
            amplitude_mod: 1.0,
            pitch_mod: 0.0,
            filter_mod: 0.0,
            gain_compensation: 1.0,
        }
    }
}

// ============================================================================
// XorShift PRNG (deterministic, no_std, no_heap)
// ============================================================================

/// 32-bit xorshift PRNG — used for growl noise component.
///
/// Deterministic: identical seed ⇒ identical output sequence.
#[derive(Debug, Clone, Copy)]
struct Xorshift32 {
    state: u32,
}

impl Xorshift32 {
    fn new(seed: u32) -> Self {
        // Seed must never be zero.
        Self { state: if seed == 0 { 0xDEAD_BEEF } else { seed } }
    }

    #[inline]
    fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }

    /// Returns a value in −1.0..+1.0.
    #[inline]
    fn next_f32(&mut self) -> f32 {
        let u = self.next_u32();
        (u as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

// ============================================================================
// GrowlProcessor
// ============================================================================

/// Growl articulation — simulates vocal-cord vibration on the breath.
///
/// Combines a periodic sine LFO with a sample-and-hold noise oscillator,
/// mixed via the `chaos` parameter (0 = pure LFO / 1 = pure noise).
#[derive(Debug, Clone, Copy)]
pub struct GrowlProcessor {
    lfo_phase: f32,
    /// Current sample-and-hold noise value.
    noise_value: f32,
    /// Counter for how many samples until the next noise hold.
    noise_counter: f32,
    prng: Xorshift32,
    /// Mix: 0.0 = pure LFO (regular), 1.0 = pure noise (raspy).
    pub chaos: f32,
    /// Modulation frequency in Hz (15–50 Hz).
    pub frequency: f32,
    /// Depth controlled by the assignable CC (0.0–1.0).
    pub depth: f32,
    sample_rate: f32,
}

impl GrowlProcessor {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            lfo_phase: 0.0,
            noise_value: 0.0,
            noise_counter: 0.0,
            prng: Xorshift32::new(0x1234_5678),
            chaos: 0.4,
            frequency: 28.0,
            depth: 0.0,
            sample_rate,
        }
    }

    /// Advance one sample and return the articulation modulation.
    #[inline]
    pub fn process(&mut self) -> ArticulationOutput {
        if self.depth < 1e-4 {
            return ArticulationOutput::default();
        }

        // LFO component.
        let phase_inc = self.frequency / self.sample_rate;
        self.lfo_phase = (self.lfo_phase + phase_inc) % 1.0;
        let lfo = sinf(self.lfo_phase * 2.0 * PI);

        // Sample-and-hold noise component.
        let hold_period = self.sample_rate / self.frequency.max(1.0);
        self.noise_counter += 1.0;
        if self.noise_counter >= hold_period {
            self.noise_counter -= hold_period;
            self.noise_value = self.prng.next_f32();
        }

        let modulation = lfo * (1.0 - self.chaos) + self.noise_value * self.chaos;
        let d = self.depth;

        ArticulationOutput {
            amplitude_mod: 1.0 + modulation * d,
            pitch_mod: modulation * d * 0.15,
            filter_mod: 0.0,
            gain_compensation: 1.0 / (1.0 + d * 0.3),
        }
    }
}

// ============================================================================
// FlutterProcessor
// ============================================================================

/// Flutter tonguing — rapid re-articulation of the breath.
///
/// Produces a smoothed square-wave (tanh-shaped) that pulses the amplitude
/// at the configured frequency. The filter opens when the amplitude dips
/// (inverse modulation) for extra brightness during the flutter dip.
#[derive(Debug, Clone, Copy)]
pub struct FlutterProcessor {
    phase: f32,
    /// Flutter frequency in Hz (10–35 Hz).
    pub frequency: f32,
    /// Depth 0.0–1.0 (from assignable CC).
    pub depth: f32,
    sample_rate: f32,
}

impl FlutterProcessor {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            phase: 0.0,
            frequency: 18.0,
            depth: 0.0,
            sample_rate,
        }
    }

    /// Advance one sample and return articulation modulation.
    #[inline]
    pub fn process(&mut self) -> ArticulationOutput {
        if self.depth < 1e-4 {
            return ArticulationOutput::default();
        }

        let phase_inc = self.frequency / self.sample_rate;
        self.phase = (self.phase + phase_inc) % 1.0;

        // tanh-shaped smoothed square wave.
        // The `10.0` controls sharpness — higher = harder edge.
        let raw_square = sinf(self.phase * 2.0 * PI);
        let smooth_square = tanhf(raw_square * 10.0) * 0.5 + 0.5; // remap to [0, 1]

        let d = self.depth;
        let amp_mod = 1.0 - smooth_square * d;   // amplitude pulses toward 0
        let filt_mod = smooth_square * d * 0.2;   // filter opens on amplitude dip

        ArticulationOutput {
            amplitude_mod: amp_mod.max(0.0),
            pitch_mod: 0.0,
            filter_mod: filt_mod,
            gain_compensation: 1.0 / (1.0 + d * 0.3),
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

    // ---- Xorshift -----------------------------------------------------------

    /// Same seed must produce identical output (determinism test).
    #[test]
    fn xorshift_deterministic() {
        let mut a = Xorshift32::new(0xABCD_EF01);
        let mut b = Xorshift32::new(0xABCD_EF01);
        for _ in 0..1_000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    /// Output must be in [-1, 1].
    #[test]
    fn xorshift_range() {
        let mut r = Xorshift32::new(42);
        for _ in 0..10_000 {
            let v = r.next_f32();
            assert!((-1.0..=1.0).contains(&v), "out of range: {v}");
        }
    }

    // ---- GrowlProcessor ----------------------------------------------------

    /// With depth=0 all outputs should be neutral (no modulation).
    #[test]
    fn growl_zero_depth_neutral() {
        let mut g = GrowlProcessor::new(SR);
        g.depth = 0.0;
        for _ in 0..100 {
            let out = g.process();
            assert!((out.amplitude_mod - 1.0).abs() < 1e-4);
            assert!(out.pitch_mod.abs() < 1e-4);
            assert_eq!(out.gain_compensation, 1.0);
        }
    }

    /// Growl with same initial state produces identical results (determinism).
    #[test]
    fn growl_deterministic() {
        let mut g1 = GrowlProcessor::new(SR);
        let mut g2 = GrowlProcessor::new(SR);
        g1.depth = 0.8;
        g2.depth = 0.8;
        for _ in 0..1_000 {
            let o1 = g1.process();
            let o2 = g2.process();
            assert!((o1.amplitude_mod - o2.amplitude_mod).abs() < 1e-6);
        }
    }

    /// Gain compensation must decrease with depth (louder setting → more reduction).
    #[test]
    fn growl_gain_compensation_decreases_with_depth() {
        let mut g = GrowlProcessor::new(SR);
        g.depth = 0.1;
        let low_comp = g.process().gain_compensation;
        g.depth = 0.9;
        let high_comp = g.process().gain_compensation;
        assert!(high_comp < low_comp, "Gain compensation should decrease at higher depth");
    }

    // ---- FlutterProcessor --------------------------------------------------

    /// With depth=0 all outputs should be neutral.
    #[test]
    fn flutter_zero_depth_neutral() {
        let mut f = FlutterProcessor::new(SR);
        f.depth = 0.0;
        let out = f.process();
        assert!((out.amplitude_mod - 1.0).abs() < 1e-4);
        assert!(out.filter_mod.abs() < 1e-4);
    }

    /// With non-zero depth, amplitude_mod must stay in [0, 1].
    #[test]
    fn flutter_amplitude_clipped() {
        let mut f = FlutterProcessor::new(SR);
        f.depth = 1.0;
        let period = (SR / f.frequency) as usize;
        for _ in 0..(3 * period) {
            let out = f.process();
            assert!(
                (0.0..=1.0).contains(&out.amplitude_mod),
                "Flutter amplitude_mod out of range: {}",
                out.amplitude_mod
            );
        }
    }

    /// Flutter pulse shape test: over one cycle there must be both a dip AND a peak.
    #[test]
    fn flutter_pulse_has_variation() {
        let mut f = FlutterProcessor::new(SR);
        f.depth = 1.0;
        let period = (SR / f.frequency) as usize;
        let mut min = f32::MAX;
        let mut max = f32::MIN;
        for _ in 0..period {
            let v = f.process().amplitude_mod;
            if v < min { min = v; }
            if v > max { max = v; }
        }
        assert!(max - min > 0.5, "Flutter should produce significant amplitude variation");
    }
}
