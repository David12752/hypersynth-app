# HyperSynth

A synthesizer with a web and desktop front end and a Rust DSP engine.

- **Front end:** Next.js + React + TypeScript (`app/`, `components/`, `hooks/`, `lib/`).
- **Desktop shell:** Electron (`electron/`), which runs the native engine host.
- **Engine:** a Rust workspace in `hypersynth-engine/`:
  - `engine/`: the core DSP
  - `standalone/`: the native host that Electron starts
  - `wasm-bridge/`: a wasm-bindgen bridge for running in the browser
  - `plugin/`: a plugin wrapper built on [NIH-plug](https://github.com/robbert-vdh/nih-plug)

## Build

```bash
npm install
npm run dev              # web UI
npm run electron:dev     # desktop
npm run standalone:build # the Rust engine (Windows, PowerShell)
```

Copy `.env.example` to `.env` if you need local settings. Design notes are in `DISCOVERY.md`, `DISPLAY_IMPL.md` and
`DEVELOPMENT_PLAN.md`.

## Status

Published from the author's archive as is. It is a working project, not a maintained product.

## Licence

MIT (see `LICENSE`). A VST3 build of the plugin links the GPLv3 VST3 bindings that NIH-plug uses, so a distributed VST3
binary falls under GPLv3.
