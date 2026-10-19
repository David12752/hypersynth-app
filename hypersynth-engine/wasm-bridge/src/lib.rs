use wasm_bindgen::prelude::*;
use hypersynth_engine::{HyperSynthEngine, EngineMessage};

#[wasm_bindgen]
pub struct WasmEngine {
    engine: HyperSynthEngine,
    sample_rate: f32,
}

#[wasm_bindgen]
impl WasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> WasmEngine {
        WasmEngine {
            engine: HyperSynthEngine::new(sample_rate),
            sample_rate,
        }
    }

    /// Process a block of audio. Returns interleaved stereo f32 samples.
    #[wasm_bindgen]
    pub fn process(&mut self, num_frames: usize) -> Vec<f32> {
        let mut output = vec![0.0f32; num_frames * 2];
        let midi_events = [];
        self.engine.process_block(&mut output, &midi_events);
        output
    }

    // ── Parameter control (string key API) ──────────────────────────────────

    /// Send a named parameter change to the engine.
    /// Keys match PARAM_MAP in AudioBridge.ts exactly.
    #[wasm_bindgen]
    pub fn set_param(&mut self, target: &str, value: f32) {
        self.engine.handle_message(EngineMessage::ParamChange {
            target: target.into(),
            value,
        });
    }

    /// Set a parameter by its stable numeric ID (preferred over string API).
    /// IDs are defined in `generatedParamMap.ts`. Returns true on success.
    #[wasm_bindgen]
    pub fn set_param_by_id(&mut self, id: u16, value: f32) -> bool {
        self.engine.set_param_by_id(id, value)
    }

    // ── MIDI ─────────────────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.engine.handle_message(EngineMessage::NoteOn { note, velocity });
    }

    #[wasm_bindgen]
    pub fn note_off(&mut self, note: u8) {
        self.engine.handle_message(EngineMessage::NoteOff { note });
    }

    // ── LFO control ──────────────────────────────────────────────────────────

    /// Set LFO rate for ALL LFOs (0.01 – 20 Hz).
    #[wasm_bindgen]
    pub fn set_lfo_rate(&mut self, rate: f32) {
        self.engine.handle_message(EngineMessage::ParamChange {
            target: "lfo_rate".into(),
            value: rate,
        });
    }

    /// Set LFO waveform index (0=Sine 1=Triangle 2=Saw 3=Square 4=S&H).
    #[wasm_bindgen]
    pub fn set_lfo_waveform(&mut self, index: u8) {
        self.engine.handle_message(EngineMessage::ParamChange {
            target: "lfo_waveform".into(),
            value: index as f32,
        });
    }

    /// Set how much LFO 0 modulates filter cutoff (0 = off, 1 = full range).
    #[wasm_bindgen]
    pub fn set_lfo_mix_amount(&mut self, amount: f32) {
        self.engine.handle_message(EngineMessage::ParamChange {
            target: "lfo_mix_amount".into(),
            value: amount,
        });
    }

    // ── Amp envelope ─────────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn set_amp_attack(&mut self, secs: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "amp_attack".into(), value: secs });
    }

    #[wasm_bindgen]
    pub fn set_amp_decay(&mut self, secs: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "amp_decay".into(), value: secs });
    }

    #[wasm_bindgen]
    pub fn set_amp_sustain(&mut self, level: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "amp_sustain".into(), value: level });
    }

    #[wasm_bindgen]
    pub fn set_amp_release(&mut self, secs: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "amp_release".into(), value: secs });
    }

    // ── Filter envelope ───────────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn set_filter_env_attack(&mut self, secs: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "filter_env_attack".into(), value: secs });
    }

    #[wasm_bindgen]
    pub fn set_filter_env_decay(&mut self, secs: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "filter_env_decay".into(), value: secs });
    }

    #[wasm_bindgen]
    pub fn set_filter_env_sustain(&mut self, level: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "filter_env_sustain".into(), value: level });
    }

    #[wasm_bindgen]
    pub fn set_filter_env_release(&mut self, secs: f32) {
        self.engine.handle_message(EngineMessage::ParamChange { target: "filter_env_release".into(), value: secs });
    }

    // ── Metering ──────────────────────────────────────────────────────────────

    /// Returns number of currently active voices.
    #[wasm_bindgen]
    pub fn get_active_voices(&self) -> u8 {
        self.engine.active_voice_count()
    }

    #[wasm_bindgen]
    pub fn get_sample_rate(&self) -> f32 {
        self.sample_rate
    }

    // ── Wind controller ──────────────────────────────────────────────────

    #[wasm_bindgen]
    pub fn wind_set_enabled(&mut self, enabled: bool) {
        self.engine.wind_set_enabled(enabled);
    }

    #[wasm_bindgen]
    pub fn wind_handle_cc(&mut self, cc: u8, value: u8) {
        self.engine.wind_handle_cc(cc, value);
    }

    #[wasm_bindgen]
    pub fn wind_handle_pitch_bend(&mut self, msb: u8, lsb: u8) {
        self.engine.wind_handle_pitch_bend(msb, lsb);
    }

    #[wasm_bindgen]
    pub fn wind_handle_aftertouch(&mut self, value: u8) {
        self.engine.wind_handle_aftertouch(value);
    }

    /// Transfer a custom 128-point breath response curve from JavaScript.
    /// Returns `false` if the slice is not exactly 128 elements.
    #[wasm_bindgen]
    pub fn wind_set_custom_curve(&mut self, table: &[f32]) -> bool {
        if table.len() != 128 {
            return false;
        }
        let mut array = [0.0f32; 128];
        array.copy_from_slice(table);
        self.engine.wind_set_custom_curve(&array);
        true
    }

    /// Set a wind parameter by its numeric ID (500–554).
    /// Delegates to `set_param_by_id` — already routes ids ≥ 500 to the wind processor.
    #[wasm_bindgen]
    pub fn wind_set_param(&mut self, id: u16, value: f32) -> bool {
        self.engine.set_param_by_id(id, value)
    }
}
