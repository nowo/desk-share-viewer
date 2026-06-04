<script lang="ts" setup>
// 主机端：抓屏 + 二维码 + 状态 + 虚拟屏 + 画质预设
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import SourcePicker from '~/components/SourcePicker.vue'
import { useHost } from '~/composables/useHost'
import { useSignaling } from '~/composables/useSignaling'
import { useVirtualDisplay } from '~/composables/useVirtualDisplay'
import { newRoomId } from '~/utils/ids'
import { getLanIp, getSignalPort } from '~/utils/bridge'

const router = useRouter()

// 房间号：sessionStorage 持久化（刷新保留，不动 URL —— hash routing 模式下改 hash 会覆盖路由）
const ROOM_KEY = 'desk-host-room'
const initRoomId = (): string => {
    const stored = sessionStorage.getItem(ROOM_KEY)
    if (stored && /^\d{6}$/.test(stored)) return stored
    return newRoomId()
}
const roomId = ref(initRoomId())

watchEffect(() => {
    sessionStorage.setItem(ROOM_KEY, roomId.value)
})

// 观众端用浏览器（同 WiFi）访问 http://<lanIp>:1420/#/<roomId>
const lanIp = ref<string | null>(null)
const signalPort = ref(51234)
onMounted(async () => {
    lanIp.value = await getLanIp()
    signalPort.value = await getSignalPort()
})

const viewerUrl = computed(() => {
    if (!lanIp.value) return ''
    return `http://${lanIp.value}:1420/#/${roomId.value}`
})

const qrDataUrl = ref('')
watchEffect(async () => {
    if (viewerUrl.value) {
        qrDataUrl.value = await QRCode.toDataURL(viewerUrl.value, {
            margin: 1, width: 256,
            color: { dark: '#0f172a', light: '#ffffff' },
        })
    }
})

const sig = useSignaling()
const host = useHost(sig)
const vd = useVirtualDisplay()
const previewEl = useTemplateRef<HTMLVideoElement>('previewEl')

const toggleVirtualDisplay = async () => {
    if (vd.info.value) await vd.close()
    else await vd.open()
}

watch(host.stream, (s) => {
    if (previewEl.value) previewEl.value.srcObject = s
})

// 画质预设
const qualityOptions = [
    { label: '低 (720p / 1.5 Mbps)',   value: 'low' },
    { label: '中 (1080p / 3 Mbps)',    value: 'medium' },
    { label: '高 (1080p / 8 Mbps)',    value: 'high' },
    { label: '极致 (1440p / 12 Mbps)', value: 'ultra' },
    { label: '4K (2160p / 20 Mbps)',   value: '4k' },
]
const quality = ref('high')
watch(quality, async (v) => {
    await host.setQuality(v as any)
})

// 源选择 picker
const pickerOpen = ref(false)

const onSourcePicked = async (source: { id: string, name: string }) => {
    pickerOpen.value = false
    if (host.sharing.value) {
        // 已在共享 —— 换屏，走 replaceTrack
        await host.reShare(source.id)
    } else {
        // 首次共享 —— addTrack + 连信令
        await host.startShare(source.id)
        if (host.sharing.value) sig.connect({ room: roomId.value, role: 'host' })
    }
}

const start = () => { pickerOpen.value = true }
const reShare = () => { pickerOpen.value = true }

const stop = async () => {
    await host.stopShare()
    sig.close()
}

const copyRoom = () => navigator.clipboard?.writeText(roomId.value)
const copyHost = () => lanIp.value && navigator.clipboard?.writeText(`${lanIp.value}:${signalPort.value}`)
const copyLink = () => viewerUrl.value && navigator.clipboard?.writeText(viewerUrl.value)

const back = () => router.push('/')

const fmtState = (s: string): string => ({
    new: '未开始', connecting: '握手中', connected: '已连接',
    disconnected: '断开（自动重连）', failed: '失败', closed: '已关闭',
    checking: '检查中', completed: '完成',
} as Record<string, string>)[s] || s

onBeforeUnmount(() => sig.close())
</script>

<template>
    <div class="min-h-screen bg-slate-900 text-slate-100">
        <div class="mx-auto max-w-6xl px-4 py-8">
            <div class="mb-6 flex items-center justify-between">
                <button class="flex items-center gap-1 rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                        @click="back">
                    <i class="i-mdi-arrow-left" /> 返回
                </button>
                <div class="text-sm text-slate-400">{{ host.sharing.value ? '共享中' : '未开始' }}</div>
            </div>

            <!-- 虚拟显示器面板 -->
            <div class="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div class="flex items-start gap-4">
                    <i class="i-mdi-view-grid mt-1 text-2xl text-amber-400" />
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-amber-300">虚拟显示器</h3>
                            <span v-if="vd.info.value"
                                  class="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                                ON · display_id={{ vd.info.value.display_id }}
                            </span>
                            <span v-else class="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                                OFF
                            </span>
                        </div>
                        <p v-if="!vd.info.value" class="mt-1 text-xs text-slate-400">
                            创建一块虚拟外接显示器（不可见），可以把其他 app 的窗口拖到这块屏上，再用 OS 屏幕共享时选这块屏即可。DeskPad 同款机制。
                        </p>
                        <p v-else class="mt-1 text-xs text-slate-400">
                            <strong class="text-amber-300">{{ vd.info.value.name }}</strong>（{{ vd.info.value.width }}×{{ vd.info.value.height }}）已就绪 ——
                            把要演示的窗口拖到这块屏，然后开始共享屏幕时选「{{ vd.info.value.name }}」
                        </p>
                        <p v-if="vd.error.value" class="mt-2 text-xs text-red-400">
                            {{ vd.error.value }}
                        </p>
                    </div>
                    <button :disabled="vd.loading.value"
                            class="flex items-center gap-1 rounded border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
                            :class="vd.info.value
                                ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                                : 'border-amber-500 text-amber-300 hover:bg-amber-500/10'"
                            @click="toggleVirtualDisplay">
                        <i :class="vd.info.value ? 'i-mdi-power' : 'i-mdi-plus-circle'" />
                        {{ vd.info.value ? '关闭' : '打开虚拟屏' }}
                    </button>
                </div>
            </div>

            <div v-if="!host.sharing.value" class="rounded-xl border border-slate-700 bg-slate-800/50 p-12 text-center">
                <i class="i-mdi-monitor mb-4 text-6xl text-sky-400" />
                <h2 class="mb-2 text-2xl font-bold">准备共享屏幕</h2>
                <p class="mb-6 text-sm text-slate-400">点击下方按钮选择要共享的屏幕 / 窗口</p>
                <button class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-base font-medium text-white transition hover:bg-emerald-500"
                        @click="start">
                    <i class="i-mdi-play" />
                    开始共享屏幕
                </button>
                <p v-if="host.error.value" class="mt-4 text-sm text-red-400">{{ host.error.value }}</p>
            </div>

            <div v-else class="grid gap-6 md:grid-cols-2">
                <!-- 左：房间号 + 二维码 + 主机 IP -->
                <div class="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
                    <div class="mb-4 text-sm text-slate-400">观众扫码或手动输入</div>
                    <div class="mb-4 flex items-center justify-center rounded-lg bg-white p-4">
                        <img v-if="qrDataUrl" :src="qrDataUrl" class="h-56 w-56" alt="QR">
                    </div>
                    <div class="mb-4 flex items-center gap-2">
                        <code class="flex-1 rounded bg-slate-900 px-4 py-3 text-center font-mono text-3xl font-bold tracking-widest text-sky-400">
                            {{ roomId }}
                        </code>
                        <button class="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                                title="复制房间号" @click="copyRoom">
                            <i class="i-mdi-content-copy" />
                        </button>
                    </div>
                    <div v-if="lanIp" class="space-y-2">
                        <div class="rounded bg-slate-900 px-3 py-2 text-xs">
                            <div class="text-slate-500">观众浏览器 URL（QR 扫这个）</div>
                            <div class="mt-1 flex items-center gap-2">
                                <code class="flex-1 truncate font-mono text-emerald-400">{{ viewerUrl }}</code>
                                <button class="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                                        title="复制 URL" @click="copyLink">
                                    <i class="i-mdi-content-copy text-xs" />
                                </button>
                            </div>
                        </div>
                        <div class="rounded bg-slate-900 px-3 py-2 text-xs">
                            <div class="text-slate-500">主机 IP:信令端口</div>
                            <div class="mt-1 flex items-center gap-2">
                                <code class="flex-1 font-mono text-sky-300">{{ lanIp }}:{{ signalPort }}</code>
                                <button class="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                                        title="复制" @click="copyHost">
                                    <i class="i-mdi-content-copy text-xs" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 右：预览 + 状态 -->
                <div class="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
                    <div class="mb-3 text-sm text-slate-400">本地预览</div>
                    <div class="relative aspect-video overflow-hidden rounded-lg bg-black">
                        <video ref="previewEl" autoplay muted playsinline
                               class="absolute inset-0 h-full w-full object-contain" />
                        <div v-if="host.trackEnded.value"
                             class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 p-4 text-center">
                            <i class="i-mdi-alert mb-2 text-3xl text-amber-400" />
                            <div class="mb-3 text-sm">屏幕共享中断</div>
                            <button class="inline-flex items-center gap-1 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
                                    @click="reShare">
                                <i class="i-mdi-refresh" /> 重新选择屏幕
                            </button>
                        </div>
                    </div>

                    <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div class="rounded bg-slate-900 px-3 py-2">
                            <div class="text-xs text-slate-500">信令</div>
                            <div class="font-semibold" :class="sig.connected.value ? 'text-emerald-400' : 'text-amber-400'">
                                {{ sig.connected.value ? '已连' : '重连中' }}
                            </div>
                        </div>
                        <div class="rounded bg-slate-900 px-3 py-2">
                            <div class="text-xs text-slate-500">观众</div>
                            <div class="font-semibold" :class="sig.peerJoined.value ? 'text-emerald-400' : 'text-slate-500'">
                                {{ sig.peerJoined.value ? '在线' : '等待' }}
                            </div>
                        </div>
                        <div class="rounded bg-slate-900 px-3 py-2">
                            <div class="text-xs text-slate-500">PC</div>
                            <div class="font-semibold">{{ fmtState(host.connectionState.value) }}</div>
                        </div>
                        <div class="rounded bg-slate-900 px-3 py-2">
                            <div class="text-xs text-slate-500">ICE</div>
                            <div class="font-semibold">{{ fmtState(host.iceState.value) }}</div>
                        </div>
                        <div class="col-span-2 rounded bg-slate-900 px-3 py-2">
                            <div class="text-xs text-slate-500">防休眠</div>
                            <div class="font-semibold" :class="host.sleepLocked.value ? 'text-emerald-400' : 'text-slate-500'">
                                {{ host.sleepLocked.value ? '已锁' : '未锁' }}
                            </div>
                        </div>
                    </div>

                    <!-- 画质预设 -->
                    <div class="mt-4 flex items-center gap-2">
                        <label class="text-sm text-slate-400">画质</label>
                        <select v-model="quality"
                                class="flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
                            <option v-for="o in qualityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                        </select>
                    </div>

                    <div class="mt-3 flex gap-2">
                        <button class="flex flex-1 items-center justify-center gap-1 rounded border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                                @click="reShare">
                            <i class="i-mdi-refresh" /> 重新选屏
                        </button>
                        <button class="flex flex-1 items-center justify-center gap-1 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
                                @click="stop">
                            <i class="i-mdi-stop" /> 停止共享
                        </button>
                    </div>

                    <p v-if="host.error.value" class="mt-3 text-sm text-red-400">{{ host.error.value }}</p>
                </div>
            </div>
        </div>

        <!-- 源选择 picker -->
        <SourcePicker v-if="pickerOpen"
                      :virtual-display-id="vd.info.value?.display_id ?? null"
                      @pick="onSourcePicked"
                      @cancel="pickerOpen = false" />
    </div>
</template>
