// 虚拟显示器（desk-display sidecar）控制
import { onMounted, ref } from 'vue'

export interface IDisplayInfo {
    display_id: number
    width: number
    height: number
    name: string
}

export interface IOpenOpts {
    width?: number
    height?: number
    hz?: number
    name?: string
}

const inElectron = () => typeof window !== 'undefined' && !!(window as any).desk

export const useVirtualDisplay = () => {
    const info = ref<IDisplayInfo | null>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const refresh = async () => {
        if (!inElectron()) return
        const active = await (window as any).desk.virtualDisplayStatus() as boolean
        if (!active) info.value = null
    }

    const open = async (opts: IOpenOpts = {}) => {
        if (!inElectron()) {
            error.value = '此功能仅在 desk 桌面应用内可用'
            return
        }
        error.value = null
        loading.value = true
        try {
            info.value = await (window as any).desk.openVirtualDisplay(opts) as IDisplayInfo
        } catch (e: any) {
            error.value = typeof e === 'string' ? e : (e?.message || String(e))
            info.value = null
        } finally {
            loading.value = false
        }
    }

    const close = async () => {
        if (!inElectron()) return
        loading.value = true
        try {
            await (window as any).desk.closeVirtualDisplay()
        } finally {
            info.value = null
            loading.value = false
        }
    }

    onMounted(refresh)

    return { info, loading, error, open, close }
}
