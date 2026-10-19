# Directive: פיתוח Frontend (Next.js UI)

## מטרה
עבודה על ממשק המשתמש — React components, pages, styling, UI↔Engine wiring.

## Stack
- **Framework:** Next.js 16 + React 19
- **Styling:** Tailwind CSS + globals.css
- **Components:** Radix UI primitives + custom synth components
- **State:** React hooks (useAudioEngine, useState, useEffect)
- **Theme:** next-themes (dark mode)

## כלי ביצוע
**Script:** `execution/dev_frontend.py` (start dev server + watch)

## תהליך רגיל
1. הרץ `npm run dev` (או דרך script)
2. פתח `http://localhost:3000`
3. עריכת קבצים ← Hot reload אוטומטי

## מבנה קבצים
```
app/
  layout.tsx          ← Root layout + providers
  page.tsx            ← Main synth UI page
  globals.css         ← Global styles
  keyboard/page.tsx   ← Virtual keyboard page

components/
  synth/              ← Synth-specific components
    Knob.tsx          ← Rotary knob control
    SliderTrack.tsx   ← Linear slider
    LED.tsx           ← Status LED indicator
    Oscilloscope.tsx  ← Waveform visualization
    VUMeter.tsx       ← Level meter
    panels/           ← Page panels (Oscillator, Filter, FX, etc.)
  ui/                 ← Reusable shadcn/ui components

hooks/
  useAudioEngine.ts   ← Audio engine interface hook
  use-mobile.ts       ← Mobile detection
  use-toast.ts        ← Toast notifications

lib/
  audio/
    AudioBridge.ts    ← WASM ↔ JS bridge
  utils.ts            ← Utility functions
```

## קונבנציות קוד
- **Component naming:** PascalCase, קובץ = שם component
- **Panel props:** כל panel מקבל `params` + `onParamChange` callback
- **Parameter IDs:** משתמשים ב-ParamId numeric values (מתואמים עם Rust enum)
- **Styling:** Tailwind classes inline, globals.css רק ל-CSS variables ו-base styles
- **אין props drilling מעבר ל-2 רמות** — אם צריך יותר, להשתמש ב-context או hook

## בדיקות תקינות
- `npm run lint` עובר בלי שגיאות
- `npm run build` מצליח
- UI נטען ב-`localhost:3000` בלי console errors

## נקודות כשל ידועות
- **WASM לא נטען:** ודא שנבנה עם `build_wasm.md` והקבצים ב-`public/wasm/`
- **Hydration mismatch:** להשתמש ב-`useEffect` לדברים שתלויים ב-client (Audio API, MIDI)
- **TypeScript errors:** `npm run lint` ואז `npx tsc --noEmit` לבדיקות טיפוסים

## עדכונים
