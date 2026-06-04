<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const inputRoom = ref('')

const goHost = () => router.push('/host')
const canJoin = computed(() => /^\d{6}$/.test(inputRoom.value.trim()))
const goViewer = () => {
    if (canJoin.value) router.push(`/viewer/${inputRoom.value.trim()}`)
}
</script>

<template>
    <div class="min-h-screen bg-slate-900 text-slate-100">
        <div class="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4 py-12">
            <h1 class="mb-2 text-4xl font-bold tracking-tight">desk</h1>
            <p class="mb-12 text-slate-400">屏幕共享 + 演示画布 · WebRTC P2P · 锁屏不断</p>

            <div class="grid w-full gap-6 md:grid-cols-2">
                <!-- 主机 -->
                <div class="cursor-pointer rounded-xl border border-slate-700 bg-slate-800/50 p-8 transition hover:-translate-y-1 hover:border-sky-500 hover:shadow-lg"
                     @click="goHost">
                    <div class="mb-3 text-sky-400">
                        <i class="i-mdi-monitor text-4xl" />
                    </div>
                    <h2 class="mb-2 text-2xl font-bold">我是主机</h2>
                    <p class="text-sm text-slate-400">
                        共享这台电脑的屏幕。生成 6 位房间号 + 二维码，让观众扫码加入。
                    </p>
                </div>

                <!-- 观众 -->
                <div class="rounded-xl border border-slate-700 bg-slate-800/50 p-8">
                    <div class="mb-3 text-emerald-400">
                        <i class="i-mdi-cellphone text-4xl" />
                    </div>
                    <h2 class="mb-2 text-2xl font-bold">我是观众</h2>
                    <p class="mb-4 text-sm text-slate-400">
                        输入主机给的 6 位房间号，或扫二维码直接进入。
                    </p>
                    <div class="flex gap-2">
                        <input v-model="inputRoom" placeholder="房间号 例 234567"
                               class="flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 font-mono tracking-widest text-slate-100 outline-none focus:border-sky-500"
                               inputmode="numeric" pattern="\d*" maxlength="6"
                               @keyup.enter="goViewer">
                        <button :disabled="!canJoin"
                                class="rounded bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                                @click="goViewer">
                            加入
                        </button>
                    </div>
                </div>
            </div>

            <div class="mt-12 max-w-2xl text-xs text-slate-500">
                <p class="mb-1 font-semibold text-slate-400">特性：</p>
                <ul class="list-inside list-disc space-y-1">
                    <li>LAN 内置 WebSocket 信令服务（0.0.0.0:51234），无需外部依赖</li>
                    <li>Mac 防休眠 powerSaveBlocker，共享期间系统不锁屏</li>
                    <li>断线自动重连，ICE 失败自动 restart，replaceTrack 换屏不掉房间</li>
                    <li>macOS 虚拟显示器（SkyLight 私有 API，DeskPad 等价物）</li>
                    <li>观众端浏览器直连：扫 QR / 输入 6 位房间号即入</li>
                </ul>
            </div>
        </div>
    </div>
</template>
