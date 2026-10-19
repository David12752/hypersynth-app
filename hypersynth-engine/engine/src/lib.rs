#![cfg_attr(not(test), no_std)]

extern crate alloc;

#[cfg(test)]
extern crate std;

pub mod filters;
pub mod modulation;
pub mod oscillators;
pub mod params;
pub mod smoothing;
pub mod virtual_analog;
pub mod voice;
pub mod wind;

use alloc::string::String;
use alloc::vec::Vec;
use core::cell::UnsafeCell;
use core::mem::MaybeUninit;
use core::sync::atomic::{AtomicUsize, Ordering};

use crate::smoothing::SmoothedParam;
use crate::wind::WindControllerProcessor;
use crate::wind::note_manager::NoteEvent;

/// Smoothed versions of the most-critical audio-rate params (5 ms glide).
/// All other params take effect on the next block (no zipper noise at typical UI rates).
struct SmoothedAudioParams {
    filter_cutoff: SmoothedParam,
    master_volume: SmoothedParam,
    filter_resonance: SmoothedParam,
}

impl SmoothedAudioParams {
    fn new(sample_rate: f32) -> Self {
        Self {
            filter_cutoff: SmoothedParam::new(12_000.0, 5.0, sample_rate),
            master_volume: SmoothedParam::new(0.8, 5.0, sample_rate),
            filter_resonance: SmoothedParam::new(0.2, 5.0, sample_rate),
        }
    }
}

pub use filters::{FilterModel, LadderFilter, StateVariableFilter, SvfMode, AnalogLadder, TptLadderFilter};
pub use modulation::{AdsrEnvelope, EnvelopeStage, Lfo, LfoWaveform};
pub use oscillators::{OscillatorEngine, VaOscillator, VaWaveform, WavetableOscillator,
    CircuitOscillator, CircuitWaveform, TptVco, TptWaveform};
pub use params::{EngineParams, OscEngineType, OscExtraParams, ParamCurve, ParamDescriptor, ParamId, ParamUnit};
pub use voice::Voice;

const POLYPHONY: usize = 8;
const NUM_LFOS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MidiEvent {
    NoteOn { note: u8, velocity: f32 },
    NoteOff { note: u8 },
}

pub enum EngineMessage {
    ParamChange { target: String, value: f32 },
    NoteOn { note: u8, velocity: f32 },
    NoteOff { note: u8 },
    PresetLoad(Vec<u8>),
}

pub struct HyperSynthEngine {
    voices: [Voice; POLYPHONY],
    lfos: [Lfo; NUM_LFOS],
    sample_rate: f32,
    pub params: EngineParams,
    smooth: SmoothedAudioParams,
    /// Wind controller mono processing layer (disabled by default).
    pub wind: WindControllerProcessor,
    /// Previous wind gate state — used to fire note_off when breath drops below threshold.
    prev_wind_gate: bool,
}

impl HyperSynthEngine {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            voices: core::array::from_fn(|_| Voice::new(sample_rate)),
            lfos: core::array::from_fn(|index| Lfo::with_seed(0x1A2B_3C40 + index as u32)),
            sample_rate,
            params: EngineParams::default(),
            smooth: SmoothedAudioParams::new(sample_rate),
            wind: WindControllerProcessor::new(sample_rate),
            prev_wind_gate: false,
        }
    }

    pub fn process_block(&mut self, output: &mut [f32], midi_events: &[MidiEvent]) {
        for sample in output.iter_mut() {
            *sample = 0.0;
        }

        // Wind mode intercepts MIDI; poly mode uses the old direct path.
        self.wind.reset_block();
        for event in midi_events {
            match *event {
                MidiEvent::NoteOn { note, velocity } => {
                    if self.wind.enabled {
                        // Route through wind note manager (mono/legato).
                        self.wind.handle_note_on(note, (velocity * 127.0) as u8);
                    } else {
                        let index = self.allocate_voice(note);
                        self.voices[index].note_on(note, velocity, self.sample_rate);
                    }
                }
                MidiEvent::NoteOff { note } => {
                    if self.wind.enabled {
                        self.wind.handle_note_off(note);
                    } else {
                        for voice in self.voices.iter_mut() {
                            if voice.active && voice.note == note {
                                voice.note_off();
                            }
                        }
                    }
                }
            }
        }

        self.sync_params_to_voices();

        // Count active voices for proper gain normalization
        let active_count = self.voices.iter().filter(|v| v.active).count().max(1);

        for frame in output.chunks_exact_mut(2) {
            // --- Wind processor (parallel modulation path) ---
            let wind_out = self.wind.process_sample();

            // Apply sample-accurate note events from the wind note manager.
            for i in 0..wind_out.note_event_count {
                if let Some(tev) = wind_out.note_events[i] {
                    match tev.event {
                        NoteEvent::NewNote { note, velocity } => {
                            // Mono mode: silence all active voices before triggering new one.
                            for v in self.voices.iter_mut() {
                                if v.active { v.note_off(); }
                            }
                            let idx = self.allocate_voice(note);
                            self.voices[idx].note_on(
                                note,
                                velocity as f32 / 127.0,
                                self.sample_rate,
                            );
                        }
                        NoteEvent::LegatoSlide { to_note, .. } => {
                            for v in self.voices.iter_mut() {
                                if v.active { v.slide_to(to_note); }
                            }
                        }
                        NoteEvent::AllNotesOff => {
                            for v in self.voices.iter_mut() {
                                if v.active { v.note_off(); }
                            }
                        }
                    }
                }
            }

            // Advance smoothers one sample
            let smooth_cutoff = self.smooth.filter_cutoff.next();
            let smooth_vol = self.smooth.master_volume.next();
            let lfo0_out = self.lfos[0].process(self.sample_rate);
            for lfo in self.lfos[1..].iter_mut() {
                let _ = lfo.process(self.sample_rate);
            }

            // Wind: apply pitch (portamento + vibrato + bend) per-sample.
            if self.wind.enabled {
                for v in self.voices.iter_mut() {
                    if v.active {
                        v.set_pitch_semitones(wind_out.pitch);
                    }
                }
            }

            // Wind gate: when breath drops below threshold, begin release on all voices.
            if self.wind.enabled && !wind_out.gate && self.prev_wind_gate {
                for v in self.voices.iter_mut() {
                    if v.active {
                        v.note_off();
                    }
                }
            }
            self.prev_wind_gate = wind_out.gate;

            // Soft gain normalization: sounds full with 1 voice, scales gently with more
            let divisor = 1.0 + (active_count as f32 - 1.0) * 0.7;

            // LFO 0 modulates filter cutoff; wind adds an additive Hz offset on top.
            let wind_cutoff_hz = wind_out.filter_cutoff_mod * 18_000.0;
            let mod_cutoff = (smooth_cutoff
                * (1.0 + lfo0_out * self.params.lfo_mix_amount)
                + wind_cutoff_hz)
                .clamp(20.0, 20_000.0);

            // Wind amplitude multiplier (1.0 when wind is disabled → neutral).
            // When gate is closed the breath router outputs amplitude=0 already,
            // but we keep the 0-gate path explicit for voices in release phase.
            let wind_amp = if self.wind.enabled { wind_out.amplitude } else { 1.0 };

            let mut mixed_l = 0.0;
            let mut mixed_r = 0.0;
            for voice in self.voices.iter_mut() {
                if voice.active {
                    voice.set_lfo_cutoff_override(mod_cutoff, self.sample_rate);
                    // Wind resonance offset (parallel modulation path, Amendment 7).
                    if self.wind.enabled && wind_out.filter_resonance_mod > 0.0 {
                        voice.add_wind_resonance(wind_out.filter_resonance_mod);
                    }
                    let (left, right) = voice.process(self.sample_rate);
                    mixed_l += left * wind_amp;
                    mixed_r += right * wind_amp;
                }
            }

            let gain = smooth_vol / divisor;
            frame[0] = mixed_l * gain;
            frame[1] = mixed_r * gain;
        }
    }

    fn allocate_voice(&mut self, _note: u8) -> usize {
        if let Some(index) = self.voices.iter().position(|voice| !voice.active) {
            return index;
        }

        self.voices
            .iter()
            .enumerate()
            .max_by_key(|(_, voice)| voice.age_samples)
            .map(|(index, _)| index)
            .unwrap_or(0)
    }

    fn sync_params_to_voices(&mut self) {
        self.params.clamp();
        // Push new targets to smoothers (glide happens per-sample in process_block)
        self.smooth.filter_cutoff.set(self.params.filter_cutoff);
        self.smooth.master_volume.set(self.params.master_volume);
        self.smooth.filter_resonance.set(self.params.filter_resonance);
        for voice in self.voices.iter_mut() {
            voice.set_filter_type(self.params.filter_type);
            voice.set_filter_params(
                self.params.filter_cutoff,
                self.params.filter_resonance,
                self.params.filter_drive,
                self.params.filter_env_amount,
                self.sample_rate,
            );
            for slot_index in 0..3 {
                voice.set_osc_params(
                    slot_index,
                    self.params.osc_level(slot_index),
                    self.params.osc_tune(slot_index),
                    self.params.osc_detune(slot_index),
                    self.params.osc_pan(slot_index),
                    self.params.osc_waveform(slot_index),
                    self.params.osc_pulse_width(slot_index),
                    self.params.osc_extra(slot_index),
                );
            }
            // Sync amp envelope defaults (already-playing voices keep current stage,
            // but time constants update immediately so next note uses new values)
            voice.amp_env.set_attack(self.params.amp_attack);
            voice.amp_env.set_decay(self.params.amp_decay);
            voice.amp_env.set_sustain(self.params.amp_sustain);
            voice.amp_env.set_release(self.params.amp_release);
            // Sync filter envelope defaults
            voice.filter_env.set_attack(self.params.filter_env_attack);
            voice.filter_env.set_decay(self.params.filter_env_decay);
            voice.filter_env.set_sustain(self.params.filter_env_sustain);
            voice.filter_env.set_release(self.params.filter_env_release);
        }
    }

    pub fn active_voice_count(&self) -> u8 {
        self.voices.iter().filter(|v| v.active).count() as u8
    }

    // ---- Wind controller public API (for WASM bridge) --------------------

    /// Enable or disable the wind controller processing layer.
    pub fn wind_set_enabled(&mut self, enabled: bool) {
        self.wind.enabled = enabled;
    }

    /// Forward a MIDI CC to the wind processor (breath, bite, growl, flutter).
    pub fn wind_handle_cc(&mut self, cc: u8, value: u8) {
        self.wind.handle_cc(cc, value);
    }

    /// Forward a 14-bit pitch-bend message to the wind processor.
    pub fn wind_handle_pitch_bend(&mut self, msb: u8, lsb: u8) {
        self.wind.handle_pitch_bend(msb, lsb);
    }

    /// Forward channel aftertouch (bite pressure) to the wind processor.
    pub fn wind_handle_aftertouch(&mut self, value: u8) {
        self.wind.handle_aftertouch(value);
    }

    /// Update the custom breath response curve (128 normalized f32 values).
    pub fn wind_set_custom_curve(&mut self, table: &[f32; 128]) {
        self.wind.set_custom_curve(table);
    }

    /// Set a parameter by its stable numeric `ParamId`.
    /// This is the preferred API for WASM — no string allocation.
    /// Returns `false` if the id is unknown.
    pub fn set_param_by_id(&mut self, id: u16, value: f32) -> bool {
        // Wind params (500+) bypass EngineParams and go directly to wind processor.
        if id >= 500 {
            return self.wind.set_param_by_raw_id(id, value);
        }

        use crate::params::ParamId;
        let Some(param_id) = ParamId::try_from_u16(id) else { return false };

        // LFO params need special handling (stored in LFO array, not EngineParams)
        match param_id {
            ParamId::Lfo1Rate => {
                self.set_lfo_rate(value);
                return true;
            }
            ParamId::Lfo1Waveform => {
                self.set_lfo_waveform_index(value as u8);
                return true;
            }
            _ => {}
        }

        self.params.set_by_id(param_id, value)
    }

    pub fn set_lfo_rate(&mut self, value: f32) {
        for lfo in self.lfos.iter_mut() {
            lfo.set_rate(value);
        }
    }

    pub fn set_lfo_waveform_index(&mut self, value: u8) {
        let waveform = match value {
            0 => LfoWaveform::Sine,
            1 => LfoWaveform::Triangle,
            2 => LfoWaveform::Sawtooth,
            3 => LfoWaveform::Square,
            _ => LfoWaveform::SampleAndHold,
        };

        for lfo in self.lfos.iter_mut() {
            lfo.set_waveform(waveform);
        }
    }

    pub fn handle_message(&mut self, msg: EngineMessage) {
        match msg {
            EngineMessage::ParamChange { target, value } => match target.as_str() {
                "filter_cutoff" => self.params.filter_cutoff = value,
                "filter_resonance" | "filter_reso" => self.params.filter_resonance = value,
                "filter_drive" => self.params.filter_drive = value,
                "filter_type" => self.params.filter_type = (value as u8).min(3),
                "master_volume" | "master_vol" => self.params.master_volume = value,
                "filter_env_amount" => self.params.filter_env_amount = value,
                "lfo_mix_amount" => self.params.lfo_mix_amount = value.clamp(0.0, 1.0),
                "lfo_rate" => {
                    for lfo in self.lfos.iter_mut() {
                        lfo.set_rate(value);
                    }
                }
                "lfo_waveform" => {
                    let wf = match value as u8 {
                        0 => LfoWaveform::Sine,
                        1 => LfoWaveform::Triangle,
                        2 => LfoWaveform::Sawtooth,
                        3 => LfoWaveform::Square,
                        _ => LfoWaveform::SampleAndHold,
                    };
                    for lfo in self.lfos.iter_mut() {
                        lfo.set_waveform(wf);
                    }
                }
                // Amplitude envelope parameters — stored in params, synced to voices each block
                "amp_attack" => self.params.amp_attack = value,
                "amp_decay" => self.params.amp_decay = value,
                "amp_sustain" => self.params.amp_sustain = value,
                "amp_release" => self.params.amp_release = value,
                // Filter envelope parameters
                "filter_env_attack" => self.params.filter_env_attack = value,
                "filter_env_decay" => self.params.filter_env_decay = value,
                "filter_env_sustain" => self.params.filter_env_sustain = value,
                "filter_env_release" => self.params.filter_env_release = value,
                _ => {
                    if let Some(rest) = target.strip_prefix("osc1_") {
                        let _ = self.params.set_osc_string_param(0, rest, value);
                    } else if let Some(rest) = target.strip_prefix("osc2_") {
                        let _ = self.params.set_osc_string_param(1, rest, value);
                    } else if let Some(rest) = target.strip_prefix("osc3_") {
                        let _ = self.params.set_osc_string_param(2, rest, value);
                    }
                }
            },
            EngineMessage::NoteOn { note, velocity } => {
                let index = self.allocate_voice(note);
                self.voices[index].note_on(note, velocity, self.sample_rate);
            }
            EngineMessage::NoteOff { note } => {
                for voice in self.voices.iter_mut() {
                    if voice.active && voice.note == note {
                        voice.note_off();
                    }
                }
            }
            EngineMessage::PresetLoad(_) => {}
        }
    }
}

pub struct LockFreeQueue<T, const N: usize> {
    buffer: UnsafeCell<[MaybeUninit<T>; N]>,
    read_idx: AtomicUsize,
    write_idx: AtomicUsize,
}

unsafe impl<T: Send, const N: usize> Send for LockFreeQueue<T, N> {}
unsafe impl<T: Send, const N: usize> Sync for LockFreeQueue<T, N> {}

impl<T, const N: usize> LockFreeQueue<T, N> {
    pub fn new() -> Self {
        assert!(N > 1, "queue capacity must be greater than 1");
        Self {
            buffer: UnsafeCell::new(unsafe { MaybeUninit::uninit().assume_init() }),
            read_idx: AtomicUsize::new(0),
            write_idx: AtomicUsize::new(0),
        }
    }

    #[inline]
    fn next_index(index: usize) -> usize {
        if index + 1 == N {
            0
        } else {
            index + 1
        }
    }

    pub fn push(&self, value: T) -> Result<(), T> {
        let write = self.write_idx.load(Ordering::Relaxed);
        let next = Self::next_index(write);
        let read = self.read_idx.load(Ordering::Acquire);

        if next == read {
            return Err(value);
        }

        unsafe {
            let buffer = &mut *self.buffer.get();
            buffer[write].write(value);
        }
        self.write_idx.store(next, Ordering::Release);
        Ok(())
    }

    pub fn pop(&self) -> Option<T> {
        let read = self.read_idx.load(Ordering::Relaxed);
        let write = self.write_idx.load(Ordering::Acquire);
        if read == write {
            return None;
        }

        let value = unsafe {
            let buffer = &mut *self.buffer.get();
            buffer[read].assume_init_read()
        };

        self.read_idx
            .store(Self::next_index(read), Ordering::Release);
        Some(value)
    }

    pub fn is_empty(&self) -> bool {
        self.read_idx.load(Ordering::Acquire) == self.write_idx.load(Ordering::Acquire)
    }
}

impl<T, const N: usize> Default for LockFreeQueue<T, N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T, const N: usize> Drop for LockFreeQueue<T, N> {
    fn drop(&mut self) {
        while self.pop().is_some() {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::LadderFilter;
    use crate::modulation::{AdsrEnvelope, Lfo, LfoWaveform};
    use crate::oscillators::{OscillatorEngine, VaOscillator, VaWaveform};
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::cell::Cell;

    struct CountingAllocator;

    thread_local! {
        static COUNT_ENABLED: Cell<bool> = const { Cell::new(false) };
        static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
    }

    unsafe impl GlobalAlloc for CountingAllocator {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            COUNT_ENABLED.with(|enabled| {
                if enabled.get() {
                    ALLOCATIONS.with(|count| count.set(count.get() + 1));
                }
            });
            System.alloc(layout)
        }

        unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
            System.dealloc(ptr, layout)
        }

        unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
            COUNT_ENABLED.with(|enabled| {
                if enabled.get() {
                    ALLOCATIONS.with(|count| count.set(count.get() + 1));
                }
            });
            System.realloc(ptr, layout, new_size)
        }
    }

    #[global_allocator]
    static GLOBAL_ALLOCATOR: CountingAllocator = CountingAllocator;

    fn with_allocation_counter<R>(callback: impl FnOnce() -> R) -> (R, usize) {
        COUNT_ENABLED.with(|enabled| enabled.set(true));
        ALLOCATIONS.with(|count| count.set(0));
        let result = callback();
        let allocations = ALLOCATIONS.with(|count| count.get());
        COUNT_ENABLED.with(|enabled| enabled.set(false));
        (result, allocations)
    }

    #[test]
    fn test_va_sawtooth_no_dc_offset() {
        let mut osc = VaOscillator::new(VaWaveform::Sawtooth);
        osc.set_frequency(220.0);
        let sample_rate = 48_000.0;
        let mut sum = 0.0;
        let samples = 48_000;
        for _ in 0..samples {
            sum += osc.process(sample_rate);
        }

        let average = sum / samples as f32;
        assert!(average.abs() < 0.01, "DC offset too high: {average}");
    }

    #[test]
    fn test_ladder_self_oscillation() {
        let mut filter = LadderFilter::new();
        filter.set_cutoff(800.0, 48_000.0);
        filter.set_resonance(3.95);
        filter.set_drive(0.2);

        let mut energy = 0.0;
        for _ in 0..8_192 {
            energy += filter.process(0.0, 48_000.0).abs();
        }

        assert!(energy > 1.0, "ladder filter did not self-oscillate enough: {energy}");
    }

    #[test]
    fn test_adsr_completes_cycle() {
        let mut env = AdsrEnvelope::new(1_000.0);
        env.set_attack(0.01);
        env.set_decay(0.02);
        env.set_sustain(0.4);
        env.set_release(0.03);

        env.note_on();
        for _ in 0..64 {
            env.process();
        }
        env.note_off();
        for _ in 0..256 {
            env.process();
        }

        assert!(!env.is_active(), "envelope remained active");
        assert!(env.level() <= 0.001, "envelope did not return to zero");
    }

    #[test]
    fn test_voice_stealing_oldest_first() {
        let mut engine = HyperSynthEngine::new(48_000.0);
        for note in 0..POLYPHONY as u8 {
            let index = engine.allocate_voice(note);
            engine.voices[index].note_on(60 + note, 1.0, 48_000.0);
            engine.voices[index].age_samples = (note as u64 + 1) * 100;
            engine.voices[index].active = true;
        }

        let stolen = engine.allocate_voice(72);
        assert_eq!(stolen, POLYPHONY - 1);
    }

    #[test]
    fn test_process_block_no_allocation() {
        let mut engine = HyperSynthEngine::new(48_000.0);
        let events = [MidiEvent::NoteOn {
            note: 60,
            velocity: 0.8,
        }];
        let mut output = [0.0_f32; 128];

        engine.process_block(&mut output, &events);
        let (_, allocations) = with_allocation_counter(|| {
            engine.process_block(&mut output, &[]);
        });

        assert_eq!(allocations, 0, "process_block allocated on the audio thread");
    }

    #[test]
    fn test_lfo_independent_phases() {
        let mut lfo_a = Lfo::with_seed(1);
        let mut lfo_b = Lfo::with_seed(2);
        lfo_a.set_waveform(LfoWaveform::Sine);
        lfo_b.set_waveform(LfoWaveform::Sine);
        lfo_a.set_rate(2.0);
        lfo_b.set_rate(2.0);

        let mut differs = false;
        for _ in 0..64 {
            if (lfo_a.process(48_000.0) - lfo_b.process(48_000.0)).abs() > 1.0e-6 {
                differs = true;
                break;
            }
        }

        assert!(differs, "LFOs were phase-locked when they should be independent");
    }

    // ── VA Oscillator Tests ──────────────────────────────────────

    #[test]
    fn test_va_output_range() {
        let waveforms = [
            VaWaveform::Sine,
            VaWaveform::Triangle,
            VaWaveform::Sawtooth,
            VaWaveform::Square,
            VaWaveform::Noise,
        ];
        let sample_rate = 48_000.0;

        for wf in &waveforms {
            let mut osc = VaOscillator::new(*wf);
            osc.set_frequency(440.0);
            for _ in 0..48_000 {
                let s = osc.process(sample_rate);
                assert!(
                    s >= -1.0 && s <= 1.0,
                    "VA {:?} output out of range: {}",
                    wf,
                    s
                );
                assert!(!s.is_nan(), "VA {:?} produced NaN", wf);
            }
        }
    }

    #[test]
    fn test_va_sine_frequency_accuracy() {
        let mut osc = VaOscillator::new(VaWaveform::Sine);
        let sample_rate = 48_000.0;
        let target_hz = 440.0;
        osc.set_frequency(target_hz);

        // Count zero crossings (positive → negative) over 1 second
        let mut crossings = 0u32;
        let mut prev = osc.process(sample_rate);
        for _ in 1..48_000 {
            let curr = osc.process(sample_rate);
            if prev >= 0.0 && curr < 0.0 {
                crossings += 1;
            }
            prev = curr;
        }

        // Should be ~440 crossings ±1
        let diff = (crossings as f32 - target_hz).abs();
        assert!(diff <= 2.0, "Sine frequency off: {} crossings, expected {}", crossings, target_hz);
    }

    #[test]
    fn test_va_drift_stays_bounded() {
        let mut osc = VaOscillator::new(VaWaveform::Sawtooth);
        osc.set_frequency(440.0);
        osc.set_param("drift", 1.0); // Maximum drift

        let sample_rate = 48_000.0;
        for _ in 0..480_000 {
            // 10 seconds
            let s = osc.process(sample_rate);
            assert!(
                s >= -1.0 && s <= 1.0,
                "VA with drift output out of range: {}",
                s
            );
        }
    }

    #[test]
    fn test_va_brightness_filter() {
        let sample_rate = 48_000.0;
        let n = 4800;

        // Full brightness
        let mut bright = VaOscillator::new(VaWaveform::Sawtooth);
        bright.set_frequency(440.0);
        bright.set_param("brightness", 1.0);
        let bright_energy: f32 = (0..n).map(|_| {
            let s = bright.process(sample_rate);
            s * s
        }).sum();

        // Low brightness
        let mut dark = VaOscillator::new(VaWaveform::Sawtooth);
        dark.set_frequency(440.0);
        dark.set_param("brightness", 0.1);
        let dark_energy: f32 = (0..n).map(|_| {
            let s = dark.process(sample_rate);
            s * s
        }).sum();

        // Dark should have less energy (lowpass removes harmonics)
        assert!(
            dark_energy < bright_energy,
            "Dark saw should have less energy: dark={}, bright={}",
            dark_energy,
            bright_energy
        );
    }

    #[test]
    fn test_va_sub_oscillator() {
        let mut osc = VaOscillator::new(VaWaveform::Sine);
        osc.set_frequency(440.0);
        osc.set_param("sub_mode", 1.0); // Sub1Sine
        osc.set_param("sub_level", 1.0);

        let sample_rate = 48_000.0;
        let mut max_val = 0.0f32;
        for _ in 0..48_000 {
            let s = osc.process(sample_rate);
            if s.abs() > max_val {
                max_val = s.abs();
            }
        }
        // With sub-oscillator added, peak should be above what a sine alone produces
        assert!(max_val > 0.9, "Sub-osc signal too weak: {}", max_val);
    }

    #[test]
    fn test_va_reset_clears_state() {
        let mut osc = VaOscillator::new(VaWaveform::Triangle);
        osc.set_frequency(440.0);
        osc.set_param("drift", 0.5);
        osc.set_param("brightness", 0.3);

        for _ in 0..48_000 {
            osc.process(48_000.0);
        }

        osc.reset();
        // After reset, first sample should be near zero (phase = 0)
        let first = osc.process(48_000.0);
        assert!(first.abs() < 0.2, "After reset, first sample too far from zero: {}", first);
    }

    // ── Wavetable Oscillator Tests ───────────────────────────────

    #[test]
    fn test_wavetable_output_range() {
        use crate::oscillators::WavetableOscillator;

        let mut osc = WavetableOscillator::new();
        osc.set_frequency(440.0);
        let sample_rate = 48_000.0;

        for frame in 0..=10 {
            osc.set_param("frame_position", frame as f32 / 10.0);
            for _ in 0..4800 {
                let s = osc.process(sample_rate);
                assert!(
                    s >= -1.0 && s <= 1.0,
                    "Wavetable output out of range at frame {}: {}",
                    frame,
                    s
                );
                assert!(!s.is_nan(), "Wavetable produced NaN at frame {}", frame);
            }
        }
    }

    #[test]
    fn test_wavetable_frame_crossfade_smooth() {
        use crate::oscillators::WavetableOscillator;

        let mut osc = WavetableOscillator::new();
        osc.set_frequency(440.0);
        osc.set_param("morph_smooth", 0.0); // Instant morph

        let sample_rate = 48_000.0;

        // Read some samples at frame 0
        for _ in 0..480 {
            osc.process(sample_rate);
        }

        // Jump to frame 1.0 — should not produce discontinuity > 2.0
        osc.set_param("frame_position", 1.0);
        let mut prev = osc.process(sample_rate);
        let mut max_jump = 0.0f32;
        for _ in 0..480 {
            let curr = osc.process(sample_rate);
            let jump = (curr - prev).abs();
            if jump > max_jump {
                max_jump = jump;
            }
            prev = curr;
        }

        assert!(
            max_jump < 2.0,
            "Wavetable frame jump caused discontinuity: {}",
            max_jump
        );
    }

    #[test]
    fn test_wavetable_factory_presets_load() {
        use crate::oscillators::{WavetableOscillator, FactoryWavetable};

        let presets = [
            FactoryWavetable::Basic,
            FactoryWavetable::PwmSweep,
            FactoryWavetable::FormantSweep,
            FactoryWavetable::Digital,
            FactoryWavetable::Vocal,
        ];

        for (i, preset) in presets.iter().enumerate() {
            let mut osc = WavetableOscillator::with_preset(*preset);
            osc.set_frequency(440.0);
            let sample_rate = 48_000.0;

            let mut has_signal = false;
            for _ in 0..4800 {
                let s = osc.process(sample_rate);
                if s.abs() > 0.01 {
                    has_signal = true;
                }
                assert!(
                    s >= -1.0 && s <= 1.0,
                    "Preset {} output out of range: {}",
                    i,
                    s
                );
            }
            assert!(has_signal, "Preset {} produced no signal", i);
        }
    }

    #[test]
    fn test_wavetable_custom_load() {
        use crate::oscillators::{WavetableOscillator, FRAME_SIZE};

        let mut osc = WavetableOscillator::new();

        // Create 2 custom frames: silence and full-scale sine
        let mut data = vec![0.0f32; FRAME_SIZE * 2];
        for i in 0..FRAME_SIZE {
            // Frame 1 = sine
            data[FRAME_SIZE + i] =
                libm::sinf(core::f32::consts::TAU * i as f32 / FRAME_SIZE as f32);
        }

        osc.load_from_samples(&data, 2);
        osc.set_frequency(440.0);

        // At frame 0 (silence) — should be near zero
        osc.set_param("frame_position", 0.0);
        osc.set_param("morph_smooth", 0.0);
        let sample_rate = 48_000.0;
        let mut energy = 0.0f32;
        for _ in 0..480 {
            let s = osc.process(sample_rate);
            energy += s * s;
        }
        assert!(energy < 0.1, "Silent frame should have near-zero energy: {}", energy);

        // At frame 1 (sine) — should have signal
        osc.set_param("frame_position", 1.0);
        let mut energy = 0.0f32;
        for _ in 0..4800 {
            let s = osc.process(sample_rate);
            energy += s * s;
        }
        assert!(energy > 10.0, "Sine frame should have significant energy: {}", energy);
    }

    #[test]
    fn test_wavetable_high_frequency_no_aliasing_blowup() {
        use crate::oscillators::WavetableOscillator;

        // At very high frequencies, mip-mapping should prevent wild output
        let mut osc = WavetableOscillator::new();
        osc.set_frequency(15_000.0); // Very high
        osc.set_param("frame_position", 0.3); // Saw-like frame in Basic

        let sample_rate = 48_000.0;
        for _ in 0..48_000 {
            let s = osc.process(sample_rate);
            assert!(
                s >= -1.0 && s <= 1.0,
                "High-freq wavetable output out of range: {}",
                s
            );
        }
    }
}
