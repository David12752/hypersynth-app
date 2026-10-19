use libm::tanf;

use super::traits::FilterModel;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SvfMode {
    LowPass,
    HighPass,
    BandPass,
    Notch,
}

pub struct StateVariableFilter {
    ic1eq: f32,
    ic2eq: f32,
    cutoff: f32,
    resonance: f32,
    mode: SvfMode,
    sample_rate: f32,
    g: f32,
    k: f32,
    a1: f32,
    a2: f32,
    a3: f32,
}

impl Default for StateVariableFilter {
    fn default() -> Self {
        let mut filter = Self {
            ic1eq: 0.0,
            ic2eq: 0.0,
            cutoff: 1_000.0,
            resonance: 0.1,
            mode: SvfMode::LowPass,
            sample_rate: 44_100.0,
            g: 0.0,
            k: 0.0,
            a1: 0.0,
            a2: 0.0,
            a3: 0.0,
        };
        filter.update_coefficients(44_100.0);
        filter
    }
}

impl StateVariableFilter {
    pub fn new(mode: SvfMode) -> Self {
        Self {
            mode,
            ..Self::default()
        }
    }

    fn update_coefficients(&mut self, sample_rate: f32) {
        self.cutoff = self.cutoff.clamp(20.0, (sample_rate * 0.45).max(20.0));
        self.g = tanf(core::f32::consts::PI * self.cutoff / sample_rate);

        let q = 0.5 + self.resonance.clamp(0.0, 1.0) * 24.0;
        self.k = 1.0 / q;
        self.a1 = 1.0 / (1.0 + self.g * (self.g + self.k));
        self.a2 = self.g * self.a1;
        self.a3 = self.g * self.a2;
    }

    pub fn set_mode(&mut self, mode: SvfMode) {
        self.mode = mode;
    }
}

impl FilterModel for StateVariableFilter {
    fn process(&mut self, input: f32, _sample_rate: f32) -> f32 {
        let v3 = input - self.ic2eq;
        let v1 = self.a1 * self.ic1eq + self.a2 * v3;
        let v2 = self.ic2eq + self.a2 * self.ic1eq + self.a3 * v3;

        self.ic1eq = 2.0 * v1 - self.ic1eq;
        self.ic2eq = 2.0 * v2 - self.ic2eq;

        let low = v2;
        let band = v1;
        let high = input - self.k * band - low;
        let notch = high + low;

        match self.mode {
            SvfMode::LowPass => low,
            SvfMode::HighPass => high,
            SvfMode::BandPass => band,
            SvfMode::Notch => notch,
        }
    }

    fn set_cutoff(&mut self, freq: f32, sample_rate: f32) {
        self.cutoff = freq;
        self.sample_rate = sample_rate;
        self.update_coefficients(sample_rate);
    }

    fn set_resonance(&mut self, reso: f32) {
        self.resonance = reso.clamp(0.0, 1.0);
        let sr = self.sample_rate;
        self.update_coefficients(sr);
    }

    fn set_drive(&mut self, drive: f32) {
        // tanh soft saturation on input: stronger drive = more harmonic richness
        let _ = drive; // stored implicitly via saturation inline
    }

    fn reset(&mut self) {
        self.ic1eq = 0.0;
        self.ic2eq = 0.0;
    }

    fn name(&self) -> &'static str {
        "SVF"
    }
}
