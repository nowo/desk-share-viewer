// Electron IPC bridge —— 通过 preload 暴露的 window.desk.* 调主进程
// 浏览器环境（观众端）下走 fallback：返回默认值或 hostname

export interface UpdateResult {
    hasUpdate: boolean
    currentVersion: string
    latestVersion?: string
    releaseUrl?: string
    notes?: string
    error?: string
}

interface DeskApi {
    getLanIp: () => Promise<string | null>
    getSignalPort: () => Promise<number>
    getHttpPort: () => Promise<number>
    preventSleep: () => Promise<boolean>
    allowSleep: () => Promise<void>
    openInBrowser: (url: string) => Promise<void>
    checkForUpdate: () => Promise<UpdateResult>
    onMenuCheckUpdate: (cb: () => void) => () => void
    virtualDisplaySupported: () => Promise<boolean>
    openVirtualDisplay: (opts?: { width?: number, height?: number, hz?: number, name?: string }) => Promise<{
        display_id: number
        width: number
        height: number
        name: string
    }>
    closeVirtualDisplay: () => Promise<void>
    virtualDisplayStatus: () => Promise<boolean>
    getDisplaySources: () => Promise<{
        sources: { id: string, name: string, display_id: string, thumbnail: string, appIcon: string | null }[]
        displays: { id: number, label: string, bounds: any, internal: boolean }[]
    }>
}

declare global {
    interface Window {
        desk?: DeskApi
        // 主机静态 server 注入的真实信令端口（观众端浏览器场景用）
        __DESK_SIGNAL_PORT__?: number
    }
}

const inElectron = (): boolean => typeof window !== 'undefined' && typeof window.desk !== 'undefined'

export const getLanIp = async (): Promise<string | null> => {
    if (!inElectron()) return window.location.hostname
    return window.desk!.getLanIp()
}

export const getSignalPort = async (): Promise<number> => {
    // 观众端浏览器：用主机注入的真实端口，没有再回退默认值
    if (!inElectron()) return window.__DESK_SIGNAL_PORT__ ?? 51234
    return window.desk!.getSignalPort()
}

export const getHttpPort = async (): Promise<number> => {
    // 观众端浏览器：页面就是静态 server 提供的，端口即当前 location.port
    if (!inElectron()) return Number(window.location.port) || 1420
    return window.desk!.getHttpPort()
}

export const preventSleep = async (): Promise<boolean> => {
    if (!inElectron()) return false
    return window.desk!.preventSleep()
}

export const allowSleep = async (): Promise<void> => {
    if (!inElectron()) return
    return window.desk!.allowSleep()
}

export const openInBrowser = async (url: string): Promise<void> => {
    if (!inElectron()) {
        window.open(url, '_blank')
        return
    }
    return window.desk!.openInBrowser(url)
}

// 观众端（浏览器）没有「更新」概念，直接返回无更新
export const checkForUpdate = async (): Promise<UpdateResult> => {
    if (!inElectron()) return { hasUpdate: false, currentVersion: '' }
    return window.desk!.checkForUpdate()
}

export const onMenuCheckUpdate = (cb: () => void): (() => void) => {
    if (!inElectron()) return () => {}
    return window.desk!.onMenuCheckUpdate(cb)
}
