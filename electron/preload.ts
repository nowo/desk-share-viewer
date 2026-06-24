// Preload — 在 renderer 上暴露 window.desk.* API
import { contextBridge, ipcRenderer } from 'electron'

const api = {
    getLanIp: () => ipcRenderer.invoke('get-lan-ip') as Promise<string | null>,
    getSignalPort: () => ipcRenderer.invoke('signal-port') as Promise<number>,
    getHttpPort: () => ipcRenderer.invoke('http-port') as Promise<number>,
    preventSleep: () => ipcRenderer.invoke('prevent-sleep') as Promise<boolean>,
    allowSleep: () => ipcRenderer.invoke('allow-sleep') as Promise<void>,
    openInBrowser: (url: string) => ipcRenderer.invoke('open-in-browser', url) as Promise<void>,
    checkForUpdate: () => ipcRenderer.invoke('update:check') as Promise<{
        hasUpdate: boolean
        currentVersion: string
        latestVersion?: string
        releaseUrl?: string
        notes?: string
        error?: string
    }>,
    // 菜单「检查更新…」触发，返回取消订阅函数
    onMenuCheckUpdate: (cb: () => void) => {
        const listener = (): void => cb()
        ipcRenderer.on('update:menu-check', listener)
        return () => ipcRenderer.removeListener('update:menu-check', listener)
    },
    virtualDisplaySupported: () => ipcRenderer.invoke('virtual-display:supported') as Promise<boolean>,
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
