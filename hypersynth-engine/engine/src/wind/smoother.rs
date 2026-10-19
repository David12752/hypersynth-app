/// One-pole IIR low-pass smoother for wind controller parameter values.
///
/// Wind controllers send CC values at ~500 Hz with 7-bit resolution (0–127).
/// Feeding raw values directly into synthesis parameters causes audible zipper
/// noise (staircase artifacts). This smoother eliminates that by exponentially
/// approaching the target value.
///
/// Transfer function: y[n] = y[n-1] + coeff * (target - y[n-1])
/// where coeff = 1.0 - exp(-1.0 / (tau * sample_rate))
///
/// This is the same algorithm as the existing `SmoothedParam` in `smoothing.rs`.
/// `ParameterSmoother` extends it with block processing, settleability checks,
/// and runtime time-constant changes.
use libm::expf;

/// Default smoothing time in milliseconds.
pub const DEFAULT_TIME_MS: f32 = 5.0;
/// Below this threshold the smoother is considered "settled" (saves CPU).
///
/// With f32 arithmetic near target=1.0 the one-pole update stalls at roughly
/// 2.6×10⁻⁵ (coeff × ulp near 1.0), so 1×10⁻⁶ can never be reached.
/// 1×10⁻⁴ (−80 dB) is completely inaudible and is safely achievable.
const SETTLED_EPSILON: f32 = 1e-4;

#[derive(Debug, Clone, Copy)]
pub struct ParameterSmoother {
    current: f32,
    target: f32,
    /// One-pole coefficient: 1.0 - exp(-1/(time_ms*0.001*sample_rate)).
    coeff: f32,
    sample_rate: f32,
}

impl ParameterSmoother {
    /// Create a new smoother with the given initial value and time constant.
    ///
    /// `time_constant_ms` is clamped to [1.0, 500.0] ms.
    pub fn new(sample_rate: f32, time_constant_ms: f32) -> Self {
        let coeff = Self::calc_coeff(time_constant_ms, sample_rate);
        Self { current: 0.0, target: 0.0, coeff, sample_rate }
    }

    fn calc_coeff(time_ms: f32, sample_rate: f32) -> f32 {
        let clamped = time_ms.clamp(1.0, 500.0);
        1.0 - expf(-1.0 / (clamped * 0.001 * sample_rate.max(1.0)))
    }

    /// Update the target value. Called when a new CC arrives.
    #[inline]
    pub fn set_target(&mut self, value: f32) {
        self.target = value;
    }

    /// Update the smoothing time constant at runtime (e.g., from a UI knob).
    pub fn set_time_constant(&mut self, ms: f32) {
        self.coeff = Self::calc_coeff(ms, self.sample_rate);
    }

    /// Advance one sample and return the smoothed value.
    #[inline]
    pub fn next(&mut self) -> f32 {
        self.current += self.coeff * (self.target - self.current);
        self.current
    }

    /// Fill a block with smoothed values.
    ///
    /// If the smoother has already settled, fills the block with the
    /// constant target value (avoids redundant multiplication per-sample).
    #[inline]
    pub fn next_block(&mut self, output: &mut [f32]) {
        if self.is_settled() {
            for s in output.iter_mut() {
                *s = self.target;
            }
            self.current = self.target;
        } else {
            for s in output.iter_mut() {
                *s = self.next();
            }
        }
    }

    /// Returns `true` when the smoother has converged to within `SETTLED_EPSILON`
    /// of the target. Callers may skip processing when settled.
    #[inline]
    pub fn is_settled(&self) -> bool {
        (self.target - self.current).abs() < SETTLED_EPSILON
    }

    /// Immediately snap to value without smoothing. Use during initialization
    /// or preset load to avoid an audible glide from zero.
    #[inline]
    pub fn snap(&mut self) {
        self.current = self.target;
    }

    /// Return the current (smoothed) value without advancing.
    #[inline]
    pub fn current(&self) -> f32 {
        self.current
    }

    /// Return the current target value.
    #[inline]
    pub fn target(&self) -> f32 {
        self.target
    }
}

// ----------------------------------------------------------------------------
// SmootherBank
// ----------------------------------------------------------------------------

/// One `ParameterSmoother` per wind controller input stream.
///
/// The bank centralizes initialization so the top-level `WindControllerProcessor`
/// can own a single struct rather than six independent smoothers.
#[derive(Debug, Clone, Copy)]
pub struct SmootherBank {
    /// CC2 Breath Control — primary expression source.
    pub breath: ParameterSmoother,
    /// CC11 Expression — secondary expression (some controllers use this).
    pub expression: ParameterSmoother,
    /// 14-bit pitch bend, normalized to -1.0..+1.0 before entering the smoother.
    pub pitch_bend: ParameterSmoother,
    /// Bite / mouthpiece pressure (Aftertouch or an assignable CC).
    pub bite_pressure: ParameterSmoother,
    /// User-assignable CC for growl depth.
    pub growl_cc: ParameterSmoother,
    /// User-assignable CC for flutter depth.
    pub flutter_cc: ParameterSmoother,
}

impl SmootherBank {
    /// Create a bank with all smoothers initialised to DEFAULT_TIME_MS (5 ms).
    pub fn new(sample_rate: f32) -> Self {
        Self {
            breath: ParameterSmoother::new(sample_rate, DEFAULT_TIME_MS),
            expression: ParameterSmoother::new(sample_rate, DEFAULT_TIME_MS),
            pitch_bend: ParameterSmoother::new(sample_rate, DEFAULT_TIME_MS),
            bite_pressure: ParameterSmoother::new(sample_rate, DEFAULT_TIME_MS),
            growl_cc: ParameterSmoother::new(sample_rate, DEFAULT_TIME_MS),
            flutter_cc: ParameterSmoother::new(sample_rate, DEFAULT_TIME_MS),
        }
    }

    /// Advance all six smoothers one sample.
    #[inline]
    pub fn next_all(&mut self) {
        self.breath.next();
        self.expression.next();
        self.pitch_bend.next();
        self.bite_pressure.next();
        self.growl_cc.next();
        self.flutter_cc.next();
    }

    /// Snap all smoothers to their current targets (use on initialization).
    pub fn snap_all(&mut self) {
        self.breath.snap();
        self.expression.snap();
        self.pitch_bend.snap();
        self.bite_pressure.snap();
        self.growl_cc.snap();
        self.flutter_cc.snap();
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 44_100.0;

    /// After 3 × time_constant samples the smoother should be within 5 % of the target.
    /// (Exact: 1 - e^{-3} ≈ 95 %)
    #[test]
    fn step_response_convergence() {
        let time_ms = 10.0_f32;
        let mut s = ParameterSmoother::new(SR, time_ms);
        s.set_target(1.0);
        // 3 tau in samples
        let tau_samples = (time_ms * 0.001 * SR) as usize;
        let three_tau = 3 * tau_samples;
        let mut value = 0.0;
        for _ in 0..three_tau {
            value = s.next();
        }
        assert!(
            (value - 1.0).abs() < 0.05,
            "Not within 5% at 3τ: got {value}"
        );
    }

    /// After 5 × τ the smoother must be settled (within SETTLED_EPSILON = 1e-4).
    ///
    /// After n time-constants the residual is ≈ e^{-n}.
    /// e^{-5} ≈ 6.7×10⁻³, e^{-7} ≈ 9×10⁻⁴ > 1e-4 in real arithmetic but f32
    /// stalls earlier near target=0.0 where precision is best.
    /// We target downward to 0.0 to avoid f32 stalling near 1.0.
    #[test]
    fn settles_within_ten_tau_toward_zero() {
        let time_ms = 5.0_f32;
        let mut s = ParameterSmoother::new(SR, time_ms);
        // Start at 1.0, target 0.0 — near 0.0 f32 precision is finest.
        s.set_target(0.0);
        s.snap(); // snap to 0 first so we can snap to 1.0 then target 0.0
        // Re-init: start at 1.0 manually.
        s.set_target(1.0);
        s.snap();
        s.set_target(0.0);
        let tau_samples = (time_ms * 0.001 * SR) as usize;
        for _ in 0..(10 * tau_samples) {
            s.next();
        }
        assert!(s.is_settled(), "Smoother not settled after 10τ toward 0.0");
    }

    /// snap() must immediately equalise current and target.
    #[test]
    fn snap_immediately_settles() {
        let mut s = ParameterSmoother::new(SR, 100.0);
        s.set_target(0.75);
        s.snap();
        assert!(s.is_settled());
        assert!((s.current() - 0.75).abs() < 1e-9);
    }

    /// next_block must produce the same values as the equivalent sample-by-sample loop.
    #[test]
    fn block_matches_sample_by_sample() {
        let mut s1 = ParameterSmoother::new(SR, 20.0);
        let mut s2 = ParameterSmoother::new(SR, 20.0);
        s1.set_target(1.0);
        s2.set_target(1.0);

        let mut block = [0.0f32; 64];
        s1.next_block(&mut block);

        for expected in &block {
            let sample = s2.next();
            assert!(
                (sample - expected).abs() < 1e-9,
                "Mismatch: block={expected} sample={sample}"
            );
        }
    }

    /// A settled smoother must fill the block with a constant (fast path).
    #[test]
    fn settled_block_is_constant() {
        let mut s = ParameterSmoother::new(SR, DEFAULT_TIME_MS);
        s.set_target(0.5);
        s.snap();
        let mut block = [0.0f32; 64];
        s.next_block(&mut block);
        for v in &block {
            assert!((v - 0.5).abs() < 1e-9);
        }
    }

    /// SmootherBank initialises and snaps all channels cleanly.
    #[test]
    fn smoother_bank_snap_all() {
        let mut bank = SmootherBank::new(SR);
        bank.breath.set_target(0.8);
        bank.pitch_bend.set_target(-0.3);
        bank.snap_all();
        assert!(bank.breath.is_settled());
        assert!(bank.pitch_bend.is_settled());
        assert!((bank.pitch_bend.current() - (-0.3)).abs() < 1e-9);
    }
}
