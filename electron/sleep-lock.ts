// 防休眠：用 Electron 自带 powerSaveBlocker，跨平台
import { powerSaveBlocker } from 'electron'

let id: number | null = null

export function preventSleep(): boolean {
    if (id !== null) return true
    try {
        id = powerSaveBlocker.start('prevent-display-sleep')
        return true
    } catch {
        return false
    }
}

export function allowSleep(): void {
    if (id === null) return
    try { powerSaveBlocker.stop(id) } catch {}
    id = null
}
