# Directive: פיתוח Rust DSP Engine

## מטרה
עבודה על הליבה של הסינתיסייזר — oscillators, filters, modulation, FX, voice management.

## Stack
- **שפה:** Rust (stable)
- **Workspace:** `hypersynth-engine/` (Cargo workspace)
- **Crates:**
  - `engine/` — הליבה (DSP, voices, params)
  - `wasm-bridge/` — WASM bindings (wasm-bindgen)
  - `plugin/` — VST3/CLAP (NIH-plug)
  - `standalone/` — Native standalone binary

## כלי ביצוע
**Script:** `execution/dev_engine.py` (check, build, test)

## תהליך רגיל
1. ערוך קוד ב-`hypersynth-engine/engine/src/`
2. בדוק: `execution/dev_engine.py --check`
3. טסטים: `execution/dev_engine.py --test`
4. בנה WASM: קרא `directives/build_wasm.md`

## מבנה Engine
```
engine/src/
  lib.rs              ← HyperSynthEngine — ה-struct הראשי
  voice.rs            ← Voice struct + polyphony
  params.rs           ← ParamId enum + ParamDescriptor
  oscillators/
    va.rs             ← Virtual Analog (polyBLEP)
    wavetable.rs      ← Wavetable playback
    fm.rs             ← FM synthesis
    granular.rs       ← Granular synthesis
    modal.rs          ← Modal synthesis
    additive.rs       ← Additive synthesis
    sampler.rs        ← Sample playback
  filters/
    svf.rs            ← State Variable Filter
    ladder.rs         ← Moog-style Ladder
    ms20.rs           ← Korg MS-20 style
    formant.rs        ← Formant filter
    comb.rs           ← Comb filter
  modulation/
    envelope.rs       ← ADSR envelopes
    lfo.rs            ← LFOs
    mod_matrix.rs     ← Modulation routing
  effects/
    reverb.rs, delay.rs, chorus.rs, ...
  mixer.rs            ← Voice mixer + routing
  unison.rs           ← Unison engine
```

## קונבנציות קוד
- **אין allocations ב-audio thread** — `process()` חייב להיות allocation-free
- **`#[inline]`** על פונקציות DSP קטנות שנקראות per-sample
- **`f32` everywhere** — אלא אם precision דורש `f64` (phase accumulation בסמפלר)
- **Smoothed params** — כל פרמטר שמשתנה real-time חייב לעבור smoothing
- **Sample rate aware** — לעולם לא hardcode 44100 או 48000
- **Trait objects (`dyn`)** — רק ב-OscillatorSlot ו-FilterModel (hot-swap בזמן ריצה)

## ספריות reference (לא לשילוב ישיר!)
- **MoogLadders** — reference ל-analog filter modeling
- **DaisySP** — reference ל-FX building blocks
- **DSPFilters** — reference ל-IIR filters
- **synfx-dsp** — reference בלבד (GPL, לא לשילוב!)

## פקודות cargo שימושיות
```bash
# Check (מהיר, בלי build)
cargo check -p hypersynth-engine

# Test
cargo test -p hypersynth-engine

# Build release
cargo build --release -p hypersynth-engine

# Clippy (linting)
cargo clippy -p hypersynth-engine -- -W clippy::all
```

## נקודות כשל ידועות
- **Unicode path → bindgen crash:** `CARGO_TARGET_DIR=C:\hypersynth-target`
- **libm conflicts:** ודא ש-`libm` dependency הוא באותו version בכל ה-crates
- **WASM incompatible code:** `std::time`, `std::thread`, `std::fs` לא עובדים ב-WASM — השתמש ב-`#[cfg(not(target_arch = "wasm32"))]`

## עדכונים
