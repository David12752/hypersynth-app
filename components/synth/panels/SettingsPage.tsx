"use client"

import { SectionPanel } from "@/components/synth/SectionPanel"
import { ToggleButton } from "@/components/synth/ToggleButton"
import { SliderTrack } from "@/components/synth/SliderTrack"

type BufferSize = 256 | 512 | 1024 | 2048
type VelocityCurve = "soft" | "linear" | "hard"

interface MidiInputInfo {
  id: string
  name: string
  manufacturer: string
  state: string
  connection: string
}

interface SettingsPageProps {
  isReady: boolean
  audioError: string | null
  audioSettings: {
    sampleRate: number
    bufferSize: BufferSize
    audioHostId: string | "default"
    outputDeviceId: string | "default"
    outputChannelPair: number
  }
  audioHosts: Array<{
    hostId: string
    label: string
    isDefault: boolean
    available: boolean
  }>
  midiSettings: {
    enabled: boolean
    inputId: string | "all" | null
    channel: number | "all"
    velocityCurve: VelocityCurve
  }
  audioDevices: Array<{
    deviceId: string
    kind: "audioinput" | "audiooutput"
    label: string
    groupId: string
    isDefault: boolean
    hostId: string
    hostName: string
    maxChannels: number
    defaultSampleRate: number | null
  }>
  midiInputs: MidiInputInfo[]
  engineStats: {
    audioState: string
    activeVoices: number
    sampleRate: number
    bufferSize: BufferSize
  }
  backendInfo: {
    backend: "Web Audio" | "Native Rust"
    driverModel: string
    requestedSampleRate: number
    actualSampleRate: number | null
    baseLatencyMs: number | null
    outputLatencyMs: number | null
    outputSelectionSupported: boolean
    selectedHostId: string
    selectedHostName: string
    outputDeviceId: string | "default"
    outputDeviceLabel: string
    outputChannelPair: number
    outputChannelCount: number
    availableOutputPairs: number
  }
  onAudioSettingsChange: (patch: Partial<SettingsPageProps["audioSettings"]>) => void | Promise<void>
  onMidiSettingsChange: (patch: Partial<SettingsPageProps["midiSettings"]>) => void | Promise<void>
  onRefreshAudio: () => void | Promise<void>
  onRefreshMidi: () => void | Promise<void>
  onOpenKeyboard: () => void
}

const SAMPLE_RATES = [44100, 48000, 96000] as const
const BUFFER_SIZES = [256, 512, 1024, 2048] as const
const MIDI_CHANNELS = ["all", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const
const VELOCITY_CURVES = ["soft", "linear", "hard"] as const

export function SettingsPage({
  isReady,
  audioError,
  audioSettings,
  audioHosts,
  midiSettings,
  audioDevices,
  midiInputs,
  engineStats,
  backendInfo,
  onAudioSettingsChange,
  onMidiSettingsChange,
  onRefreshAudio,
  onRefreshMidi,
  onOpenKeyboard,
}: SettingsPageProps) {
  const selectedHostId = audioSettings.audioHostId === "default" ? backendInfo.selectedHostId : audioSettings.audioHostId
  const audioOutputs = audioDevices.filter((device) => device.kind === "audiooutput")
  const audioInputs = audioDevices.filter((device) => device.kind === "audioinput")
  const outputDevicesForHost = audioOutputs.filter((device) => device.hostId === selectedHostId)
  const inputDevicesForHost = audioInputs.filter((device) => device.hostId === selectedHostId)
  const selectedOutputDevice = outputDevicesForHost.find((device) => device.deviceId === audioSettings.outputDeviceId)
  const outputPairCount = Math.max(
    1,
    selectedOutputDevice
      ? Math.floor(Math.max(selectedOutputDevice.maxChannels, 2) / 2)
      : backendInfo.availableOutputPairs
  )

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1.3fr 1fr", minHeight: 0 }}>
      <SectionPanel
        title="AUDIO ENGINE"
        className="h-full"
        headerRight={
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-1 font-mono uppercase panel-recessed"
              style={{ fontSize: 7, letterSpacing: "1px", color: isReady ? "#10b981" : "#f59e0b" }}
            >
              {isReady ? "ENGINE LIVE" : "ENGINE RECOVERING"}
            </span>
            <button
              className="px-2 py-1 font-mono uppercase"
              style={{
                fontSize: 7,
                letterSpacing: "1px",
                background: "rgba(255,255,255,0.55)",
                color: "var(--text-section)",
                border: "1px solid var(--panel-shadow)",
              }}
              onClick={onRefreshAudio}
            >
              RESCAN
            </button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <StatusCard label="STATE" value={engineStats.audioState.toUpperCase()} accent={isReady ? "#10b981" : "#f59e0b"} />
            <StatusCard label="VOICES" value={String(engineStats.activeVoices)} accent="#10b981" />
            <StatusCard label="ENGINE SR" value={`${Math.round(engineStats.sampleRate)} Hz`} accent="#5865f2" />
            <StatusCard label="BUFFER" value={`${engineStats.bufferSize}`} accent="#a855f7" />
            <StatusCard label="BACKEND" value={backendInfo.backend} accent="#10b981" />
            <StatusCard label="LATENCY" value={backendInfo.baseLatencyMs == null ? "--" : `${backendInfo.baseLatencyMs.toFixed(1)} ms`} accent="#f59e0b" />
          </div>

          <div className="grid gap-2">
            <Label>Sample Rate</Label>
            <div className="flex gap-2">
              {SAMPLE_RATES.map((sampleRate) => (
                <ToggleButton
                  key={sampleRate}
                  active={audioSettings.sampleRate === sampleRate}
                  label={`${sampleRate / 1000}k`}
                  accentColor="#5865f2"
                  onClick={() => onAudioSettingsChange({ sampleRate })}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Buffer Size</Label>
            <div className="flex gap-2 flex-wrap">
              {BUFFER_SIZES.map((bufferSize) => (
                <ToggleButton
                  key={bufferSize}
                  active={audioSettings.bufferSize === bufferSize}
                  label={`${bufferSize}`}
                  accentColor="#a855f7"
                  onClick={() => onAudioSettingsChange({ bufferSize })}
                />
              ))}
            </div>
            <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
              Smaller buffers reduce latency. Larger buffers reduce CPU spikes.
            </span>
          </div>

          <div className="grid gap-2">
            <Label>Audio Driver / Host</Label>
            <NativeSelect
              value={audioSettings.audioHostId}
              onChange={(event) =>
                onAudioSettingsChange({
                  audioHostId: event.target.value as string | "default",
                  outputDeviceId: "default",
                  outputChannelPair: 0,
                })
              }
            >
              <option value="default">SYSTEM DEFAULT HOST</option>
              {audioHosts.map((host) => (
                <option key={host.hostId} value={host.hostId}>
                  {host.label}{host.isDefault ? " · DEFAULT" : ""}{host.hostId === "asio" ? " · EXCLUSIVE" : ""}
                </option>
              ))}
            </NativeSelect>
            {selectedHostId === "asio" ? (
              <span className="font-mono" style={{ fontSize: 8, color: "#f59e0b" }}>
                ⚠ ASIO runs in exclusive mode — other applications may lose audio while this host is active. If you need concurrent audio, switch to WASAPI.
              </span>
            ) : (
              <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
                WASAPI shared mode allows other applications to play audio simultaneously. ASIO offers lower latency but takes exclusive device control.
              </span>
            )}
            {backendInfo.driverModel.includes("fallback") && (
              <span className="font-mono" style={{ fontSize: 8, color: "#f59e0b" }}>
                ⚠ The requested host was unavailable. The engine fell back to {backendInfo.selectedHostName}.
              </span>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Audio Output Device</Label>
            <NativeSelect
              value={audioSettings.outputDeviceId}
              disabled={!backendInfo.outputSelectionSupported}
              onChange={(event) => onAudioSettingsChange({ outputDeviceId: event.target.value as string | "default" })}
            >
              <option value="default">HOST DEFAULT OUTPUT</option>
              {outputDevicesForHost.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </NativeSelect>
            <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
              {backendInfo.outputSelectionSupported
                ? "Output switching is exposed by this runtime. Changing the device restarts the audio path."
                : "This Web Audio standalone currently follows the system default output. Direct driver selection is not available from Chromium."}
            </span>
          </div>

          <div className="grid gap-2">
            <Label>Audio Output Pair</Label>
            <NativeSelect
              value={String(audioSettings.outputChannelPair)}
              disabled={!backendInfo.outputSelectionSupported}
              onChange={(event) => onAudioSettingsChange({ outputChannelPair: Number(event.target.value) })}
            >
              {Array.from({ length: outputPairCount }, (_, pairIndex) => (
                <option key={pairIndex} value={pairIndex}>
                  {`OUT ${pairIndex * 2 + 1}/${pairIndex * 2 + 2}`}
                </option>
              ))}
            </NativeSelect>
            <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
              Signal routing is pinned to the selected stereo output pair on the chosen hardware device.
            </span>
          </div>

          <div className="grid gap-2">
            <Label>Detected Audio Hardware</Label>
            <div className="panel-recessed px-2 py-2 grid gap-2" style={{ maxHeight: 200, overflow: "auto" }}>
              {audioDevices.length === 0 ? (
                <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
                  No audio devices were exposed by the current runtime.
                </span>
              ) : (
                <>
                  <DeviceGroup title={`OUTPUTS · ${selectedHostId.toUpperCase()}`} devices={outputDevicesForHost} />
                  <DeviceGroup title={`INPUTS · ${selectedHostId.toUpperCase()}`} devices={inputDevicesForHost} />
                </>
              )}
            </div>
          </div>

          {audioError && (
            <div className="panel-recessed px-3 py-2 font-mono" style={{ fontSize: 8, color: "#ef4444" }}>
              {audioError}
            </div>
          )}

          <div className="panel-recessed px-3 py-2 font-mono grid gap-1" style={{ fontSize: 8, color: "var(--text-display)" }}>
            <div>
              {backendInfo.backend === "Native Rust"
                ? "Audio settings are applied by restarting the native Rust host process that owns the real audio driver connection."
                : "Audio settings are applied to the Rust engine by rebuilding the WASM audio path."}
            </div>
            <div>{backendInfo.driverModel}</div>
            <div>{`Active host: ${backendInfo.selectedHostName} · Device: ${backendInfo.outputDeviceLabel}`}</div>
            <div>{`Routed output pair: ${backendInfo.outputChannelPair * 2 + 1}/${backendInfo.outputChannelPair * 2 + 2}`}</div>
            <div>Detected hardware is real device enumeration from the current runtime, not placeholder UI values.</div>
          </div>
        </div>
      </SectionPanel>

      <div className="grid gap-4" style={{ gridTemplateRows: "1fr auto" }}>
        <SectionPanel
          title="MIDI"
          headerRight={
            <button
              className="px-2 py-1 font-mono uppercase"
              style={{
                fontSize: 7,
                letterSpacing: "1px",
                background: "rgba(255,255,255,0.55)",
                color: "var(--text-section)",
                border: "1px solid var(--panel-shadow)",
              }}
              onClick={onRefreshMidi}
            >
              RESCAN
            </button>
          }
        >
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <Label>MIDI Input</Label>
              <ToggleButton
                active={midiSettings.enabled}
                label={midiSettings.enabled ? "ENABLED" : "DISABLED"}
                accentColor="#10b981"
                onClick={() => onMidiSettingsChange({ enabled: !midiSettings.enabled })}
              />
            </div>

            <NativeSelect
              value={midiSettings.inputId ?? "all"}
              onChange={(event) => onMidiSettingsChange({ inputId: event.target.value as string })}
            >
              <option value="all">ALL MIDI INPUTS</option>
              {midiInputs.map((input) => (
                <option key={input.id} value={input.id}>
                  {input.manufacturer} - {input.name}
                </option>
              ))}
            </NativeSelect>

            <div className="grid gap-2">
              <Label>MIDI Channel</Label>
              <NativeSelect
                value={String(midiSettings.channel)}
                onChange={(event) => {
                  const nextValue = event.target.value
                  onMidiSettingsChange({ channel: nextValue === "all" ? "all" : Number(nextValue) })
                }}
              >
                {MIDI_CHANNELS.map((channel) => (
                  <option key={String(channel)} value={String(channel)}>
                    {channel === "all" ? "OMNI" : `CHANNEL ${channel}`}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="grid gap-2">
              <Label>Velocity Curve</Label>
              <div className="flex gap-2">
                {VELOCITY_CURVES.map((curve) => (
                  <ToggleButton
                    key={curve}
                    active={midiSettings.velocityCurve === curve}
                    label={curve.toUpperCase()}
                    accentColor="#f59e0b"
                    onClick={() => onMidiSettingsChange({ velocityCurve: curve })}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Detected Inputs</Label>
              <div className="panel-recessed px-2 py-2 grid gap-2" style={{ maxHeight: 180, overflow: "auto" }}>
                {midiInputs.length === 0 ? (
                  <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
                    No MIDI inputs detected.
                  </span>
                ) : (
                  midiInputs.map((input) => (
                    <div key={input.id} className="flex items-center justify-between gap-3">
                      <div className="grid">
                        <span className="font-mono" style={{ fontSize: 8, color: "var(--text-display)" }}>
                          {input.name}
                        </span>
                        <span className="font-mono" style={{ fontSize: 7, color: "var(--text-label)" }}>
                          {input.manufacturer} · {input.state} · {input.connection}
                        </span>
                      </div>
                      <div
                        className="rounded-full"
                        style={{
                          width: 8,
                          height: 8,
                          background: input.state === "connected" ? "#10b981" : "#6b7280",
                          boxShadow: input.state === "connected" ? "0 0 8px rgba(16,185,129,0.6)" : "none",
                        }}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </SectionPanel>

        <SectionPanel title="PERFORMANCE KEYBOARD">
          <div className="grid gap-3">
            <SliderTrack
              value={audioSettings.bufferSize}
              min={256}
              max={2048}
              label="LAT"
              displayValue={`${audioSettings.bufferSize}`}
              accentColor="#5865f2"
              onChange={() => undefined}
            />
            <button
              className="px-3 py-2 font-mono uppercase"
              style={{
                fontSize: 8,
                letterSpacing: "1.5px",
                background: "#1e2035",
                color: "#6e7af5",
                border: "1px solid #3040a0",
                borderRadius: 4,
              }}
              onClick={onOpenKeyboard}
            >
              OPEN FLOATING KEYBOARD
            </button>
            <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
              The popup keyboard sends note on/off events into the main Rust audio engine through the shared MIDI channel.
            </span>
          </div>
        </SectionPanel>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1.5px", color: "var(--text-label)" }}>
      {children}
    </span>
  )
}

function StatusCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel-recessed px-3 py-2 grid">
      <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "var(--text-label)" }}>
        {label}
      </span>
      <span className="font-mono" style={{ fontSize: 10, color: accent }}>
        {value}
      </span>
    </div>
  )
}

function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="panel-recessed font-mono px-2 py-2 outline-none"
      style={{ fontSize: 8, color: "var(--text-display)", width: "100%" }}
    />
  )
}

function DeviceGroup({ title, devices }: { title: string; devices: SettingsPageProps["audioDevices"] }) {
  return (
    <div className="grid gap-1">
      <span className="font-mono uppercase" style={{ fontSize: 7, letterSpacing: "1px", color: "var(--text-label)" }}>
        {title}
      </span>
      {devices.length === 0 ? (
        <span className="font-mono" style={{ fontSize: 8, color: "var(--text-label)" }}>
          None detected
        </span>
      ) : (
        devices.map((device) => (
          <div key={device.deviceId || `${title}-default`} className="flex items-center justify-between gap-3">
            <div className="grid gap-0.5">
              <span className="font-mono" style={{ fontSize: 8, color: "var(--text-display)" }}>
                {device.label}
              </span>
              <span className="font-mono" style={{ fontSize: 7, color: "var(--text-label)" }}>
                {`${device.hostName} · ${device.maxChannels} ch${device.defaultSampleRate ? ` · ${device.defaultSampleRate} Hz` : ""}`}
              </span>
            </div>
            <div className="grid justify-items-end gap-0.5">
              {device.isDefault && (
                <span className="font-mono" style={{ fontSize: 7, color: "#10b981" }}>
                  DEFAULT
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}