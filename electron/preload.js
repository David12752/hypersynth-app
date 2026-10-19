const { contextBridge, ipcRenderer } = require("electron")

let listener = null

contextBridge.exposeInMainWorld("hyperSynthNative", {
  isAvailable: () => true,
  startEngine: (audioSettings, midiSettings) => ipcRenderer.invoke("hypersynth-native-start", { audioSettings, midiSettings }),
  restartEngine: (audioSettings, midiSettings) => ipcRenderer.invoke("hypersynth-native-restart", { audioSettings, midiSettings }),
  stopEngine: () => ipcRenderer.invoke("hypersynth-native-stop"),
  listDevices: () => ipcRenderer.invoke("hypersynth-native-list-devices"),
  getState: () => ipcRenderer.invoke("hypersynth-native-get-state"),
  getWavetableDisplayData: (preset, frames) => ipcRenderer.invoke("hypersynth-native-get-wavetable", { preset, frames }),
  setParam: (target, value) => ipcRenderer.invoke("hypersynth-native-set-param", { target, value }),
  setParamById: (id, value) => ipcRenderer.invoke("hypersynth-native-set-param-by-id", { id, value }),
  noteOn: (note, velocity) => ipcRenderer.invoke("hypersynth-native-note-on", { note, velocity }),
  noteOff: (note) => ipcRenderer.invoke("hypersynth-native-note-off", { note }),
  windSetEnabled: (enabled) => ipcRenderer.invoke("hypersynth-native-wind-set-enabled", { enabled }),
  windHandleCC: (cc, value) => ipcRenderer.invoke("hypersynth-native-wind-handle-cc", { cc, value }),
  windHandlePitchBend: (msb, lsb) => ipcRenderer.invoke("hypersynth-native-wind-handle-pitch-bend", { msb, lsb }),
  windHandleAftertouch: (value) => ipcRenderer.invoke("hypersynth-native-wind-handle-aftertouch", { value }),
  onEvent: (callback) => {
    if (listener) {
      ipcRenderer.removeListener("hypersynth-native-event", listener)
    }

    listener = (_event, payload) => callback(payload)
    ipcRenderer.on("hypersynth-native-event", listener)
  },
  clearEventListener: () => {
    if (!listener) {
      return
    }

    ipcRenderer.removeListener("hypersynth-native-event", listener)
    listener = null
  },
})