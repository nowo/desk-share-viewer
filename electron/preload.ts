// Preload — 在 renderer 上暴露 window.desk.* API
import { contextBridge, ipcRenderer } from 'electron'

const api = {
    getLanIp: () => ipcRenderer.invoke('get-lan-ip') as Promise<string | null>,
    getSignalPort: () => ipcRenderer.invoke('signal-port') as Promise<number>,
    preventSleep: () => ipcRenderer.invoke('prevent-sleep') as Promise<boolean>,
    allowSleep: () => ipcRenderer.invoke('allow-sleep') as Promise<void>,
    openInBrowser: (url: string) => ipcRenderer.invoke('open-in-browser', url) as Promise<void>,
    openVirtualDisplay: (opts?: { width?: number, height?: number, hz?: number, name?: string }) =>
        ipcRenderer.invoke('virtual-display:open', opts || {}) as Promise<{
            display_id: number
            width: number
            height: number
            name: string
        }>,
    closeVirtualDisplay: () => ipcRenderer.invoke('virtual-display:close') as Promise<void>,
    virtualDisplayStatus: () => ipcRenderer.invoke('virtual-display:status') as Promise<boolean>,
    getDisplaySources: () => ipcRenderer.invoke('get-display-sources') as Promise<{
        sources: { id: string, name: string, display_id: string, thumbnail: string, appIcon: string | null }[]
        displays: { id: number, label: string, bounds: any, internal: boolean }[]
    }>,
}

contextBridge.exposeInMainWorld('desk', api)

export type DeskApi = typeof api
