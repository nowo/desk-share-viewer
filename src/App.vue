<script lang="ts" setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { useUpdate } from '~/composables/useUpdate'
import { onMenuCheckUpdate } from '~/utils/bridge'

const update = useUpdate()
let offMenu: (() => void) | null = null

onMounted(() => {
    // 启动静默自检：只在有新版时弹提示条
    void update.check({ silent: true })
    // 菜单「检查更新…」→ 手动检查（会反馈「已是最新 / 失败」）
    offMenu = onMenuCheckUpdate(() => update.check())
})

onBeforeUnmount(() => offMenu?.())
</script>

<template>
    <RouterView />

    <!-- 有新版本：顶部提示条 -->
    <div v-if="update.showBanner.value"
        class="text-sm px-4 py-3 flex gap-3 max-w-[92vw] shadow-black/30 shadow-lg items-center left-1/2 top-4 fixed z-100 backdrop-blur -translate-x-1/2">
        <div class="px-4 py-3 rounded-xl bg-sky-600/95 flex gap-3 items-center -mx-4 -my-3">
            <i class="i-mdi-rocket-launch text-lg text-white shrink-0" />
            <span class="text-white">
                发现新版本 <strong>{{ update.result.value?.latestVersion }}</strong>
                <span class="text-sky-100/80">（当前 {{ update.result.value?.currentVersion }}）</span>
            </span>
            <button class="text-sm text-sky-700 font-medium px-3 py-1 rounded-lg bg-white whitespace-nowrap transition hover:bg-sky-50"
                @click="update.download">
                去下载
            </button>
            <button class="text-white/80 p-1 rounded transition hover:bg-white/15" title="稍后" @click="update.dismiss">
                <i class="i-mdi-close" />
            </button>
        </div>
    </div>

    <!-- 手动检查反馈：已是最新 / 失败 -->
    <div v-if="update.latestToast.value || update.errorToast.value"
        class="text-sm text-white px-4 py-2.5 rounded-xl flex gap-2 shadow-black/30 shadow-lg items-center left-1/2 top-4 fixed z-100 backdrop-blur -translate-x-1/2"
        :class="update.errorToast.value ? 'bg-red-600/95' : 'bg-slate-700/95'">
        <i :class="update.errorToast.value ? 'i-mdi-alert-circle' : 'i-mdi-check-circle'" class="text-lg" />
        <span>{{ update.errorToast.value || '已是最新版本' }}</span>
    </div>
</template>
