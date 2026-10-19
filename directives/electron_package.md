# Directive: אריזת Electron

## מטרה
אריזת HyperSynth כ-desktop application עם Electron.

## Stack
- **Electron:** מוגדר ב-`electron/main.js`
- **Preload:** `electron/preload.js` — חושף APIs בטוחים ל-renderer
- **Native host:** `electron/native-host.js` — bridge ל-Rust standalone

## כלי ביצוע
**Script:** `execution/build_electron.py`

## תהליך
1. `npm run build` — בנה את Next.js
2. `npm run electron:build` — ארוז עם electron-builder
3. Output: installer ב-`dist/`

## דרישות
- Node.js 18+
- `electron-builder` (dev dependency)
- `cross-env` (dev dependency)
- Next.js build מוכן

## npm scripts קיימים
```json
{
  "electron": "cross-env NODE_ENV=production electron .",
  "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:3000 && electron .\"",
  "electron:build": "next build && next export -o out && electron-builder"
}
```

## בדיקת תקינות
- האפליקציה נפתחת בלי crash
- אודיו עובד (WASM/Native)
- MIDI input מזוהה
- Preset save/load עובד

## פלטפורמות
| פלטפורמה | פורמט | הערות |
|-----------|--------|-------|
| Windows | `.exe` (NSIS installer) | ראשי |
| macOS | `.dmg` | דורש code signing |
| Linux | `.AppImage` | אופציונלי |

## נקודות כשל ידועות
- **next export deprecated:** ב-Next.js 14+ להשתמש ב-`output: 'export'` ב-`next.config.mjs`
- **Native modules:** אם יש native Rust bindings, צריך rebuild per platform
- **Code signing:** macOS/Windows דורשים חתימה דיגיטלית להפצה ציבורית

## עדכונים
