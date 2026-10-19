use alloc::boxed::Box;
use libm::{powf, sinf, cosf};

use crate::filters::{FilterModel, LadderFilter, StateVariableFilter, AnalogLadder, TptLadderFilter};
use crate::modulation::AdsrEnvelope;
use crate::oscillators::{
    FmOscillator, OscillatorEngine, VaOscillator, VaWaveform, WavetableOscillator,
    AdditiveOscillator, ModalOscillator, GranularOscillator, SamplerOscillator,
    CircuitOscillator, TptVco,
};
use crate::params::{OscEngineType, OscExtraParams, FilterType};

const OSC_SLOT_COUNT: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SlotEngineKind {
    Va,
    Wavetable,
    Fm,
    Granular,
    Modal,
    Additive,
    Sampler,
    TptVco,
    CircuitVco,
}

impl SlotEngineKind {
    fn from_index(index: u8) -> Self {
        match OscEngineType::from_index(index) {
            OscEngineType::Va => Self::Va,
            OscEngineType::Wavetable => Self::Wavetable,
            OscEngineType::Fm => Self::Fm,
            OscEngineType::Granular => Self::Granular,
            OscEngineType::Modal => Self::Modal,
            OscEngineType::Additive => Self::Additive,
            OscEngineType::Sampler => Self::Sampler,
            OscEngineType::TptVco => Self::TptVco,
            OscEngineType::CircuitVco => Self::CircuitVco,
        }
    }
}

struct OscillatorSlot {
    oscillator: Box<dyn OscillatorEngine>,
    engine_kind: SlotEngineKind,
    level: f32,
    pan: f32,
    tune: f32,
    detune: f32,
}

impl OscillatorSlot {
    fn new() -> Self {
        Self {
            oscillator: Box::new(VaOscillator::new(VaWaveform::Sawtooth)),
            engine_kind: SlotEngineKind::Va,
            level: 0.0,
            pan: 0.0,
            tune: 0.0,
            detune: 0.0,
        }
    }

    fn replace_engine(&mut self, engine_kind: SlotEngineKind) {
        self.oscillator = match engine_kind {
            SlotEngineKind::Va => Box::new(VaOscillator::new(VaWaveform::Sawtooth)),
            SlotEngineKind::Wavetable => Box::new(WavetableOscillator::new()),
            SlotEngineKind::Fm => Box::new(FmOscillator::new()),
            SlotEngineKind::Granular => Box::new(GranularOscillator::new()),
            SlotEngineKind::Modal => Box::new(ModalOscillator::new()),
            SlotEngineKind::Additive => Box::new(AdditiveOscillator::new()),
            SlotEngineKind::Sampler => Box::new(SamplerOscillator::new()),
            SlotEngineKind::TptVco => Box::new(TptVco::new(0)),
            SlotEngineKind::CircuitVco => Box::new(CircuitOscillator::new(0)),
        };
        self.engine_kind = engine_kind;
    }

    fn configure(
        &mut self,
        level: f32,
        tune: f32,
        detune: f32,
        pan: f32,
        waveform: u8,
        pulse_width: f32,
        extra: OscExtraParams,
        velocity: f32,
        is_active: bool,
        frequency: f32,
    ) {
        let requested_engine = SlotEngineKind::from_index(extra.engine_type);
        if requested_engine != self.engine_kind {
            self.replace_engine(requested_engine);
        }

        self.level = level.clamp(0.0, 1.0);
        self.tune = tune.clamp(-24.0, 24.0);
        self.detune = detune.clamp(-100.0, 100.0);
        self.pan = pan.clamp(-1.0, 1.0);

        match self.engine_kind {
            SlotEngineKind::Va => {
                self.oscillator.set_param("waveform", waveform as f32);
                self.oscillator.set_param("pulse_width", pulse_width);
                self.oscillator.set_param("pwm_amount", extra.va_pwm_amount);
                self.oscillator.set_param("drift", extra.va_drift);
                self.oscillator.set_param("vintage", extra.va_vintage);
                self.oscillator.set_param("brightness", extra.va_brightness);
                self.oscillator.set_param("sub_mode", extra.va_sub_mode as f32);
                self.oscillator.set_param("sub_level", extra.va_sub_level);
                self.oscillator.set_param("sync", if extra.va_sync { 1.0 } else { 0.0 });
            }
            SlotEngineKind::Wavetable => {
                self.oscillator.set_param("preset", extra.wave_preset as f32);
                self.oscillator.set_param("frame_position", extra.wave_frame);
                self.oscillator.set_param("morph", extra.wave_morph);
                self.oscillator.set_param("scan_mode", if extra.wave_scan { 1.0 } else { 0.0 });
                self.oscillator.set_param("scan_time", extra.wave_scan_time);
            }
            SlotEngineKind::Fm => {
                self.oscillator.set_param("algorithm", extra.fm_algorithm as f32);
                self.oscillator.set_param("mod_index", extra.fm_mod_index);
                self.oscillator.set_param("master_feedback", extra.fm_feedback);
                self.oscillator.set_param("velocity", velocity);
                self.oscillator.set_param("op1_ratio", extra.fm_op_ratios[0]);
                self.oscillator.set_param("op2_ratio", extra.fm_op_ratios[1]);
                self.oscillator.set_param("op3_ratio", extra.fm_op_ratios[2]);
                self.oscillator.set_param("op4_ratio", extra.fm_op_ratios[3]);
                self.oscillator.set_param("op1_level", extra.fm_op_levels[0]);
                self.oscillator.set_param("op2_level", extra.fm_op_levels[1]);
                self.oscillator.set_param("op3_level", extra.fm_op_levels[2]);
                self.oscillator.set_param("op4_level", extra.fm_op_levels[3]);
            }
            SlotEngineKind::Granular => {
                self.oscillator.set_param("grain_size", extra.gran_size);
                self.oscillator.set_param("density", extra.gran_density);
                self.oscillator.set_param("position", extra.gran_position);
                self.oscillator.set_param("spray", extra.gran_spray);
                self.oscillator.set_param("pitch_random", extra.gran_pitch_random);
                self.oscillator.set_param("window", extra.gran_window as f32);
            }
            SlotEngineKind::Modal => {
                self.oscillator.set_param("body", extra.modal_body as f32);
                self.oscillator.set_param("decay", extra.modal_decay);
                self.oscillator.set_param("brightness", extra.modal_brightness);
            }
            SlotEngineKind::Additive => {
                self.oscillator.set_param("harmonics", extra.add_harmonics);
                self.oscillator.set_param("morph", extra.add_morph);
            }
            SlotEngineKind::Sampler => {
                self.oscillator.set_param("mode", extra.samp_mode as f32);
                self.oscillator.set_param("start", extra.samp_start);
                self.oscillator.set_param("end", extra.samp_end);
                self.oscillator.set_param("pitch", extra.samp_pitch);
            }
            SlotEngineKind::TptVco => {
                self.oscillator.set_param("waveform", waveform as f32);
                self.oscillator.set_param("pulse_width", pulse_width);
                self.oscillator.set_param("pwm_mod", extra.va_pwm_amount);
                self.oscillator.set_param("drift", extra.va_drift);
                self.oscillator.set_param("vintage", extra.va_vintage);
                self.oscillator.set_param("brightness", extra.va_brightness);
                self.oscillator.set_param("sub_level", extra.va_sub_level);
                self.oscillator.set_param("sub_mode", extra.va_sub_mode as f32);
                self.oscillator.set_param("sync", if extra.va_sync { 1.0 } else { 0.0 });
            }
            SlotEngineKind::CircuitVco => {
                self.oscillator.set_param("waveform", waveform as f32);
                self.oscillator.set_param("pulse_width", pulse_width);
                self.oscillator.set_param("pwm_mod", extra.va_pwm_amount);
                self.oscillator.set_param("drift", extra.va_drift);
                self.oscillator.set_param("vintage", extra.va_vintage);
                self.oscillator.set_param("brightness", extra.va_brightness);
                self.oscillator.set_param("sub_level", extra.va_sub_level);
                self.oscillator.set_param("sub_mode", extra.va_sub_mode as f32);
                self.oscillator.set_param("sync", if extra.va_sync { 1.0 } else { 0.0 });
            }
        }

        if is_active {
            self.oscillator.set_frequency(frequency);
        }
    }
}

pub struct Voice {
    oscillators: [OscillatorSlot; OSC_SLOT_COUNT],
    pub filter: Box<dyn FilterModel>,
    pub amp_env: AdsrEnvelope,
    pub filter_env: AdsrEnvelope,
    pub active: bool,
    pub note: u8,
    pub velocity: f32,
    pub age_samples: u64,
    filter_base_cutoff: f32,
    filter_resonance: f32,
    filter_drive: f32,
    filter_env_amount: f32,
    filter_type: u8,
}

impl Voice {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            oscillators: core::array::from_fn(|_| OscillatorSlot::new()),
            filter: Box::new(LadderFilter::new()),
            amp_env: AdsrEnvelope::new(sample_rate),
            filter_env: AdsrEnvelope::new(sample_rate),
            active: false,
            note: 0,
            velocity: 0.0,
            age_samples: 0,
            filter_base_cutoff: 12_000.0,
            filter_resonance: 0.2,
            filter_drive: 0.0,
            filter_env_amount: 0.35,
            filter_type: 0,
        }
    }

    fn frequency_for(note: u8, tune: f32, detune: f32) -> f32 {
        let note_with_offset = note as f32 + tune + detune / 100.0;
        440.0 * powf(2.0, (note_with_offset - 69.0) / 12.0)
    }

    pub fn note_on(&mut self, note: u8, velocity: f32, sample_rate: f32) {
        self.note = note;
        self.velocity = velocity.clamp(0.0, 1.0);
        self.active = true;
        self.age_samples = 0;
        self.amp_env.set_sample_rate(sample_rate);
        self.filter_env.set_sample_rate(sample_rate);
        for slot in self.oscillators.iter_mut() {
            slot.oscillator.reset();
            slot.oscillator.set_param("velocity", self.velocity);
            let frequency = Self::frequency_for(self.note, slot.tune, slot.detune);
            slot.oscillator.set_frequency(frequency);
        }
        self.filter.reset();
        self.amp_env.note_on();
        self.filter_env.note_on();
    }

    pub fn note_off(&mut self) {
        self.amp_env.note_off();
        self.filter_env.note_off();
    }

    /// Update oscillator frequencies for a legato pitch slide without re-triggering
    /// envelopes. Used by the wind controller's NoteEvent::LegatoSlide path.
    pub fn slide_to(&mut self, note: u8) {
        self.note = note;
        for slot in self.oscillators.iter_mut() {
            let frequency = Self::frequency_for(self.note, slot.tune, slot.detune);
            slot.oscillator.set_frequency(frequency);
        }
    }

    /// Override all oscillator frequencies from an absolute pitch in semitones.
    ///
    /// Called per-sample when the wind controller is active so that portamento
    /// glides, vibrato, and pitch-bend all reach the audio output. Per-oscillator
    /// tune/detune offsets are still applied on top of the wind pitch.
    pub fn set_pitch_semitones(&mut self, semitones: f32) {
        for slot in self.oscillators.iter_mut() {
            let final_st = semitones + slot.tune + slot.detune / 100.0;
            let freq = (440.0 * powf(2.0, (final_st - 69.0) / 12.0)).clamp(20.0, 20_000.0);
            slot.oscillator.set_frequency(freq);
        }
    }

    /// Add a wind-controller resonance offset on top of the voice's base resonance.
    ///
    /// Called per-sample when the wind controller is active. The filter's
    /// resonance is temporarily elevated by `add` (0–1 normalized).
    pub fn add_wind_resonance(&mut self, add: f32) {
        let reso = (self.filter_resonance + add).clamp(0.0, 1.0);
        self.filter.set_resonance(reso * 4.0);
    }

    pub fn set_filter_params(
        &mut self,
        cutoff: f32,
        resonance: f32,
        drive: f32,
        filter_env_amount: f32,
        sample_rate: f32,
    ) {
        self.filter_base_cutoff = cutoff.clamp(20.0, 20_000.0);
        self.filter_resonance = resonance.clamp(0.0, 1.0);
        self.filter_drive = drive.clamp(0.0, 1.0);
        self.filter_env_amount = filter_env_amount.clamp(-1.0, 1.0);
        self.filter
            .set_cutoff(self.filter_base_cutoff, sample_rate.max(1.0));
        self.filter.set_resonance(self.filter_resonance * 4.0);
        self.filter.set_drive(self.filter_drive);
    }

    /// Switch the filter model at runtime when the user changes filter type.
    pub fn set_filter_type(&mut self, filter_type: u8) {
        if self.filter_type == filter_type {
            return;
        }
        self.filter_type = filter_type;
        self.filter = match FilterType::from_index(filter_type) {
            FilterType::Ladder => Box::new(LadderFilter::new()),
            FilterType::Svf => Box::new(StateVariableFilter::new(crate::filters::SvfMode::LowPass)),
            FilterType::AnalogLadder => Box::new(AnalogLadder::new(0)),
            FilterType::TptLadder => Box::new(TptLadderFilter::new(0)),
        };
    }

    /// Override the base cutoff with an LFO-modulated value (called per-frame from engine)
    pub fn set_lfo_cutoff_override(&mut self, mod_cutoff: f32, sample_rate: f32) {
        self.filter_base_cutoff = mod_cutoff.clamp(20.0, 20_000.0);
        self.filter.set_cutoff(self.filter_base_cutoff, sample_rate);
    }

    pub fn set_osc_params(
        &mut self,
        slot_index: usize,
        level: f32,
        tune: f32,
        detune: f32,
        pan: f32,
        waveform: u8,
        pulse_width: f32,
        extra: OscExtraParams,
    ) {
        let frequency = Self::frequency_for(self.note, tune, detune);
        let slot = &mut self.oscillators[slot_index.min(OSC_SLOT_COUNT - 1)];
        slot.configure(
            level,
            tune,
            detune,
            pan,
            waveform,
            pulse_width,
            extra,
            self.velocity,
            self.active,
            frequency,
        );

        if self.active {
            slot.oscillator.set_frequency(frequency);
        }
    }

    pub fn process(&mut self, sample_rate: f32) -> (f32, f32) {
        self.age_samples = self.age_samples.saturating_add(1);
        if !self.is_active() {
            self.active = false;
            return (0.0, 0.0);
        }

        let mut oscillator_sample = 0.0;
        let mut active_slot_count = 0usize;
        let mut weighted_pan = 0.0;
        let mut total_level = 0.0;

        for slot in self.oscillators.iter_mut() {
            if slot.level <= 0.0001 {
                continue;
            }
            active_slot_count += 1;
            let sample = slot.oscillator.process(sample_rate) * slot.level;
            oscillator_sample += sample;
            weighted_pan += slot.pan * slot.level;
            total_level += slot.level;
        }

        if active_slot_count > 1 {
            oscillator_sample /= 1.0 + (active_slot_count as f32 - 1.0) * 0.6;
        }

        let filter_env = self.filter_env.process();
        let cutoff = (self.filter_base_cutoff * (1.0 + filter_env * self.filter_env_amount * 4.0))
            .clamp(20.0, 20_000.0);

        self.filter.set_cutoff(cutoff, sample_rate);
        self.filter.set_resonance(self.filter_resonance * 4.0);
        self.filter.set_drive(self.filter_drive);

        let filtered = self.filter.process(oscillator_sample, sample_rate);
        let amplitude = self.amp_env.process();
        let sample = filtered * amplitude * self.velocity;

        let osc_pan = if total_level > 0.0 {
            (weighted_pan / total_level).clamp(-1.0, 1.0)
        } else {
            0.0
        };

        let angle = (osc_pan + 1.0) * core::f32::consts::FRAC_PI_4;
        let left = sample * cosf(angle);
        let right = sample * sinf(angle);

        self.active = self.amp_env.is_active();
        (left, right)
    }

    pub fn is_active(&self) -> bool {
        self.amp_env.is_active()
    }
}
