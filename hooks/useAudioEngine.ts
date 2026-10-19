import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyAudioSettings,
  listAudioHosts,
  applyMidiSettings,
  getAudioBackendInfo,
  getAudioMeters,
  getAudioSettings,
  getEngineStats,
  getMidiSettings,
  initAudio,
  listAudioDevices,
  listMidiInputs,
  setParam,
  setParamById,
  noteOn,
  noteOff,
  resumeAudio,
  PARAM_MAP,
  type AudioBackendInfo,
  type AudioDeviceInfo,
  type AudioEngineSettings,
  type AudioHostInfo,
  type MeterState,
  type MidiInputInfo,
  type MidiSettings,
} from "@/lib/audio/AudioBridge";
export { P, getParamDescriptor, PARAM_DESCRIPTORS } from "@/lib/audio/generatedParamMap";
export type { ParamDescriptor } from "@/lib/audio/generatedParamMap";

export function useAudioEngine() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioEngineSettings>(getAudioSettings());
  const [midiSettings, setMidiSettings] = useState<MidiSettings>(getMidiSettings());
  const [audioHosts, setAudioHosts] = useState<AudioHostInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [midiInputs, setMidiInputs] = useState<MidiInputInfo[]>([]);
  const [engineStats, setEngineStats] = useState(getEngineStats());
  const [meters, setMeters] = useState<MeterState>(getAudioMeters());
  const [backendInfo, setBackendInfo] = useState<AudioBackendInfo>(getAudioBackendInfo());
  const initStarted = useRef(false);

  const refreshAudioDevices = useCallback(async () => {
    const [hosts, devices] = await Promise.all([listAudioHosts(), listAudioDevices()]);
    setAudioHosts(hosts);
    setAudioDevices(devices);
    setAudioSettings(getAudioSettings());
    setBackendInfo(getAudioBackendInfo());
  }, []);

  const refreshMidiInputs = useCallback(async () => {
    const inputs = await listMidiInputs();
    setMidiInputs(inputs);
    setMidiSettings(getMidiSettings());
  }, []);

  const initialize = useCallback(async () => {
    if (initStarted.current) return;
    initStarted.current = true;
    try {
      setError(null);
      await initAudio();
      setIsReady(true);
      setAudioSettings(getAudioSettings());
      setEngineStats(getEngineStats());
      setBackendInfo(getAudioBackendInfo());
      await refreshAudioDevices();
      await refreshMidiInputs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio init failed");
      initStarted.current = false;
    }
  }, [refreshAudioDevices, refreshMidiInputs]);

  /** Send a UI knob value to the engine. uiParamId is a PARAM_MAP key. */
  const sendParam = useCallback((uiParamId: string, value: number) => {
    const engineTarget = PARAM_MAP[uiParamId] ?? uiParamId;
    setParam(engineTarget, value);
  }, []);

  /** Send a parameter value by its stable numeric ID (preferred over string API). */
  const sendParamById = useCallback((id: number, value: number) => {
    setParamById(id, value);
  }, []);

  const triggerNoteOn = useCallback(
    (note: number, velocity = 1.0) => {
      void resumeAudio().catch(() => undefined).finally(() => noteOn(note, velocity));
    },
    []
  );

  const triggerNoteOff = useCallback((note: number) => {
    noteOff(note);
  }, []);

  const updateAudioSettings = useCallback(async (patch: Partial<AudioEngineSettings>) => {
    try {
      setError(null);
      const nextSettings = await applyAudioSettings(patch);
      setAudioSettings(nextSettings);
      setEngineStats(getEngineStats());
      setBackendInfo(getAudioBackendInfo());
      setIsReady(getEngineStats().audioState !== "uninitialized");
      await refreshAudioDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio reconfiguration failed");
    }
  }, [refreshAudioDevices]);

  const updateMidiSettings = useCallback(async (patch: Partial<MidiSettings>) => {
    try {
      setError(null);
      const inputs = await applyMidiSettings(patch);
      setMidiInputs(inputs);
      setMidiSettings(getMidiSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : "MIDI reconfiguration failed");
    }
  }, []);

  useEffect(() => {
    void refreshAudioDevices();
    void refreshMidiInputs();
    void initialize();

    const statsInterval = window.setInterval(() => {
      const stats = getEngineStats();
      const info = getAudioBackendInfo();
      setEngineStats(stats);
      setMeters(getAudioMeters());
      setBackendInfo(info);
      setIsReady(stats.audioState === "running");
      if (stats.audioState === "error") {
        setError(info.driverModel || "Native audio stream error");
      } else if (stats.audioState === "running") {
        setError(null);
      }
    }, 120);

    return () => {
      window.clearInterval(statsInterval);
    };
  }, [initialize, refreshAudioDevices, refreshMidiInputs]);

  useEffect(() => {
    let didUnlock = false;

    const unlockAudio = () => {
      if (didUnlock) return;
      didUnlock = true;
      void initialize()
        .catch(() => undefined)
        .finally(() => {
          void resumeAudio().catch(() => undefined);
        });
    };

    window.addEventListener("pointerdown", unlockAudio, { capture: true });
    window.addEventListener("keydown", unlockAudio, { capture: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("keydown", unlockAudio, { capture: true });
    };
  }, [initialize]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel("hypersynth-midi");
    channel.onmessage = (event) => {
      const data = event.data as { type?: string; note?: number; velocity?: number };
      if (data.type === "noteOn" && typeof data.note === "number") {
        void resumeAudio().catch(() => undefined).finally(() => noteOn(data.note!, data.velocity ?? 1));
      }
      if (data.type === "noteOff" && typeof data.note === "number") {
        noteOff(data.note);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  return {
    isReady,
    error,
    initialize,
    sendParam,
    sendParamById,
    triggerNoteOn,
    triggerNoteOff,
    audioSettings,
    audioHosts,
    midiSettings,
    audioDevices,
    midiInputs,
    engineStats,
    meters,
    backendInfo,
    updateAudioSettings,
    updateMidiSettings,
    refreshAudioDevices,
    refreshMidiInputs,
  };
}
