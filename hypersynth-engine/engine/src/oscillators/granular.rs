use libm::{cosf, expf, floorf, fabsf, sqrtf};
use crate::oscillators::OscillatorEngine;

const TAU: f32 = core::f32::consts::TAU;
const MAX_GRAINS: usize = 64;

/// Internal single-cycle source buffer used as the grain source.
/// Following Arturia Pigments' approach: granular reads from a wavetable
/// buffer rather than requiring external sample loading.
const SOURCE_LEN: usize = 2048;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GrainEnvelope {
    Hann = 0,
    Gaussian = 1,
    Triangle = 2,
    Trapezoid = 3,
    Rectangular = 4,
}

impl GrainEnvelope {
    pub fn from_index(i: u8) -> Self {
        match i {
            1 => Self::Gaussian,
            2 => Self::Triangle,
            3 => Self::Trapezoid,
            4 => Self::Rectangular,
            _ => Self::Hann,
        }
    }

    fn window(self, age: f32) -> f32 {
        match self {
            Self::Hann => 0.5 * (1.0 - cosf(age * TAU)),
            Self::Gaussian => expf(-18.0 * (age - 0.5) * (age - 0.5)),
            Self::Triangle => 1.0 - fabsf(age * 2.0 - 1.0),
            Self::Trapezoid => {
                let rise = (age * 5.0).min(1.0);
                let fall = ((1.0 - age) * 5.0).min(1.0);
                rise.min(fall)
            }
            Self::Rectangular => 1.0,
        }
    }
}

#[derive(Clone, Copy)]
struct Grain {
    active: bool,
    position: f32,
    phase_increment: f32,
    age: f32,
    age_increment: f32,
    pan: f32,
}

impl Default for Grain {
    fn default() -> Self {
        Self {
            active: false,
            position: 0.0,
            phase_increment: 1.0,
            age: 0.0,
            age_increment: 0.01,
            pan: 0.0,
        }
    }
}

pub struct GranularOscillator {
    grains: [Grain; MAX_GRAINS],
    source: [f32; SOURCE_LEN],
    frequency: f32,
    grain_size_ms: f32,
    density: f32,
    position: f32,
    spray: f32,
    pitch_random: f32,
    envelope_type: GrainEnvelope,
    spawn_timer: f32,
    random_state: u32,
    sample_rate_cached: f32,
}

impl GranularOscillator {
    pub fn new() -> Self {
        let mut osc = Self {
            grains: [Grain::default(); MAX_GRAINS],
            source: [0.0; SOURCE_LEN],
            frequency: 440.0,
            grain_size_ms: 80.0,
            density: 40.0,
            position: 0.5,
            spray: 0.0,
            pitch_random: 0.0,
            envelope_type: GrainEnvelope::Hann,
            spawn_timer: 0.0,
            random_state: 12345,
            sample_rate_cached: 48000.0,
        };
        osc.generate_source_saw();
        osc
    }

    /// Fill the internal source with a band-limited sawtooth
    fn generate_source_saw(&mut self) {
        for i in 0..SOURCE_LEN {
            let phase = i as f32 / SOURCE_LEN as f32;
            // Simple saw: -1..+1
            self.source[i] = phase * 2.0 - 1.0;
        }
    }

    /// Fast pseudo-random number [0..1)
    fn next_random(&mut self) -> f32 {
        self.random_state = self.random_state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.random_state >> 8) as f32 / 16777216.0
    }

    fn spawn_grain(&mut self) {
        // Find an inactive grain slot index
        let slot_idx = match self.grains.iter().position(|g| !g.active) {
            Some(idx) => idx,
            None => return,
        };

        let spray_offset = (self.next_random() - 0.5) * self.spray;
        let start_pos = (self.position + spray_offset).clamp(0.0, 1.0) * SOURCE_LEN as f32;

        let pitch_rand = 1.0 + (self.next_random() - 0.5) * self.pitch_random * 0.2;
        let phase_inc = (self.frequency / 440.0) * pitch_rand;

        let grain_samples = (self.grain_size_ms * self.sample_rate_cached / 1000.0).max(4.0);

        let pan = (self.next_random() - 0.5) * 0.5;

        let slot = &mut self.grains[slot_idx];
        slot.active = true;
        slot.position = start_pos;
        slot.phase_increment = phase_inc;
        slot.age = 0.0;
        slot.age_increment = 1.0 / grain_samples;
        slot.pan = pan;
    }

}

impl OscillatorEngine for GranularOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        self.sample_rate_cached = sample_rate;

        // Spawn new grains based on density
        let spawn_interval = if self.density > 0.01 {
            sample_rate / self.density
        } else {
            sample_rate * 10.0
        };

        self.spawn_timer -= 1.0;
        if self.spawn_timer <= 0.0 {
            self.spawn_grain();
            self.spawn_timer = spawn_interval;
        }

        // Process active grains
        let mut output = 0.0;
        let mut active_count = 0u32;
        let source = &self.source;
        let envelope_type = self.envelope_type;

        for grain in self.grains.iter_mut() {
            if !grain.active {
                continue;
            }

            let window = envelope_type.window(grain.age);
            // Inline read_source to avoid borrow conflict
            let len = SOURCE_LEN as f32;
            let p = grain.position - floorf(grain.position / len) * len;
            let idx = p as usize;
            let frac = p - idx as f32;
            let i0 = idx % SOURCE_LEN;
            let i1 = (idx + 1) % SOURCE_LEN;
            let sample = source[i0] * (1.0 - frac) + source[i1] * frac;

            output += sample * window;
            active_count += 1;

            // Advance grain
            grain.position += grain.phase_increment;
            grain.age += grain.age_increment;

            if grain.age >= 1.0 {
                grain.active = false;
            }
        }

        // Normalize by active grain count to prevent amplitude explosion
        if active_count > 1 {
            output /= sqrtf(active_count as f32);
        }

        output
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq;
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "grain_size" => self.grain_size_ms = value.clamp(10.0, 500.0),
            "density" => self.density = value.clamp(0.5, 100.0),
            "position" => self.position = value.clamp(0.0, 1.0),
            "spray" => self.spray = value.clamp(0.0, 1.0),
            "pitch_random" => self.pitch_random = value.clamp(0.0, 1.0),
            "window" => self.envelope_type = GrainEnvelope::from_index(value as u8),
            _ => {}
        }
    }

    fn reset(&mut self) {
        for grain in self.grains.iter_mut() {
            grain.active = false;
        }
        self.spawn_timer = 0.0;
    }

    fn name(&self) -> &'static str {
        "Granular"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    #[test]
    fn granular_produces_bounded_output() {
        let mut osc = GranularOscillator::new();
        osc.set_frequency(440.0);
        osc.set_param("position", 0.25);
        osc.set_param("density", 80.0);
        osc.set_param("grain_size", 60.0);

        let mut peak = 0.0f32;
        for _ in 0..8192 {
            let sample = osc.process(SR);
            assert!(!sample.is_nan(), "granular sample should not be NaN");
            assert!(!sample.is_infinite(), "granular sample should not be infinite");
            peak = peak.max(sample.abs());
        }

        assert!(peak > 0.001, "granular oscillator should produce audible output, peak={peak}");
        assert!(peak <= 4.0, "granular output should stay bounded, peak={peak}");
    }

    #[test]
    fn granular_params_are_clamped_and_routed() {
        let mut osc = GranularOscillator::new();
        osc.set_param("grain_size", 999.0);
        osc.set_param("density", 999.0);
        osc.set_param("position", -1.0);
        osc.set_param("spray", 2.0);
        osc.set_param("pitch_random", 2.0);
        osc.set_param("window", 4.0);

        assert_eq!(osc.grain_size_ms, 500.0);
        assert_eq!(osc.density, 100.0);
        assert_eq!(osc.position, 0.0);
        assert_eq!(osc.spray, 1.0);
        assert_eq!(osc.pitch_random, 1.0);
        assert_eq!(osc.envelope_type, GrainEnvelope::Rectangular);
    }

    #[test]
    fn grain_windows_are_distinct() {
        assert!(GrainEnvelope::Hann.window(0.0) < 0.01);
        assert!(GrainEnvelope::Gaussian.window(0.5) > 0.99);
        assert!(GrainEnvelope::Triangle.window(0.5) > 0.99);
        assert!(GrainEnvelope::Trapezoid.window(0.5) > 0.99);
        assert_eq!(GrainEnvelope::Rectangular.window(0.0), 1.0);
        assert_eq!(GrainEnvelope::Rectangular.window(0.5), 1.0);
    }

    #[test]
    fn reset_deactivates_grains() {
        let mut osc = GranularOscillator::new();
        osc.set_param("density", 100.0);
        for _ in 0..2048 {
            let _ = osc.process(SR);
        }
        assert!(osc.grains.iter().any(|grain| grain.active));
        osc.reset();
        assert!(osc.grains.iter().all(|grain| !grain.active));
    }
}
