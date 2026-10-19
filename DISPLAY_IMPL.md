# Wave Display Implementation

## What was built

A new Three.js-based wavetable display was added for the WAVE oscillator view.

It includes:

- a dark square-ish WebGL display area inside the oscillator panel
- a 64-frame 3D wavetable stack rendered in perspective
- an active frame highlight rendered on top of the stack
- a live cyan waveform overlay driven by the engine scope telemetry
- a scrolling spectrogram ribbon below the main display
- bloom post-processing via `UnrealBloomPass`
- drag-to-orbit camera interaction
- `ResizeObserver`-driven layout updates
- a small imperative API:
  - `updateFrame(Float32Array | number[])`
  - `updateWavetable(Float32Array | number[], numFrames)`

## Data flow

### Static wavetable content

- Electron renderer calls `getWavetableDisplayData()` in `lib/audio/AudioBridge.ts`
- Preload forwards this through `ipcRenderer.invoke(...)`
- Electron main forwards to `NativeHostManager.getWavetableDisplayData()`
- `NativeHostManager` spawns the existing standalone host with:
  - `--dump-wavetable <preset> --frames 64 --json`
- Rust standalone creates a `WavetableOscillator` and exports flattened display frames
- Renderer uploads the result once into preallocated Three.js geometries

### Live waveform overlay

- Native standalone still captures output scope data from the audio callback
- Scope telemetry was upgraded from a single short frame to a 2048-sample ring snapshot
- Native status snapshots now emit every 16 ms instead of 120 ms
- Renderer reads the latest scope frame through `getScopeFrame()` during animation
- Overlay geometry is updated in place without rebuilding the scene

### Spectrogram ribbon

- Renderer derives magnitude bins from the latest scope frame
- A `THREE.DataTexture` is updated every 4 animation frames
- The texture scrolls left and writes the newest spectral slice into the rightmost column

## Rust changes

- Added `WavetableOscillator` export helpers:
  - wavetable name
  - source frame count
  - flattened 64-frame display export
- Added standalone CLI wavetable dump endpoint
- Reworked scope telemetry storage into a ring buffer
- Increased telemetry cadence for desktop visualization

## Frontend changes

- Added `three` dependency
- Added `components/synth/WavetableThreeDisplay.tsx`
- Replaced the old WAVE demo display in `OscillatorPanel.tsx`
- Added Electron IPC plumbing for on-demand wavetable fetches
- Extended `AudioBridge.ts` with wavetable display data access

## Verification performed

Successful:

- TypeScript editor diagnostics: no errors in changed files
- `npm run build`: passed
- `cargo check -p hypersynth-standalone`: passed
- `cargo build --release -p hypersynth-standalone` with alternate target dir: passed
- standalone CLI wavetable export endpoint: returned JSON payload successfully

Not fully verified from tools:

- Electron window runtime could not be fully confirmed because local Electron launch hit Chromium disk cache permission errors on this machine
- Because of that, visual FPS confirmation from the actual Electron window was not possible here, even though `Stats` was added to the display component for live measurement in dev mode

## Known limitations

- The active synth voice path is still VA-only in the Rust engine
- The WAVE page now uses Rust-exported wavetable data for the 3D stack, but the live overlay reflects current engine output scope rather than a dedicated wavetable-oscillator voice path
- The spectrogram uses a lightweight renderer-side magnitude estimate from the scope frame, not a full FFT pipeline yet
- If Chromium cache permissions remain restricted locally, Electron may still print cache warnings during launch even though the app build is otherwise valid
