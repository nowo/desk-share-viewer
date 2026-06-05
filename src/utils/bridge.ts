// Electron IPC bridge —— 通过 preload 暴露的 window.desk.* 调主进程
// 浏览器环境（观众端）下走 fallback：返回默认值或 hostname

interface DeskApi {
    getLanIp: () => Promise<string | null>
    getSignalPort: () => Promise<number>
    preventSleep: () => Promise<boolean>
    allowSleep: () => Promise<void>
    openInBrowser: (url: string) => Promise<void>
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
    interface Window { desk?: DeskApi }
}

const inElectron = (): boolean => typeof window !== 'undefined' && typeof window.desk !== 'undefined'

export const getLanIp = async (): Promise<string | null> => {
    if (!inElectron()) return window.location.hostname
    return window.desk!.getLanIp()
}

export const getSignalPort = async (): Promise<number> => {
    if (!inElectron()) return 51234
    return window.desk!.getSignalPort()
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
