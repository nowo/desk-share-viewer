// 软件更新检查：查 GitHub Release 最新版，有新版弹提示条 +「去下载」跳转
// 单例 state，App 顶层提示条和手动触发共享同一份状态
import type { UpdateResult } from '~/utils/bridge'
import { computed, ref } from 'vue'
import { checkForUpdate, openInBrowser } from '~/utils/bridge'

const checking = ref(false)
const result = ref<UpdateResult | null>(null)
const dismissed = ref(false)
// 手动检查且「已是最新」时的轻提示
const latestToast = ref(false)
const errorToast = ref<string | null>(null)

let toastTimer: ReturnType<typeof setTimeout> | null = null
const flash = (target: typeof latestToast | typeof errorToast, value: any) => {
    if (toastTimer) clearTimeout(toastTimer)
    latestToast.value = false
    errorToast.value = null
    target.value = value
    toastTimer = setTimeout(() => {
        latestToast.value = false
        errorToast.value = null
    }, 2800)
}

export const useUpdate = () => {
    // silent：启动时静默自检，只在有新版时提示，不报「已是最新 / 失败」
    const check = async (opts: { silent?: boolean } = {}) => {
        if (checking.value) return
        checking.value = true
        try {
            const r = await checkForUpdate()
            result.value = r
            dismissed.value = false
            if (!opts.silent && !r.hasUpdate) {
                if (r.error) flash(errorToast, r.error)
                else flash(latestToast, true)
            }
        } finally {
            checking.value = false
        }
    }

    const dismiss = () => {
        dismissed.value = true
    }

    const download = () => {
        if (result.value?.releaseUrl) void openInBrowser(result.value.releaseUrl)
    }

    const showBanner = computed(() => !!result.value?.hasUpdate && !dismissed.value)

    return { checking, result, latestToast, errorToast, showBanner, check, dismiss, download }
}
