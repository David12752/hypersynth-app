# Directive: Troubleshooting — בעיות נפוצות ופתרונות

## בעיות Build

### Unicode path — bindgen crash
**סימפטום:** `bindgen` נכשל עם שגיאת encoding בנתיב  
**סיבה:** נתיב פרויקט מכיל תווי Unicode (עברית)  
**פתרון:** `$env:CARGO_TARGET_DIR = "C:\hypersynth-target"`

### wasm-pack build failure — "can't find crate"
**סימפטום:** `wasm-pack build` נכשל עם missing crate  
**פתרון:**
1. ודא ב-`hypersynth-engine/Cargo.toml` שה-workspace members נכונים
2. `cargo clean` ואז נסה שוב
3. בדוק שאין version conflicts ב-dependencies

### Cargo לא נמצא
**סימפטום:** `cargo: command not found`  
**פתרון:** `$cargo = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"`

### ASIO build failure
**סימפטום:** שגיאת clang/bindgen בזמן build עם ASIO  
**פתרון:**
1. התקן LLVM: https://releases.llvm.org/
2. `$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"`
3. הורד ASIO SDK ושים בנתיב ידוע
4. `$env:CPAL_ASIO_DIR = "path\to\asio_sdk"`

## בעיות Runtime

### אין צליל
**בדיקות:**
1. WASM נטען? → בדוק console ל-errors
2. AudioContext started? → צריך user gesture (click) לפני `audioContext.resume()`
3. Note events מגיעים? → הוסף `console.log` ב-note_on
4. Output מחובר? → בדוק gain node chain

### AudioWorklet לא נטען
**סימפטום:** `Failed to load audio worklet`  
**פתרון:**
1. ודא ש-`public/audio-worklet-processor.js` קיים
2. WASM file path נכון (relative to worklet)
3. CORS headers תקינים (בפיתוח זה לא אמור להיות בעיה)

### NaN/Infinity באודיו — שורק/שתיקה
**סימפטום:** אודיו שורק, קופץ לאינסוף, או שקט פתאומי  
**סיבה:** NaN propagation ב-DSP chain  
**פתרון:**
1. הוסף NaN check: `if output.is_nan() { output = 0.0; }`
2. חפש חלוקה ב-0 (resonance, frequency calculation)
3. בדוק sample rate — hardcoded 48000 במקום actual?

### High CPU usage
**בדיקות:**
1. כמה voices פעילים? → voice stealing עובד?
2. Oversampling מופעל? → כפול CPU per factor
3. FX chain ארוך? → disable effects ובדוק

## בעיות UI

### Hydration mismatch (Next.js)
**סימפטום:** React hydration error בקונסול  
**סיבה:** Server render ≠ Client render  
**פתרון:** עטוף client-only code ב-`useEffect` או `dynamic(() => import(...), { ssr: false })`

### Knob/Slider לא מגיב
**בדיקות:**
1. Event handler מחובר? (`onParamChange`)
2. ParamId נכון? (תואם ל-Rust enum)
3. ה-hook `useAudioEngine` מאותחל?

## Lessons Learned
<!-- הוסף כאן כל דבר שלמדת מניסיון -->

## עדכונים
- 2026-04: קובץ נוצר עם בעיות מתועדות
