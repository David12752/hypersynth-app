# Directive: ניהול Presets

## מטרה
יצירה, עריכה, ייצוא וייבוא של presets עבור HyperSynth.

## פורמט
- **Internal:** JSON (serde_json) — קריא, ניתן ל-diff
- **Export:** `.hypersynth` files (JSON בפנים)
- **Binary (אופציונלי):** bincode / MessagePack לטעינה מהירה

## מבנה
```
public/presets/
  factory/              ← 20+ factory presets
    INIT.json
    Super Saw.json
    ...
  user/                 ← presets של המשתמש (Electron בלבד)
```

## תהליך יצירת preset
1. כוון את הסינת' לצליל הרצוי
2. `engine.get_state()` → serialized bytes
3. הוסף metadata (שם, קטגוריה, תגיות)
4. שמור ל-JSON

## Factory Presets — רשימה מינימלית
ראה `DEVELOPMENT_PLAN.md` Phase 9.2 ל-20 presets מינימום.

## קונבנציות שמות
- **קבצים:** `{name}.json`
- **שמות:** אנגלית, PascalCase או מילים עם רווחים
- **קטגוריות:** Bass, Lead, Pad, Keys, Pluck, Strings, Brass, Percussion, SFX, Ambient, Experimental

## כלי ביצוע
**Script:** `execution/manage_presets.py` (validate, list, convert)

## נקודות כשל ידועות
- **Version mismatch:** preset מ-version ישן עם params חדשים → fill defaults
- **NaN values:** validate כל ערך בטעינה

## עדכונים
