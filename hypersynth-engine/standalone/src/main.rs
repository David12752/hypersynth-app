use std::env;
use std::io::{self, BufRead, BufReader, Write};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, FromSample, Host, HostId, SampleFormat, SampleRate, SizedSample, Stream, StreamConfig};
use hypersynth_engine::{HyperSynthEngine, LockFreeQueue, MidiEvent};
use hypersynth_engine::oscillators::{FactoryWavetable, WavetableOscillator, FRAME_SIZE};
use midir::{Ignore, MidiInput, MidiInputConnection, MidiInputPort};
use serde::{Deserialize, Serialize};

const ENGINE_CHANNELS: usize = 2;
const CONTROL_QUEUE_CAPACITY: usize = 2048;
const MAX_EVENTS_PER_CALLBACK: usize = 128;
const RENDER_CHUNK_FRAMES: usize = 256;
const SCOPE_CAPTURE_SAMPLES: usize = 2048;
const STATUS_INTERVAL_MS: u64 = 16;

#[derive(Clone, Debug)]
struct RequestedConfig {
    sample_rate: u32,
    buffer_size: u32,
    audio_host_id: Option<String>,
    audio_device_id: Option<String>,
    output_pair: u16,
    midi_enabled: bool,
    midi_input_id: Option<String>,
    midi_channel: Option<u8>,
    ipc_mode: bool,
}

impl RequestedConfig {
    fn from_env() -> Self {
        Self {
            sample_rate: env::var("HYPERSYNTH_SAMPLE_RATE")
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(44_100),
            buffer_size: env::var("HYPERSYNTH_BUFFER_SIZE")
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(256),
            audio_host_id: env::var("HYPERSYNTH_AUDIO_HOST")
                .ok()
                .filter(|value| !value.is_empty() && value != "default"),
            audio_device_id: env::var("HYPERSYNTH_AUDIO_DEVICE")
                .ok()
                .filter(|value| !value.is_empty() && value != "default"),
            output_pair: env::var("HYPERSYNTH_OUTPUT_PAIR")
                .ok()
                .and_then(|value| value.parse::<u16>().ok())
                .unwrap_or(0),
            midi_enabled: env::var("HYPERSYNTH_MIDI_ENABLED")
                .ok()
                .map(|value| value != "0" && !value.eq_ignore_ascii_case("false"))
                .unwrap_or(false),
            midi_input_id: env::var("HYPERSYNTH_MIDI_INPUT")
                .ok()
                .filter(|value| !value.is_empty() && value != "all"),
            midi_channel: env::var("HYPERSYNTH_MIDI_CHANNEL")
                .ok()
                .and_then(|value| value.parse::<u8>().ok())
                .filter(|channel| (1..=16).contains(channel)),
            ipc_mode: env::var("HYPERSYNTH_IPC")
                .ok()
                .map(|value| value.eq_ignore_ascii_case("stdio"))
                .unwrap_or(false),
        }
    }
}

#[derive(Clone, Copy)]
enum OscParamName {
    Level, Tune, Detune, Pan, Waveform, PulseWidth, EngineType,
    WtFrame, WtMorph, WtScan, WtScanTime, WtPreset,
    FmAlgorithm, FmModIndex, FmFeedback,
    FmOp1Ratio, FmOp2Ratio, FmOp3Ratio, FmOp4Ratio,
    FmOp1Level, FmOp2Level, FmOp3Level, FmOp4Level,
    GranSize, GranDensity, GranPosition, GranSpray, GranPitchRandom, GranWindow,
    ModalBody, ModalDecay, ModalBrightness,
    AddHarmonics, AddMorph,
    SampMode, SampStart, SampEnd, SampPitch,
    VaDrift, VaVintage, VaBrightness, VaSubMode, VaSubLevel, VaSync, VaPwm,
}

impl OscParamName {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "level" => Some(Self::Level),
            "tune" => Some(Self::Tune),
            "detune" => Some(Self::Detune),
            "pan" => Some(Self::Pan),
            "waveform" => Some(Self::Waveform),
            "pulse_width" => Some(Self::PulseWidth),
            "engine_type" => Some(Self::EngineType),
            "wt_frame" => Some(Self::WtFrame),
            "wt_morph" => Some(Self::WtMorph),
            "wt_scan" => Some(Self::WtScan),
            "wt_scan_time" => Some(Self::WtScanTime),
            "wt_preset" => Some(Self::WtPreset),
            "fm_algorithm" => Some(Self::FmAlgorithm),
            "fm_mod_index" => Some(Self::FmModIndex),
            "fm_feedback" => Some(Self::FmFeedback),
            "fm_op1_ratio" => Some(Self::FmOp1Ratio),
            "fm_op2_ratio" => Some(Self::FmOp2Ratio),
            "fm_op3_ratio" => Some(Self::FmOp3Ratio),
            "fm_op4_ratio" => Some(Self::FmOp4Ratio),
            "fm_op1_level" => Some(Self::FmOp1Level),
            "fm_op2_level" => Some(Self::FmOp2Level),
            "fm_op3_level" => Some(Self::FmOp3Level),
            "fm_op4_level" => Some(Self::FmOp4Level),
            "gran_size" => Some(Self::GranSize),
            "gran_density" => Some(Self::GranDensity),
            "gran_position" => Some(Self::GranPosition),
            "gran_spray" => Some(Self::GranSpray),
            "gran_pitch_random" => Some(Self::GranPitchRandom),
            "gran_window" => Some(Self::GranWindow),
            "modal_body" => Some(Self::ModalBody),
            "modal_decay" => Some(Self::ModalDecay),
            "modal_brightness" => Some(Self::ModalBrightness),
            "add_harmonics" => Some(Self::AddHarmonics),
            "add_morph" => Some(Self::AddMorph),
            "samp_mode" => Some(Self::SampMode),
            "samp_start" => Some(Self::SampStart),
            "samp_end" => Some(Self::SampEnd),
            "samp_pitch" => Some(Self::SampPitch),
            "va_drift" => Some(Self::VaDrift),
            "va_vintage" => Some(Self::VaVintage),
            "va_brightness" => Some(Self::VaBrightness),
            "va_sub_mode" => Some(Self::VaSubMode),
            "va_sub_level" => Some(Self::VaSubLevel),
            "va_sync" => Some(Self::VaSync),
            "va_pwm" => Some(Self::VaPwm),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Level => "level",
            Self::Tune => "tune",
            Self::Detune => "detune",
            Self::Pan => "pan",
            Self::Waveform => "waveform",
            Self::PulseWidth => "pulse_width",
            Self::EngineType => "engine_type",
            Self::WtFrame => "wt_frame",
            Self::WtMorph => "wt_morph",
            Self::WtScan => "wt_scan",
            Self::WtScanTime => "wt_scan_time",
            Self::WtPreset => "wt_preset",
            Self::FmAlgorithm => "fm_algorithm",
            Self::FmModIndex => "fm_mod_index",
            Self::FmFeedback => "fm_feedback",
            Self::FmOp1Ratio => "fm_op1_ratio",
            Self::FmOp2Ratio => "fm_op2_ratio",
            Self::FmOp3Ratio => "fm_op3_ratio",
            Self::FmOp4Ratio => "fm_op4_ratio",
            Self::FmOp1Level => "fm_op1_level",
            Self::FmOp2Level => "fm_op2_level",
            Self::FmOp3Level => "fm_op3_level",
            Self::FmOp4Level => "fm_op4_level",
            Self::GranSize => "gran_size",
            Self::GranDensity => "gran_density",
            Self::GranPosition => "gran_position",
            Self::GranSpray => "gran_spray",
            Self::GranPitchRandom => "gran_pitch_random",
            Self::GranWindow => "gran_window",
            Self::ModalBody => "modal_body",
            Self::ModalDecay => "modal_decay",
            Self::ModalBrightness => "modal_brightness",
            Self::AddHarmonics => "add_harmonics",
            Self::AddMorph => "add_morph",
            Self::SampMode => "samp_mode",
            Self::SampStart => "samp_start",
            Self::SampEnd => "samp_end",
            Self::SampPitch => "samp_pitch",
            Self::VaDrift => "va_drift",
            Self::VaVintage => "va_vintage",
            Self::VaBrightness => "va_brightness",
            Self::VaSubMode => "va_sub_mode",
            Self::VaSubLevel => "va_sub_level",
            Self::VaSync => "va_sync",
            Self::VaPwm => "va_pwm",
        }
    }
}

#[derive(Clone, Copy)]
enum ParamTarget {
    OscParam { slot: usize, name: OscParamName },
    FilterCutoff,
    FilterResonance,
    FilterDrive,
    FilterEnvAmount,
    AmpAttack,
    AmpDecay,
    AmpSustain,
    AmpRelease,
    FilterEnvAttack,
    FilterEnvDecay,
    FilterEnvSustain,
    FilterEnvRelease,
    LfoRate,
    LfoWaveform,
    LfoMixAmount,
    Osc1Level,
    Osc1Tune,
    Osc1Detune,
    Osc1Pan,
    Osc1Waveform,
    Osc1PulseWidth,
    Osc2Level,
    Osc2Tune,
    Osc2Detune,
    Osc2Pan,
    Osc3Level,
    Osc3Tune,
    Osc3Detune,
    Osc3Pan,
    MasterVolume,
}

impl ParamTarget {
    fn parse(value: &str) -> Option<Self> {
        if let Some(rest) = value.strip_prefix("osc1_") {
            return OscParamName::parse(rest).map(|name| Self::OscParam { slot: 0, name });
        }
        if let Some(rest) = value.strip_prefix("osc2_") {
            return OscParamName::parse(rest).map(|name| Self::OscParam { slot: 1, name });
        }
        if let Some(rest) = value.strip_prefix("osc3_") {
            return OscParamName::parse(rest).map(|name| Self::OscParam { slot: 2, name });
        }
        match value {
            "filter_cutoff" => Some(Self::FilterCutoff),
            "filter_resonance" | "filter_reso" => Some(Self::FilterResonance),
            "filter_drive" => Some(Self::FilterDrive),
            "filter_env_amount" => Some(Self::FilterEnvAmount),
            "amp_attack" => Some(Self::AmpAttack),
            "amp_decay" => Some(Self::AmpDecay),
            "amp_sustain" => Some(Self::AmpSustain),
            "amp_release" => Some(Self::AmpRelease),
            "filter_env_attack" => Some(Self::FilterEnvAttack),
            "filter_env_decay" => Some(Self::FilterEnvDecay),
            "filter_env_sustain" => Some(Self::FilterEnvSustain),
            "filter_env_release" => Some(Self::FilterEnvRelease),
            "lfo_rate" => Some(Self::LfoRate),
            "lfo_waveform" => Some(Self::LfoWaveform),
            "lfo_mix_amount" => Some(Self::LfoMixAmount),
            "osc1_level" => Some(Self::Osc1Level),
            "osc1_tune" => Some(Self::Osc1Tune),
            "osc1_detune" => Some(Self::Osc1Detune),
            "osc1_pan" => Some(Self::Osc1Pan),
            "osc1_waveform" => Some(Self::Osc1Waveform),
            "osc1_pulse_width" => Some(Self::Osc1PulseWidth),
            "osc2_level" => Some(Self::Osc2Level),
            "osc2_tune" => Some(Self::Osc2Tune),
            "osc2_detune" => Some(Self::Osc2Detune),
            "osc2_pan" => Some(Self::Osc2Pan),
            "osc3_level" => Some(Self::Osc3Level),
            "osc3_tune" => Some(Self::Osc3Tune),
            "osc3_detune" => Some(Self::Osc3Detune),
            "osc3_pan" => Some(Self::Osc3Pan),
            "master_volume" | "master_vol" => Some(Self::MasterVolume),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
enum EngineCommand {
    SetParam { target: ParamTarget, value: f32 },
    SetParamById { id: u16, value: f32 },
    NoteOn { note: u8, velocity: f32 },
    NoteOff { note: u8 },
    WindSetEnabled { enabled: bool },
    WindHandleCc { cc: u8, value: u8 },
    WindHandlePitchBend { msb: u8, lsb: u8 },
    WindHandleAftertouch { value: u8 },
}

struct SharedTelemetry {
    active_voices: AtomicU32,
    peak_l: AtomicU32,
    peak_r: AtomicU32,
    rms_l: AtomicU32,
    rms_r: AtomicU32,
    clipping: AtomicBool,
    scope_write_index: AtomicUsize,
    scope_valid_len: AtomicUsize,
    scope_samples: [AtomicU32; SCOPE_CAPTURE_SAMPLES],
}

impl Default for SharedTelemetry {
    fn default() -> Self {
        Self {
            active_voices: AtomicU32::new(0),
            peak_l: AtomicU32::new(0.0f32.to_bits()),
            peak_r: AtomicU32::new(0.0f32.to_bits()),
            rms_l: AtomicU32::new(0.0f32.to_bits()),
            rms_r: AtomicU32::new(0.0f32.to_bits()),
            clipping: AtomicBool::new(false),
            scope_write_index: AtomicUsize::new(0),
            scope_valid_len: AtomicUsize::new(0),
            scope_samples: core::array::from_fn(|_| AtomicU32::new(0.0f32.to_bits())),
        }
    }
}

impl SharedTelemetry {
    fn store(
        &self,
        peak_l: f32,
        peak_r: f32,
        rms_l: f32,
        rms_r: f32,
        clipping: bool,
        active_voices: u8,
        scope_samples: &[f32],
    ) {
        self.active_voices.store(active_voices as u32, Ordering::Relaxed);
        self.peak_l.store(peak_l.to_bits(), Ordering::Relaxed);
        self.peak_r.store(peak_r.to_bits(), Ordering::Relaxed);
        self.rms_l.store(rms_l.to_bits(), Ordering::Relaxed);
        self.rms_r.store(rms_r.to_bits(), Ordering::Relaxed);
        self.clipping.store(clipping, Ordering::Relaxed);

        if !scope_samples.is_empty() {
            let mut write_index = self.scope_write_index.load(Ordering::Relaxed);
            for &sample in scope_samples {
                self.scope_samples[write_index].store(sample.to_bits(), Ordering::Relaxed);
                write_index = (write_index + 1) % SCOPE_CAPTURE_SAMPLES;
            }
            self.scope_write_index.store(write_index, Ordering::Relaxed);

            let valid_len = self.scope_valid_len.load(Ordering::Relaxed);
            self.scope_valid_len
                .store((valid_len + scope_samples.len()).min(SCOPE_CAPTURE_SAMPLES), Ordering::Relaxed);
        }
    }

    fn snapshot(&self) -> TelemetrySnapshot {
        let scope_len = self.scope_valid_len.load(Ordering::Relaxed).min(SCOPE_CAPTURE_SAMPLES);
        let write_index = self.scope_write_index.load(Ordering::Relaxed) % SCOPE_CAPTURE_SAMPLES;
        let mut scope = Vec::with_capacity(scope_len);
        let start_index = if scope_len == SCOPE_CAPTURE_SAMPLES {
            write_index
        } else {
            0
        };

        for offset in 0..scope_len {
            let index = (start_index + offset) % SCOPE_CAPTURE_SAMPLES;
            scope.push(f32::from_bits(self.scope_samples[index].load(Ordering::Relaxed)));
        }

        TelemetrySnapshot {
            meters: MeterSnapshot {
                peak_l: f32::from_bits(self.peak_l.load(Ordering::Relaxed)),
                peak_r: f32::from_bits(self.peak_r.load(Ordering::Relaxed)),
                rms_l: f32::from_bits(self.rms_l.load(Ordering::Relaxed)),
                rms_r: f32::from_bits(self.rms_r.load(Ordering::Relaxed)),
                clipping: self.clipping.load(Ordering::Relaxed),
                active_voices: self.active_voices.load(Ordering::Relaxed) as u8,
            },
            scope: ScopeSnapshot { samples: scope },
        }
    }
}

struct StandaloneRenderer {
    engine: HyperSynthEngine,
    control_queue: Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
    telemetry: Arc<SharedTelemetry>,
    output_pair: usize,
    pending_commands: [EngineCommand; MAX_EVENTS_PER_CALLBACK],
    pending_midi: [MidiEvent; MAX_EVENTS_PER_CALLBACK],
    scratch: [f32; RENDER_CHUNK_FRAMES * ENGINE_CHANNELS],
    scope_scratch: [f32; RENDER_CHUNK_FRAMES],
}

impl StandaloneRenderer {
    fn new(
        sample_rate: f32,
        control_queue: Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
        telemetry: Arc<SharedTelemetry>,
        output_pair: usize,
    ) -> Self {
        Self {
            engine: HyperSynthEngine::new(sample_rate),
            control_queue,
            telemetry,
            output_pair,
            pending_commands: [EngineCommand::NoteOff { note: 0 }; MAX_EVENTS_PER_CALLBACK],
            pending_midi: [MidiEvent::NoteOff { note: 0 }; MAX_EVENTS_PER_CALLBACK],
            scratch: [0.0; RENDER_CHUNK_FRAMES * ENGINE_CHANNELS],
            scope_scratch: [0.0; RENDER_CHUNK_FRAMES],
        }
    }

    fn render<T>(&mut self, output: &mut [T], channels: usize)
    where
        T: SizedSample + FromSample<f32>,
    {
        let frame_count = output.len() / channels.max(1);
        let mut pending_command_count = 0;
        while pending_command_count < self.pending_commands.len() {
            let Some(command) = self.control_queue.pop() else {
                break;
            };

            self.pending_commands[pending_command_count] = command;
            pending_command_count += 1;
        }

        let mut pending_midi_count = 0;
        for index in 0..pending_command_count {
            match self.pending_commands[index] {
                EngineCommand::SetParam { target, value } => apply_param(&mut self.engine, target, value),
                EngineCommand::SetParamById { id, value } => {
                    let _ = self.engine.set_param_by_id(id, value);
                }
                EngineCommand::NoteOn { note, velocity } if pending_midi_count < self.pending_midi.len() => {
                    self.pending_midi[pending_midi_count] = MidiEvent::NoteOn { note, velocity };
                    pending_midi_count += 1;
                }
                EngineCommand::NoteOff { note } if pending_midi_count < self.pending_midi.len() => {
                    self.pending_midi[pending_midi_count] = MidiEvent::NoteOff { note };
                    pending_midi_count += 1;
                }
                EngineCommand::WindSetEnabled { enabled } => self.engine.wind_set_enabled(enabled),
                EngineCommand::WindHandleCc { cc, value } => self.engine.wind_handle_cc(cc, value),
                EngineCommand::WindHandlePitchBend { msb, lsb } => self.engine.wind_handle_pitch_bend(msb, lsb),
                EngineCommand::WindHandleAftertouch { value } => self.engine.wind_handle_aftertouch(value),
                _ => {}
            }
        }

        let mut frame_offset = 0;
        while frame_offset < frame_count {
            let chunk_frames = (frame_count - frame_offset).min(RENDER_CHUNK_FRAMES);
            let scratch_len = chunk_frames * ENGINE_CHANNELS;
            self.engine.process_block(
                &mut self.scratch[..scratch_len],
                &self.pending_midi[..pending_midi_count],
            );

            let mut peak_l: f32 = 0.0;
            let mut peak_r: f32 = 0.0;
            let mut sum_sq_l: f32 = 0.0;
            let mut sum_sq_r: f32 = 0.0;
            let mut clipping = false;

            for chunk_frame in 0..chunk_frames {
                let left = self.scratch[chunk_frame * 2].clamp(-1.0, 1.0);
                let right = self.scratch[chunk_frame * 2 + 1].clamp(-1.0, 1.0);
                let base = (frame_offset + chunk_frame) * channels;

                peak_l = peak_l.max(left.abs());
                peak_r = peak_r.max(right.abs());
                sum_sq_l += left * left;
                sum_sq_r += right * right;
                clipping |= left.abs() >= 0.999 || right.abs() >= 0.999;
                self.scope_scratch[chunk_frame] = (left + right) * 0.5;

                if channels == 1 {
                    output[base] = T::from_sample((left + right) * 0.5);
                    continue;
                }

                for channel in 0..channels {
                    output[base + channel] = T::from_sample(0.0);
                }

                let left_channel = (self.output_pair * 2).min(channels.saturating_sub(2));
                let right_channel = (left_channel + 1).min(channels.saturating_sub(1));
                output[base + left_channel] = T::from_sample(left);
                output[base + right_channel] = T::from_sample(right);
            }

            self.telemetry.store(
                peak_l * 100.0,
                peak_r * 100.0,
                (sum_sq_l / chunk_frames.max(1) as f32).sqrt() * 100.0,
                (sum_sq_r / chunk_frames.max(1) as f32).sqrt() * 100.0,
                clipping,
                self.engine.active_voice_count(),
                &self.scope_scratch[..chunk_frames],
            );

            frame_offset += chunk_frames;
            pending_midi_count = 0;
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AudioHostDescriptor {
    host_id: String,
    label: String,
    is_default: bool,
    available: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AudioDeviceDescriptor {
    device_id: String,
    kind: &'static str,
    label: String,
    group_id: String,
    is_default: bool,
    host_id: String,
    host_name: String,
    max_channels: u16,
    default_sample_rate: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MidiInputDescriptor {
    id: String,
    name: String,
    manufacturer: String,
    state: String,
    connection: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceListing {
    audio_hosts: Vec<AudioHostDescriptor>,
    audio_devices: Vec<AudioDeviceDescriptor>,
    midi_inputs: Vec<MidiInputDescriptor>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackendInfo {
    backend: String,
    driver_model: String,
    requested_sample_rate: u32,
    actual_sample_rate: Option<u32>,
    base_latency_ms: Option<f32>,
    output_latency_ms: Option<f32>,
    output_selection_supported: bool,
    selected_host_id: String,
    selected_host_name: String,
    output_device_id: String,
    output_device_label: String,
    output_channel_pair: u16,
    output_channel_count: u16,
    available_output_pairs: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EngineStatsSnapshot {
    audio_state: String,
    active_voices: u8,
    sample_rate: u32,
    buffer_size: u32,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct MeterSnapshot {
    peak_l: f32,
    peak_r: f32,
    rms_l: f32,
    rms_r: f32,
    clipping: bool,
    active_voices: u8,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ScopeSnapshot {
    samples: Vec<f32>,
}

#[derive(Clone, Default)]
struct TelemetrySnapshot {
    meters: MeterSnapshot,
    scope: ScopeSnapshot,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeSnapshot {
    backend_info: BackendInfo,
    engine_stats: EngineStatsSnapshot,
    meters: MeterSnapshot,
    scope: ScopeSnapshot,
    audio_hosts: Vec<AudioHostDescriptor>,
    audio_devices: Vec<AudioDeviceDescriptor>,
    midi_inputs: Vec<MidiInputDescriptor>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WavetableDisplaySnapshot {
    preset: &'static str,
    source_frame_count: usize,
    display_frame_count: usize,
    frame_size: usize,
    samples: Vec<f32>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum UiCommand {
    SetParam { target: String, value: f32 },
    SetParamById { id: u16, value: f32 },
    NoteOn { note: u8, velocity: f32 },
    NoteOff { note: u8 },
    WindSetEnabled { enabled: bool },
    WindHandleCc { cc: u8, value: u8 },
    WindHandlePitchBend { msb: u8, lsb: u8 },
    WindHandleAftertouch { value: u8 },
}

#[derive(Clone)]
struct SelectedAudioConfig {
    sample_format: SampleFormat,
    stream_config: StreamConfig,
    actual_sample_rate: u32,
    output_channel_count: u16,
    output_channel_pair: u16,
}

fn main() -> Result<()> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let json_output = args.iter().any(|arg| arg == "--json");
    if args.iter().any(|arg| arg == "--list-devices") {
        return list_devices_command(json_output);
    }
    if let Some(index) = args.iter().position(|arg| arg == "--dump-wavetable") {
        let preset_name = args.get(index + 1).map(String::as_str).unwrap_or("basic");
        let display_frame_count = args
            .iter()
            .position(|arg| arg == "--frames")
            .and_then(|frames_index| args.get(frames_index + 1))
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(64);
        return dump_wavetable_command(preset_name, display_frame_count, json_output);
    }

    let requested = RequestedConfig::from_env();
    run_host(requested)
}

fn parse_factory_wavetable(value: &str) -> FactoryWavetable {
    match value.to_ascii_lowercase().as_str() {
        "basic" => FactoryWavetable::Basic,
        "pwm" | "pwm-sweep" | "pwmsweep" => FactoryWavetable::PwmSweep,
        "formant" | "formant-sweep" | "formantsweep" => FactoryWavetable::FormantSweep,
        "digital" => FactoryWavetable::Digital,
        "vocal" => FactoryWavetable::Vocal,
        _ => FactoryWavetable::Basic,
    }
}

fn dump_wavetable_command(preset_name: &str, display_frame_count: usize, json_output: bool) -> Result<()> {
    let preset = parse_factory_wavetable(preset_name);
    let oscillator = WavetableOscillator::with_preset(preset);
    let snapshot = WavetableDisplaySnapshot {
        preset: oscillator.wavetable_name(),
        source_frame_count: oscillator.source_frame_count(),
        display_frame_count,
        frame_size: FRAME_SIZE,
        samples: oscillator.export_display_wavetable(display_frame_count),
    };

    if json_output {
        println!("{}", serde_json::to_string(&snapshot)?);
    } else {
        println!(
            "preset={} source_frames={} display_frames={} frame_size={}",
            snapshot.preset,
            snapshot.source_frame_count,
            snapshot.display_frame_count,
            snapshot.frame_size,
        );
    }

    Ok(())
}

fn run_host(requested: RequestedConfig) -> Result<()> {
    let (audio_hosts, audio_devices) = collect_audio_inventory()?;
    let midi_inputs = collect_midi_inputs()?;

    if !requested.ipc_mode {
        print_human_device_listing(&audio_hosts, &audio_devices, &midi_inputs);
    }

    let control_queue = Arc::new(LockFreeQueue::<EngineCommand, CONTROL_QUEUE_CAPACITY>::new());
    let telemetry = Arc::new(SharedTelemetry::default());

    let _stdin_thread = if requested.ipc_mode {
        Some(spawn_stdin_thread(control_queue.clone()))
    } else {
        None
    };

    let _midi_connection = connect_midi_input(&requested, control_queue.clone())?;

    // Try the requested host first, then fall back to default if it fails.
    let (stream, selected_host_key, selected_host_name, output_device_descriptor, selected_config, fallback_used) =
        open_audio_stream_with_fallback(&requested, &control_queue, &telemetry)?;

    stream.play().context("failed to start audio stream")?;

    let driver_note = if fallback_used {
        format!(
            "CPAL native host: {} (fallback from {}). ASIO was unavailable or failed to open; using shared-mode host instead.",
            selected_host_name,
            requested.audio_host_id.as_deref().unwrap_or("default"),
        )
    } else {
        format!(
            "CPAL native host: {}. Buffer size is requested from the UI and may be negotiated by the active driver.",
            selected_host_name,
        )
    };

    let backend_info = BackendInfo {
        backend: String::from("Native Rust"),
        driver_model: driver_note,
        requested_sample_rate: requested.sample_rate,
        actual_sample_rate: Some(selected_config.actual_sample_rate),
        base_latency_ms: None,
        output_latency_ms: None,
        output_selection_supported: true,
        selected_host_id: selected_host_key.clone(),
        selected_host_name: selected_host_name.clone(),
        output_device_id: output_device_descriptor.device_id.clone(),
        output_device_label: output_device_descriptor.label.clone(),
        output_channel_pair: selected_config.output_channel_pair,
        output_channel_count: selected_config.output_channel_count,
        available_output_pairs: (selected_config.output_channel_count / 2).max(1),
    };

    let runtime_snapshot = RuntimeSnapshot {
        backend_info: backend_info.clone(),
        engine_stats: EngineStatsSnapshot {
            audio_state: String::from("running"),
            active_voices: 0,
            sample_rate: selected_config.actual_sample_rate,
            buffer_size: requested.buffer_size,
        },
        meters: MeterSnapshot::default(),
        scope: ScopeSnapshot::default(),
        audio_hosts,
        audio_devices,
        midi_inputs,
    };

    if requested.ipc_mode {
        emit_runtime_snapshot(&runtime_snapshot)?;
        spawn_status_thread(runtime_snapshot, telemetry)?;
    } else {
        println!(
            "Audio host: {selected_host_name} | output: {} | channels={} | sample_rate={} Hz | buffer={:?} | sample_format={:?} | pair={}/{}",
            output_device_descriptor.label,
            selected_config.stream_config.channels,
            selected_config.stream_config.sample_rate.0,
            selected_config.stream_config.buffer_size,
            selected_config.sample_format,
            selected_config.output_channel_pair * 2 + 1,
            selected_config.output_channel_pair * 2 + 2,
        );
        if requested.midi_enabled && requested.midi_input_id.is_none() {
            println!("MIDI input armed: first available port");
        } else if let Some(midi_input) = &requested.midi_input_id {
            println!("MIDI input armed: {midi_input}");
        } else {
            println!("MIDI input disabled.");
        }
        println!("HyperSynth standalone is running. Press Ctrl+C to stop.");
    }

    loop {
        thread::sleep(Duration::from_secs(1));
    }
}

/// Try to open audio on the requested host. If that fails (e.g. ASIO exclusive lock),
/// fall back to the system default host (typically WASAPI shared mode).
fn open_audio_stream_with_fallback(
    requested: &RequestedConfig,
    control_queue: &Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
    telemetry: &Arc<SharedTelemetry>,
) -> Result<(Stream, String, String, AudioDeviceDescriptor, SelectedAudioConfig, bool)> {
    let primary_result = try_open_audio_stream(
        requested.audio_host_id.as_deref(),
        requested.audio_device_id.as_deref(),
        requested,
        control_queue,
        telemetry,
    );

    match primary_result {
        Ok((stream, host_key, host_name, descriptor, config)) => {
            Ok((stream, host_key, host_name, descriptor, config, false))
        }
        Err(primary_error) => {
            // Only attempt fallback if a non-default host was requested.
            let has_alternate = requested.audio_host_id.as_deref().is_some();
            if !has_alternate {
                return Err(primary_error);
            }

            eprintln!(
                "Requested audio host {:?} failed: {primary_error:#}. Falling back to system default host.",
                requested.audio_host_id.as_deref().unwrap_or("default"),
            );

            let (stream, host_key, host_name, descriptor, config) =
                try_open_audio_stream(None, None, requested, control_queue, telemetry)
                    .context("fallback to default audio host also failed")?;

            Ok((stream, host_key, host_name, descriptor, config, true))
        }
    }
}

fn try_open_audio_stream(
    host_id_override: Option<&str>,
    device_id_override: Option<&str>,
    requested: &RequestedConfig,
    control_queue: &Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
    telemetry: &Arc<SharedTelemetry>,
) -> Result<(Stream, String, String, AudioDeviceDescriptor, SelectedAudioConfig)> {
    let host = select_host(host_id_override)?;
    let host_id = host.id();
    let key = host_key(host_id);
    let name = host_label(host_id);
    let (output_device, descriptor) = select_output_device(&host, host_id, device_id_override)?;
    let config = select_stream_config(&output_device, requested)?;
    let stream = build_output_stream(
        &output_device,
        &config.stream_config,
        config.sample_format,
        Arc::clone(control_queue),
        Arc::clone(telemetry),
        config.output_channel_pair as usize,
    )?;
    Ok((stream, key, name, descriptor, config))
}

fn list_devices_command(json_output: bool) -> Result<()> {
    let (audio_hosts, audio_devices) = collect_audio_inventory()?;
    let snapshot = DeviceListing {
        audio_hosts,
        audio_devices,
        midi_inputs: collect_midi_inputs()?,
    };

    if json_output {
        println!("{}", serde_json::to_string(&snapshot)?);
        return Ok(());
    }

    print_human_device_listing(&snapshot.audio_hosts, &snapshot.audio_devices, &snapshot.midi_inputs);
    Ok(())
}

fn print_human_device_listing(
    audio_hosts: &[AudioHostDescriptor],
    audio_devices: &[AudioDeviceDescriptor],
    midi_inputs: &[MidiInputDescriptor],
) {
    println!("Detected audio hosts:");
    for host in audio_hosts {
        println!("  - {}{}", host.label, if host.is_default { " (default)" } else { "" });
    }

    println!("Detected output devices:");
    for (index, device) in audio_devices.iter().filter(|device| device.kind == "audiooutput").enumerate() {
        println!(
            "  [{index}] {} [{}] ({} ch)",
            device.label,
            device.host_name,
            device.max_channels
        );
    }

    if midi_inputs.is_empty() {
        println!("No MIDI input devices detected.");
    } else {
        println!("Detected MIDI inputs:");
        for (index, device) in midi_inputs.iter().enumerate() {
            println!("  [{index}] {}", device.name);
        }
    }
}

fn collect_audio_inventory() -> Result<(Vec<AudioHostDescriptor>, Vec<AudioDeviceDescriptor>)> {
    let default_host_id = cpal::default_host().id();
    let mut hosts = Vec::new();
    let mut devices = Vec::new();

    for host_id in cpal::available_hosts() {
        let host = cpal::host_from_id(host_id)
            .with_context(|| format!("failed to initialize audio host {}", host_id.name()))?;
        hosts.push(AudioHostDescriptor {
            host_id: host_key(host_id),
            label: host_label(host_id),
            is_default: host_id == default_host_id,
            available: true,
        });
        devices.extend(collect_audio_devices_for_host(&host, host_id)?);
    }

    Ok((hosts, devices))
}

fn collect_audio_devices_for_host(host: &Host, host_id: HostId) -> Result<Vec<AudioDeviceDescriptor>> {
    let default_output_name = host.default_output_device().map(|device| readable_device_name(&device));
    let default_input_name = host.default_input_device().map(|device| readable_device_name(&device));
    let host_id_key = host_key(host_id);
    let host_name = host_label(host_id);
    let mut devices = Vec::new();

    for device in host.output_devices().context("failed to enumerate output devices")? {
        let label = readable_device_name(&device);
        let is_default = default_output_name.as_ref().map(|name| name == &label).unwrap_or(false);
        devices.push(AudioDeviceDescriptor {
            device_id: format!("{}::output::{}", host_id_key, label),
            kind: "audiooutput",
            label,
            group_id: String::new(),
            is_default,
            host_id: host_id_key.clone(),
            host_name: host_name.clone(),
            max_channels: max_output_channels(&device),
            default_sample_rate: default_output_sample_rate(&device),
        });
    }

    for device in host.input_devices().context("failed to enumerate input devices")? {
        let label = readable_device_name(&device);
        let is_default = default_input_name.as_ref().map(|name| name == &label).unwrap_or(false);
        devices.push(AudioDeviceDescriptor {
            device_id: format!("{}::input::{}", host_id_key, label),
            kind: "audioinput",
            label,
            group_id: String::new(),
            is_default,
            host_id: host_id_key.clone(),
            host_name: host_name.clone(),
            max_channels: max_input_channels(&device),
            default_sample_rate: default_input_sample_rate(&device),
        });
    }

    Ok(devices)
}

fn collect_midi_inputs() -> Result<Vec<MidiInputDescriptor>> {
    let midi_input = MidiInput::new("HyperSynth MIDI Scan").context("failed to initialize MIDI input")?;
    let ports = midi_input.ports();
    let mut devices = Vec::with_capacity(ports.len());
    for port in ports {
        let name = midi_input
            .port_name(&port)
            .unwrap_or_else(|_| String::from("Unknown MIDI Input"));
        devices.push(MidiInputDescriptor {
            id: name.clone(),
            name,
            manufacturer: String::from("System MIDI"),
            state: String::from("connected"),
            connection: String::from("closed"),
        });
    }

    Ok(devices)
}

fn select_host(preferred_host_id: Option<&str>) -> Result<Host> {
    if let Some(preferred_host_id) = preferred_host_id {
        for host_id in cpal::available_hosts() {
            let host_key = host_key(host_id);
            if host_key.eq_ignore_ascii_case(preferred_host_id)
                || host_id.name().eq_ignore_ascii_case(preferred_host_id)
            {
                return cpal::host_from_id(host_id)
                    .with_context(|| format!("failed to initialize audio host {preferred_host_id}"));
            }
        }

        bail!("requested audio host not found: {preferred_host_id}");
    }

    Ok(cpal::default_host())
}

fn select_output_device(host: &Host, host_id: HostId, preferred_name: Option<&str>) -> Result<(Device, AudioDeviceDescriptor)> {
    let host_key = host_key(host_id);
    let host_name = host_label(host_id);
    let default_output_name = host.default_output_device().map(|device| readable_device_name(&device));

    if let Some(preferred_name) = preferred_name {
        let preferred_lower = preferred_name.to_ascii_lowercase();
        for device in host.output_devices().context("failed to enumerate output devices")? {
            let descriptor = build_output_device_descriptor(&device, &host_key, &host_name, default_output_name.as_ref());
            if descriptor.device_id.eq_ignore_ascii_case(preferred_name)
                || descriptor.label.to_ascii_lowercase().contains(&preferred_lower)
            {
                return Ok((device, descriptor));
            }
        }

        bail!("requested audio device not found: {preferred_name}");
    }

    let device = host
        .default_output_device()
        .context("no default audio output device is available")?;
    let descriptor = build_output_device_descriptor(&device, &host_key, &host_name, default_output_name.as_ref());
    Ok((device, descriptor))
}

fn select_stream_config(device: &Device, requested: &RequestedConfig) -> Result<SelectedAudioConfig> {
    let required_channels = ((requested.output_pair + 1) * 2).max(2);
    let mut best_match: Option<SelectedAudioConfig> = None;

    if let Ok(supported_configs) = device.supported_output_configs() {
        for config_range in supported_configs {
            if config_range.channels() < required_channels {
                continue;
            }

            let min_sample_rate = config_range.min_sample_rate().0;
            let max_sample_rate = config_range.max_sample_rate().0;
            if requested.sample_rate < min_sample_rate || requested.sample_rate > max_sample_rate {
                continue;
            }

            let mut stream_config = config_range.with_sample_rate(SampleRate(requested.sample_rate)).config();
            stream_config.buffer_size = BufferSize::Fixed(requested.buffer_size);
            let candidate = SelectedAudioConfig {
                sample_format: config_range.sample_format(),
                actual_sample_rate: requested.sample_rate,
                stream_config,
                output_channel_count: config_range.channels(),
                output_channel_pair: requested.output_pair.min((config_range.channels().saturating_sub(2)) / 2),
            };

            let should_replace = best_match
                .as_ref()
                .map(|existing| candidate.output_channel_count < existing.output_channel_count)
                .unwrap_or(true);
            if should_replace {
                best_match = Some(candidate);
            }
        }
    }

    if let Some(selected) = best_match {
        return Ok(selected);
    }

    let default_config = device
        .default_output_config()
        .with_context(|| format!("failed to get default output config for {}", readable_device_name(device)))?;
    let mut stream_config = default_config.config();
    stream_config.buffer_size = BufferSize::Default;

    Ok(SelectedAudioConfig {
        sample_format: default_config.sample_format(),
        actual_sample_rate: stream_config.sample_rate.0,
        stream_config,
        output_channel_count: default_config.channels(),
        output_channel_pair: requested.output_pair.min((default_config.channels().saturating_sub(2)) / 2),
    })
}

fn build_output_stream(
    device: &Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    control_queue: Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
    telemetry: Arc<SharedTelemetry>,
    output_pair: usize,
) -> Result<Stream> {
    match sample_format {
        SampleFormat::I8 => build_typed_output_stream::<i8>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::I16 => build_typed_output_stream::<i16>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::I32 => build_typed_output_stream::<i32>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::I64 => build_typed_output_stream::<i64>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::U8 => build_typed_output_stream::<u8>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::F32 => build_typed_output_stream::<f32>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::U16 => build_typed_output_stream::<u16>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::U32 => build_typed_output_stream::<u32>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::U64 => build_typed_output_stream::<u64>(device, config, control_queue, telemetry, output_pair),
        SampleFormat::F64 => build_typed_output_stream::<f64>(device, config, control_queue, telemetry, output_pair),
        other => bail!("unsupported output sample format: {other:?}"),
    }
}

fn build_typed_output_stream<T>(
    device: &Device,
    config: &StreamConfig,
    control_queue: Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
    telemetry: Arc<SharedTelemetry>,
    output_pair: usize,
) -> Result<Stream>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    let primary_queue = Arc::clone(&control_queue);
    let primary_telemetry = Arc::clone(&telemetry);
    let mut primary_renderer = StandaloneRenderer::new(
        config.sample_rate.0 as f32,
        primary_queue,
        primary_telemetry,
        output_pair,
    );

    match device.build_output_stream(
        config,
        move |data: &mut [T], _| primary_renderer.render(data, channels),
        |error| eprintln!("Audio stream error: {error}"),
        None,
    ) {
        Ok(stream) => Ok(stream),
        Err(_) if matches!(config.buffer_size, BufferSize::Fixed(_)) => {
            let mut fallback_config = config.clone();
            fallback_config.buffer_size = BufferSize::Default;
            let fallback_queue = Arc::clone(&control_queue);
            let fallback_telemetry = Arc::clone(&telemetry);
            let mut fallback_renderer = StandaloneRenderer::new(
                fallback_config.sample_rate.0 as f32,
                fallback_queue,
                fallback_telemetry,
                output_pair,
            );

            device
                .build_output_stream(
                    &fallback_config,
                    move |data: &mut [T], _| fallback_renderer.render(data, channels),
                    |error| eprintln!("Audio stream error: {error}"),
                    None,
                )
                .context("failed to build output stream")
        }
        Err(error) => Err(error).context("failed to build output stream"),
    }
}

fn connect_midi_input(
    requested: &RequestedConfig,
    control_queue: Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
) -> Result<Option<MidiInputConnection<()>>> {
    if !requested.midi_enabled {
        return Ok(None);
    }

    let mut midi_input = MidiInput::new("HyperSynth Standalone MIDI")
        .context("failed to initialize MIDI input")?;
    midi_input.ignore(Ignore::None);

    let ports = midi_input.ports();
    if ports.is_empty() {
        return Ok(None);
    }

    let selected_port = select_midi_port(&midi_input, &ports, requested.midi_input_id.as_deref())?;
    let selected_name = midi_input
        .port_name(&selected_port)
        .unwrap_or_else(|_| String::from("<unavailable name>"));
    let queue_for_callback = control_queue;
    let midi_channel = requested.midi_channel;

    let connection = midi_input
        .connect(
            &selected_port,
            "hypersynth-midi-input",
            move |_, message, _| {
                if let Some(command) = translate_midi_message(message, midi_channel) {
                    let _ = queue_for_callback.push(command);
                }
            },
            (),
        )
        .with_context(|| format!("failed to connect MIDI input {selected_name}"))?;

    Ok(Some(connection))
}

fn select_midi_port(
    midi_input: &MidiInput,
    ports: &[MidiInputPort],
    preferred_name: Option<&str>,
) -> Result<MidiInputPort> {
    if let Some(preferred_name) = preferred_name {
        let preferred_lower = preferred_name.to_ascii_lowercase();
        for port in ports {
            let port_name = midi_input
                .port_name(port)
                .unwrap_or_else(|_| String::from("<unavailable name>"));
            if port_name.to_ascii_lowercase().contains(&preferred_lower) {
                return Ok(port.clone());
            }
        }

        bail!("requested MIDI input not found: {preferred_name}");
    }

    Ok(ports[0].clone())
}

fn translate_midi_message(message: &[u8], midi_channel: Option<u8>) -> Option<EngineCommand> {
    if message.len() < 3 {
        return None;
    }

    let status = message[0];
    let message_type = status & 0xF0;
    let channel = (status & 0x0F) + 1;
    if midi_channel.is_some() && midi_channel != Some(channel) {
        return None;
    }

    let note = message[1];
    let value = message[2];

    match message_type {
        0x90 if value > 0 => Some(EngineCommand::NoteOn {
            note,
            velocity: value as f32 / 127.0,
        }),
        0x80 | 0x90 => Some(EngineCommand::NoteOff { note }),
        _ => None,
    }
}

fn spawn_stdin_thread(
    control_queue: Arc<LockFreeQueue<EngineCommand, CONTROL_QUEUE_CAPACITY>>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let stdin = io::stdin();
        let reader = BufReader::new(stdin.lock());

        for line in reader.lines() {
            let Ok(line) = line else {
                break;
            };

            if line.trim().is_empty() {
                continue;
            }

            let Ok(command) = serde_json::from_str::<UiCommand>(&line) else {
                continue;
            };

            let mapped = match command {
                UiCommand::SetParam { target, value } => ParamTarget::parse(&target)
                    .map(|target| EngineCommand::SetParam { target, value }),
                UiCommand::SetParamById { id, value } => Some(EngineCommand::SetParamById { id, value }),
                UiCommand::NoteOn { note, velocity } => Some(EngineCommand::NoteOn { note, velocity }),
                UiCommand::NoteOff { note } => Some(EngineCommand::NoteOff { note }),
                UiCommand::WindSetEnabled { enabled } => Some(EngineCommand::WindSetEnabled { enabled }),
                UiCommand::WindHandleCc { cc, value } => Some(EngineCommand::WindHandleCc { cc, value }),
                UiCommand::WindHandlePitchBend { msb, lsb } => Some(EngineCommand::WindHandlePitchBend { msb, lsb }),
                UiCommand::WindHandleAftertouch { value } => Some(EngineCommand::WindHandleAftertouch { value }),
            };

            if let Some(mapped) = mapped {
                let _ = control_queue.push(mapped);
            }
        }
    })
}

fn spawn_status_thread(
    snapshot_template: RuntimeSnapshot,
    telemetry: Arc<SharedTelemetry>,
) -> Result<thread::JoinHandle<()>> {
    let stdout = io::stdout();
    let handle = thread::spawn(move || {
        let mut writer = stdout.lock();
        loop {
            let telemetry_snapshot = telemetry.snapshot();
            let snapshot = RuntimeSnapshot {
                engine_stats: EngineStatsSnapshot {
                    active_voices: telemetry_snapshot.meters.active_voices,
                    ..snapshot_template.engine_stats.clone()
                },
                meters: telemetry_snapshot.meters,
                scope: telemetry_snapshot.scope,
                ..snapshot_template.clone()
            };

            if serde_json::to_writer(&mut writer, &snapshot).is_err() {
                break;
            }
            if writer.write_all(b"\n").is_err() || writer.flush().is_err() {
                break;
            }

            thread::sleep(Duration::from_millis(STATUS_INTERVAL_MS));
        }
    });

    Ok(handle)
}

fn emit_runtime_snapshot(snapshot: &RuntimeSnapshot) -> Result<()> {
    println!("{}", serde_json::to_string(snapshot)?);
    Ok(())
}

fn apply_param(engine: &mut HyperSynthEngine, target: ParamTarget, value: f32) {
    match target {
        ParamTarget::OscParam { slot, name } => {
            let _ = engine.params.set_osc_string_param(slot, name.as_str(), value);
        }
        ParamTarget::FilterCutoff => engine.params.filter_cutoff = value,
        ParamTarget::FilterResonance => engine.params.filter_resonance = value,
        ParamTarget::FilterDrive => engine.params.filter_drive = value,
        ParamTarget::FilterEnvAmount => engine.params.filter_env_amount = value,
        ParamTarget::AmpAttack => engine.params.amp_attack = value,
        ParamTarget::AmpDecay => engine.params.amp_decay = value,
        ParamTarget::AmpSustain => engine.params.amp_sustain = value,
        ParamTarget::AmpRelease => engine.params.amp_release = value,
        ParamTarget::FilterEnvAttack => engine.params.filter_env_attack = value,
        ParamTarget::FilterEnvDecay => engine.params.filter_env_decay = value,
        ParamTarget::FilterEnvSustain => engine.params.filter_env_sustain = value,
        ParamTarget::FilterEnvRelease => engine.params.filter_env_release = value,
        ParamTarget::LfoRate => engine.set_lfo_rate(value),
        ParamTarget::LfoWaveform => engine.set_lfo_waveform_index(value as u8),
        ParamTarget::LfoMixAmount => engine.params.lfo_mix_amount = value,
        ParamTarget::Osc1Level => engine.params.osc1_level = value,
        ParamTarget::Osc1Tune => engine.params.osc1_tune = value,
        ParamTarget::Osc1Detune => engine.params.osc1_detune = value,
        ParamTarget::Osc1Pan => engine.params.osc1_pan = value,
        ParamTarget::Osc1Waveform => engine.params.osc1_waveform = value as u8,
        ParamTarget::Osc1PulseWidth => engine.params.osc1_pulse_width = value,
        ParamTarget::Osc2Level => engine.params.osc2_level = value,
        ParamTarget::Osc2Tune => engine.params.osc2_tune = value,
        ParamTarget::Osc2Detune => engine.params.osc2_detune = value,
        ParamTarget::Osc2Pan => engine.params.osc2_pan = value,
        ParamTarget::Osc3Level => engine.params.osc3_level = value,
        ParamTarget::Osc3Tune => engine.params.osc3_tune = value,
        ParamTarget::Osc3Detune => engine.params.osc3_detune = value,
        ParamTarget::Osc3Pan => engine.params.osc3_pan = value,
        ParamTarget::MasterVolume => engine.params.master_volume = value,
    }
}

fn readable_device_name(device: &Device) -> String {
    device
        .name()
        .unwrap_or_else(|_| String::from("<unavailable name>"))
}

fn host_key(host_id: HostId) -> String {
    host_id.name().to_ascii_lowercase()
}

fn host_label(host_id: HostId) -> String {
    host_id.name().to_string()
}

fn max_output_channels(device: &Device) -> u16 {
    device
        .supported_output_configs()
        .ok()
        .and_then(|configs| configs.map(|config| config.channels()).max())
        .or_else(|| device.default_output_config().ok().map(|config| config.channels()))
        .unwrap_or(2)
}

fn max_input_channels(device: &Device) -> u16 {
    device
        .supported_input_configs()
        .ok()
        .and_then(|configs| configs.map(|config| config.channels()).max())
        .or_else(|| device.default_input_config().ok().map(|config| config.channels()))
        .unwrap_or(0)
}

fn default_output_sample_rate(device: &Device) -> Option<u32> {
    device.default_output_config().ok().map(|config| config.sample_rate().0)
}

fn default_input_sample_rate(device: &Device) -> Option<u32> {
    device.default_input_config().ok().map(|config| config.sample_rate().0)
}

fn build_output_device_descriptor(
    device: &Device,
    host_id: &str,
    host_name: &str,
    default_output_name: Option<&String>,
) -> AudioDeviceDescriptor {
    let label = readable_device_name(device);
    AudioDeviceDescriptor {
        device_id: format!("{}::output::{}", host_id, label),
        kind: "audiooutput",
        label: label.clone(),
        group_id: String::new(),
        is_default: default_output_name.map(|name| name == &label).unwrap_or(false),
        host_id: host_id.to_string(),
        host_name: host_name.to_string(),
        max_channels: max_output_channels(device),
        default_sample_rate: default_output_sample_rate(device),
    }
}