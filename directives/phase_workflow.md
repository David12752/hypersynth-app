# Directive: Phase Workflow

## מטרה
ניהול מעבר מסודר בין phases של DEVELOPMENT_PLAN.md.

## מצב נוכחי
**Phase פעיל:** 0 (תיקוני באגים ותשתית)  
**מצב UI:** ~90% מוכן  
**מצב Engine:** ~12% מוכן  
**מצב WASM Bridge:** ~8% מוכן

## סדר Phases
| Phase | שם | תלוי ב- | מצב |
|-------|----|---------|------|
| 0 | באגים + תשתית | - | ⚠️ בעבודה |
| 1 | מערכת פרמטרים | Phase 0 | ❌ |
| 2 | ארכיטקטורת קול | Phase 1 | ❌ |
| 3 | מנועי סינתזה | Phase 2 | ❌ |
| 4 | פילטרים | Phase 2 | ❌ |
| 5 | מודולציה + Mod Matrix | Phase 3+4 | ❌ |
| 6 | אפקטים | Phase 5 | ❌ |
| 7 | מיקסר + Routing | Phase 6 | ❌ |
| 8 | WASM Bridge + UI Wiring | Phase 7 | ❌ |
| 9 | Presets + Polish | Phase 8 | ❌ |

## תהליך סיום Phase
1. **כל הפריטים ב-Phase עברו** — ודא מול `DEVELOPMENT_PLAN.md`
2. **טסטים עוברים** — `cargo test -p hypersynth-engine`
3. **אין regressions** — מה שעבד ב-Phase קודם עדיין עובד
4. **WASM build תקין** (אם רלוונטי)
5. **עדכן את הטבלה למעלה** — סמן Phase כ-✅
6. **Commit** עם הודעה: `phase X complete: [תיאור קצר]`

## כלל אצבע
- **לא לדלג על phases** — כל אחד בונה על הקודם
- **Phase 3 ו-4 יכולים לרוץ במקביל** — אין תלות ישירה ביניהם
- **Phase 5 דורש את שניהם** — mod matrix צריך גם oscillators וגם filters
- **Phase 8 הוא integration** — מחבר הכל יחד

## עדכונים
