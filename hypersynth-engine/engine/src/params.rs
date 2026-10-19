#[derive(Debug, Clone)]
pub struct EngineParams {
    // === FILTER ===
    pub filter_cutoff: f32,        // 20 – 20000 Hz
    pub filter_resonance: f32,     // 0 – 1
    pub filter_drive: f32,         // 0 – 1
    pub filter_env_amount: f32,    // 0 – 1
    pub filter_type: u8,           // 0=Ladder 1=SVF 2=AnalogLadder 3=TptLadder

    // === MASTER ===
    pub master_volume: f32,        // 0 – 1

    // === LFO 0 → filter cutoff modulation depth ===
    pub lfo_mix_amount: f32,       // 0 – 1  (how much LFO0 moves the cutoff)

    // === OSC 1 base params (applied to va oscillator) ===
    pub osc1_level: f32,           // 0 – 1
    pub osc1_tune: f32,            // semitones: -24 – +24
    pub osc1_detune: f32,          // cents: -100 – +100
    pub osc1_pan: f32,             // -1 – +1
    pub osc1_waveform: u8,         // 0=Sine 1=Tri 2=Saw 3=Square 4=Noise
    pub osc1_pulse_width: f32,     // 0.1 – 0.9

    // === OSC 2 base params ===
    pub osc2_level: f32,
    pub osc2_tune: f32,
    pub osc2_detune: f32,
    pub osc2_pan: f32,
    pub osc2_waveform: u8,
    pub osc2_pulse_width: f32,

    // === OSC 3 base params ===
    pub osc3_level: f32,
    pub osc3_tune: f32,
    pub osc3_detune: f32,
    pub osc3_pan: f32,
    pub osc3_waveform: u8,
    pub osc3_pulse_width: f32,

    // === Per-oscillator engine-specific params ===
    pub osc_extras: [OscExtraParams; 3],

    // === AMP ENVELOPE (shared default for all voices) ===
    pub amp_attack: f32,           // 0.001 – 10 s
    pub amp_decay: f32,            // 0.001 – 10 s
    pub amp_sustain: f32,          // 0 – 1
    pub amp_release: f32,          // 0.001 – 30 s

    // === FILTER ENVELOPE ===
    pub filter_env_attack: f32,
    pub filter_env_decay: f32,
    pub filter_env_sustain: f32,
    pub filter_env_release: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OscEngineType {
    Va = 0,
    Wavetable = 1,
    Fm = 2,
    Granular = 3,
    Modal = 4,
    Additive = 5,
    Sampler = 6,
    TptVco = 7,
    CircuitVco = 8,
}

impl OscEngineType {
    pub fn from_index(index: u8) -> Self {
        match index {
            1 => Self::Wavetable,
            2 => Self::Fm,
            3 => Self::Granular,
            4 => Self::Modal,
            5 => Self::Additive,
            6 => Self::Sampler,
            7 => Self::TptVco,
            8 => Self::CircuitVco,
            _ => Self::Va,
        }
    }
}

/// Filter model selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterType {
    /// Basic Moog-style ladder (PolyBLEP + tanh, lightweight)
    Ladder = 0,
    /// State Variable Filter (LP/HP/BP/Notch)
    Svf = 1,
    /// Full Huovilainen nonlinear transistor ladder (analog_ladder)
    AnalogLadder = 2,
    /// TPT Zero-Delay Feedback Moog ladder (Diva-class, highest quality)
    TptLadder = 3,
}

impl FilterType {
    pub fn from_index(index: u8) -> Self {
        match index {
            1 => Self::Svf,
            2 => Self::AnalogLadder,
            3 => Self::TptLadder,
            _ => Self::Ladder,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct OscExtraParams {
    pub engine_type: u8,
    pub wave_frame: f32,
    pub wave_morph: f32,
    pub wave_scan: bool,
    pub wave_scan_time: f32,
    pub wave_preset: u8,
    pub fm_algorithm: u8,
    pub fm_mod_index: f32,
    pub fm_feedback: f32,
    pub fm_op_ratios: [f32; 4],
    pub fm_op_levels: [f32; 4],
    pub gran_size: f32,
    pub gran_density: f32,
    pub gran_position: f32,
    pub gran_spray: f32,
    pub gran_pitch_random: f32,
    pub gran_window: u8,
    pub modal_body: u8,
    pub modal_decay: f32,
    pub modal_brightness: f32,
    pub add_harmonics: f32,
    pub add_morph: f32,
    pub samp_mode: u8,
    pub samp_start: f32,
    pub samp_end: f32,
    pub samp_pitch: f32,
    // === VA-specific extras ===
    pub va_drift: f32,
    pub va_vintage: f32,
    pub va_brightness: f32,
    pub va_sub_mode: u8,
    pub va_sub_level: f32,
    pub va_sync: bool,
    pub va_pwm_amount: f32,
}

impl Default for OscExtraParams {
    fn default() -> Self {
        Self {
            engine_type: OscEngineType::CircuitVco as u8,
            wave_frame: 0.0,
            wave_morph: 0.0,
            wave_scan: false,
            wave_scan_time: 2.0,
            wave_preset: 0,
            fm_algorithm: 0,
            fm_mod_index: 2.0,
            fm_feedback: 0.0,
            fm_op_ratios: [1.0, 1.0, 2.0, 4.0],
            fm_op_levels: [1.0, 0.75, 0.75, 0.75],
            gran_size: 80.0,
            gran_density: 40.0,
            gran_position: 0.5,
            gran_spray: 0.0,
            gran_pitch_random: 0.0,
            gran_window: 0,
            modal_body: 0,
            modal_decay: 2.0,
            modal_brightness: 0.6,
            add_harmonics: 16.0,
            add_morph: 0.0,
            samp_mode: 1,
            samp_start: 0.0,
            samp_end: 1.0,
            samp_pitch: 0.0,
            va_drift: 0.0,
            va_vintage: 0.0,
            va_brightness: 1.0,
            va_sub_mode: 0,
            va_sub_level: 0.5,
            va_sync: false,
            va_pwm_amount: 0.0,
        }
    }
}

impl Default for EngineParams {
    fn default() -> Self {
        Self {
            filter_cutoff: 12_000.0,
            filter_resonance: 0.2,
            filter_drive: 0.0,
            filter_env_amount: 0.35,
            filter_type: 0,   // Ladder (default)
            master_volume: 0.8,
            lfo_mix_amount: 0.0,

            osc1_level: 1.0,
            osc1_tune: 0.0,
            osc1_detune: 0.0,
            osc1_pan: 0.0,
            osc1_waveform: 2,   // Saw
            osc1_pulse_width: 0.5,

            osc2_level: 0.8,
            osc2_tune: 0.0,
            osc2_detune: 7.0,
            osc2_pan: 0.0,
            osc2_waveform: 3,   // Square
            osc2_pulse_width: 0.5,

            osc3_level: 0.6,
            osc3_tune: -12.0,
            osc3_detune: -5.0,
            osc3_pan: 0.0,
            osc3_waveform: 1,   // Triangle
            osc3_pulse_width: 0.5,
            osc_extras: [
                OscExtraParams::default(),
                OscExtraParams::default(),
                OscExtraParams::default(),
            ],

            amp_attack: 0.01,
            amp_decay: 0.12,
            amp_sustain: 0.8,
            amp_release: 0.2,

            filter_env_attack: 0.01,
            filter_env_decay: 0.2,
            filter_env_sustain: 0.0,
            filter_env_release: 0.3,
        }
    }
}

impl EngineParams {
    pub fn clamp(&mut self) {
        self.filter_cutoff = self.filter_cutoff.clamp(20.0, 20_000.0);
        self.filter_resonance = self.filter_resonance.clamp(0.0, 1.0);
        self.filter_drive = self.filter_drive.clamp(0.0, 1.0);
        self.filter_env_amount = self.filter_env_amount.clamp(-1.0, 1.0);
        self.filter_type = self.filter_type.min(3);
        self.master_volume = self.master_volume.clamp(0.0, 1.0);
        self.lfo_mix_amount = self.lfo_mix_amount.clamp(0.0, 1.0);

        self.osc1_level = self.osc1_level.clamp(0.0, 1.0);
        self.osc1_tune = self.osc1_tune.clamp(-24.0, 24.0);
        self.osc1_detune = self.osc1_detune.clamp(-100.0, 100.0);
        self.osc1_pan = self.osc1_pan.clamp(-1.0, 1.0);
        self.osc1_pulse_width = self.osc1_pulse_width.clamp(0.1, 0.9);

        self.osc2_level = self.osc2_level.clamp(0.0, 1.0);
        self.osc2_tune = self.osc2_tune.clamp(-24.0, 24.0);
        self.osc2_detune = self.osc2_detune.clamp(-100.0, 100.0);
        self.osc2_pan = self.osc2_pan.clamp(-1.0, 1.0);
        self.osc2_pulse_width = self.osc2_pulse_width.clamp(0.1, 0.9);

        self.osc3_level = self.osc3_level.clamp(0.0, 1.0);
        self.osc3_tune = self.osc3_tune.clamp(-24.0, 24.0);
        self.osc3_detune = self.osc3_detune.clamp(-100.0, 100.0);
        self.osc3_pan = self.osc3_pan.clamp(-1.0, 1.0);
        self.osc3_pulse_width = self.osc3_pulse_width.clamp(0.1, 0.9);

        for extra in &mut self.osc_extras {
            extra.engine_type = extra.engine_type.min(OscEngineType::CircuitVco as u8);
            extra.wave_frame = extra.wave_frame.clamp(0.0, 1.0);
            extra.wave_morph = extra.wave_morph.clamp(0.0, 1.0);
            extra.wave_scan_time = extra.wave_scan_time.clamp(0.1, 10.0);
            extra.wave_preset = extra.wave_preset.min(4);
            extra.fm_algorithm = extra.fm_algorithm.min(5);
            extra.fm_mod_index = extra.fm_mod_index.clamp(0.0, 4.0);
            extra.fm_feedback = extra.fm_feedback.clamp(0.0, 1.0);
            for value in &mut extra.fm_op_ratios {
                *value = value.clamp(0.5, 32.0);
            }
            for value in &mut extra.fm_op_levels {
                *value = value.clamp(0.0, 1.0);
            }
            extra.gran_size = extra.gran_size.clamp(10.0, 500.0);
            extra.gran_density = extra.gran_density.clamp(1.0, 100.0);
            extra.gran_position = extra.gran_position.clamp(0.0, 1.0);
            extra.gran_spray = extra.gran_spray.clamp(0.0, 1.0);
            extra.gran_pitch_random = extra.gran_pitch_random.clamp(0.0, 1.0);
            extra.gran_window = extra.gran_window.min(4);
            extra.modal_body = extra.modal_body.min(5);
            extra.modal_decay = extra.modal_decay.clamp(0.1, 10.0);
            extra.modal_brightness = extra.modal_brightness.clamp(0.0, 1.0);
            extra.add_harmonics = extra.add_harmonics.clamp(8.0, 128.0);
            extra.add_morph = extra.add_morph.clamp(0.0, 1.0);
            extra.samp_mode = extra.samp_mode.min(3);
            extra.samp_start = extra.samp_start.clamp(0.0, 0.95);
            extra.samp_end = extra.samp_end.clamp((extra.samp_start + 0.01).min(1.0), 1.0);
            extra.samp_pitch = extra.samp_pitch.clamp(-24.0, 24.0);
            extra.va_drift = extra.va_drift.clamp(0.0, 1.0);
            extra.va_vintage = extra.va_vintage.clamp(0.0, 1.0);
            extra.va_brightness = extra.va_brightness.clamp(0.0, 1.0);
            extra.va_sub_mode = extra.va_sub_mode.min(3);
            extra.va_sub_level = extra.va_sub_level.clamp(0.0, 1.0);
            extra.va_pwm_amount = extra.va_pwm_amount.clamp(0.0, 0.45);
        }

        self.amp_attack = self.amp_attack.clamp(0.001, 10.0);
        self.amp_decay = self.amp_decay.clamp(0.001, 10.0);
        self.amp_sustain = self.amp_sustain.clamp(0.0, 1.0);
        self.amp_release = self.amp_release.clamp(0.001, 30.0);

        self.filter_env_attack = self.filter_env_attack.clamp(0.001, 10.0);
        self.filter_env_decay = self.filter_env_decay.clamp(0.001, 10.0);
        self.filter_env_sustain = self.filter_env_sustain.clamp(0.0, 1.0);
        self.filter_env_release = self.filter_env_release.clamp(0.001, 30.0);
    }

    pub fn osc_level(&self, index: usize) -> f32 {
        match index {
            0 => self.osc1_level,
            1 => self.osc2_level,
            _ => self.osc3_level,
        }
    }

    pub fn osc_tune(&self, index: usize) -> f32 {
        match index {
            0 => self.osc1_tune,
            1 => self.osc2_tune,
            _ => self.osc3_tune,
        }
    }

    pub fn osc_detune(&self, index: usize) -> f32 {
        match index {
            0 => self.osc1_detune,
            1 => self.osc2_detune,
            _ => self.osc3_detune,
        }
    }

    pub fn osc_pan(&self, index: usize) -> f32 {
        match index {
            0 => self.osc1_pan,
            1 => self.osc2_pan,
            _ => self.osc3_pan,
        }
    }

    pub fn osc_waveform(&self, index: usize) -> u8 {
        match index {
            0 => self.osc1_waveform,
            1 => self.osc2_waveform,
            _ => self.osc3_waveform,
        }
    }

    pub fn osc_pulse_width(&self, index: usize) -> f32 {
        match index {
            0 => self.osc1_pulse_width,
            1 => self.osc2_pulse_width,
            _ => self.osc3_pulse_width,
        }
    }

    pub fn osc_extra(&self, index: usize) -> OscExtraParams {
        self.osc_extras[index.min(2)]
    }

    pub fn set_osc_string_param(&mut self, index: usize, name: &str, value: f32) -> bool {
        let slot = index.min(2);
        match name {
            "level" => match slot {
                0 => self.osc1_level = value,
                1 => self.osc2_level = value,
                _ => self.osc3_level = value,
            },
            "tune" => match slot {
                0 => self.osc1_tune = value,
                1 => self.osc2_tune = value,
                _ => self.osc3_tune = value,
            },
            "detune" => match slot {
                0 => self.osc1_detune = value,
                1 => self.osc2_detune = value,
                _ => self.osc3_detune = value,
            },
            "pan" => match slot {
                0 => self.osc1_pan = value,
                1 => self.osc2_pan = value,
                _ => self.osc3_pan = value,
            },
            "waveform" => match slot {
                0 => self.osc1_waveform = value as u8,
                1 => self.osc2_waveform = value as u8,
                _ => self.osc3_waveform = value as u8,
            },
            "pulse_width" => match slot {
                0 => self.osc1_pulse_width = value,
                1 => self.osc2_pulse_width = value,
                _ => self.osc3_pulse_width = value,
            },
            "engine_type" => self.osc_extras[slot].engine_type = value as u8,
            "wt_frame" => self.osc_extras[slot].wave_frame = value,
            "wt_morph" => self.osc_extras[slot].wave_morph = value,
            "wt_scan" => self.osc_extras[slot].wave_scan = value >= 0.5,
            "wt_scan_time" => self.osc_extras[slot].wave_scan_time = value,
            "wt_preset" => self.osc_extras[slot].wave_preset = value as u8,
            "fm_algorithm" => self.osc_extras[slot].fm_algorithm = value as u8,
            "fm_mod_index" => self.osc_extras[slot].fm_mod_index = value,
            "fm_feedback" => self.osc_extras[slot].fm_feedback = value,
            "fm_op1_ratio" => self.osc_extras[slot].fm_op_ratios[0] = value,
            "fm_op2_ratio" => self.osc_extras[slot].fm_op_ratios[1] = value,
            "fm_op3_ratio" => self.osc_extras[slot].fm_op_ratios[2] = value,
            "fm_op4_ratio" => self.osc_extras[slot].fm_op_ratios[3] = value,
            "fm_op1_level" => self.osc_extras[slot].fm_op_levels[0] = value,
            "fm_op2_level" => self.osc_extras[slot].fm_op_levels[1] = value,
            "fm_op3_level" => self.osc_extras[slot].fm_op_levels[2] = value,
            "fm_op4_level" => self.osc_extras[slot].fm_op_levels[3] = value,
            "gran_size" => self.osc_extras[slot].gran_size = value,
            "gran_density" => self.osc_extras[slot].gran_density = value,
            "gran_position" => self.osc_extras[slot].gran_position = value,
            "gran_spray" => self.osc_extras[slot].gran_spray = value,
            "gran_pitch_random" => self.osc_extras[slot].gran_pitch_random = value,
            "gran_window" => self.osc_extras[slot].gran_window = value as u8,
            "modal_body" => self.osc_extras[slot].modal_body = value as u8,
            "modal_decay" => self.osc_extras[slot].modal_decay = value,
            "modal_brightness" => self.osc_extras[slot].modal_brightness = value,
            "add_harmonics" => self.osc_extras[slot].add_harmonics = value,
            "add_morph" => self.osc_extras[slot].add_morph = value,
            "samp_mode" => self.osc_extras[slot].samp_mode = value as u8,
            "samp_start" => self.osc_extras[slot].samp_start = value,
            "samp_end" => self.osc_extras[slot].samp_end = value,
            "samp_pitch" => self.osc_extras[slot].samp_pitch = value,
            "va_drift"      => self.osc_extras[slot].va_drift = value,
            "va_vintage"    => self.osc_extras[slot].va_vintage = value,
            "va_brightness" => self.osc_extras[slot].va_brightness = value,
            "va_sub_mode"   => self.osc_extras[slot].va_sub_mode = value as u8,
            "va_sub_level"  => self.osc_extras[slot].va_sub_level = value,
            "va_sync"       => self.osc_extras[slot].va_sync = value >= 0.5,
            "va_pwm"        => self.osc_extras[slot].va_pwm_amount = value,
            _ => return false,
        }

        self.clamp();
        true
    }

    /// Set a parameter value by numeric `ParamId`.
    /// Values are clamped to the descriptor's [min, max] range automatically.
    /// Returns `false` if the id is unknown.
    pub fn set_by_id(&mut self, id: ParamId, value: f32) -> bool {
        let desc = id.descriptor();
        let v = value.clamp(desc.min, desc.max);
        match id {
            ParamId::FilterCutoff       => self.filter_cutoff = v,
            ParamId::FilterResonance    => self.filter_resonance = v,
            ParamId::FilterDrive        => self.filter_drive = v,
            ParamId::FilterEnvAmount    => self.filter_env_amount = v,
            ParamId::FilterType         => self.filter_type = v as u8,
            ParamId::MasterVolume       => self.master_volume = v,
            ParamId::Lfo1Rate           => { /* stored externally in LFO array; caller must sync */ }
            ParamId::Lfo1Waveform       => { /* stored externally */ }
            ParamId::Lfo1MixAmount      => self.lfo_mix_amount = v,
            ParamId::AmpAttack          => self.amp_attack = v,
            ParamId::AmpDecay           => self.amp_decay = v,
            ParamId::AmpSustain         => self.amp_sustain = v,
            ParamId::AmpRelease         => self.amp_release = v,
            ParamId::FilterEnvAttack    => self.filter_env_attack = v,
            ParamId::FilterEnvDecay     => self.filter_env_decay = v,
            ParamId::FilterEnvSustain   => self.filter_env_sustain = v,
            ParamId::FilterEnvRelease   => self.filter_env_release = v,
            ParamId::Osc1Level          => self.osc1_level = v,
            ParamId::Osc1Tune           => self.osc1_tune = v,
            ParamId::Osc1Detune         => self.osc1_detune = v,
            ParamId::Osc1Pan            => self.osc1_pan = v,
            ParamId::Osc1Waveform       => self.osc1_waveform = v as u8,
            ParamId::Osc1PulseWidth     => self.osc1_pulse_width = v,
            ParamId::Osc2Level          => self.osc2_level = v,
            ParamId::Osc2Tune           => self.osc2_tune = v,
            ParamId::Osc2Detune         => self.osc2_detune = v,
            ParamId::Osc2Pan            => self.osc2_pan = v,
            ParamId::Osc2Waveform       => self.osc2_waveform = v as u8,
            ParamId::Osc2PulseWidth     => self.osc2_pulse_width = v,
            ParamId::Osc3Level          => self.osc3_level = v,
            ParamId::Osc3Tune           => self.osc3_tune = v,
            ParamId::Osc3Detune         => self.osc3_detune = v,
            ParamId::Osc3Pan            => self.osc3_pan = v,
            ParamId::Osc3Waveform       => self.osc3_waveform = v as u8,
            ParamId::Osc3PulseWidth     => self.osc3_pulse_width = v,
        }
        true
    }

    /// Read a parameter value by numeric `ParamId`.
    pub fn get_by_id(&self, id: ParamId) -> f32 {
        match id {
            ParamId::FilterCutoff       => self.filter_cutoff,
            ParamId::FilterResonance    => self.filter_resonance,
            ParamId::FilterDrive        => self.filter_drive,
            ParamId::FilterEnvAmount    => self.filter_env_amount,
            ParamId::FilterType         => self.filter_type as f32,
            ParamId::MasterVolume       => self.master_volume,
            ParamId::Lfo1Rate           => 0.0, // stored in LFO array
            ParamId::Lfo1Waveform       => 0.0,
            ParamId::Lfo1MixAmount      => self.lfo_mix_amount,
            ParamId::AmpAttack          => self.amp_attack,
            ParamId::AmpDecay           => self.amp_decay,
            ParamId::AmpSustain         => self.amp_sustain,
            ParamId::AmpRelease         => self.amp_release,
            ParamId::FilterEnvAttack    => self.filter_env_attack,
            ParamId::FilterEnvDecay     => self.filter_env_decay,
            ParamId::FilterEnvSustain   => self.filter_env_sustain,
            ParamId::FilterEnvRelease   => self.filter_env_release,
            ParamId::Osc1Level          => self.osc1_level,
            ParamId::Osc1Tune           => self.osc1_tune,
            ParamId::Osc1Detune         => self.osc1_detune,
            ParamId::Osc1Pan            => self.osc1_pan,
            ParamId::Osc1Waveform       => self.osc1_waveform as f32,
            ParamId::Osc1PulseWidth     => self.osc1_pulse_width,
            ParamId::Osc2Level          => self.osc2_level,
            ParamId::Osc2Tune           => self.osc2_tune,
            ParamId::Osc2Detune         => self.osc2_detune,
            ParamId::Osc2Pan            => self.osc2_pan,
            ParamId::Osc2Waveform       => self.osc2_waveform as f32,
            ParamId::Osc2PulseWidth     => self.osc2_pulse_width,
            ParamId::Osc3Level          => self.osc3_level,
            ParamId::Osc3Tune           => self.osc3_tune,
            ParamId::Osc3Detune         => self.osc3_detune,
            ParamId::Osc3Pan            => self.osc3_pan,
            ParamId::Osc3Waveform       => self.osc3_waveform as f32,
            ParamId::Osc3PulseWidth     => self.osc3_pulse_width,
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// PARAM ID ENUM — Stable numeric identifiers for all parameters.
// IDs are grouped by section with gaps for future expansion.
// These IDs are used for preset serialization, automation, and WASM API.
// ══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[repr(u16)]
pub enum ParamId {
    // === FILTER (0–19) ===
    FilterCutoff    = 0,
    FilterResonance = 1,
    FilterDrive     = 2,
    FilterEnvAmount = 3,
    FilterType      = 4,

    // === MASTER (20–29) ===
    MasterVolume = 20,

    // === LFO 1 (30–49) ===
    Lfo1Rate      = 30,
    Lfo1Waveform  = 31,
    Lfo1MixAmount = 32,

    // === AMP ENVELOPE (50–59) ===
    AmpAttack  = 50,
    AmpDecay   = 51,
    AmpSustain = 52,
    AmpRelease = 53,

    // === FILTER ENVELOPE (60–69) ===
    FilterEnvAttack   = 60,
    FilterEnvDecay    = 61,
    FilterEnvSustain  = 62,
    FilterEnvRelease  = 63,

    // === OSC 1 (100–149) ===
    Osc1Level      = 100,
    Osc1Tune       = 101,
    Osc1Detune     = 102,
    Osc1Pan        = 103,
    Osc1Waveform   = 104,
    Osc1PulseWidth = 105,

    // === OSC 2 (150–199) ===
    Osc2Level      = 150,
    Osc2Tune       = 151,
    Osc2Detune     = 152,
    Osc2Pan        = 153,
    Osc2Waveform   = 154,
    Osc2PulseWidth = 155,

    // === OSC 3 (200–249) ===
    Osc3Level      = 200,
    Osc3Tune       = 201,
    Osc3Detune     = 202,
    Osc3Pan        = 203,
    Osc3Waveform   = 204,
    Osc3PulseWidth = 205,
}

impl ParamId {
    /// Convert a raw u16 to a `ParamId`. Returns `None` for unknown IDs.
    pub fn try_from_u16(v: u16) -> Option<Self> {
        match v {
            0   => Some(Self::FilterCutoff),
            1   => Some(Self::FilterResonance),
            2   => Some(Self::FilterDrive),
            3   => Some(Self::FilterEnvAmount),
            4   => Some(Self::FilterType),
            20  => Some(Self::MasterVolume),
            30  => Some(Self::Lfo1Rate),
            31  => Some(Self::Lfo1Waveform),
            32  => Some(Self::Lfo1MixAmount),
            50  => Some(Self::AmpAttack),
            51  => Some(Self::AmpDecay),
            52  => Some(Self::AmpSustain),
            53  => Some(Self::AmpRelease),
            60  => Some(Self::FilterEnvAttack),
            61  => Some(Self::FilterEnvDecay),
            62  => Some(Self::FilterEnvSustain),
            63  => Some(Self::FilterEnvRelease),
            100 => Some(Self::Osc1Level),
            101 => Some(Self::Osc1Tune),
            102 => Some(Self::Osc1Detune),
            103 => Some(Self::Osc1Pan),
            104 => Some(Self::Osc1Waveform),
            105 => Some(Self::Osc1PulseWidth),
            150 => Some(Self::Osc2Level),
            151 => Some(Self::Osc2Tune),
            152 => Some(Self::Osc2Detune),
            153 => Some(Self::Osc2Pan),
            154 => Some(Self::Osc2Waveform),
            155 => Some(Self::Osc2PulseWidth),
            200 => Some(Self::Osc3Level),
            201 => Some(Self::Osc3Tune),
            202 => Some(Self::Osc3Detune),
            203 => Some(Self::Osc3Pan),
            204 => Some(Self::Osc3Waveform),
            205 => Some(Self::Osc3PulseWidth),
            _   => None,
        }
    }

    /// Return the static descriptor for this parameter.
    pub fn descriptor(self) -> ParamDescriptor {
        match self {
            // Filter
            Self::FilterCutoff    => ParamDescriptor { id: self, name: "Filter Cutoff",    short_name: "CUTOFF", min: 20.0,   max: 20_000.0, default: 12_000.0, curve: ParamCurve::Logarithmic, unit: ParamUnit::Hz,      smoothing_ms: 5.0 },
            Self::FilterResonance => ParamDescriptor { id: self, name: "Filter Resonance", short_name: "RESO",   min: 0.0,    max: 1.0,      default: 0.2,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 5.0 },
            Self::FilterDrive     => ParamDescriptor { id: self, name: "Filter Drive",     short_name: "DRIVE",  min: 0.0,    max: 1.0,      default: 0.0,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            Self::FilterEnvAmount => ParamDescriptor { id: self, name: "Filter Env Amt",   short_name: "ENV",    min: -1.0,   max: 1.0,      default: 0.35,     curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            Self::FilterType      => ParamDescriptor { id: self, name: "Filter Type",      short_name: "TYPE",   min: 0.0,    max: 3.0,      default: 0.0,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            // Master
            Self::MasterVolume    => ParamDescriptor { id: self, name: "Master Volume",    short_name: "VOL",    min: 0.0,    max: 1.0,      default: 0.8,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 5.0 },
            // LFO
            Self::Lfo1Rate        => ParamDescriptor { id: self, name: "LFO 1 Rate",       short_name: "RATE",   min: 0.01,   max: 20.0,     default: 1.0,      curve: ParamCurve::Logarithmic, unit: ParamUnit::Hz,      smoothing_ms: 0.0 },
            Self::Lfo1Waveform    => ParamDescriptor { id: self, name: "LFO 1 Waveform",   short_name: "WAVE",   min: 0.0,    max: 4.0,      default: 0.0,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            Self::Lfo1MixAmount   => ParamDescriptor { id: self, name: "LFO 1 Mix",        short_name: "MIX",    min: 0.0,    max: 1.0,      default: 0.0,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            // Amp envelope
            Self::AmpAttack       => ParamDescriptor { id: self, name: "Amp Attack",       short_name: "ATK",    min: 0.001,  max: 10.0,     default: 0.01,     curve: ParamCurve::Exponential, unit: ParamUnit::Seconds, smoothing_ms: 0.0 },
            Self::AmpDecay        => ParamDescriptor { id: self, name: "Amp Decay",        short_name: "DEC",    min: 0.001,  max: 10.0,     default: 0.12,     curve: ParamCurve::Exponential, unit: ParamUnit::Seconds, smoothing_ms: 0.0 },
            Self::AmpSustain      => ParamDescriptor { id: self, name: "Amp Sustain",      short_name: "SUS",    min: 0.0,    max: 1.0,      default: 0.8,      curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            Self::AmpRelease      => ParamDescriptor { id: self, name: "Amp Release",      short_name: "REL",    min: 0.001,  max: 30.0,     default: 0.2,      curve: ParamCurve::Exponential, unit: ParamUnit::Seconds, smoothing_ms: 0.0 },
            // Filter envelope
            Self::FilterEnvAttack  => ParamDescriptor { id: self, name: "Filter Env Attack",  short_name: "ATK", min: 0.001, max: 10.0, default: 0.01, curve: ParamCurve::Exponential, unit: ParamUnit::Seconds, smoothing_ms: 0.0 },
            Self::FilterEnvDecay   => ParamDescriptor { id: self, name: "Filter Env Decay",   short_name: "DEC", min: 0.001, max: 10.0, default: 0.2,  curve: ParamCurve::Exponential, unit: ParamUnit::Seconds, smoothing_ms: 0.0 },
            Self::FilterEnvSustain => ParamDescriptor { id: self, name: "Filter Env Sustain", short_name: "SUS", min: 0.0,   max: 1.0,  default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,    smoothing_ms: 0.0 },
            Self::FilterEnvRelease => ParamDescriptor { id: self, name: "Filter Env Release", short_name: "REL", min: 0.001, max: 30.0, default: 0.3,  curve: ParamCurve::Exponential, unit: ParamUnit::Seconds, smoothing_ms: 0.0 },
            // Osc 1
            Self::Osc1Level      => ParamDescriptor { id: self, name: "Osc 1 Level",    short_name: "LVL",  min: 0.0,   max: 1.0,   default: 1.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 5.0 },
            Self::Osc1Tune       => ParamDescriptor { id: self, name: "Osc 1 Tune",     short_name: "TUNE", min: -24.0, max: 24.0,  default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::Semitones, smoothing_ms: 0.0 },
            Self::Osc1Detune     => ParamDescriptor { id: self, name: "Osc 1 Detune",   short_name: "DET",  min: -100.0,max: 100.0, default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::Cents,    smoothing_ms: 0.0 },
            Self::Osc1Pan        => ParamDescriptor { id: self, name: "Osc 1 Pan",      short_name: "PAN",  min: -1.0,  max: 1.0,   default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 5.0 },
            Self::Osc1Waveform   => ParamDescriptor { id: self, name: "Osc 1 Waveform", short_name: "WAVE", min: 0.0,   max: 4.0,   default: 2.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 0.0 },
            Self::Osc1PulseWidth => ParamDescriptor { id: self, name: "Osc 1 PW",       short_name: "PW",   min: 0.1,   max: 0.9,   default: 0.5,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 0.0 },
            // Osc 2
            Self::Osc2Level      => ParamDescriptor { id: self, name: "Osc 2 Level",    short_name: "LVL",  min: 0.0,   max: 1.0,   default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 5.0 },
            Self::Osc2Tune       => ParamDescriptor { id: self, name: "Osc 2 Tune",     short_name: "TUNE", min: -24.0, max: 24.0,  default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::Semitones, smoothing_ms: 0.0 },
            Self::Osc2Detune     => ParamDescriptor { id: self, name: "Osc 2 Detune",   short_name: "DET",  min: -100.0,max: 100.0, default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::Cents,    smoothing_ms: 0.0 },
            Self::Osc2Pan        => ParamDescriptor { id: self, name: "Osc 2 Pan",      short_name: "PAN",  min: -1.0,  max: 1.0,   default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 5.0 },
            Self::Osc2Waveform   => ParamDescriptor { id: self, name: "Osc 2 Waveform", short_name: "WAVE", min: 0.0,   max: 4.0,   default: 3.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 0.0 },
            Self::Osc2PulseWidth => ParamDescriptor { id: self, name: "Osc 2 PW",       short_name: "PW",   min: 0.1,   max: 0.9,   default: 0.5,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 0.0 },
            // Osc 3
            Self::Osc3Level      => ParamDescriptor { id: self, name: "Osc 3 Level",    short_name: "LVL",  min: 0.0,   max: 1.0,   default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 5.0 },
            Self::Osc3Tune       => ParamDescriptor { id: self, name: "Osc 3 Tune",     short_name: "TUNE", min: -24.0, max: 24.0,  default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::Semitones, smoothing_ms: 0.0 },
            Self::Osc3Detune     => ParamDescriptor { id: self, name: "Osc 3 Detune",   short_name: "DET",  min: -100.0,max: 100.0, default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::Cents,    smoothing_ms: 0.0 },
            Self::Osc3Pan        => ParamDescriptor { id: self, name: "Osc 3 Pan",      short_name: "PAN",  min: -1.0,  max: 1.0,   default: 0.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 5.0 },
            Self::Osc3Waveform   => ParamDescriptor { id: self, name: "Osc 3 Waveform", short_name: "WAVE", min: 0.0,   max: 4.0,   default: 1.0,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 0.0 },
            Self::Osc3PulseWidth => ParamDescriptor { id: self, name: "Osc 3 PW",       short_name: "PW",   min: 0.1,   max: 0.9,   default: 0.5,  curve: ParamCurve::Linear,      unit: ParamUnit::None,     smoothing_ms: 0.0 },
        }
    }
}

// ── Supporting types ─────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ParamCurve {
    Linear,
    Logarithmic,
    Exponential,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ParamUnit {
    Hz,
    Db,
    Percent,
    Ms,
    Seconds,
    Semitones,
    Cents,
    None,
}

#[derive(Clone, Copy, Debug)]
pub struct ParamDescriptor {
    pub id:           ParamId,
    pub name:         &'static str,
    pub short_name:   &'static str,
    pub min:          f32,
    pub max:          f32,
    pub default:      f32,
    pub curve:        ParamCurve,
    pub unit:         ParamUnit,
    /// 0.0 = instantaneous; > 0 = one-pole smoothing in milliseconds
    pub smoothing_ms: f32,
}
