import { contextBridge, ipcRenderer } from 'electron'

// Expose only what the renderer needs — no raw electron access
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, args?: unknown) => ipcRenderer.invoke(channel, args)
})
