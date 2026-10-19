/**
 * AudioBridge — connects the React UI to the Rust WASM engine
 * via Web Audio API.
 * The WASM module is loaded dynamically at runtime from /wasm/hypersynth_wasm.js
 * (served from public/). No static import is used so Next.js / Turbopack
 * never tries to bundle the file.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type BufferSize = 256 | 512 | 1024 | 2048;
export type VelocityCurve = "soft" | "linear" | "hard";

export interface AudioEngineSettings {
  sampleRate: number;
  bufferSize: BufferSize;
  audioHostId: string | "default";
  outputDeviceId: string | "default";
  outputChannelPair: number;
}

export interface AudioHostInfo {
  hostId: string;
  label: string;
  isDefault: boolean;
  available: boolean;
}

export interface MidiSettings {
  enabled: boolean;
  inputId: string | "all" | null;
  channel: number | "all";
  velocityCurve: VelocityCurve;
}

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  connection: string;
}

export interface EngineStats {
  audioState: string;
  activeVoices: number;
  sampleRate: number;
  bufferSize: BufferSize;
}

export interface AudioDeviceInfo {
  deviceId: string;
  kind: "audioinput" | "audiooutput";
  label: string;
  groupId: string;
  isDefault: boolean;
  hostId: string;
  hostName: string;
  maxChannels: number;
  defaultSampleRate: number | null;
}

export interface AudioBackendInfo {
  backend: "Web Audio" | "Native Rust";
  driverModel: string;
  requestedSampleRate: number;
  actualSampleRate: number | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  outputSelectionSupported: boolean;
  selectedHostId: string;
  selectedHostName: string;
  outputDeviceId: string | "default";
  outputDeviceLabel: string;
  outputChannelPair: number;
  outputChannelCount: number;
  availableOutputPairs: number;
}

export interface ScopeFrame {
  samples: number[];
}

export interface MeterState {
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

export interface WavetableDisplayData {
  preset: string;
  sourceFrameCount: number;
  displayFrameCount: number;
  frameSize: number;
  samples: number[];
}

const DEFAULT_AUDIO_SETTINGS: AudioEngineSettings = {
  sampleRate: 48000,
  bufferSize: 256,
  audioHostId: "default",
  outputDeviceId: "default",
  outputChannelPair: 0,
};

const AUDIO_SETTINGS_SCHEMA_VERSION = 2;

const DEFAULT_MIDI_SETTINGS: MidiSettings = {
  enabled: true,
  inputId: "all",
  channel: "all",
  velocityCurve: "linear",
};

let audioContext: AudioContext | null = null;
let wasmEngine: any = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let isInitialized = false;
let currentAudioSettings: AudioEngineSettings = { ...DEFAULT_AUDIO_SETTINGS };
let currentMidiSettings: MidiSettings = { ...DEFAULT_MIDI_SETTINGS };
let audioHostExplicitlySelected = false;
let outputDeviceExplicitlySelected = false;
let sampleRateExplicitlySelected = false;
let midiAccess: any = null;
let deviceAccessRequested = false;
let currentMeters: MeterState = {
  peakL: 0,
  peakR: 0,
  rmsL: 0,
  rmsR: 0,
};
let nativeAudioHosts: AudioHostInfo[] = [];
let nativeAudioDevices: AudioDeviceInfo[] = [];
let nativeMidiInputs: MidiInputInfo[] = [];
let nativeInventoryLoaded = false;
let nativeInventoryRefreshPromise: Promise<void> | null = null;
let nativeBridgeDisabledForSession = false;
let nativeFallbackInProgress = false;
let nativeEngineStats: EngineStats = {
  audioState: "uninitialized",
  activeVoices: 0,
  sampleRate: DEFAULT_AUDIO_SETTINGS.sampleRate,
  bufferSize: DEFAULT_AUDIO_SETTINGS.bufferSize,
};
let nativeBackendInfo: AudioBackendInfo = {
  backend: "Native Rust",
  driverModel: "CPAL native audio host",
  requestedSampleRate: DEFAULT_AUDIO_SETTINGS.sampleRate,
  actualSampleRate: null,
  baseLatencyMs: null,
  outputLatencyMs: null,
  outputSelectionSupported: true,
  selectedHostId: "default",
  selectedHostName: "System Default",
  outputDeviceId: "default",
  outputDeviceLabel: "System Default Output",
  outputChannelPair: 0,
  outputChannelCount: 2,
  availableOutputPairs: 1,
};
let currentScopeFrame: ScopeFrame = { samples: [] };
let nativeSubscriptionInitialized = false;
const pendingParamChanges: Array<{ target: string; value: number }> = [];

function flushPendingParamChanges(): void {
  if (!isInitialized || pendingParamChanges.length === 0) return;
  const pending = pendingParamChanges.splice(0, pendingParamChanges.length);
  for (const { target, value } of pending) {
    setParam(target, value);
  }
}

function getRawNativeBridge(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).hyperSynthNative ?? null;
}

function getNativeBridge(): any | null {
  if (nativeBridgeDisabledForSession) return null;
  return getRawNativeBridge();
}

function hasNativeBridge(): boolean {
  const bridge = getNativeBridge();
  return Boolean(bridge?.isAvailable?.());
}

function switchToWebAudioFallback(reason: string): void {
  if (nativeFallbackInProgress || nativeBridgeDisabledForSession) return;
  nativeFallbackInProgress = true;
  nativeBridgeDisabledForSession = true;
  isInitialized = false;
  audioHostExplicitlySelected = false;
  outputDeviceExplicitlySelected = false;
  currentAudioSettings = {
    ...currentAudioSettings,
    audioHostId: DEFAULT_AUDIO_SETTINGS.audioHostId,
    outputDeviceId: DEFAULT_AUDIO_SETTINGS.outputDeviceId,
    outputChannelPair: DEFAULT_AUDIO_SETTINGS.outputChannelPair,
  };
  console.warn("[AudioBridge] Native audio stream failed; switching to WebAudio/WASM fallback", reason);

  void getRawNativeBridge()?.stopEngine?.().catch(() => undefined);
  void initAudio()
    .catch((error) => console.error("[AudioBridge] WebAudio/WASM fallback failed", error))
    .finally(() => {
      nativeFallbackInProgress = false;
    });
}

function applyNativeSnapshot(snapshot: any): void {
  if (!snapshot) return;
  if (nativeBridgeDisabledForSession) return;

  if (snapshot.audioHosts) {
    nativeAudioHosts = snapshot.audioHosts;
    nativeInventoryLoaded = true;
  }
  if (snapshot.audioDevices) {
    nativeAudioDevices = snapshot.audioDevices;
    nativeInventoryLoaded = true;
  }
  if (snapshot.midiInputs) {
    nativeMidiInputs = snapshot.midiInputs;
    nativeInventoryLoaded = true;
  }
  if (snapshot.engineStats) {
    nativeEngineStats = {
      audioState: snapshot.engineStats.audioState ?? nativeEngineStats.audioState,
      activeVoices: snapshot.engineStats.activeVoices ?? nativeEngineStats.activeVoices,
      sampleRate: snapshot.engineStats.sampleRate ?? nativeEngineStats.sampleRate,
      bufferSize: snapshot.engineStats.bufferSize ?? nativeEngineStats.bufferSize,
    };
  }
  if (snapshot.backendInfo) {
    nativeBackendInfo = {
      backend: snapshot.backendInfo.backend ?? "Native Rust",
      driverModel: snapshot.backendInfo.driverModel ?? nativeBackendInfo.driverModel,
      requestedSampleRate: snapshot.backendInfo.requestedSampleRate ?? currentAudioSettings.sampleRate,
      actualSampleRate: snapshot.backendInfo.actualSampleRate ?? null,
      baseLatencyMs: snapshot.backendInfo.baseLatencyMs ?? null,
      outputLatencyMs: snapshot.backendInfo.outputLatencyMs ?? null,
      outputSelectionSupported: snapshot.backendInfo.outputSelectionSupported ?? true,
      selectedHostId: snapshot.backendInfo.selectedHostId ?? nativeBackendInfo.selectedHostId,
      selectedHostName: snapshot.backendInfo.selectedHostName ?? nativeBackendInfo.selectedHostName,
      outputDeviceId: snapshot.backendInfo.outputDeviceId ?? currentAudioSettings.outputDeviceId,
      outputDeviceLabel: snapshot.backendInfo.outputDeviceLabel ?? nativeBackendInfo.outputDeviceLabel,
      outputChannelPair: snapshot.backendInfo.outputChannelPair ?? nativeBackendInfo.outputChannelPair,
      outputChannelCount: snapshot.backendInfo.outputChannelCount ?? nativeBackendInfo.outputChannelCount,
      availableOutputPairs: snapshot.backendInfo.availableOutputPairs ?? nativeBackendInfo.availableOutputPairs,
    };
  }
  if (snapshot.meters) {
    currentMeters = {
      peakL: snapshot.meters.peakL ?? 0,
      peakR: snapshot.meters.peakR ?? 0,
      rmsL: snapshot.meters.rmsL ?? 0,
      rmsR: snapshot.meters.rmsR ?? 0,
    };
  }
  if (snapshot.scope?.samples) {
    currentScopeFrame = {
      samples: Array.isArray(snapshot.scope.samples) ? snapshot.scope.samples.map((value: number) => Number(value) || 0) : [],
    };
  }

  if (snapshot.engineStats?.audioState === "error") {
    switchToWebAudioFallback(snapshot.backendInfo?.driverModel ?? "Native audio stream error");
    return;
  }

  currentAudioSettings = {
    ...currentAudioSettings,
    sampleRate: nativeBackendInfo.requestedSampleRate ?? currentAudioSettings.sampleRate,
    audioHostId: (nativeBackendInfo.selectedHostId as string | "default") ?? currentAudioSettings.audioHostId,
    outputDeviceId: (nativeBackendInfo.outputDeviceId as string | "default") ?? currentAudioSettings.outputDeviceId,
    bufferSize: nativeEngineStats.bufferSize,
    outputChannelPair: nativeBackendInfo.outputChannelPair ?? currentAudioSettings.outputChannelPair,
  };
}

async function ensureNativeSubscription(): Promise<void> {
  if (!hasNativeBridge() || nativeSubscriptionInitialized) return;

  const bridge = getNativeBridge();
  bridge.onEvent((snapshot: any) => {
    applyNativeSnapshot(snapshot);
  });

  const snapshot = await bridge.getState().catch(() => null);
  applyNativeSnapshot(snapshot);
  nativeSubscriptionInitialized = true;
}

async function refreshNativeInventory(): Promise<void> {
  await ensureNativeSubscription();
  if (nativeInventoryRefreshPromise) {
    return nativeInventoryRefreshPromise;
  }

  const bridge = getNativeBridge();
  const refreshPromise = bridge
    ?.listDevices?.()
    .then((snapshot: any) => applyNativeSnapshot(snapshot))
    .catch(() => undefined)
    .finally(() => {
      nativeInventoryRefreshPromise = null;
    }) ?? Promise.resolve();

  nativeInventoryRefreshPromise = refreshPromise;
  return refreshPromise;
}

/**
 * Load persisted audio/MIDI settings from localStorage if available.
 * Falls back to defaults for any missing keys.
 */
function loadPersistedSettings(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem("hypersynth-audio-settings");
    if (raw) {
      const saved = JSON.parse(raw);
      const isCurrentSchema = saved.version === AUDIO_SETTINGS_SCHEMA_VERSION;

      // Legacy builds persisted explicit ASIO/device choices even when the user
      // never meant to pin them. Treat old settings as unsafe and return to the
      // shared system output so Electron does not reopen a stale/exclusive device
      // and report healthy meters while the driver is actually silent.
      currentAudioSettings = {
        sampleRate: isCurrentSchema ? saved.sampleRate ?? DEFAULT_AUDIO_SETTINGS.sampleRate : DEFAULT_AUDIO_SETTINGS.sampleRate,
        bufferSize: saved.bufferSize ?? DEFAULT_AUDIO_SETTINGS.bufferSize,
        audioHostId: isCurrentSchema ? saved.audioHostId ?? DEFAULT_AUDIO_SETTINGS.audioHostId : DEFAULT_AUDIO_SETTINGS.audioHostId,
        outputDeviceId: isCurrentSchema ? saved.outputDeviceId ?? DEFAULT_AUDIO_SETTINGS.outputDeviceId : DEFAULT_AUDIO_SETTINGS.outputDeviceId,
        outputChannelPair: isCurrentSchema ? saved.outputChannelPair ?? DEFAULT_AUDIO_SETTINGS.outputChannelPair : DEFAULT_AUDIO_SETTINGS.outputChannelPair,
      };
      audioHostExplicitlySelected = isCurrentSchema ? saved.audioHostExplicitlySelected ?? false : false;
      outputDeviceExplicitlySelected = isCurrentSchema ? saved.outputDeviceExplicitlySelected ?? false : false;
      sampleRateExplicitlySelected = isCurrentSchema ? saved.sampleRateExplicitlySelected ?? false : false;
    }
  } catch {
    // ignore corrupt data
  }
  try {
    const raw = window.localStorage.getItem("hypersynth-midi-settings");
    if (raw) {
      const saved = JSON.parse(raw);
      currentMidiSettings = {
        enabled: saved.enabled ?? DEFAULT_MIDI_SETTINGS.enabled,
        inputId: saved.inputId ?? DEFAULT_MIDI_SETTINGS.inputId,
        channel: saved.channel ?? DEFAULT_MIDI_SETTINGS.channel,
        velocityCurve: saved.velocityCurve ?? DEFAULT_MIDI_SETTINGS.velocityCurve,
      };
    }
  } catch {
    // ignore corrupt data
  }
}

function persistSettings(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem("hypersynth-audio-settings", JSON.stringify({
      version: AUDIO_SETTINGS_SCHEMA_VERSION,
      ...currentAudioSettings,
      audioHostExplicitlySelected,
      outputDeviceExplicitlySelected,
      sampleRateExplicitlySelected,
    }));
    window.localStorage.setItem("hypersynth-midi-settings", JSON.stringify(currentMidiSettings));
  } catch {
    // storage full or unavailable
  }
}

/**
 * Initialize the WASM engine and Web Audio API.
 * Must be called from a user-gesture handler (browser autoplay policy).
 */
export async function initAudio(): Promise<void> {
  if (isInitialized) return;

  loadPersistedSettings();

  if (hasNativeBridge()) {
    await ensureNativeSubscription();
    const snapshot = await getNativeBridge()?.listDevices?.().catch(() => null);
    applyNativeSnapshot(snapshot);

    // Keep the startup path safe: use the shared default host unless the user
    // explicitly selected another host. Old builds auto-saved ASIO here, which
    // can crash some Windows drivers with a Rust callback stack overflow.
    if (!audioHostExplicitlySelected && currentAudioSettings.audioHostId.toLowerCase() === "asio") {
      currentAudioSettings.audioHostId = DEFAULT_AUDIO_SETTINGS.audioHostId;
      currentAudioSettings.outputDeviceId = DEFAULT_AUDIO_SETTINGS.outputDeviceId;
      currentAudioSettings.outputChannelPair = DEFAULT_AUDIO_SETTINGS.outputChannelPair;
    }
    if (!outputDeviceExplicitlySelected) {
      currentAudioSettings.outputDeviceId = DEFAULT_AUDIO_SETTINGS.outputDeviceId;
      currentAudioSettings.outputChannelPair = DEFAULT_AUDIO_SETTINGS.outputChannelPair;
    }
    if (!sampleRateExplicitlySelected) {
      currentAudioSettings.sampleRate = DEFAULT_AUDIO_SETTINGS.sampleRate;
    }

    const bridge = getNativeBridge();
    let runtimeSnapshot: any;
    try {
      runtimeSnapshot = await bridge.startEngine(currentAudioSettings, currentMidiSettings);
    } catch (error) {
      if (currentAudioSettings.audioHostId === "default") {
        throw error;
      }

      console.warn("[AudioBridge] Native host failed, falling back to default audio host", error);
      audioHostExplicitlySelected = false;
      outputDeviceExplicitlySelected = false;
      sampleRateExplicitlySelected = false;
      currentAudioSettings = {
        ...currentAudioSettings,
        sampleRate: DEFAULT_AUDIO_SETTINGS.sampleRate,
        audioHostId: DEFAULT_AUDIO_SETTINGS.audioHostId,
        outputDeviceId: DEFAULT_AUDIO_SETTINGS.outputDeviceId,
        outputChannelPair: DEFAULT_AUDIO_SETTINGS.outputChannelPair,
      };
      runtimeSnapshot = await bridge.startEngine(currentAudioSettings, currentMidiSettings);
    }
    applyNativeSnapshot(runtimeSnapshot);
    persistSettings();
    isInitialized = true;
    flushPendingParamChanges();
    return;
  }

  // Hide the import from Turbopack so the file is requested from /public at runtime.
  const loadModule = new Function("url", "return import(url)") as (url: string) => Promise<any>;
  const wasmModule = await loadModule("/wasm/hypersynth_wasm.js");
  await wasmModule.default();

  audioContext = new AudioContext({ sampleRate: currentAudioSettings.sampleRate });
  await applyOutputDeviceToContext(audioContext);
  wasmEngine = new wasmModule.WasmEngine(audioContext.sampleRate);
  scriptProcessor = audioContext.createScriptProcessor(currentAudioSettings.bufferSize, 0, 2);

  scriptProcessor.onaudioprocess = (event) => {
    const engine = wasmEngine;
    if (!engine) return;

    const outputL = event.outputBuffer.getChannelData(0);
    const outputR = event.outputBuffer.getChannelData(1);
    const numFrames = outputL.length;
    const samples = engine.process(numFrames);
    let peakL = 0;
    let peakR = 0;
    let sumSqL = 0;
    let sumSqR = 0;

    for (let i = 0; i < numFrames; i++) {
      const left = samples[i * 2];
      const right = samples[i * 2 + 1];
      outputL[i] = left;
      outputR[i] = right;

      const absL = Math.abs(left);
      const absR = Math.abs(right);
      if (absL > peakL) peakL = absL;
      if (absR > peakR) peakR = absR;
      sumSqL += left * left;
      sumSqR += right * right;
    }

    currentMeters = {
      peakL: peakL * 100,
      peakR: peakR * 100,
      rmsL: Math.sqrt(sumSqL / Math.max(numFrames, 1)) * 100,
      rmsR: Math.sqrt(sumSqR / Math.max(numFrames, 1)) * 100,
    };
  };

  scriptProcessor.connect(audioContext.destination);
  isInitialized = true;
  flushPendingParamChanges();
  await bindMidiInputs();

  console.log("[AudioBridge] Initialized successfully");
  console.log("[AudioBridge] Requested sample rate:", currentAudioSettings.sampleRate);
  console.log("[AudioBridge] Engine sample rate:", wasmEngine.get_sample_rate());
  console.log("[AudioBridge] Buffer size:", currentAudioSettings.bufferSize);
}

export async function shutdownAudio(): Promise<void> {
  if (hasNativeBridge()) {
    const bridge = getNativeBridge();
    const snapshot = await bridge.stopEngine();
    applyNativeSnapshot(snapshot);
    isInitialized = false;
    return;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor.onaudioprocess = null;
    scriptProcessor = null;
  }

  wasmEngine = null;
  isInitialized = false;

  if (audioContext) {
    const context = audioContext;
    audioContext = null;
    await context.close().catch(() => undefined);
  }
}

export async function applyAudioSettings(patch: Partial<AudioEngineSettings>): Promise<AudioEngineSettings> {
  if (patch.audioHostId !== undefined) {
    audioHostExplicitlySelected = patch.audioHostId !== "default";
  }
  if (patch.outputDeviceId !== undefined) {
    outputDeviceExplicitlySelected = patch.outputDeviceId !== "default";
  }
  if (patch.sampleRate !== undefined) {
    sampleRateExplicitlySelected = true;
  }
  currentAudioSettings = { ...currentAudioSettings, ...patch };
  persistSettings();

  if (hasNativeBridge()) {
    await ensureNativeSubscription();
    const snapshot = await getNativeBridge()?.listDevices?.().catch(() => null);
    applyNativeSnapshot(snapshot);
    if (isInitialized) {
      const snapshot = await getNativeBridge().restartEngine(currentAudioSettings, currentMidiSettings);
      applyNativeSnapshot(snapshot);
    }
    return getAudioSettings();
  }

  if (isInitialized) {
    await shutdownAudio();
    await initAudio();
  }

  return getAudioSettings();
}

export function getAudioSettings(): AudioEngineSettings {
  return { ...currentAudioSettings };
}

export function getAudioBackendInfo(): AudioBackendInfo {
  if (hasNativeBridge()) {
    return { ...nativeBackendInfo };
  }

  return {
    backend: "Web Audio",
    driverModel: "Chromium system audio path (no direct ASIO/WASAPI/CoreAudio driver selection)",
    requestedSampleRate: currentAudioSettings.sampleRate,
    actualSampleRate: audioContext?.sampleRate ?? null,
    baseLatencyMs: audioContext?.baseLatency != null ? audioContext.baseLatency * 1000 : null,
    outputLatencyMs: (audioContext as any)?.outputLatency != null ? (audioContext as any).outputLatency * 1000 : null,
    outputSelectionSupported: Boolean(audioContext && typeof (audioContext as any).setSinkId === "function"),
    selectedHostId: "chromium",
    selectedHostName: "Chromium System Audio",
    outputDeviceId: currentAudioSettings.outputDeviceId,
    outputDeviceLabel: currentAudioSettings.outputDeviceId === "default" ? "System Default Output" : currentAudioSettings.outputDeviceId,
    outputChannelPair: 0,
    outputChannelCount: 2,
    availableOutputPairs: 1,
  };
}

export function getAudioMeters(): MeterState {
  return { ...currentMeters };
}

export function getScopeFrame(): ScopeFrame {
  return {
    samples: [...currentScopeFrame.samples],
  };
}

export async function getWavetableDisplayData(
  preset: string = "basic",
  frames: number = 64,
): Promise<WavetableDisplayData> {
  if (hasNativeBridge()) {
    return (await getNativeBridge()?.getWavetableDisplayData?.(preset, frames)) as WavetableDisplayData;
  }

  return {
    preset: "Basic",
    sourceFrameCount: 0,
    displayFrameCount: 0,
    frameSize: 0,
    samples: [],
  };
}

/**
 * Send a parameter change to the Rust engine.
 * @param target  Engine parameter key (e.g. "filter_cutoff")
 * @param value   Raw value in the parameter's native range
 */
export function setParam(target: string, value: number): void {
  if (!isInitialized) {
    const existing = pendingParamChanges.find((entry) => entry.target === target);
    if (existing) {
      existing.value = value;
    } else {
      pendingParamChanges.push({ target, value });
    }
    return;
  }

  if (hasNativeBridge()) {
    void getNativeBridge()?.setParam(target, value);
    return;
  }

  if (!wasmEngine) return;
  const dedicated = DEDICATED_SETTERS[target];
  if (dedicated) {
    dedicated(wasmEngine, value);
  } else {
    wasmEngine.set_param(target, value);
  }
}

/**
 * Set a parameter by its stable numeric ID (preferred over string API).
 * IDs are exported from `lib/audio/generatedParamMap.ts` as the `P` object.
 * Falls back to a no-op if the engine is not yet initialised.
 */
export function setParamById(id: number, value: number): void {
  if (hasNativeBridge()) {
    // Native bridge still uses the string path for now
    void getNativeBridge()?.setParamById?.(id, value);
    return;
  }

  wasmEngine?.set_param_by_id(id, value);
}

/** Trigger a MIDI note-on */
export function noteOn(note: number, velocity: number = 1.0): void {
  if (hasNativeBridge()) {
    void getNativeBridge()?.noteOn(note, velocity);
    return;
  }

  wasmEngine?.note_on(note, velocity);
}

/** Trigger a MIDI note-off */
export function noteOff(note: number): void {
  if (hasNativeBridge()) {
    void getNativeBridge()?.noteOff(note);
    return;
  }

  wasmEngine?.note_off(note);
}

/** Resume audio context if the browser suspended it */
export async function resumeAudio(): Promise<void> {
  if (hasNativeBridge()) return;
  if (audioContext?.state === "suspended") {
    await audioContext.resume();
  }
}

/** Returns the current AudioContext state, or "uninitialized" */
export function getAudioState(): string {
  if (hasNativeBridge()) {
    return nativeEngineStats.audioState;
  }

  return audioContext?.state ?? "uninitialized";
}

export function getIsInitialized(): boolean {
  return isInitialized;
}

export function getEngineStats(): EngineStats {
  if (hasNativeBridge()) {
    return { ...nativeEngineStats };
  }

  return {
    audioState: getAudioState(),
    activeVoices: wasmEngine?.get_active_voices?.() ?? 0,
    sampleRate: audioContext?.sampleRate ?? currentAudioSettings.sampleRate,
    bufferSize: currentAudioSettings.bufferSize,
  };
}

export function getMidiSettings(): MidiSettings {
  return { ...currentMidiSettings };
}

export async function listMidiInputs(): Promise<MidiInputInfo[]> {
  if (hasNativeBridge()) {
    if (!(nativeInventoryLoaded && nativeEngineStats.audioState !== "uninitialized")) {
      await refreshNativeInventory();
    }
    return [...nativeMidiInputs];
  }

  return bindMidiInputs();
}

export async function listAudioHosts(): Promise<AudioHostInfo[]> {
  if (hasNativeBridge()) {
    if (!(nativeInventoryLoaded && nativeEngineStats.audioState !== "uninitialized")) {
      await refreshNativeInventory();
    }
    return [...nativeAudioHosts];
  }

  return [
    {
      hostId: "chromium",
      label: "Chromium System Audio",
      isDefault: true,
      available: true,
    },
  ];
}

export async function applyMidiSettings(patch: Partial<MidiSettings>): Promise<MidiInputInfo[]> {
  currentMidiSettings = { ...currentMidiSettings, ...patch };
  persistSettings();

  if (hasNativeBridge()) {
    await ensureNativeSubscription();
    if (isInitialized) {
      const snapshot = await getNativeBridge()?.restartEngine(currentAudioSettings, currentMidiSettings);
      applyNativeSnapshot(snapshot);
    }
    const deviceSnapshot = await getNativeBridge()?.listDevices();
    applyNativeSnapshot(deviceSnapshot);
    return [...nativeMidiInputs];
  }

  return bindMidiInputs();
}

export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (hasNativeBridge()) {
    if (!(nativeInventoryLoaded && nativeEngineStats.audioState !== "uninitialized")) {
      await refreshNativeInventory();
    }
    return [...nativeAudioDevices];
  }

  await ensureDeviceAccess();

  if (typeof navigator === "undefined" || !("mediaDevices" in navigator) || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput" || device.kind === "audiooutput")
    .map((device) => ({
      deviceId: device.deviceId,
      kind: device.kind as "audioinput" | "audiooutput",
      label: device.label || `${device.kind === "audiooutput" ? "Audio Out" : "Audio In"} (${device.deviceId || "default"})`,
      groupId: device.groupId,
      isDefault: device.deviceId === "default" || device.deviceId === "",
      hostId: "chromium",
      hostName: "Chromium System Audio",
      maxChannels: 2,
      defaultSampleRate: null,
    }));
}

function applyVelocityCurve(normalizedVelocity: number): number {
  switch (currentMidiSettings.velocityCurve) {
    case "soft":
      return Math.sqrt(normalizedVelocity);
    case "hard":
      return normalizedVelocity * normalizedVelocity;
    default:
      return normalizedVelocity;
  }
}

async function ensureMidiAccess(): Promise<any | null> {
  if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
    return null;
  }

  if (!midiAccess) {
    try {
      midiAccess = await (navigator as any).requestMIDIAccess();
    } catch (error) {
      console.warn("[AudioBridge] MIDI access unavailable", error);
      midiAccess = null;
    }
  }

  return midiAccess;
}

async function ensureDeviceAccess(): Promise<void> {
  if (deviceAccessRequested) return;
  deviceAccessRequested = true;

  if (typeof navigator === "undefined" || !("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
  } catch {
    // Device labels may stay hidden. We still return enumerateDevices() results honestly.
  }
}

async function applyOutputDeviceToContext(context: AudioContext): Promise<void> {
  if (currentAudioSettings.outputDeviceId === "default") return;
  const setSinkId = (context as any).setSinkId;
  if (typeof setSinkId !== "function") return;

  try {
    await setSinkId.call(context, currentAudioSettings.outputDeviceId);
  } catch (error) {
    console.warn("[AudioBridge] Failed to switch output device", error);
    currentAudioSettings.outputDeviceId = "default";
  }
}

function handleMidiMessage(event: any): void {
  const data: Uint8Array = event.data;
  if (!data || data.length < 3) return;

  const status = data[0];
  const message = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  if (currentMidiSettings.channel !== "all" && currentMidiSettings.channel !== channel) {
    return;
  }

  const note = data[1];
  const velocity = data[2] / 127;

  if (message === 0x90 && data[2] > 0) {
    noteOn(note, applyVelocityCurve(velocity));
    return;
  }

  if (message === 0x80 || (message === 0x90 && data[2] === 0)) {
    noteOff(note);
  }
}

async function bindMidiInputs(): Promise<MidiInputInfo[]> {
  const access = await ensureMidiAccess();
  if (!access) return [];

  const inputs = Array.from(access.inputs.values()) as any[];
  for (const input of inputs) {
    input.onmidimessage = null;
  }

  if (currentMidiSettings.enabled) {
    const useAllInputs = currentMidiSettings.inputId === "all" || !currentMidiSettings.inputId;
    for (const input of inputs) {
      if (useAllInputs || input.id === currentMidiSettings.inputId) {
        input.onmidimessage = handleMidiMessage;
      }
    }
  }

  return inputs.map((input: any) => ({
    id: input.id,
    name: input.name ?? "Unknown MIDI In",
    manufacturer: input.manufacturer ?? "Unknown",
    state: input.state ?? "unknown",
    connection: input.connection ?? "unknown",
  }));
}

/**
 * Maps UI knob IDs to Rust engine parameter keys.
 * Keys are the camelCase / hyphen IDs used in React state;
 * values are the exact strings `handle_message` matches on.
 */
export const PARAM_MAP: Record<string, string> = {
  // ── Filter ──
  "filter-cutoff":     "filter_cutoff",
  "filter-reso":       "filter_resonance",
  "filter-drive":      "filter_drive",
  "filter-env-amount": "filter_env_amount",
  // ── Amp envelope ──
  "amp-attack":        "amp_attack",
  "amp-decay":         "amp_decay",
  "amp-sustain":       "amp_sustain",
  "amp-release":       "amp_release",
  // ── Filter envelope ──
  "filter-env-attack":   "filter_env_attack",
  "filter-env-decay":    "filter_env_decay",
  "filter-env-sustain":  "filter_env_sustain",
  "filter-env-release":  "filter_env_release",
  // ── LFO 0 ──
  "lfo-rate":        "lfo_rate",
  "lfo-waveform":    "lfo_waveform",
  "lfo-mix-amount":  "lfo_mix_amount",
  // ── Osc 1 ──
  "osc1-level":   "osc1_level",
  "osc1-tune":    "osc1_tune",
  "osc1-detune":  "osc1_detune",
  "osc1-pan":     "osc1_pan",
  "osc1-waveform": "osc1_waveform",
  "osc1-pulse-width": "osc1_pulse_width",
  "osc1-engine-type": "osc1_engine_type",
  "osc1-va-drift":      "osc1_va_drift",
  "osc1-va-vintage":    "osc1_va_vintage",
  "osc1-va-brightness": "osc1_va_brightness",
  "osc1-va-sub-mode":   "osc1_va_sub_mode",
  "osc1-va-sub-level":  "osc1_va_sub_level",
  "osc1-va-sync":       "osc1_va_sync",
  "osc1-va-pwm":        "osc1_va_pwm",
  "osc1-wt-frame": "osc1_wt_frame",
  "osc1-wt-morph": "osc1_wt_morph",
  "osc1-wt-scan": "osc1_wt_scan",
  "osc1-wt-scan-time": "osc1_wt_scan_time",
  "osc1-wt-preset": "osc1_wt_preset",
  "osc1-fm-algorithm": "osc1_fm_algorithm",
  "osc1-fm-mod-index": "osc1_fm_mod_index",
  "osc1-fm-feedback": "osc1_fm_feedback",
  "osc1-fm-op1-ratio": "osc1_fm_op1_ratio",
  "osc1-fm-op2-ratio": "osc1_fm_op2_ratio",
  "osc1-fm-op3-ratio": "osc1_fm_op3_ratio",
  "osc1-fm-op4-ratio": "osc1_fm_op4_ratio",
  "osc1-fm-op1-level": "osc1_fm_op1_level",
  "osc1-fm-op2-level": "osc1_fm_op2_level",
  "osc1-fm-op3-level": "osc1_fm_op3_level",
  "osc1-fm-op4-level": "osc1_fm_op4_level",
  "osc1-gran-size": "osc1_gran_size",
  "osc1-gran-density": "osc1_gran_density",
  "osc1-gran-position": "osc1_gran_position",
  "osc1-gran-spray": "osc1_gran_spray",
  "osc1-gran-pitch-random": "osc1_gran_pitch_random",
  "osc1-gran-window": "osc1_gran_window",
  "osc1-modal-body": "osc1_modal_body",
  "osc1-modal-decay": "osc1_modal_decay",
  "osc1-modal-brightness": "osc1_modal_brightness",
  "osc1-add-harmonics": "osc1_add_harmonics",
  "osc1-add-morph": "osc1_add_morph",
  "osc1-samp-mode": "osc1_samp_mode",
  "osc1-samp-start": "osc1_samp_start",
  "osc1-samp-end": "osc1_samp_end",
  "osc1-samp-pitch": "osc1_samp_pitch",
  // ── Osc 2 ──
  "osc2-level":   "osc2_level",
  "osc2-tune":    "osc2_tune",
  "osc2-detune":  "osc2_detune",
  "osc2-pan":     "osc2_pan",
  "osc2-waveform": "osc2_waveform",
  "osc2-pulse-width": "osc2_pulse_width",
  "osc2-engine-type": "osc2_engine_type",
  "osc2-va-drift":      "osc2_va_drift",
  "osc2-va-vintage":    "osc2_va_vintage",
  "osc2-va-brightness": "osc2_va_brightness",
  "osc2-va-sub-mode":   "osc2_va_sub_mode",
  "osc2-va-sub-level":  "osc2_va_sub_level",
  "osc2-va-sync":       "osc2_va_sync",
  "osc2-va-pwm":        "osc2_va_pwm",
  "osc2-wt-frame": "osc2_wt_frame",
  "osc2-wt-morph": "osc2_wt_morph",
  "osc2-wt-scan": "osc2_wt_scan",
  "osc2-wt-scan-time": "osc2_wt_scan_time",
  "osc2-wt-preset": "osc2_wt_preset",
  "osc2-fm-algorithm": "osc2_fm_algorithm",
  "osc2-fm-mod-index": "osc2_fm_mod_index",
  "osc2-fm-feedback": "osc2_fm_feedback",
  "osc2-fm-op1-ratio": "osc2_fm_op1_ratio",
  "osc2-fm-op2-ratio": "osc2_fm_op2_ratio",
  "osc2-fm-op3-ratio": "osc2_fm_op3_ratio",
  "osc2-fm-op4-ratio": "osc2_fm_op4_ratio",
  "osc2-fm-op1-level": "osc2_fm_op1_level",
  "osc2-fm-op2-level": "osc2_fm_op2_level",
  "osc2-fm-op3-level": "osc2_fm_op3_level",
  "osc2-fm-op4-level": "osc2_fm_op4_level",
  "osc2-gran-size": "osc2_gran_size",
  "osc2-gran-density": "osc2_gran_density",
  "osc2-gran-position": "osc2_gran_position",
  "osc2-gran-spray": "osc2_gran_spray",
  "osc2-gran-pitch-random": "osc2_gran_pitch_random",
  "osc2-gran-window": "osc2_gran_window",
  "osc2-modal-body": "osc2_modal_body",
  "osc2-modal-decay": "osc2_modal_decay",
  "osc2-modal-brightness": "osc2_modal_brightness",
  "osc2-add-harmonics": "osc2_add_harmonics",
  "osc2-add-morph": "osc2_add_morph",
  "osc2-samp-mode": "osc2_samp_mode",
  "osc2-samp-start": "osc2_samp_start",
  "osc2-samp-end": "osc2_samp_end",
  "osc2-samp-pitch": "osc2_samp_pitch",
  // ── Osc 3 ──
  "osc3-level":   "osc3_level",
  "osc3-tune":    "osc3_tune",
  "osc3-detune":  "osc3_detune",
  "osc3-pan":     "osc3_pan",
  "osc3-waveform": "osc3_waveform",
  "osc3-pulse-width": "osc3_pulse_width",
  "osc3-engine-type": "osc3_engine_type",
  "osc3-va-drift":      "osc3_va_drift",
  "osc3-va-vintage":    "osc3_va_vintage",
  "osc3-va-brightness": "osc3_va_brightness",
  "osc3-va-sub-mode":   "osc3_va_sub_mode",
  "osc3-va-sub-level":  "osc3_va_sub_level",
  "osc3-va-sync":       "osc3_va_sync",
  "osc3-va-pwm":        "osc3_va_pwm",
  "osc3-wt-frame": "osc3_wt_frame",
  "osc3-wt-morph": "osc3_wt_morph",
  "osc3-wt-scan": "osc3_wt_scan",
  "osc3-wt-scan-time": "osc3_wt_scan_time",
  "osc3-wt-preset": "osc3_wt_preset",
  "osc3-fm-algorithm": "osc3_fm_algorithm",
  "osc3-fm-mod-index": "osc3_fm_mod_index",
  "osc3-fm-feedback": "osc3_fm_feedback",
  "osc3-fm-op1-ratio": "osc3_fm_op1_ratio",
  "osc3-fm-op2-ratio": "osc3_fm_op2_ratio",
  "osc3-fm-op3-ratio": "osc3_fm_op3_ratio",
  "osc3-fm-op4-ratio": "osc3_fm_op4_ratio",
  "osc3-fm-op1-level": "osc3_fm_op1_level",
  "osc3-fm-op2-level": "osc3_fm_op2_level",
  "osc3-fm-op3-level": "osc3_fm_op3_level",
  "osc3-fm-op4-level": "osc3_fm_op4_level",
  "osc3-gran-size": "osc3_gran_size",
  "osc3-gran-density": "osc3_gran_density",
  "osc3-gran-position": "osc3_gran_position",
  "osc3-gran-spray": "osc3_gran_spray",
  "osc3-gran-pitch-random": "osc3_gran_pitch_random",
  "osc3-gran-window": "osc3_gran_window",
  "osc3-modal-body": "osc3_modal_body",
  "osc3-modal-decay": "osc3_modal_decay",
  "osc3-modal-brightness": "osc3_modal_brightness",
  "osc3-add-harmonics": "osc3_add_harmonics",
  "osc3-add-morph": "osc3_add_morph",
  "osc3-samp-mode": "osc3_samp_mode",
  "osc3-samp-start": "osc3_samp_start",
  "osc3-samp-end": "osc3_samp_end",
  "osc3-samp-pitch": "osc3_samp_pitch",
  // ── Master ──
  "master-volume": "master_volume",
};

/**
 * Engine parameter keys that have a dedicated typed WASM method, routed
 * through a specific setter for correctness (e.g. time constants in seconds).
 */
const DEDICATED_SETTERS: Record<string, (engine: any, value: number) => void> = {
  amp_attack:          (e, v) => e.set_amp_attack(v),
  amp_decay:           (e, v) => e.set_amp_decay(v),
  amp_sustain:         (e, v) => e.set_amp_sustain(v),
  amp_release:         (e, v) => e.set_amp_release(v),
  filter_env_attack:   (e, v) => e.set_filter_env_attack(v),
  filter_env_decay:    (e, v) => e.set_filter_env_decay(v),
  filter_env_sustain:  (e, v) => e.set_filter_env_sustain(v),
  filter_env_release:  (e, v) => e.set_filter_env_release(v),
  lfo_rate:            (e, v) => e.set_lfo_rate(v),
  lfo_waveform:        (e, v) => e.set_lfo_waveform(v),
  lfo_mix_amount:      (e, v) => e.set_lfo_mix_amount(v),
};

// ── Wind Controller ────────────────────────────────────────────────────────────

/** Enable or disable the wind controller processing layer. */
export function windSetEnabled(enabled: boolean): void {
  if (hasNativeBridge()) {
    void (getNativeBridge() as any)?.windSetEnabled?.(enabled);
    return;
  }
  (wasmEngine as any)?.wind_set_enabled?.(enabled);
}

/** Route a raw MIDI CC to the wind processor (breath CC2, bite CC1, etc.). */
export function windHandleCC(cc: number, value: number): void {
  if (hasNativeBridge()) {
    void (getNativeBridge() as any)?.windHandleCC?.(cc, value);
    return;
  }
  (wasmEngine as any)?.wind_handle_cc?.(cc, value);
}

/** Send a 14-bit pitch-bend message to the wind processor. */
export function windHandlePitchBend(msb: number, lsb: number): void {
  if (hasNativeBridge()) {
    void (getNativeBridge() as any)?.windHandlePitchBend?.(msb, lsb);
    return;
  }
  (wasmEngine as any)?.wind_handle_pitch_bend?.(msb, lsb);
}

/** Route channel aftertouch to the wind bite-pressure smoother. */
export function windHandleAftertouch(value: number): void {
  if (hasNativeBridge()) {
    void (getNativeBridge() as any)?.windHandleAftertouch?.(value);
    return;
  }
  (wasmEngine as any)?.wind_handle_aftertouch?.(value);
}

/** Transfer a custom 128-point breath response curve to the engine. */
export function windSetCustomCurve(curve: Float32Array): void {
  if (curve.length !== 128) return;
  (wasmEngine as any)?.wind_set_custom_curve?.(curve);
}

/**
 * Set a wind controller parameter by its numeric ID (500–554).
 * See `WIND_PARAM` below or `wind::config::wind_param_id` in Rust.
 */
export function windSetParam(id: number, value: number): void {
  if (hasNativeBridge()) {
    void (getNativeBridge() as any)?.setParamById?.(id, value);
    return;
  }
  (wasmEngine as any)?.wind_set_param?.(id, value);
}

/** Wind parameter ID constants — mirrors `wind::config::wind_param_id` in Rust. */
export const WIND_PARAM = {
  ENABLED:          500,
  RESPONSE_TIME:    501,
  NOTE_MODE:        510,
  GLIDE_TIME:       511,
  PORTAMENTO_MODE:  512,
  BREATH_THRESHOLD: 520,
  BREATH_CURVE:     521,
  ROUTE_AMP:        530,
  ROUTE_FILTER:     531,
  ROUTE_DRIVE:      532,
  ROUTE_RESO:       533,
  ROUTE_VIBRATO:    534,
  ROUTE_PITCH:      535,
  ROUTE_NOISE:      536,
  BEND_RANGE:       540,
  BITE_MODE:        541,
  VIBRATO_RATE:     542,
  VIBRATO_DEPTH:    543,
  VIBRATO_DELAY:    544,
  VIBRATO_SHAPE:    545,
  BITE_MIN:         546,
  BITE_MAX:         547,
  GROWL_CC:         550,
  GROWL_FREQ:       551,
  GROWL_CHAOS:      552,
  FLUTTER_CC:       553,
  FLUTTER_FREQ:     554,
} as const;
