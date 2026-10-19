const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

// Prevent EPIPE broken-pipe errors from crashing the main process
// (happens when the terminal/pipe is closed while the engine is still running)
process.stdout.on("error", () => {})
process.stderr.on("error", () => {})

const DEFAULT_CARGO_TARGET_DIR = "C:\\hypersynth-target"

const DEFAULT_STATE = {
  backendInfo: {
    backend: "Native Rust",
    driverModel: "CPAL native audio host",
    requestedSampleRate: 48000,
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
  },
  engineStats: {
    audioState: "uninitialized",
    activeVoices: 0,
    sampleRate: 48000,
    bufferSize: 256,
  },
  meters: {
    peakL: 0,
    peakR: 0,
    rmsL: 0,
    rmsR: 0,
    clipping: false,
  },
  scope: {
    samples: [],
  },
  audioHosts: [],
  audioDevices: [],
  midiInputs: [],
}

class NativeHostManager {
  constructor(rootDir) {
    this.rootDir = rootDir
    this.workspaceDir = path.join(rootDir, "hypersynth-engine")
    this.process = null
    this.stdoutBuffer = ""
    this.window = null
    this.state = { ...DEFAULT_STATE }
    this.readyResolver = null
    this.readyRejecter = null
    this.lastStartSettings = null
    this.lastMidiSettings = null
    this.lastStreamError = null
    this.streamRecoveryAttempts = 0
    this.recoveringFromStreamError = false
  }

  setWindow(window) {
    this.window = window
    this.broadcastState()
  }

  getState() {
    return { ...this.state }
  }

  async start(audioSettings, midiSettings, options = {}) {
    await this.stop()

    if (options.resetRecovery !== false) {
      this.streamRecoveryAttempts = 0
      this.lastStreamError = null
    }
    this.lastStartSettings = { ...audioSettings }
    this.lastMidiSettings = { ...midiSettings }

    const launch = this.resolveLaunchTarget()
    const env = {
      ...process.env,
      ...resolveNativeBuildEnv(this.rootDir),
      HYPERSYNTH_IPC: "stdio",
      HYPERSYNTH_SAMPLE_RATE: String(audioSettings.sampleRate),
      HYPERSYNTH_BUFFER_SIZE: String(audioSettings.bufferSize),
      HYPERSYNTH_AUDIO_HOST: audioSettings.audioHostId === "default" ? "" : audioSettings.audioHostId,
      HYPERSYNTH_AUDIO_DEVICE: audioSettings.outputDeviceId === "default" ? "" : audioSettings.outputDeviceId,
      HYPERSYNTH_OUTPUT_PAIR: String(audioSettings.outputChannelPair ?? 0),
      HYPERSYNTH_MIDI_ENABLED: midiSettings.enabled ? "1" : "0",
      HYPERSYNTH_MIDI_INPUT: !midiSettings.inputId || midiSettings.inputId === "all" ? "" : midiSettings.inputId,
      HYPERSYNTH_MIDI_CHANNEL: midiSettings.channel === "all" ? "" : String(midiSettings.channel),
    }

    this.stdoutBuffer = ""
    this.process = spawn(launch.command, launch.args, {
      cwd: this.workspaceDir,
      env,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.process.stdout.setEncoding("utf8")
    this.process.stdout.on("data", (chunk) => this.handleStdout(chunk))
    this.process.stderr.setEncoding("utf8")
    this.process.stderr.on("data", (chunk) => {
      const text = String(chunk).trim()
      if (text) {
        console.log(`[native-host] ${text}`)
        this.handleStderr(text)
      }
    })

    this.process.once("exit", (code, signal) => {
      const error = code && code !== 0 ? `Native host exited with code ${code}` : null
      if (this.readyRejecter && error) {
        this.readyRejecter(new Error(error))
      }

      this.process = null
      this.readyResolver = null
      this.readyRejecter = null
      this.state = {
        ...this.state,
        engineStats: { ...this.state.engineStats, audioState: "uninitialized", activeVoices: 0 },
        meters: { ...DEFAULT_STATE.meters },
      }
      this.broadcastState()

      if (signal && signal !== "SIGTERM") {
        try { process.stderr.write(`[native-host] exited via signal ${signal}\n`, () => {}) } catch {}
      }
    })

    return await new Promise((resolve, reject) => {
      this.readyResolver = resolve
      this.readyRejecter = reject

      setTimeout(() => {
        if (this.readyResolver) {
          this.readyResolver = null
          this.readyRejecter = null
          reject(new Error("Timed out waiting for native audio host"))
        }
      }, 15000)
    })
  }

  async restart(audioSettings, midiSettings) {
    return this.start(audioSettings, midiSettings)
  }

  async stop() {
    if (!this.process) {
      return this.getState()
    }

    const proc = this.process
    this.process = null
    this.readyResolver = null
    this.readyRejecter = null

    await new Promise((resolve) => {
      proc.once("exit", resolve)
      proc.kill()
    })

    this.state = {
      ...this.state,
      engineStats: { ...this.state.engineStats, audioState: "uninitialized", activeVoices: 0 },
      meters: { ...DEFAULT_STATE.meters },
    }
    this.broadcastState()
    return this.getState()
  }

  async listDevices() {
    const launch = this.resolveLaunchTarget(["--list-devices", "--json"])
    const output = await runProcess(launch.command, launch.args, this.workspaceDir)
    const jsonLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{"))
      .pop() || "{}"
    const snapshot = JSON.parse(jsonLine)

    this.state = {
      ...this.state,
      audioHosts: snapshot.audioHosts ?? [],
      audioDevices: snapshot.audioDevices ?? [],
      midiInputs: snapshot.midiInputs ?? [],
    }
    this.broadcastState()
    return this.getState()
  }

  async getWavetableDisplayData(preset = "basic", frames = 64) {
    try {
      const safeFrames = Number.isFinite(Number(frames)) ? Math.max(1, Math.min(128, Number(frames))) : 64
      const launch = this.resolveLaunchTarget(["--dump-wavetable", String(preset || "basic"), "--frames", String(safeFrames), "--json"])
      const output = await runProcess(launch.command, launch.args, this.workspaceDir)
      const jsonLine = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("{"))
        .pop() || "{}"
      return JSON.parse(jsonLine)
    } catch (err) {
      try { process.stderr.write(`[native-host] getWavetableDisplayData failed: ${err?.message ?? err}\n`, () => {}) } catch {}
      return null
    }
  }

  sendCommand(command) {
    if (!this.process || !this.process.stdin.writable) {
      return false
    }

    this.process.stdin.write(`${JSON.stringify(command)}\n`)
    return true
  }

  resolveLaunchTarget(extraArgs = []) {
    const targetDir = resolveCargoTargetDir(this.workspaceDir)
    const releaseExe = path.join(targetDir, "release", "hypersynth-standalone.exe")
    if (fs.existsSync(releaseExe)) {
      return { command: releaseExe, args: extraArgs }
    }
    const debugExe = path.join(targetDir, "debug", "hypersynth-standalone.exe")
    if (fs.existsSync(debugExe)) {
      return { command: debugExe, args: extraArgs }
    }

    const cargo = resolveCargoPath()
    if (!cargo) {
      throw new Error("Cargo was not found. Build the native standalone first or add cargo.exe to PATH.")
    }

    return {
      command: cargo,
      args: ["run", "-p", "hypersynth-standalone", "--", ...extraArgs],
    }
  }

  handleStdout(chunk) {
    this.stdoutBuffer += String(chunk)
    const lines = this.stdoutBuffer.split(/\r?\n/)
    this.stdoutBuffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      if (!trimmed.startsWith("{")) {
        continue
      }

      try {
        const snapshot = JSON.parse(trimmed)
        this.state = {
          ...this.state,
          ...snapshot,
        }
        if (this.lastStreamError) {
          this.state = this.withStreamErrorState(this.state, this.lastStreamError)
        }
        this.broadcastState()

        if (this.readyResolver && this.state.engineStats?.audioState === "running") {
          const resolve = this.readyResolver
          this.readyResolver = null
          this.readyRejecter = null
          resolve(this.getState())
        }
      } catch (error) {
        try { process.stderr.write(`[native-host] Failed to parse stdout line: ${error?.message ?? error}\n`, () => {}) } catch {}
      }
    }
  }

  handleStderr(text) {
    if (!/Audio stream error/i.test(text)) {
      return
    }

    this.lastStreamError = text
    this.state = this.withStreamErrorState(this.state, text)
    this.broadcastState()
  }

  withStreamErrorState(state, message) {
    const driverModel = String(state.backendInfo?.driverModel || DEFAULT_STATE.backendInfo.driverModel)
      .replace(/ Native audio stream error:.*$/s, "")

    return {
      ...state,
      backendInfo: {
        ...state.backendInfo,
        driverModel: `${driverModel} Native audio stream error: ${message}`,
      },
      engineStats: {
        ...state.engineStats,
        audioState: "error",
        activeVoices: 0,
      },
      meters: { ...DEFAULT_STATE.meters },
    }
  }

  broadcastState() {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.webContents.send("hypersynth-native-event", this.getState())
  }
}

function resolveCargoPath() {
  if (process.env.CARGO) {
    return process.env.CARGO
  }

  const fallback = path.join(process.env.USERPROFILE || "", ".cargo", "bin", "cargo.exe")
  if (fallback && fs.existsSync(fallback)) {
    return fallback
  }

  return "cargo"
}

function resolveNativeBuildEnv(rootDir) {
  const env = {
    CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || DEFAULT_CARGO_TARGET_DIR,
  }
  const asioCandidates = [
    path.join(rootDir, "third_party", "asio_sdk"),
    path.join(process.env.TEMP || "", "asio_sdk"),
    path.join(process.env.USERPROFILE || "", "asio_sdk"),
  ]
  const llvmCandidates = [
    path.join("C:\\Program Files", "LLVM", "bin"),
    path.join("C:\\Program Files (x86)", "LLVM", "bin"),
  ]

  if (!process.env.CPAL_ASIO_DIR) {
    const asioDir = asioCandidates.find((candidate) => candidate && fs.existsSync(candidate))
    if (asioDir) {
      env.CPAL_ASIO_DIR = asioDir
    }
  }

  if (!process.env.LIBCLANG_PATH) {
    const llvmDir = llvmCandidates.find((candidate) => fs.existsSync(candidate))
    if (llvmDir) {
      env.LIBCLANG_PATH = llvmDir
    }
  }

  return env
}

function resolveCargoTargetDir(workspaceDir) {
  return process.env.CARGO_TARGET_DIR || DEFAULT_CARGO_TARGET_DIR || path.join(workspaceDir, "target")
}

function runProcess(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`))
      }
    })
  })
}

module.exports = {
  NativeHostManager,
}