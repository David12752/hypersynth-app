// ──────────────────────────────────────────────────────────────────────
// HyperSynth — Wavetable Oscillator
//
// Professional multi-frame wavetable engine with:
//   • N frames × 2048 samples per frame
//   • Smooth frame crossfading (linear interpolation between adjacent frames)
//   • Mip-mapped anti-aliasing (band-limited tables per octave)
//   • Factory wavetables: Basic, PWM Sweep, Formant Sweep, Digital, Vocal
//   • Scan modes: position (manual), LFO, envelope, one-shot
//   • Frame morphing with adjustable smoothness
// ──────────────────────────────────────────────────────────────────────

use alloc::vec;
use alloc::vec::Vec;
use libm::{floorf, sinf, cosf, log2f};

use super::traits::OscillatorEngine;

/// Samples per single waveform frame
pub const FRAME_SIZE: usize = 2048;

/// Maximum number of mip-map levels (each halves the harmonic count)
const MAX_MIP_LEVELS: usize = 12;

// ── Scan Modes ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanMode {
    /// Manual: frame_position is set directly (0.0 – 1.0)
    Manual,
    /// One-shot: frame sweeps from 0→1 on note-on, then holds last frame
    OneShot,
}

// ── Factory Wavetable Presets ────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FactoryWavetable {
    Basic,         // Sine → Triangle → Saw → Square → Pulse (8 frames)
    PwmSweep,      // Square with pulse width sweep 0.5 → 0.05 (16 frames)
    FormantSweep,  // Formant-style vowels (8 frames)
    Digital,       // Additive digital timbres (8 frames)
    Vocal,         // Vocal formants A→E→I→O→U (5 frames)
}

// ── Mip-Mapped Frame ────────────────────────────────────────────────
//
// Each frame stores the original 2048-sample waveform plus band-limited
// versions with progressively fewer harmonics. When the oscillator
// frequency is high, we read from a lower-harmonic table to avoid
// aliasing — equivalent to what Serum/Vital do.

struct MipFrame {
    /// levels[0] = full bandwidth, levels[k] = max harmonic = FRAME_SIZE/2^(k+1)
    levels: Vec<Vec<f32>>,
    num_levels: usize,
}

impl MipFrame {
    /// Build mip chain from a single frame of FRAME_SIZE samples.
    ///
    /// Approach: Additive synthesis — compute the Fourier coefficients of
    /// the original waveform, then for each mip level, reconstruct using
    /// only harmonics ≤ max_harmonic.
    ///
    /// This is O(N² / level) per mip level but only runs at load time,
    /// not per sample, so it's perfectly fine for 2048-sample frames.
    fn from_samples(samples: &[f32]) -> Self {
        let n = samples.len();
        let half_n = n / 2;

        // ── DFT: compute cosine and sine coefficients ────────────
        let mut cos_coeffs = vec![0.0f32; half_n + 1];
        let mut sin_coeffs = vec![0.0f32; half_n + 1];

        for k in 0..=half_n {
            let mut re = 0.0f32;
            let mut im = 0.0f32;
            for (i, &s) in samples.iter().enumerate() {
                let angle = core::f32::consts::TAU * k as f32 * i as f32 / n as f32;
                re += s * cosf(angle);
                im -= s * sinf(angle);
            }
            cos_coeffs[k] = re * 2.0 / n as f32;
            sin_coeffs[k] = im * 2.0 / n as f32;
        }
        // DC term doesn't get the 2× factor
        cos_coeffs[0] *= 0.5;

        // ── Build mip levels ─────────────────────────────────────
        let mut levels = Vec::with_capacity(MAX_MIP_LEVELS);

        for level in 0..MAX_MIP_LEVELS {
            let max_harmonic = if level == 0 {
                half_n
            } else {
                half_n >> level
            };

            if max_harmonic == 0 {
                // Pure DC — just store zeros (or could store DC offset)
                break;
            }

            let mut table = vec![0.0f32; n];
            for (i, sample) in table.iter_mut().enumerate() {
                let phase = core::f32::consts::TAU * i as f32 / n as f32;
                let mut val = cos_coeffs[0]; // DC
                for k in 1..=max_harmonic {
                    let angle = phase * k as f32;
                    val += cos_coeffs[k] * cosf(angle) - sin_coeffs[k] * sinf(angle);
                }
                *sample = val;
            }
            levels.push(table);
        }

        let num_levels = levels.len();
        MipFrame { levels, num_levels }
    }

    /// Read from the appropriate mip level at the given phase,
    /// using linear interpolation between samples.
    #[inline]
    fn read(&self, phase: f32, dt: f32) -> f32 {
        // dt = freq / sample_rate. Higher dt → more aliasing risk → use higher mip level.
        // mip level ≈ log2(dt * FRAME_SIZE) but clamped.
        let ideal_level = if dt > 0.0 {
            let l = log2f(dt * FRAME_SIZE as f32);
            if l < 0.0 { 0.0 } else { l }
        } else {
            0.0
        };

        let level = (ideal_level as usize).min(self.num_levels.saturating_sub(1));

        let table = &self.levels[level];
        Self::lerp_table(table, phase)
    }

    #[inline]
    fn lerp_table(table: &[f32], phase: f32) -> f32 {
        let wrapped = phase - floorf(phase);
        let pos = wrapped * table.len() as f32;
        let idx = pos as usize;
        let frac = pos - idx as f32;
        let a = table[idx % table.len()];
        let b = table[(idx + 1) % table.len()];
        a + (b - a) * frac
    }
}

// ── Wavetable: collection of MipFrames ──────────────────────────────

pub struct Wavetable {
    frames: Vec<MipFrame>,
    pub num_frames: usize,
    pub name: &'static str,
}

impl Wavetable {
    pub fn from_frames(raw_frames: &[Vec<f32>], name: &'static str) -> Self {
        let frames: Vec<MipFrame> = raw_frames
            .iter()
            .map(|f| MipFrame::from_samples(f))
            .collect();
        let num_frames = frames.len();
        Wavetable { frames, num_frames, name }
    }

    /// Read with frame crossfading: frame_pos 0.0..1.0 interpolates
    /// smoothly between frames.
    #[inline]
    fn read(&self, phase: f32, dt: f32, frame_pos: f32) -> f32 {
        if self.num_frames == 0 {
            return 0.0;
        }
        if self.num_frames == 1 {
            return self.frames[0].read(phase, dt);
        }

        // Map 0..1 → 0..(num_frames - 1)
        let pos = frame_pos.clamp(0.0, 1.0) * (self.num_frames - 1) as f32;
        let idx = (pos as usize).min(self.num_frames - 2);
        let frac = pos - idx as f32;

        let a = self.frames[idx].read(phase, dt);
        let b = self.frames[idx + 1].read(phase, dt);
        a + (b - a) * frac
    }
}

// ── Factory Wavetable Generation ────────────────────────────────────

fn generate_factory(preset: FactoryWavetable) -> Wavetable {
    match preset {
        FactoryWavetable::Basic => generate_basic(),
        FactoryWavetable::PwmSweep => generate_pwm_sweep(),
        FactoryWavetable::FormantSweep => generate_formant_sweep(),
        FactoryWavetable::Digital => generate_digital(),
        FactoryWavetable::Vocal => generate_vocal(),
    }
}

fn generate_basic() -> Wavetable {
    // 8 frames: Sine → Triangle → Saw → Square → Narrow Pulse → back
    let mut raw = Vec::with_capacity(8);

    // Frame 0: Sine
    let mut f0 = vec![0.0f32; FRAME_SIZE];
    for (i, s) in f0.iter_mut().enumerate() {
        *s = sinf(core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32);
    }
    raw.push(f0);

    // Frame 1: Triangle (additive, odd harmonics, alternating sign, 1/k²)
    let mut f1 = vec![0.0f32; FRAME_SIZE];
    for (i, s) in f1.iter_mut().enumerate() {
        let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
        let mut val = 0.0f32;
        for h in 0..64 {
            let k = 2 * h + 1; // odd harmonics
            let sign = if h % 2 == 0 { 1.0 } else { -1.0 };
            val += sign / (k as f32 * k as f32) * sinf(phase * k as f32);
        }
        *s = val * (8.0 / (core::f32::consts::PI * core::f32::consts::PI));
    }
    raw.push(f1);

    // Frame 2: Sawtooth (additive, all harmonics, 1/k)
    let mut f2 = vec![0.0f32; FRAME_SIZE];
    for (i, s) in f2.iter_mut().enumerate() {
        let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
        let mut val = 0.0f32;
        for k in 1..128 {
            let sign = if k % 2 == 0 { 1.0 } else { -1.0 };
            val += sign / k as f32 * sinf(phase * k as f32);
        }
        *s = val * (2.0 / core::f32::consts::PI);
    }
    raw.push(f2);

    // Frame 3: Square (additive, odd harmonics, 1/k)
    let mut f3 = vec![0.0f32; FRAME_SIZE];
    for (i, s) in f3.iter_mut().enumerate() {
        let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
        let mut val = 0.0f32;
        for h in 0..64 {
            let k = 2 * h + 1;
            val += sinf(phase * k as f32) / k as f32;
        }
        *s = val * (4.0 / core::f32::consts::PI);
    }
    raw.push(f3);

    // Frame 4: Narrow pulse (PW ~= 0.1)
    let mut f4 = vec![0.0f32; FRAME_SIZE];
    let pw = 0.1;
    for (i, s) in f4.iter_mut().enumerate() {
        let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
        let mut val = 0.0f32;
        for k in 1..128 {
            val += cosf(phase * k as f32 * pw * core::f32::consts::PI)
                * sinf(phase * k as f32)
                / k as f32;
        }
        *s = val * 2.0;
    }
    raw.push(f4);

    // Frame 5: Super-saw-like (detuned saws summed)
    let mut f5 = vec![0.0f32; FRAME_SIZE];
    let detune_offsets: [f32; 5] = [-0.04, -0.015, 0.0, 0.015, 0.04];
    for (i, s) in f5.iter_mut().enumerate() {
        let base_phase = i as f32 / FRAME_SIZE as f32;
        let mut val = 0.0f32;
        for &dt_offset in &detune_offsets {
            let p = (base_phase * (1.0 + dt_offset)) % 1.0;
            val += p * 2.0 - 1.0;
        }
        *s = val / 5.0;
    }
    raw.push(f5);

    // Frame 6: Half-rectified sine
    let mut f6 = vec![0.0f32; FRAME_SIZE];
    for (i, s) in f6.iter_mut().enumerate() {
        let sine = sinf(core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32);
        *s = if sine > 0.0 { sine } else { 0.0 };
    }
    raw.push(f6);

    // Frame 7: Full-rectified sine
    let mut f7 = vec![0.0f32; FRAME_SIZE];
    for (i, s) in f7.iter_mut().enumerate() {
        let sine = sinf(core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32);
        *s = if sine < 0.0 { -sine } else { sine };
    }
    raw.push(f7);

    Wavetable::from_frames(&raw, "Basic")
}

fn generate_pwm_sweep() -> Wavetable {
    // 16 frames: pulse width from 0.5 (square) down to ~0.05 (narrow pulse)
    let num_frames = 16;
    let mut raw = Vec::with_capacity(num_frames);

    for frame_idx in 0..num_frames {
        let pw = 0.5 - (frame_idx as f32 / (num_frames - 1) as f32) * 0.45;
        let mut frame = vec![0.0f32; FRAME_SIZE];
        for (i, s) in frame.iter_mut().enumerate() {
            let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
            let mut val = 0.0f32;
            for k in 1..128 {
                val += sinf(k as f32 * pw * core::f32::consts::PI)
                    * sinf(phase * k as f32)
                    / k as f32;
            }
            *s = val * (2.0 / core::f32::consts::PI);
        }
        raw.push(frame);
    }

    Wavetable::from_frames(&raw, "PWM Sweep")
}

fn generate_formant_sweep() -> Wavetable {
    // 8 frames sweeping through formant-like spectra
    // Each frame emphasizes different frequency bands
    let num_frames = 8;
    let mut raw = Vec::with_capacity(num_frames);

    let center_freqs: [f32; 8] = [2.0, 4.0, 6.0, 10.0, 16.0, 24.0, 32.0, 48.0];
    let bandwidths: [f32; 8] = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 14.0];

    for frame_idx in 0..num_frames {
        let center = center_freqs[frame_idx];
        let bw = bandwidths[frame_idx];
        let mut frame = vec![0.0f32; FRAME_SIZE];

        for (i, s) in frame.iter_mut().enumerate() {
            let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
            let mut val = 0.0f32;
            for k in 1..128 {
                // Gaussian envelope around center harmonic
                let dist = (k as f32 - center) / bw;
                let amplitude = libm::expf(-0.5 * dist * dist);
                val += amplitude * sinf(phase * k as f32) / k as f32;
            }
            *s = val;
        }

        // Normalize
        let max_val = frame.iter().copied().fold(0.0f32, |a, b| {
            let ab = if b < 0.0 { -b } else { b };
            if ab > a { ab } else { a }
        });
        if max_val > 0.001 {
            for s in frame.iter_mut() {
                *s /= max_val;
            }
        }

        raw.push(frame);
    }

    Wavetable::from_frames(&raw, "Formant Sweep")
}

fn generate_digital() -> Wavetable {
    // 8 frames of digital/metallic timbres using additive with specific harmonic patterns
    let num_frames = 8;
    let mut raw = Vec::with_capacity(num_frames);

    for frame_idx in 0..num_frames {
        let mut frame = vec![0.0f32; FRAME_SIZE];

        for (i, s) in frame.iter_mut().enumerate() {
            let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
            let mut val = 0.0f32;

            let harmonic_count = 8 + frame_idx * 4;
            for k in 1..=harmonic_count {
                // Create interesting harmonic patterns per frame
                let amplitude = match frame_idx {
                    0 => 1.0 / k as f32, // Normal harmonic series
                    1 => {
                        // Only odd harmonics, equal amplitude
                        if k % 2 == 1 { 0.5 / (1.0 + k as f32 * 0.1) } else { 0.0 }
                    }
                    2 => {
                        // Every 3rd harmonic boosted
                        if k % 3 == 0 { 1.0 / k as f32 } else { 0.2 / k as f32 }
                    }
                    3 => {
                        // FM-like (strong higher partials)
                        let x = k as f32 / 8.0;
                        libm::expf(-x) * sinf(x * core::f32::consts::PI).max(0.0)
                    }
                    4 => {
                        // Inharmonic metallic
                        let ratio = k as f32 * 1.414; // √2 stretch
                        let r = ratio / 64.0;
                        libm::expf(-r * r)
                    }
                    5 => {
                        // Comb-like (notches at certain harmonics)
                        let comb = (sinf(k as f32 * 0.5) + 1.0) * 0.5;
                        comb / k as f32
                    }
                    6 => {
                        // Bright / trebly
                        (k as f32 * 0.3).min(1.0) / (1.0 + k as f32 * 0.2)
                    }
                    _ => {
                        // Ring-mod-like
                        let r = k as f32 / 16.0;
                        libm::fabsf(sinf(r * core::f32::consts::PI * 2.0)) / k as f32
                    }
                };

                val += amplitude * sinf(phase * k as f32);
            }
            *s = val;
        }

        // Normalize
        let max_val = frame.iter().copied().fold(0.0f32, |a, b| {
            let ab = if b < 0.0 { -b } else { b };
            if ab > a { ab } else { a }
        });
        if max_val > 0.001 {
            for s in frame.iter_mut() {
                *s /= max_val;
            }
        }

        raw.push(frame);
    }

    Wavetable::from_frames(&raw, "Digital")
}

fn generate_vocal() -> Wavetable {
    // 5 frames: vowels A → E → I → O → U
    // Each vowel approximated by 2-3 formant peaks
    let vowel_formants: [[(f32, f32); 3]; 5] = [
        // (harmonic_center, bandwidth) — A
        [(5.0, 2.0), (12.0, 3.0), (25.0, 5.0)],
        // E
        [(3.0, 1.5), (14.0, 2.5), (22.0, 4.0)],
        // I
        [(2.0, 1.0), (16.0, 2.0), (28.0, 3.0)],
        // O
        [(4.0, 2.0), (8.0, 3.0), (20.0, 5.0)],
        // U
        [(3.0, 1.5), (6.0, 2.5), (18.0, 5.0)],
    ];

    let mut raw = Vec::with_capacity(5);

    for formants in &vowel_formants {
        let mut frame = vec![0.0f32; FRAME_SIZE];

        for (i, s) in frame.iter_mut().enumerate() {
            let phase = core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32;
            let mut val = 0.0f32;

            for k in 1..128 {
                let mut amplitude = 0.0f32;
                for &(center, bw) in formants {
                    let dist = (k as f32 - center) / bw;
                    amplitude += libm::expf(-0.5 * dist * dist);
                }
                amplitude = amplitude.min(1.0);
                val += amplitude * sinf(phase * k as f32) / (1.0 + k as f32 * 0.05);
            }

            *s = val;
        }

        // Normalize
        let max_val = frame.iter().copied().fold(0.0f32, |a, b| {
            let ab = if b < 0.0 { -b } else { b };
            if ab > a { ab } else { a }
        });
        if max_val > 0.001 {
            for s in frame.iter_mut() {
                *s /= max_val;
            }
        }

        raw.push(frame);
    }

    Wavetable::from_frames(&raw, "Vocal")
}

// ── Main Wavetable Oscillator ────────────────────────────────────────

pub struct WavetableOscillator {
    phase: f32,
    frequency: f32,

    /// Active wavetable holding all frames + mip maps
    wavetable: Wavetable,
    /// Which factory preset is loaded
    active_preset: FactoryWavetable,

    /// Frame scan position (0.0 – 1.0)
    frame_position: f32,
    /// Frame morph smoothness — smooths frame_position changes (0.0 = instant, 1.0 = very smooth)
    morph_smooth: f32,
    smoothed_frame: f32,

    scan_mode: ScanMode,
    /// For one-shot mode: auto-advance rate (frames per second → mapped to delta per sample)
    oneshot_rate: f32,
    oneshot_phase: f32,
    oneshot_active: bool,
}

impl Default for WavetableOscillator {
    fn default() -> Self {
        let wavetable = generate_factory(FactoryWavetable::Basic);
        Self {
            phase: 0.0,
            frequency: 440.0,
            wavetable,
            active_preset: FactoryWavetable::Basic,
            frame_position: 0.0,
            morph_smooth: 0.5,
            smoothed_frame: 0.0,
            scan_mode: ScanMode::Manual,
            oneshot_rate: 0.5,  // 2 seconds to sweep all frames
            oneshot_phase: 0.0,
            oneshot_active: false,
        }
    }
}

impl WavetableOscillator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn wavetable_name(&self) -> &'static str {
        self.wavetable.name
    }

    pub fn source_frame_count(&self) -> usize {
        self.wavetable.num_frames
    }

    pub fn export_display_wavetable(&self, target_frames: usize) -> Vec<f32> {
        if target_frames == 0 || self.wavetable.num_frames == 0 {
            return Vec::new();
        }

        let mut output = Vec::with_capacity(target_frames * FRAME_SIZE);
        let max_source_index = self.wavetable.num_frames.saturating_sub(1);

        for frame_index in 0..target_frames {
            let normalized = if target_frames <= 1 {
                0.0
            } else {
                frame_index as f32 / (target_frames - 1) as f32
            };
            let source_position = normalized * max_source_index as f32;
            let left_index = floorf(source_position) as usize;
            let right_index = (left_index + 1).min(max_source_index);
            let blend = source_position - left_index as f32;

            let left = &self.wavetable.frames[left_index].levels[0];
            let right = &self.wavetable.frames[right_index].levels[0];

            for sample_index in 0..FRAME_SIZE {
                let a = left[sample_index];
                let b = right[sample_index];
                output.push(a + (b - a) * blend);
            }
        }

        output
    }

    /// Create with a specific factory preset
    pub fn with_preset(preset: FactoryWavetable) -> Self {
        let wavetable = generate_factory(preset);
        Self {
            wavetable,
            active_preset: preset,
            ..Self::default()
        }
    }

    /// Load a custom wavetable from raw sample data.
    /// `data` should be N × FRAME_SIZE samples (consecutive frames).
    pub fn load_from_samples(&mut self, data: &[f32], num_frames: usize) {
        if data.len() < num_frames * FRAME_SIZE || num_frames == 0 {
            return;
        }

        let raw: Vec<Vec<f32>> = (0..num_frames)
            .map(|i| {
                let start = i * FRAME_SIZE;
                data[start..start + FRAME_SIZE].to_vec()
            })
            .collect();

        self.wavetable = Wavetable::from_frames(&raw, "Custom");
        self.frame_position = 0.0;
        self.smoothed_frame = 0.0;
    }

    fn switch_preset(&mut self, preset: FactoryWavetable) {
        if self.active_preset != preset {
            self.wavetable = generate_factory(preset);
            self.active_preset = preset;
        }
    }
}

impl OscillatorEngine for WavetableOscillator {
    fn process(&mut self, sample_rate: f32) -> f32 {
        let dt = (self.frequency / sample_rate).clamp(0.0, 0.5);

        // ── Update frame position based on scan mode ─────────
        let target_frame = match self.scan_mode {
            ScanMode::Manual => self.frame_position,
            ScanMode::OneShot => {
                if self.oneshot_active {
                    self.oneshot_phase += self.oneshot_rate / sample_rate;
                    if self.oneshot_phase >= 1.0 {
                        self.oneshot_phase = 1.0;
                        self.oneshot_active = false;
                    }
                }
                self.oneshot_phase
            }
        };

        // ── Smooth frame position ────────────────────────────
        let smooth_coeff = if self.morph_smooth > 0.001 {
            let rate = 1.0 / (self.morph_smooth * 0.1 * sample_rate + 1.0);
            rate
        } else {
            1.0  // instant
        };
        self.smoothed_frame += (target_frame - self.smoothed_frame) * smooth_coeff;

        // ── Read from mip-mapped wavetable with frame crossfade ─
        let sample = self.wavetable.read(self.phase, dt, self.smoothed_frame);

        // ── Advance phase ────────────────────────────────────
        self.phase += dt;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        sample.clamp(-1.0, 1.0)
    }

    fn set_frequency(&mut self, freq: f32) {
        self.frequency = freq.max(0.0);
    }

    fn set_param(&mut self, name: &str, value: f32) {
        match name {
            "frame_position" | "frame" => {
                self.frame_position = value.clamp(0.0, 1.0);
            }
            "morph" | "morph_smooth" => {
                self.morph_smooth = value.clamp(0.0, 1.0);
            }
            "scan_mode" => {
                self.scan_mode = match value as u8 {
                    0 => ScanMode::Manual,
                    _ => ScanMode::OneShot,
                };
            }
            "oneshot_rate" | "scan_time" => {
                // Rate in seconds (0.1 – 10.0s to sweep all frames)
                self.oneshot_rate = 1.0 / value.clamp(0.1, 10.0);
            }
            "preset" => {
                let preset = match value as u8 {
                    0 => FactoryWavetable::Basic,
                    1 => FactoryWavetable::PwmSweep,
                    2 => FactoryWavetable::FormantSweep,
                    3 => FactoryWavetable::Digital,
                    _ => FactoryWavetable::Vocal,
                };
                self.switch_preset(preset);
            }
            _ => {}
        }
    }

    fn reset(&mut self) {
        self.phase = 0.0;
        self.smoothed_frame = self.frame_position;
        self.oneshot_phase = 0.0;
        self.oneshot_active = matches!(self.scan_mode, ScanMode::OneShot);
    }

    fn name(&self) -> &'static str {
        "Wavetable"
    }
}
