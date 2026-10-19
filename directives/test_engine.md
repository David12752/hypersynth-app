# Directive: בדיקות Engine

## מטרה
הרצת טסטים לוודא שה-DSP engine עובד נכון — אודיו, פרמטרים, פילטרים, מודולציה.

## כלי ביצוע
**Script:** `execution/test_engine.py`

## סוגי בדיקות

### 1. Unit Tests (cargo test)
```bash
cargo test -p hypersynth-engine
```
- כל oscillator מייצר output ב-range ±1.0
- פילטרים לא מתפוצצים (NaN/Infinity check)
- Envelopes עוברים ADSR cycle נכון
- LFOs מייצרים waveforms תקינים
- Mod matrix routing עובד

### 2. Audio Output Tests
- render 1 שנייה של אודיו → בדוק שאין silence מוחלט
- render עם note_on/note_off → בדוק שה-envelope עובד
- בדוק RMS level סביר (לא מאוד חלש ולא מאוד חזק)

### 3. Performance Benchmarks
```bash
cargo bench -p hypersynth-engine
```
- `process()` ל-128 samples צריך לקחת < 1ms
- 16 voices בו-זמנית < 4ms per block
- אין memory leaks (process 1M blocks, check RSS)

### 4. Regression Tests
- כל באג שמתוקן מקבל test שמוודא שהוא לא חוזר
- preset loading → parameter values match expected

## מתי להריץ
- **לפני כל commit:** `cargo test -p hypersynth-engine`
- **לפני WASM build:** full test suite
- **אחרי שינוי ב-params:** regression + preset compat
- **אחרי שינוי ב-DSP algorithm:** audio output tests + benchmark

## תוצאות צפויות
- `cargo test` — 0 failures
- `cargo clippy` — 0 warnings
- Performance — within budget (< 1ms per block of 128 samples)

## נקודות כשל ידועות
- **NaN propagation:** שגיאה אחת ב-DSP מתפשטת לכל הקולות. כל test צריך `assert!(!output.is_nan())`
- **Sample rate dependency:** טסטים צריכים לרוץ גם ב-44100 וגם ב-48000 וגם ב-96000

## עדכונים
