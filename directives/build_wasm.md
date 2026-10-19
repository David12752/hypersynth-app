# Directive: בניית WASM Bridge

## מטרה
קומפילציה של hypersynth-engine ל-WebAssembly ופריסה לתיקיית `public/wasm/`.

## דרישות מוקדמות
- Rust toolchain עם target `wasm32-unknown-unknown`
- `wasm-pack` מותקן (`cargo install wasm-pack`)
- `wasm-bindgen-cli` (מותקן אוטומטית דרך wasm-pack)

## כלי ביצוע
**Script:** `execution/build_wasm.py`

## תהליך
1. הרץ `execution/build_wasm.py`
2. ה-script בונה את `hypersynth-engine/wasm-bridge` ל-WASM
3. Output מועתק ל-`public/wasm/`
4. קבצי `.d.ts` נוצרים אוטומטית

## פרמטרים
| פרמטר | ברירת מחדל | תיאור |
|--------|-----------|-------|
| `--release` | כן | בנייה ב-release mode (אופטימיזציות) |
| `--dev` | לא | בנייה ב-debug mode (מהיר יותר, גדול יותר) |
| `--profiling` | לא | עם debug info ל-profiling |

## בדיקת תקינות
- הקובץ `public/wasm/hypersynth_wasm_bg.wasm` קיים ומשקלו > 10KB
- הקובץ `public/wasm/hypersynth_wasm.js` קיים ומכיל `wasm_bindgen`
- ה-`.d.ts` files תקינים

## נקודות כשל ידועות
- **נתיבי Unicode:** אם `CARGO_TARGET_DIR` מכיל תווי Unicode (כמו עברית), bindgen נכשל. פתרון: `CARGO_TARGET_DIR=C:\hypersynth-target`
- **wasm-opt לא מותקן:** wasm-pack מוריד אוטומטית, אבל אם נכשל — `cargo install wasm-opt` או התקנה ידנית
- **זיכרון:** WASM builds צורכים הרבה RAM. אם נכשל — סגור תהליכים אחרים

## עדכונים
- 2026-04: path Unicode workaround מתועד
