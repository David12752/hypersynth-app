/**
 * Electron main process — HyperSynth standalone app.
 *
 * Dev:  loads Next.js dev server at ELECTRON_START_URL or http://localhost:3000
 * Prod: loads the static export at app/out/index.html
 */
const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const { NativeHostManager } = require("./native-host");

// Silence EPIPE errors that occur when the console/IPC pipe closes
// while the Rust audio engine is still writing (common during window teardown)
process.on("uncaughtException", (err) => {
  if (err.code === "EPIPE") return
  console.error("[main] Uncaught exception:", err)
})
process.on("unhandledRejection", (reason) => {
  if (reason?.code === "EPIPE") return
  console.error("[main] Unhandled rejection:", reason)
})

const isDev = process.env.NODE_ENV !== "production";
const devUrl = process.env.ELECTRON_START_URL || "http://localhost:3000/?layout=v2";
const rootDir = path.join(__dirname, "..");
const nativeHost = new NativeHostManager(rootDir);

app.commandLine.appendSwitch("enable-features", "WebMidi,WebMidiSysex");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 840,
    minWidth: 1100,
    minHeight: 680,
    title: "HyperSynth",
    backgroundColor: "#1e2035",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      // Allow Web Audio / WASM / SharedArrayBuffer
      webSecurity: true,
    },
    show: false, // avoid white flash
  });

  nativeHost.setWindow(win)

  // Remove default menu bar (keeps keyboard shortcuts via Chromium)
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => win.show());

  // Open external links in the OS browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isInternalUrl = isDev
      ? url.startsWith(devUrl)
      : url.startsWith("file://");

    if (isInternalUrl) {
      return { action: "allow" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(devUrl);
    // Open DevTools in dev (comment out if not needed)
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../out/index.html"));
  }
}

function registerIpcHandlers() {
  ipcMain.handle("hypersynth-native-start", async (_event, payload) => {
    return nativeHost.start(payload.audioSettings, payload.midiSettings)
  })

  ipcMain.handle("hypersynth-native-restart", async (_event, payload) => {
    return nativeHost.restart(payload.audioSettings, payload.midiSettings)
  })

  ipcMain.handle("hypersynth-native-stop", async () => {
    return nativeHost.stop()
  })

  ipcMain.handle("hypersynth-native-list-devices", async () => {
    return nativeHost.listDevices()
  })

  ipcMain.handle("hypersynth-native-get-state", async () => {
    return nativeHost.getState()
  })

  ipcMain.handle("hypersynth-native-get-wavetable", async (_event, payload) => {
    return nativeHost.getWavetableDisplayData(payload?.preset, payload?.frames)
  })

  ipcMain.handle("hypersynth-native-set-param", async (_event, payload) => {
    nativeHost.sendCommand({ type: "setParam", target: payload.target, value: payload.value })
    return true
  })

  ipcMain.handle("hypersynth-native-set-param-by-id", async (_event, payload) => {
    nativeHost.sendCommand({ type: "setParamById", id: payload.id, value: payload.value })
    return true
  })

  ipcMain.handle("hypersynth-native-note-on", async (_event, payload) => {
    nativeHost.sendCommand({ type: "noteOn", note: payload.note, velocity: payload.velocity })
    return true
  })

  ipcMain.handle("hypersynth-native-note-off", async (_event, payload) => {
    nativeHost.sendCommand({ type: "noteOff", note: payload.note })
    return true
  })

  ipcMain.handle("hypersynth-native-wind-set-enabled", async (_event, payload) => {
    nativeHost.sendCommand({ type: "windSetEnabled", enabled: Boolean(payload.enabled) })
    return true
  })

  ipcMain.handle("hypersynth-native-wind-handle-cc", async (_event, payload) => {
    nativeHost.sendCommand({ type: "windHandleCc", cc: payload.cc, value: payload.value })
    return true
  })

  ipcMain.handle("hypersynth-native-wind-handle-pitch-bend", async (_event, payload) => {
    nativeHost.sendCommand({ type: "windHandlePitchBend", msb: payload.msb, lsb: payload.lsb })
    return true
  })

  ipcMain.handle("hypersynth-native-wind-handle-aftertouch", async (_event, payload) => {
    nativeHost.sendCommand({ type: "windHandleAftertouch", value: payload.value })
    return true
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  void nativeHost.stop()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
