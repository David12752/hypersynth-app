/// One-pole lowpass parameter smoother.
///
/// Eliminates zipper noise when knobs change value mid-block.
/// Industry standard: 5 ms smoothing time at the given sample rate.
use libm::expf;

#[derive(Debug, Clone)]
pub struct SmoothedParam {
    current: f32,
    target: f32,
    /// Per-sample coefficient: exp(-1 / (smoothing_ms * 0.001 * sample_rate))
    coefficient: f32,
}

impl SmoothedParam {
    pub fn new(initial: f32, smoothing_ms: f32, sample_rate: f32) -> Self {
        Self {
            current: initial,
            target: initial,
            coefficient: Self::calc_coeff(smoothing_ms, sample_rate),
        }
    }

    fn calc_coeff(smoothing_ms: f32, sample_rate: f32) -> f32 {
        let time_secs = (smoothing_ms * 0.001).max(0.0001);
        expf(-1.0 / (time_secs * sample_rate.max(1.0)))
    }

    /// Set the target value — smoothing glides current toward it.
    #[inline]
    pub fn set(&mut self, value: f32) {
        self.target = value;
    }

    /// Advance one sample and return the smoothed value.
    #[inline]
    pub fn next(&mut self) -> f32 {
        self.current = self.target + (self.current - self.target) * self.coefficient;
        self.current
    }

    /// Instantly snap to value (no glide — use on init or preset load).
    #[inline]
    pub fn snap(&mut self, value: f32) {
        self.current = value;
        self.target = value;
    }

    #[inline]
    pub fn current(&self) -> f32 {
        self.current
    }

    #[inline]
    pub fn target(&self) -> f32 {
        self.target
    }

    /// Returns true when the param has settled (within epsilon of target).
    #[inline]
    pub fn is_settled(&self) -> bool {
        (self.current - self.target).abs() < 1e-5
    }

    pub fn set_sample_rate(&mut self, smoothing_ms: f32, sample_rate: f32) {
        self.coefficient = Self::calc_coeff(smoothing_ms, sample_rate);
    }
}
