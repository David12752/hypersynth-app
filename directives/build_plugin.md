# Directive: בניית VST3/CLAP Plugin

## מטרה
בנייה של HyperSynth כ-VST3 plugin באמצעות NIH-plug.

## דרישות מוקדמות
- Rust toolchain
- `cargo-nih-plug` bundler (`cargo install cargo-nih-plug` אם לא מותקן)

## כלי ביצוע
**Script:** `execution/build_plugin.py`

## תהליך
1. `execution/build_plugin.py` — בנייה ב-release mode
2. Build: `cargo build --release -p hypersynth-plugin`
3. Bundle: `cargo nih-plug bundle hypersynth-plugin --release`
4. Output: `hypersynth-engine/target/bundled/hypersynth-plugin.vst3`
5. Copy ל-`hypersynth-engine/target/bundled/HYPERSYNTH.vst3`

## בדיקת תקינות
- הקובץ `.vst3` קיים ומשקלו > 500KB
- ניתן לטעון ב-DAW (Reaper/FL Studio/Ableton)

## פרמטרים
| פרמטר | ברירת מחדל | תיאור |
|--------|-----------|-------|
| `--debug` | לא | debug build (עם symbols) |
| `--install` | לא | העתקה אוטומטית ל-VST3 system path |

## VST3 System Paths
- **Windows:** `C:\Program Files\Common Files\VST3\`
- **macOS:** `~/Library/Audio/Plug-Ins/VST3/`
- **Linux:** `~/.vst3/`

## נקודות כשל ידועות
- **bundler לא מותקן:** `cargo install cargo-nih-plug`
- **Unicode paths:** אותו workaround כמו standalone — `CARGO_TARGET_DIR=C:\hypersynth-target`

## עדכונים
- 2026-04: נתיב bundled → HYPERSYNTH.vst3 מתועד
