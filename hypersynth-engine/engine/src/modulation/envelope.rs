use libm::expf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvelopeStage {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Debug, Clone)]
pub struct AdsrEnvelope {
    stage: EnvelopeStage,
    level: f32,
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    sample_rate: f32,
    release_level: f32,
}

impl Default for AdsrEnvelope {
    fn default() -> Self {
        Self {
            stage: EnvelopeStage::Idle,
            level: 0.0,
            attack: 0.01,
            decay: 0.12,
            sustain: 0.8,
            release: 0.2,
            sample_rate: 48_000.0,
            release_level: 0.0,
        }
    }
}

impl AdsrEnvelope {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            ..Self::default()
        }
    }

    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(1.0);
    }

    pub fn set_attack(&mut self, attack: f32) {
        self.attack = attack.clamp(0.001, 10.0);
    }

    pub fn set_decay(&mut self, decay: f32) {
        self.decay = decay.clamp(0.001, 10.0);
    }

    pub fn set_sustain(&mut self, sustain: f32) {
        self.sustain = sustain.clamp(0.0, 1.0);
    }

    pub fn set_release(&mut self, release: f32) {
        self.release = release.clamp(0.001, 30.0);
    }

    fn coefficient(time_secs: f32, sample_rate: f32) -> f32 {
        expf(-1.0 / (time_secs.max(0.001) * sample_rate.max(1.0)))
    }

    pub fn note_on(&mut self) {
        self.stage = EnvelopeStage::Attack;
    }

    pub fn note_off(&mut self) {
        self.release_level = self.level;
        self.stage = EnvelopeStage::Release;
    }

    pub fn process(&mut self) -> f32 {
        match self.stage {
            EnvelopeStage::Idle => {
                self.level = 0.0;
            }
            EnvelopeStage::Attack => {
                let coeff = Self::coefficient(self.attack, self.sample_rate);
                self.level += (1.0 - self.level) * (1.0 - coeff);
                if self.level >= 0.999 {
                    self.level = 1.0;
                    self.stage = EnvelopeStage::Decay;
                }
            }
            EnvelopeStage::Decay => {
                let coeff = Self::coefficient(self.decay, self.sample_rate);
                self.level += (self.sustain - self.level) * (1.0 - coeff);
                if (self.level - self.sustain).abs() <= 0.001 {
                    self.level = self.sustain;
                    self.stage = EnvelopeStage::Sustain;
                }
            }
            EnvelopeStage::Sustain => {
                self.level = self.sustain;
            }
            EnvelopeStage::Release => {
                let coeff = Self::coefficient(self.release, self.sample_rate);
                self.level += (0.0 - self.level) * (1.0 - coeff);
                if self.level <= 0.0005 || self.release_level <= 0.0005 {
                    self.level = 0.0;
                    self.stage = EnvelopeStage::Idle;
                }
                self.release_level = self.level;
            }
        }

        self.level.clamp(0.0, 1.0)
    }

    pub fn is_active(&self) -> bool {
        self.stage != EnvelopeStage::Idle
    }

    pub fn stage(&self) -> EnvelopeStage {
        self.stage
    }

    pub fn level(&self) -> f32 {
        self.level
    }
}
