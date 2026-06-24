<script lang="ts" setup>
// 主机端：抓屏 + 二维码 + 状态 + 虚拟屏 + 画质预设
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import SourcePicker from '~/components/SourcePicker.vue'
import { useHost } from '~/composables/useHost'
import { usePanZoom } from '~/composables/usePanZoom'
import { useSignaling } from '~/composables/useSignaling'
import { useVirtualDisplay } from '~/composables/useVirtualDisplay'
import { getHttpPort, getLanIp, getSignalPort } from '~/utils/bridge'
import { newRoomId } from '~/utils/ids'

const router = useRouter()

// 房间号：localStorage 持久化（app 重启后保留 —— 观众端可以反复用同一个 URL 访问）
const ROOM_KEY = 'desk-host-room'
const initRoomId = (): string => {
    const stored = localStorage.getItem(ROOM_KEY)
    if (stored && /^\d{6}$/.test(stored)) return stored
    return newRoomId()
}
const roomId = ref(initRoomId())

watchEffect(() => {
    localStorage.setItem(ROOM_KEY, roomId.value)
})

// 房间号输入：用户编辑时的临时值，commit 后才同步到 roomId
const roomInput = ref(roomId.value)
watch(roomId, (v) => {
    roomInput.value = v
})
// 输入时自动剥离非数字 + 截到 6 位（最简单的输入约束）
watch(roomInput, (v) => {
    const clean = v.replace(/\D/g, '').slice(0, 6)
    if (clean !== v) roomInput.value = clean
})

const commitRoom = () => {
    const v = roomInput.value
    // 无效或没变 → 恢复显示，不触发任何信令变化
    if (!/^\d{6}$/.test(v) || v === roomId.value) {
        roomInput.value = roomId.value
        return
    }
    roomId.value = v
}

const randomRoom = () => {
    roomId.value = newRoomId()
}

// 观众端用浏览器（同 WiFi）访问 http://<lanIp>:<httpPort>/#/<roomId>
const lanIp = ref<string | null>(null)
const signalPort = ref(51234)
const httpPort = ref(1420)
onMounted(async () => {
    lanIp.value = await getLanIp()
    signalPort.value = await getSignalPort()
    httpPort.value = await getHttpPort()
})

const viewerUrl = computed(() => {
    if (!lanIp.value) return ''
    return `http://${lanIp.value}:${httpPort.value}/#/${roomId.value}`
})

const qrDataUrl = ref('')
watchEffect(async () => {
    if (viewerUrl.value) {
        qrDataUrl.value = await QRCode.toDataURL(viewerUrl.value, {
            margin: 1,
            width: 256,
            color: { dark: '#0f172a', light: '#ffffff' },
        })
    }
})

const sig = useSignaling()
const host = useHost(sig)
const vd = useVirtualDisplay()
const previewEl = useTemplateRef<HTMLVideoElement>('previewEl')

// 放大查看：弹出全屏覆盖层，绑定同一路 stream，支持滚轮缩放 + 拖拽平移
const zoomOpen = ref(false)
const zoomEl = useTemplateRef<HTMLVideoElement>('zoomEl')
const pz = usePanZoom()

const openZoom = () => {
    pz.reset()
    zoomOpen.value = true
}
const closeZoom = () => {
    zoomOpen.value = false
}

// 模态打开后把同一路 stream 喂给放大的 video
watchEffect(() => {
    if (zoomEl.value && host.stream.value) {
        zoomEl.value.srcObject = host.stream.value
    }
})

// 共享中断时退出放大模式 —— 放大层绑的 stream 已失效，留着只会黑屏
watch(() => host.trackEnded.value, (ended) => {
    if (ended && zoomOpen.value) closeZoom()
})

// 允许观众放大：默认开，通过信令下发给观众端
const ZOOM_PERM_KEY = 'desk-host-allow-viewer-zoom'
const allowViewerZoom = ref(localStorage.getItem(ZOOM_PERM_KEY) !== '0')
const sendZoomPermission = () => {
    sig.send({ type: 'control', allowZoom: allowViewerZoom.value })
}
watch(allowViewerZoom, (v) => {
    localStorage.setItem(ZOOM_PERM_KEY, v ? '1' : '0')
    sendZoomPermission()
})
// 观众加入时把当前权限补发一次（覆盖晚加入的观众）
watch(() => sig.peerJoined.value, (joined) => {
    if (joined) sendZoomPermission()
})

// 共享中切换房间号：断开旧房间信令，连新房间
// （未共享时改房间号只更新 URL/QR，不动信令）
watch(roomId, (newRoom, oldRoom) => {
    if (newRoom === oldRoom || !host.sharing.value) return
    sig.close()
    sig.connect({ room: newRoom, role: 'host' })
})

const toggleVirtualDisplay = async () => {
    if (vd.info.value) await vd.close()
    else await vd.open()
}

// 用 watchEffect 同时跟踪 previewEl 和 stream 的变化
// 修 bug：首次共享时 stream 先于 previewEl 挂载，原来的 watch 只在 stream 变时触发，
// 而 previewEl 后挂载时不会重新赋 srcObject，导致预览空白
watchEffect(() => {
    if (previewEl.value && host.stream.value) {
        previewEl.value.srcObject = host.stream.value
    }
})

// 画质预设
const qualityOptions = [
    { label: '低 (720p / 1.5 Mbps)', value: 'low' },
    { label: '中 (1080p / 3 Mbps)', value: 'medium' },
    { label: '高 (1080p / 8 Mbps)', value: 'high' },
    { label: '极致 (1440p / 12 Mbps)', value: 'ultra' },
    { label: '4K (2160p / 20 Mbps)', value: '4k' },
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

const start = () => {
    pickerOpen.value = true
}
const reShare = () => {
    pickerOpen.value = true
}

const stop = async () => {
    await host.stopShare()
    sig.close()
}

const copyRoom = () => navigator.clipboard?.writeText(roomId.value)
const copyHost = () => lanIp.value && navigator.clipboard?.writeText(`${lanIp.value}:${signalPort.value}`)
const copyLink = () => viewerUrl.value && navigator.clipboard?.writeText(viewerUrl.value)

const back = () => router.push('/')

const fmtState = (s: string): string => ({
    new: '未开始',
    connecting: '握手中',
    connected: '已连接',
    disconnected: '断开（自动重连）',
    failed: '失败',
    closed: '已关闭',
    checking: '检查中',
    completed: '完成',
} as Record<string, string>)[s] || s

const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && zoomOpen.value) closeZoom()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    sig.close()
})
</script>

<template>
    <div class="text-slate-100 bg-slate-900 min-h-screen">
        <div class="mx-auto px-4 py-8 max-w-6xl">
            <div class="mb-6 flex items-center justify-between">
                <button class="text-sm text-slate-300 px-3 py-1.5 rounded flex gap-1 items-center hover:bg-slate-800"
                    @click="back">
                    <i class="i-mdi-arrow-left" /> 返回
                </button>
                <div class="text-sm text-slate-400">
                    {{ host.sharing.value ? '共享中' : '未开始' }}
                </div>
            </div>

            <!-- 虚拟显示器面板：仅 macOS 主机显示（SkyLight 私有 API 不跨端） -->
            <div v-if="vd.supported.value"
                class="mb-6 p-4 border border-amber-500/30 rounded-xl bg-amber-500/5">
                <div class="flex gap-4 items-start">
                    <i class="i-mdi-view-grid text-2xl text-amber-400 mt-1" />
                    <div class="flex-1">
                        <div class="flex gap-2 items-center">
                            <h3 class="text-amber-300 font-bold">
                                虚拟显示器
                            </h3>
                            <span v-if="vd.info.value"
                                class="text-xs text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20">
                                ON · display_id={{ vd.info.value.display_id }}
                            </span>
                            <span v-else class="text-xs text-slate-400 px-2 py-0.5 rounded bg-slate-700">
                                OFF
                            </span>
                        </div>
                        <p v-if="!vd.info.value" class="text-xs text-slate-400 mt-1">
                            创建一块虚拟外接显示器（不可见），可以把其他 app 的窗口拖到这块屏上，再用 OS 屏幕共享时选这块屏即可。DeskPad 同款机制。
                        </p>
                        <p v-else class="text-xs text-slate-400 mt-1">
                            <strong class="text-amber-300">{{ vd.info.value.name }}</strong>（{{ vd.info.value.width
                            }}×{{ vd.info.value.height }}）已就绪 ——
                            把要演示的窗口拖到这块屏，然后开始共享屏幕时选「{{ vd.info.value.name }}」
                        </p>
                        <p v-if="vd.error.value" class="text-xs text-red-400 mt-2">
                            {{ vd.error.value }}
                        </p>
                    </div>
                    <button :disabled="vd.loading.value"
                        class="text-sm font-medium px-3 py-1.5 border rounded flex gap-1 transition items-center disabled:opacity-50"
                        :class="vd.info.value
                            ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                            : 'border-amber-500 text-amber-300 hover:bg-amber-500/10'"
                        @click="toggleVirtualDisplay">
                        <i :class="vd.info.value ? 'i-mdi-power' : 'i-mdi-plus-circle'" />
                        {{ vd.info.value ? '关闭' : '打开虚拟屏' }}
                    </button>
                </div>
            </div>

            <div v-if="!host.sharing.value" class="p-12 text-center border border-slate-700 rounded-xl bg-slate-800/50">
                <i class="i-mdi-monitor text-6xl text-sky-400 mb-4" />
                <h2 class="text-2xl font-bold mb-2">
                    准备共享屏幕
                </h2>

                <!-- 房间号（可编辑，固定后观众端 URL 也固定，下次开 app 不变） -->
                <div class="mx-auto mb-6 max-w-sm">
                    <div class="text-xs text-slate-500 mb-2">
                        房间号（观众端 URL 末尾的 6 位）
                    </div>
                    <div class="flex gap-2 items-center">
                        <input v-model="roomInput" maxlength="6" inputmode="numeric"
                            class="text-2xl text-sky-400 tracking-widest font-bold font-mono px-4 py-3 text-center outline-none border border-slate-700 rounded bg-slate-900 flex-1 focus:border-sky-500"
                            @blur="commitRoom" @keydown.enter="commitRoom">
                        <button class="text-slate-400 p-3 border border-slate-700 rounded transition hover:text-slate-100 hover:bg-slate-800"
                            title="随机换一个" @click="randomRoom">
                            <i class="i-mdi-autorenew" />
                        </button>
                    </div>
                </div>

                <p class="text-sm text-slate-400 mb-6">
                    点击下方按钮选择要共享的屏幕 / 窗口
                </p>
                <button class="text-base text-white font-medium px-6 py-3 rounded-lg bg-emerald-600 inline-flex gap-2 transition items-center hover:bg-emerald-500"
                    @click="start">
                    <i class="i-mdi-play" />
                    开始共享屏幕
                </button>
                <p v-if="host.error.value" class="text-sm text-red-400 mt-4">
                    {{ host.error.value }}
                </p>
            </div>

            <div v-else class="gap-6 grid md:grid-cols-2">
                <!-- 左：房间号 + 二维码 + 主机 IP -->
                <div class="p-6 border border-slate-700 rounded-xl bg-slate-800/50">
                    <div class="text-sm text-slate-400 mb-4">
                        观众扫码或手动输入
                    </div>
                    <div class="mb-4 p-4 rounded-lg bg-white flex items-center justify-center">
                        <img v-if="qrDataUrl" :src="qrDataUrl" class="h-56 w-56" alt="QR">
                    </div>
                    <div class="mb-4 flex gap-2 items-center">
                        <input v-model="roomInput" maxlength="6" inputmode="numeric"
                            class="text-3xl text-sky-400 tracking-widest font-bold font-mono px-4 py-3 text-center outline-none border border-transparent rounded bg-slate-900 flex-1 focus:border-sky-500"
                            @blur="commitRoom" @keydown.enter="commitRoom">
                        <button class="text-slate-400 p-2 rounded hover:text-slate-100 hover:bg-slate-800" title="随机换一个"
                            @click="randomRoom">
                            <i class="i-mdi-autorenew" />
                        </button>
                        <button class="text-slate-400 p-2 rounded hover:text-slate-100 hover:bg-slate-800" title="复制房间号"
                            @click="copyRoom">
                            <i class="i-mdi-content-copy" />
                        </button>
                    </div>
                    <div v-if="lanIp" class="space-y-2">
                        <div class="text-xs px-3 py-2 rounded bg-slate-900">
                            <div class="text-slate-500">
                                观众浏览器 URL（QR 扫这个）
                            </div>
                            <div class="mt-1 flex gap-2 items-center">
                                <code class="text-emerald-400 font-mono flex-1 truncate">{{ viewerUrl }}</code>
                                <button class="text-slate-400 p-1.5 rounded hover:text-slate-100 hover:bg-slate-800"
                                    title="复制 URL" @click="copyLink">
                                    <i class="i-mdi-content-copy text-xs" />
                                </button>
                            </div>
                        </div>
                        <div class="text-xs px-3 py-2 rounded bg-slate-900">
                            <div class="text-slate-500">
                                主机 IP:信令端口
                            </div>
                            <div class="mt-1 flex gap-2 items-center">
                                <code class="text-sky-300 font-mono flex-1">{{ lanIp }}:{{ signalPort }}</code>
                                <button class="text-slate-400 p-1.5 rounded hover:text-slate-100 hover:bg-slate-800"
                                    title="复制" @click="copyHost">
                                    <i class="i-mdi-content-copy text-xs" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 右：预览 + 状态 -->
                <div class="p-6 border border-slate-700 rounded-xl bg-slate-800/50">
                    <div class="text-sm text-slate-400 mb-3">
                        本地预览
                    </div>
                    <div class="rounded-lg bg-black aspect-video relative overflow-hidden">
                        <video ref="previewEl" autoplay muted playsinline
                            class="h-full w-full inset-0 absolute object-contain" />
                        <button v-if="!host.trackEnded.value"
                            class="text-white p-2 rounded-lg bg-black/50 transition right-2 top-2 absolute backdrop-blur hover:bg-black/70"
                            title="放大查看" @click="openZoom">
                            <i class="i-mdi-magnify-plus-outline text-lg" />
                        </button>
                        <div v-if="host.trackEnded.value"
                            class="p-4 text-center bg-slate-900/90 flex flex-col items-center inset-0 justify-center absolute">
                            <i class="i-mdi-alert text-3xl text-amber-400 mb-2" />
                            <div class="text-sm mb-3">
                                屏幕共享中断
                            </div>
                            <button class="text-sm text-white font-medium px-4 py-2 rounded bg-amber-600 inline-flex gap-1 items-center hover:bg-amber-500"
                                @click="reShare">
                                <i class="i-mdi-refresh" /> 重新选择屏幕
                            </button>
                        </div>
                    </div>

                    <div class="text-sm mt-4 gap-3 grid grid-cols-2">
                        <div class="px-3 py-2 rounded bg-slate-900">
                            <div class="text-xs text-slate-500">
                                信令
                            </div>
                            <div class="font-semibold"
                                :class="sig.connected.value ? 'text-emerald-400' : 'text-amber-400'">
                                {{ sig.connected.value ? '已连' : '重连中' }}
                            </div>
                        </div>
                        <div class="px-3 py-2 rounded bg-slate-900">
                            <div class="text-xs text-slate-500">
                                观众
                            </div>
                            <div class="font-semibold"
                                :class="sig.peerJoined.value ? 'text-emerald-400' : 'text-slate-500'">
                                {{ sig.peerJoined.value ? '在线' : '等待' }}
                            </div>
                        </div>
                        <div class="px-3 py-2 rounded bg-slate-900">
                            <div class="text-xs text-slate-500">
                                PC
                            </div>
                            <div class="font-semibold">
                                {{ fmtState(host.connectionState.value) }}
                            </div>
                        </div>
                        <div class="px-3 py-2 rounded bg-slate-900">
                            <div class="text-xs text-slate-500">
                                ICE
                            </div>
                            <div class="font-semibold">
                                {{ fmtState(host.iceState.value) }}
                            </div>
                        </div>
                        <div class="px-3 py-2 rounded bg-slate-900 col-span-2">
                            <div class="text-xs text-slate-500">
                                防休眠
                            </div>
                            <div class="font-semibold"
                                :class="host.sleepLocked.value ? 'text-emerald-400' : 'text-slate-500'">
                                {{ host.sleepLocked.value ? '已锁' : '未锁' }}
                            </div>
                        </div>
                    </div>

                    <!-- 画质预设 -->
                    <div class="mt-4 flex gap-2 items-center">
                        <label class="text-sm text-slate-400">画质</label>
                        <select v-model="quality"
                            class="text-sm text-slate-100 px-3 py-2 outline-none border border-slate-600 rounded bg-slate-900 flex-1 focus:border-sky-500">
                            <option v-for="o in qualityOptions" :key="o.value" :value="o.value">
                                {{ o.label }}
                            </option>
                        </select>
                    </div>

                    <!-- 允许观众放大 -->
                    <label class="text-sm text-slate-400 mt-3 flex gap-2 cursor-pointer select-none items-center">
                        <input v-model="allowViewerZoom" type="checkbox"
                            class="accent-sky-500 rounded bg-slate-900 h-4 w-4">
                        允许观众放大画面
                        <span class="text-xs text-slate-500">（关闭后观众端只能整屏查看）</span>
                    </label>

                    <div class="mt-3 flex gap-2">
                        <button class="text-sm text-slate-300 px-3 py-2 border border-slate-600 rounded flex flex-1 gap-1 items-center justify-center hover:bg-slate-800"
                            @click="reShare">
                            <i class="i-mdi-refresh" /> 重新选屏
                        </button>
                        <button class="text-sm text-white font-medium px-3 py-2 rounded bg-red-600 flex flex-1 gap-1 items-center justify-center hover:bg-red-500"
                            @click="stop">
                            <i class="i-mdi-stop" /> 停止共享
                        </button>
                    </div>

                    <p v-if="host.error.value" class="text-sm text-red-400 mt-3">
                        {{ host.error.value }}
                    </p>
                </div>
            </div>
        </div>

        <!-- 源选择 picker -->
        <SourcePicker v-if="pickerOpen" :virtual-display-id="vd.info.value?.display_id ?? null" @pick="onSourcePicked"
            @cancel="pickerOpen = false" />

        <!-- 放大查看：全屏覆盖层，滚轮缩放 + 拖拽平移 -->
        <div v-if="zoomOpen"
            class="bg-black/95 flex items-center inset-0 justify-center fixed z-50"
            @click.self="closeZoom">
            <video ref="zoomEl" autoplay muted playsinline
                class="max-h-full max-w-full select-none"
                :style="{ transform: pz.transform.value, cursor: pz.cursor.value, transition: pz.dragging.value ? 'none' : 'transform 0.1s ease-out' }"
                @wheel="pz.onWheel" @pointerdown="pz.onPointerDown" @pointermove="pz.onPointerMove"
                @pointerup="pz.onPointerUp" @pointercancel="pz.onPointerUp" @dblclick="pz.reset" />

            <!-- 工具栏 -->
            <div class="px-3 py-2 rounded-full bg-slate-800/90 flex gap-1 items-center bottom-6 left-1/2 fixed backdrop-blur -translate-x-1/2"
                @click.stop>
                <button class="text-slate-200 p-2 rounded-full transition hover:bg-slate-700" title="缩小" @click="pz.zoomOut">
                    <i class="i-mdi-magnify-minus-outline text-lg" />
                </button>
                <span class="text-sm text-slate-300 font-mono px-2 text-center w-14 tabular-nums">{{ Math.round(pz.scale.value * 100) }}%</span>
                <button class="text-slate-200 p-2 rounded-full transition hover:bg-slate-700" title="放大" @click="pz.zoomIn">
                    <i class="i-mdi-magnify-plus-outline text-lg" />
                </button>
                <button class="text-slate-200 p-2 rounded-full transition hover:bg-slate-700" title="重置" @click="pz.reset">
                    <i class="i-mdi-restore text-lg" />
                </button>
                <div class="mx-1 bg-slate-600 h-5 w-px" />
                <button class="text-slate-200 p-2 rounded-full transition hover:bg-slate-700" title="关闭 (Esc)" @click="closeZoom">
                    <i class="i-mdi-close text-lg" />
                </button>
            </div>
        </div>
    </div>
</template>
