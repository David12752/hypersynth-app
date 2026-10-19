use libm::{floorf, sinf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LfoWaveform {
    Sine,
    Triangle,
    Sawtooth,
    Square,
    SampleAndHold,
}

#[derive(Debug, Clone)]
pub struct Lfo {
    phase: f32,
    rate: f32,
    waveform: LfoWaveform,
    amount: f32,
    current_random: f32,
    last_phase: f32,
    random_state: u32,
}

impl Default for Lfo {
    fn default() -> Self {
        Self::with_seed(0xCAFE_BABE)
    }
}

impl Lfo {
    fn wrap_unit(value: f32) -> f32 {
        value - floorf(value)
    }

    pub fn with_seed(seed: u32) -> Self {
        let seed_phase = (seed % 360) as f32 / 360.0;
        Self {
            phase: Self::wrap_unit(seed_phase),
            rate: 1.0,
            waveform: LfoWaveform::Sine,
            amount: 1.0,
            current_random: 0.0,
            last_phase: 0.0,
            random_state: seed,
        }
    }

    pub fn set_rate(&mut self, rate: f32) {
        self.rate = rate.clamp(0.01, 20.0);
    }

    pub fn set_amount(&mut self, amount: f32) {
        self.amount = amount.clamp(0.0, 1.0);
    }

    pub fn set_waveform(&mut self, waveform: LfoWaveform) {
        self.waveform = waveform;
    }

    fn next_random(&mut self) -> f32 {
        self.random_state = self
            .random_state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        ((self.random_state >> 8) as f32 / 16_777_216.0) * 2.0 - 1.0
    }

    pub fn process(&mut self, sample_rate: f32) -> f32 {
        self.phase += self.rate / sample_rate.max(1.0);
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        if self.phase < self.last_phase {
            self.current_random = self.next_random();
        }
        self.last_phase = self.phase;

        let value = match self.waveform {
            LfoWaveform::Sine => sinf(self.phase * core::f32::consts::TAU),
            LfoWaveform::Triangle => 1.0 - 4.0 * (self.phase - 0.5).abs(),
            LfoWaveform::Sawtooth => self.phase * 2.0 - 1.0,
            LfoWaveform::Square => {
                if self.phase < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            LfoWaveform::SampleAndHold => self.current_random,
        };

        (value * self.amount).clamp(-1.0, 1.0)
    }
}
