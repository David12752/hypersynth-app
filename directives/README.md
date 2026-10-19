# Directives — הנחיות עבודה

כל קובץ כאן הוא SOP (Standard Operating Procedure) — הוראות עבודה מפורטות.

## קבצים

| קובץ | תחום | מתי להשתמש |
|------|------|------------|
| `build_wasm.md` | בנייה | בניית WASM bridge ופריסה ל-public/wasm |
| `build_standalone.md` | בנייה | בניית standalone Rust binary |
| `build_plugin.md` | בנייה | בניית VST3/CLAP plugin |
| `dev_frontend.md` | פיתוח | עבודה על Next.js UI |
| `dev_engine.md` | פיתוח | עבודה על Rust DSP engine |
| `test_engine.md` | בדיקות | הרצת טסטים ל-engine |
| `phase_workflow.md` | תכנון | מעבר בין phases לפי DEVELOPMENT_PLAN |
| `preset_management.md` | תוכן | ניהול presets |
| `electron_package.md` | פריסה | אריזת Electron לפרודקשן |
| `troubleshooting.md` | תחזוקה | בעיות נפוצות ופתרונות |

## עקרונות

1. **כל directive הוא מסמך חי** — כשמגלים דבר חדש, מעדכנים
2. **Execution scripts עושים את העבודה** — ה-AI רק מנתב ומחליט
3. **Self-anneal** — שגיאה → תיקון → עדכון directive → המערכת חזקה יותר
