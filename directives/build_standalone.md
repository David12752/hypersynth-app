# Directive: בניית Standalone

## מטרה
בנייה והרצה של ה-native Rust standalone binary (ללא Electron/Browser).

## דרישות מוקדמות
- Rust toolchain (cargo ב-PATH או ב-`~/.cargo/bin/`)
- **WASAPI** (ברירת מחדל, Windows) — לא צריך הגדרה
- **ASIO** (אופציונלי) — דורש LLVM + ASIO SDK

## כלי ביצוע
**Script:** `execution/build_standalone.py`  
**חלופה:** `scripts/rust-standalone.ps1` (PowerShell ישיר)

## תהליך
1. `execution/build_standalone.py --mode run` להרצה
2. `execution/build_standalone.py --mode build` לבנייה בלבד
3. ה-script מגדיר אוטומטית: `CARGO_TARGET_DIR`, `CPAL_ASIO_DIR`, `LIBCLANG_PATH`

## משתני סביבה
| משתנה | ערך | חובה |
|--------|-----|------|
| `CARGO_TARGET_DIR` | `C:\hypersynth-target` | כן (Unicode workaround) |
| `CPAL_ASIO_DIR` | נתיב ל-ASIO SDK | רק אם רוצים ASIO |
| `LIBCLANG_PATH` | `C:\Program Files\LLVM\bin` | רק אם רוצים ASIO |
| `HYPERSYNTH_AUDIO_DEVICE` | שם device | אופציונלי |
| `HYPERSYNTH_MIDI_INPUT` | שם MIDI input | אופציונלי |

## Host אודיו
- **WASAPI** — ברירת מחדל. Shared mode, מאפשר אודיו מקבילי
- **ASIO** — opt-in בלבד. Exclusive mode, latency נמוך
- אם ה-host שנבחר נכשל, fallback אוטומטי ל-system default

## נקודות כשל ידועות
- **Unicode paths:** Bindgen לא עובד עם נתיבים בעברית → `CARGO_TARGET_DIR=C:\hypersynth-target`
- **ASIO בלי LLVM:** קומפילציה נכשלת עם שגיאת clang → התקן LLVM או וותר על ASIO
- **Audio device busy:** ASIO ננעל מתוכנה אחרת → עבור ל-WASAPI

## עדכונים
- 2026-04: WASAPI כברירת מחדל, ASIO opt-in
- 2026-04: Audio/MIDI settings persisted ב-localStorage
