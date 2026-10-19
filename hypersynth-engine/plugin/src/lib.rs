use std::num::NonZeroU32;
use std::sync::Arc;

use hypersynth_engine::{HyperSynthEngine, MidiEvent};
use nih_plug::prelude::*;

const MAX_EVENTS_PER_BLOCK: usize = 128;

struct HyperSynthPlugin {
    params: Arc<HyperSynthParams>,
    engine: HyperSynthEngine,
    pending_events: [MidiEvent; MAX_EVENTS_PER_BLOCK],
    pending_event_count: usize,
    scratch: Vec<f32>,
}

#[derive(Params)]
struct HyperSynthParams {
    #[id = "filter_cutoff"]
    filter_cutoff: FloatParam,

    #[id = "filter_reso"]
    filter_resonance: FloatParam,

    #[id = "master_vol"]
    master_volume: FloatParam,
}

impl Default for HyperSynthParams {
    fn default() -> Self {
        Self {
            filter_cutoff: FloatParam::new(
                "Filter Cutoff",
                12_000.0,
                FloatRange::Skewed {
                    min: 20.0,
                    max: 20_000.0,
                    factor: FloatRange::skew_factor(-2.5),
                },
            ),
            filter_resonance: FloatParam::new(
                "Filter Resonance",
                0.2,
                FloatRange::Linear { min: 0.0, max: 1.0 },
            ),
            master_volume: FloatParam::new(
                "Master Volume",
                0.8,
                FloatRange::Linear { min: 0.0, max: 1.0 },
            ),
        }
    }
}

impl Default for HyperSynthPlugin {
    fn default() -> Self {
        Self {
            params: Arc::new(HyperSynthParams::default()),
            engine: HyperSynthEngine::new(48_000.0),
            pending_events: [MidiEvent::NoteOff { note: 0 }; MAX_EVENTS_PER_BLOCK],
            pending_event_count: 0,
            scratch: Vec::new(),
        }
    }
}

impl Plugin for HyperSynthPlugin {
    const NAME: &'static str = "HYPERSYNTH";
    const VENDOR: &'static str = "YourName";
    const URL: &'static str = "https://example.com";
    const EMAIL: &'static str = "support@example.com";
    const VERSION: &'static str = "0.1.0";

    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[AudioIOLayout {
        main_input_channels: None,
        main_output_channels: Some(unsafe { NonZeroU32::new_unchecked(2) }),
        aux_input_ports: &[],
        aux_output_ports: &[],
        names: PortNames::const_default(),
    }];

    const MIDI_INPUT: MidiConfig = MidiConfig::Basic;

    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> {
        self.params.clone()
    }

    fn initialize(
        &mut self,
        _audio_io_layout: &AudioIOLayout,
        buffer_config: &BufferConfig,
        _context: &mut impl InitContext<Self>,
    ) -> bool {
        self.engine = HyperSynthEngine::new(buffer_config.sample_rate as f32);
        self.scratch
            .resize(buffer_config.max_buffer_size as usize * 2, 0.0);
        true
    }

    fn reset(&mut self) {
        self.engine = HyperSynthEngine::new(48_000.0);
    }

    fn process(
        &mut self,
        buffer: &mut Buffer,
        _aux: &mut AuxiliaryBuffers,
        context: &mut impl ProcessContext<Self>,
    ) -> ProcessStatus {
        self.pending_event_count = 0;
        while let Some(event) = context.next_event() {
            if self.pending_event_count >= self.pending_events.len() {
                break;
            }

            let translated = match event {
                NoteEvent::NoteOn { note, velocity, .. } => {
                    Some(MidiEvent::NoteOn { note, velocity })
                }
                NoteEvent::NoteOff { note, .. } => Some(MidiEvent::NoteOff { note }),
                _ => None,
            };

            if let Some(midi_event) = translated {
                self.pending_events[self.pending_event_count] = midi_event;
                self.pending_event_count += 1;
            }
        }

        self.engine.params.filter_cutoff = self.params.filter_cutoff.value();
        self.engine.params.filter_resonance = self.params.filter_resonance.value();
        self.engine.params.master_volume = self.params.master_volume.value();

        let sample_frames = buffer.samples();
        let scratch_len = sample_frames * 2;
        self.engine
            .process_block(&mut self.scratch[..scratch_len], &self.pending_events[..self.pending_event_count]);

        for (sample_index, mut channel_samples) in buffer.iter_samples().enumerate() {
            for (channel_index, sample) in channel_samples.iter_mut().enumerate() {
                let scratch_index = sample_index * 2 + channel_index.min(1);
                *sample = self.scratch[scratch_index];
            }
        }

        ProcessStatus::Normal
    }
}

impl ClapPlugin for HyperSynthPlugin {
    const CLAP_ID: &'static str = "com.yourname.hypersynth";
    const CLAP_DESCRIPTION: Option<&'static str> = Some("HYPERSYNTH virtual instrument");
    const CLAP_MANUAL_URL: Option<&'static str> = Some(Self::URL);
    const CLAP_SUPPORT_URL: Option<&'static str> = Some(Self::URL);
    const CLAP_FEATURES: &'static [ClapFeature] = &[ClapFeature::Instrument, ClapFeature::Synthesizer];
}

impl Vst3Plugin for HyperSynthPlugin {
    const VST3_CLASS_ID: [u8; 16] = *b"HyperSynth000001";
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] =
        &[Vst3SubCategory::Instrument, Vst3SubCategory::Synth];
}

nih_export_clap!(HyperSynthPlugin);
nih_export_vst3!(HyperSynthPlugin);