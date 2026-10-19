use crate::oscillators::OscillatorEngine;

const MAX_BUFFER: usize = 262144; // ~5.4 seconds @ 48kHz

/// Sample playback modes
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SamplePlayMode {
    OneShot = 0,
    Loop = 1,
    PingPong = 2,
    SustainLoop = 3,
}

impl SamplePlayMode {
    pub fn from_index(i: u8) -> Self {
        match i {
            0 => Self::OneShot,
            2 => Self::PingPong,
            3 => Self::SustainLoop,
            _ => Self::Loop,
        }
    }
}

pub struct SamplerOscillator {
    buffer: [f32; MAX_BUFFER],
    buffer_length: usize,
    position: f64,
    phase_increment: f64,
    loop_start: f32,
    loop_end: f32,
    mode: SamplePlayMode,
    direction: f64,
    pitch_offset: f32,
    root_note: u8,
    current_note: u8,
    playing: bool,
    released: bool,
}

impl SamplerOscillator {
    pub fn new() -> Self {
        let mut osc = Self {
            buffer: [0.0; MAX_BUFFER],
            buffer_length: 0,
            position: 0.0,
            phase_increment: 1.0,
            loop_start: 0.0,
            loop_end: 1.0,
            mode: SamplePlayMode::Loop,
            direction: 1.0,
            pitch_offset: 0.0,
            root_note: 60,
            current_note: 60,
            playing: false,
            released: false,
        };
        // Generate a default sample (single-cycle sawtooth at C3)
        osc.generate_default_sample();
        osc
    }

    /// Fill buffer with a simple waveform as placeholder until real sample loading
    fn generate_default_sample(&mut self) {
        // Generate a few cycles of sawtooth for default playback
        let cycles = 8;
        let cycle_len = 2048;
        let total = cycles * cycle_len;
        self.buffer_length = total.min(MAX_BUFFER);

        for i in 0..self.buffer_length {
            let phase = (i % cycle_len) as f32 / cycle_len as f32;
            self.buffer[i] = phase * 2.0 - 1.0;
        }
    }

    fn update_phase_increment(&mut self) {
        let semitone_offset = (self.current_note as f64 - self.root_note as f64) + self.pitch_offset as f64;
        self.phase_increment = libm::pow(2.0, semitone_offset / 12.0);
    }

    /// 4-point Hermite interpolation for clean pitch shifting
    fn hermite_interp(y0: f32, y1: f32, y2: f32, y3: f32, t: f32) -> f32 {
        let c0 = y1;
        let c1 = 0.5 * (y2 - y0);
        let c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
        let c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        ((c3 * t + c2) * t + c1) * t + c0
    }

    fn read_sample(&self, pos: f64) -> f32 {
        if self.buffer_length < 4 {
            return 0.0;
        }

        let len = self.buffer_length;
        let idx = pos as usize;
        let frac = (pos - idx as f64) as f32;

        let i0 = if idx == 0 { len - 1 } else { idx - 1 };
        let i1 = idx % len;
        let i2 = (idx + 1) % len;
        let i3 = (idx + 2) % len;

        Self::hermite_interp(
            self.buffer[i0],
            self.buffer[i1],
            self.buffer[i2],
            self.buffer[i3],
            frac,
        )
    }
}

impl OscillatorEngine for SamplerOscillator {
    fn process(&mut self, _sample_rate: f32) -> f32 {
        if !self.playing || self.buffer_length < 4 {
            return 0.0;
        }

        let output = self.read_sample(self.position);

        // Advance position
        self.position += self.phase_increment * self.direction;

        let len = self.buffer_length as f64;
        let loop_start = (self.loop_start as f64 * len).max(0.0);
        let loop_end = (self.loop_end as f64 * len).min(len - 1.0);

        match self.mode {
            SamplePlayMode::OneShot => {
                if self.position >= len || self.position < 0.0 {
                    self.playing = false;
                }
            }
            SamplePlayMode::Loop => {
                if self.position >= loop_end {
                    self.position = loop_start + (self.position - loop_end);
                }
                if self.position < loop_start {
                    self.position = loop_start;
                }
            }
            SamplePlayMode::PingPong => {
                if self.position >= loop_end {
                    self.position = loop_end - (self.position - loop_end);
                    self.direction = -1.0;
                }
                if self.position <= loop_start {
                    self.position = loop_start + (loop_start - self.position);
                    self.direction = 1.0;
                }
            }
            SamplePlayMode::SustainLoop => {
                if self.released {
                    // After release, play to end
                    if self.position >= len {
                        self.playing = false;
                    }
                } else {
                    // While held, loop
                    if self.position >= loop_end {
                        self.position = loop_start + (self.position - loop_end);
                    }
                }
            }
        }

        output
    }

    fn set_frequency(&mut self, _freq: f32) {
        // For sampler, frequency is derived from the MIDI note vs root_note
        // We just use this as a trigger signal: new frequency = new note
        self.playing = true;
        self.released = false;
        self.direction = 1.0;
        self.position = self.loop_start as f64 * self.buffer_length as f64;
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "mode" => self.mode = SamplePlayMode::from_index(value as u8),
            "start" => self.loop_start = value.clamp(0.0, 1.0),
            "end" => self.loop_end = value.clamp(0.0, 1.0),
            "pitch" => {
                self.pitch_offset = value.clamp(-24.0, 24.0);
                self.update_phase_increment();
            }
            "note" => {
                self.current_note = (value as u8).clamp(0, 127);
                self.update_phase_increment();
            }
            "release" => {
                self.released = true;
            }
            _ => {}
        }
    }

    fn reset(&mut self) {
        self.position = 0.0;
        self.direction = 1.0;
        self.playing = false;
        self.released = false;
    }

    fn name(&self) -> &'static str {
        "Sampler"
    }
}
