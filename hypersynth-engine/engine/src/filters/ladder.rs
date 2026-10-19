use libm::{tanf, tanhf};

use super::traits::FilterModel;

pub struct LadderFilter {
    stage: [f32; 4],
    stage_tanh: [f32; 4],
    cutoff: f32,
    resonance: f32,
    drive: f32,
    g: f32,
    k: f32,
    noise_state: u32,
}

impl Default for LadderFilter {
    fn default() -> Self {
        let mut filter = Self {
            stage: [0.0; 4],
            stage_tanh: [0.0; 4],
            cutoff: 1_000.0,
            resonance: 0.0,
            drive: 0.0,
            g: 0.0,
            k: 0.0,
            noise_state: 0x1234_5678,
        };
        filter.update_coefficients(48_000.0);
        filter
    }
}

impl LadderFilter {
    pub fn new() -> Self {
        Self::default()
    }

    fn update_coefficients(&mut self, sample_rate: f32) {
        let cutoff = self.cutoff.clamp(20.0, (sample_rate * 0.45).max(20.0));
        self.cutoff = cutoff;
        self.g = tanf(core::f32::consts::PI * cutoff / sample_rate).min(1.5);
        self.k = self.resonance.clamp(0.0, 4.0);
    }

    fn thermal_noise(&mut self) -> f32 {
        self.noise_state = self
            .noise_state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        let normalized = ((self.noise_state >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0;
        normalized * 2.0e-3
    }
}

impl FilterModel for LadderFilter {
    fn process(&mut self, input: f32, _sample_rate: f32) -> f32 {
        let drive = 1.0 + self.drive * 8.0;
        let driven_input = input * drive;
        let half_g = self.g * 0.5;
        let resonance_excitation = (self.k - 3.5).max(0.0) * 0.08;

        for _ in 0..2 {
            let excitation = driven_input + self.thermal_noise() + self.stage[3] * resonance_excitation;
            let feedback = self.k * self.stage_tanh[3] * (1.0 + self.g * 0.35);
            let x = tanhf(excitation - feedback);

            self.stage[0] += half_g * (x - self.stage_tanh[0]);
            self.stage_tanh[0] = tanhf(self.stage[0]);

            self.stage[1] += half_g * (self.stage_tanh[0] - self.stage_tanh[1]);
            self.stage_tanh[1] = tanhf(self.stage[1]);

            self.stage[2] += half_g * (self.stage_tanh[1] - self.stage_tanh[2]);
            self.stage_tanh[2] = tanhf(self.stage[2]);

            self.stage[3] += half_g * (self.stage_tanh[2] - self.stage_tanh[3]);
            self.stage_tanh[3] = tanhf(self.stage[3]);
        }

        self.stage[3].clamp(-1.2, 1.2)
    }

    fn set_cutoff(&mut self, freq: f32, sample_rate: f32) {
        self.cutoff = freq;
        self.update_coefficients(sample_rate);
    }

    fn set_resonance(&mut self, reso: f32) {
        self.resonance = reso.clamp(0.0, 4.0);
        self.k = self.resonance;
    }

    fn set_drive(&mut self, drive: f32) {
        self.drive = drive.clamp(0.0, 1.0);
    }

    fn reset(&mut self) {
        self.stage = [0.0; 4];
        self.stage_tanh = [0.0; 4];
    }

    fn name(&self) -> &'static str {
        "Ladder"
    }
}
