<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUpdate } from '~/composables/useUpdate'
import { isElectron } from '~/utils/bridge'

const router = useRouter()
const inputRoom = ref('')

// 观众端是浏览器，没有抓屏能力，只放开「加入房间」，隐藏主机入口
const canHost = isElectron()

const goHost = () => router.push('/host')
const canJoin = computed(() => /^\d{6}$/.test(inputRoom.value.trim()))
const goViewer = () => {
    if (canJoin.value) router.push(`/viewer/${inputRoom.value.trim()}`)
}

const update = useUpdate()
const currentVersion = computed(() => update.result.value?.currentVersion)
</script>

<template>
    <div class="text-slate-100 bg-slate-900 min-h-screen">
        <div class="mx-auto px-4 py-12 flex flex-col max-w-4xl min-h-screen items-center justify-center">
            <h1 class="text-4xl tracking-tight font-bold mb-2">
                desk
            </h1>
            <p class="text-slate-400 mb-12">
                屏幕共享 + 演示画布 · WebRTC P2P · 锁屏不断
            </p>

            <div class="gap-6 grid w-full" :class="canHost ? 'md:grid-cols-2' : 'max-w-md'">
                <!-- 主机：仅 Electron 端（浏览器观众无抓屏能力） -->
                <div v-if="canHost"
                    class="p-8 border border-slate-700 rounded-xl bg-slate-800/50 cursor-pointer transition hover:border-sky-500 hover:shadow-lg hover:-translate-y-1"
                    @click="goHost">
                    <div class="text-sky-400 mb-3">
                        <i class="i-mdi-monitor text-4xl" />
                    </div>
                    <h2 class="text-2xl font-bold mb-2">
                        我是主机
                    </h2>
                    <p class="text-sm text-slate-400">
                        共享这台电脑的屏幕。生成 6 位房间号 + 二维码，让观众扫码加入。
                    </p>
                </div>

                <!-- 观众 -->
                <div class="p-8 border border-slate-700 rounded-xl bg-slate-800/50">
                    <div class="text-emerald-400 mb-3">
                        <i class="i-mdi-cellphone text-4xl" />
                    </div>
                    <h2 class="text-2xl font-bold mb-2">
                        我是观众
                    </h2>
                    <p class="text-sm text-slate-400 mb-4">
                        输入主机给的 6 位房间号，或扫二维码直接进入。
                    </p>
                    <div class="flex gap-2">
                        <input v-model="inputRoom" placeholder="房间号 例 234567"
                            class="text-slate-100 tracking-widest font-mono px-3 py-2 outline-none border border-slate-600 rounded bg-slate-900 flex-1 focus:border-sky-500"
                            inputmode="numeric" pattern="\d*" maxlength="6"
                            @keyup.enter="goViewer">
                        <button :disabled="!canJoin"
                            class="text-white font-medium px-4 py-2 rounded bg-emerald-600 transition hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                            @click="goViewer">
                            加入
                        </button>
                    </div>
                </div>
            </div>

            <div class="text-xs text-slate-500 mt-12 max-w-2xl">
                <p class="text-slate-400 font-semibold mb-1">
                    特性：
                </p>
                <ul class="list-disc list-inside space-y-1">
                    <li>LAN 内置 WebSocket 信令服务（默认 0.0.0.0:51234，端口被占用时自动顺延），无需外部依赖</li>
                    <li>Mac 防休眠 powerSaveBlocker，共享期间系统不锁屏</li>
                    <li>断线自动重连，ICE 失败自动 restart，replaceTrack 换屏不掉房间</li>
                    <li>macOS 虚拟显示器（SkyLight 私有 API，DeskPad 等价物）</li>
                    <li>观众端浏览器直连：扫 QR / 输入 6 位房间号即入</li>
                </ul>
            </div>

            <div class="text-xs text-slate-500 mt-8 flex gap-3 items-center">
                <span v-if="currentVersion" class="font-mono">v{{ currentVersion }}</span>
                <button class="text-slate-400 px-2 py-1 rounded inline-flex gap-1 transition items-center hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    :disabled="update.checking.value" @click="update.check()">
                    <i class="i-mdi-refresh" :class="{ 'animate-spin': update.checking.value }" />
                    {{ update.checking.value ? '检查中…' : '检查更新' }}
                </button>
            </div>
        </div>
    </div>
</template>
