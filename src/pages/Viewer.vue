<script lang="ts" setup>
// 观众端：全屏视频 + 状态浮层
// signal host 直接用 window.location.hostname（URL 里的 IP / 域名）
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePanZoom } from '~/composables/usePanZoom'
import { useSignaling } from '~/composables/useSignaling'
import { useViewer } from '~/composables/useViewer'
import { getTabId } from '~/utils/ids'

const route = useRoute()
const router = useRouter()
const roomId = computed(() => String(route.params.roomId || ''))

const sig = useSignaling()
const viewer = useViewer(sig)
const videoEl = useTemplateRef<HTMLVideoElement>('videoEl')

// 放大：是否允许由主机通过信令 control 消息下发，默认不允许
const allowZoom = ref(false)
const pz = usePanZoom()
sig.onMessage((m) => {
    if (m.type === 'control' && typeof m.allowZoom === 'boolean') {
        allowZoom.value = m.allowZoom
    }
})
// 主机收回权限时复位缩放，避免观众停留在放大状态
watch(allowZoom, (v) => {
    if (!v) pz.reset()
})

// 主机加入后又离开：标记状态、复位缩放（画面已由 useViewer 在 peer-leave 时清空）
const hostLeft = ref(false)
watch(() => sig.peerJoined.value, (joined, prev) => {
    if (joined) {
        hostLeft.value = false
    } else if (prev) {
        hostLeft.value = true
        pz.reset()
    }
})

// 仅在允许时响应缩放/平移
const onWheel = (e: WheelEvent) => allowZoom.value && pz.onWheel(e)
const onPointerDown = (e: PointerEvent) => allowZoom.value && pz.onPointerDown(e)

watchEffect(() => {
    if (videoEl.value && viewer.remoteStream.value) {
        videoEl.value.srcObject = viewer.remoteStream.value
        // 显式 play() —— 某些场景下 autoplay 不自动触发，需要主动调
        videoEl.value.play().catch(e => console.warn('[viewer] video.play() failed:', e))
    }
})

// 同浏览器多标签协调：被服务器拒（client-limit）的标签可一键「接管」
// —— 通知正在看的旧标签退出，本标签随后接手（浏览器无法跨标签聚焦/关闭，只能这样转移）
const tabId = getTabId()
let bc: BroadcastChannel | null = null
let waitingTakeover = false

const onBcMessage = (e: MessageEvent) => {
    const m = e.data
    if (!m || m.tabId === tabId) return
    if (m.type === 'takeover') {
        // 只有「正在观看」的旧标签才让位；自己也是被拒标签则忽略（避免被一起踢回首页）
        if (sig.rejected.value) return
        sig.close()
        bc?.postMessage({ type: 'released', tabId })
        router.push('/')
    } else if (m.type === 'released' && waitingTakeover) {
        // 旧标签已让位 → 稍等其连接被服务器清理后重连
        waitingTakeover = false
        setTimeout(() => sig.connect({ room: roomId.value, role: 'viewer' }), 500)
    }
}

const takeOver = () => {
    waitingTakeover = true
    bc?.postMessage({ type: 'takeover', tabId })
    // 兜底：旧标签没响应也尝试重连
    setTimeout(() => {
        if (waitingTakeover) {
            waitingTakeover = false
            sig.connect({ room: roomId.value, role: 'viewer' })
        }
    }, 800)
}

onMounted(() => {
    if (!/^\d{6}$/.test(roomId.value)) {
        router.push('/')
        return
    }
    bc = new BroadcastChannel(`desk-viewer-${roomId.value}`)
    bc.onmessage = onBcMessage
    // signalHost 不传 → useSignaling 自动用 window.location.hostname
    sig.connect({ room: roomId.value, role: 'viewer' })
})

onBeforeUnmount(() => {
    sig.close()
    bc?.close()
})

const showControls = ref(true)
let hideTimer: ReturnType<typeof setTimeout> | null = null
const hideSoon = () => {
    if (hideTimer) clearTimeout(hideTimer)
    showControls.value = true
    hideTimer = setTimeout(() => (showControls.value = false), 3000)
}
const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.()
}
const back = () => router.push('/')

const stateText = computed(() => {
    if (!sig.connected.value) return '信令连接中…'
    if (!sig.peerJoined.value) return hostLeft.value ? '主机已离开，等待重连…' : `等待主机加入房间 ${roomId.value}`
    if (viewer.connectionState.value === 'connected') return ''
    if (viewer.connectionState.value === 'failed') return '连接失败，等待主机重连'
    return 'WebRTC 协商中…'
})

const hasStream = computed(() => !!viewer.remoteStream.value)

// 被服务器拒绝的提示文案
const rejectedText = computed(() => {
    switch (sig.rejected.value) {
        case 'room-full': return '房间已满，已达到最多观看人数'
        case 'client-limit': return '这个浏览器已在另一个标签观看本房间'
        case null: return ''
        default: return '无法加入房间'
    }
})
</script>

<template>
    <div class="text-white bg-black h-screen w-screen relative overflow-hidden"
        @mousemove="hideSoon" @touchstart="hideSoon">
        <!-- muted 是为了通过浏览器自动播放策略；流本身无音轨，加 muted 无副作用 -->
        <video ref="videoEl" autoplay muted playsinline
            class="h-full w-full inset-0 absolute object-contain"
            :style="{ transform: pz.transform.value, cursor: allowZoom ? pz.cursor.value : undefined, transition: pz.dragging.value ? 'none' : 'transform 0.1s ease-out' }"
            @wheel="onWheel" @pointerdown="onPointerDown" @pointermove="pz.onPointerMove"
            @pointerup="pz.onPointerUp" @pointercancel="pz.onPointerUp"
            @dblclick="toggleFullscreen" />

        <!-- 顶部控制条 -->
        <div v-if="showControls"
            class="p-4 flex transition items-center left-0 right-0 top-0 justify-between absolute z-10 from-black/70 to-transparent bg-gradient-to-b">
            <button class="text-sm text-slate-300 px-3 py-1.5 rounded flex gap-1 items-center hover:bg-white/10"
                @click="back">
                <i class="i-mdi-arrow-left" /> 离开
            </button>
            <div class="text-sm font-mono">
                房间 {{ roomId }}
            </div>
            <button class="text-slate-300 p-2 rounded hover:bg-white/10" @click="toggleFullscreen">
                <i class="i-mdi-fullscreen" />
            </button>
        </div>

        <!-- 缩放工具栏：仅主机允许放大时显示 -->
        <div v-if="allowZoom && hasStream && showControls"
            class="px-3 py-2 rounded-full bg-black/60 flex gap-1 items-center bottom-6 left-1/2 absolute z-10 backdrop-blur -translate-x-1/2">
            <button class="text-slate-200 p-2 rounded-full transition hover:bg-white/10" title="缩小" @click="pz.zoomOut">
                <i class="i-mdi-magnify-minus-outline text-lg" />
            </button>
            <span class="text-sm text-slate-200 font-mono px-2 text-center w-14 tabular-nums">{{ Math.round(pz.scale.value * 100) }}%</span>
            <button class="text-slate-200 p-2 rounded-full transition hover:bg-white/10" title="放大" @click="pz.zoomIn">
                <i class="i-mdi-magnify-plus-outline text-lg" />
            </button>
            <button class="text-slate-200 p-2 rounded-full transition hover:bg-white/10" title="重置" @click="pz.reset">
                <i class="i-mdi-restore text-lg" />
            </button>
        </div>

        <!-- 被拒绝：房间满 / 同浏览器已在看 —— 终态，不再连接 -->
        <div v-if="rejectedText"
            class="p-6 text-center bg-slate-900 flex flex-col items-center inset-0 justify-center absolute z-20">
            <i class="i-mdi-account-cancel text-5xl text-amber-400 mb-4" />
            <div class="text-lg mb-2">
                {{ rejectedText }}
            </div>
            <div class="mt-4 flex gap-2">
                <!-- 同浏览器已在看：可把观看转移到本标签（旧标签会自动退出） -->
                <button v-if="sig.rejected.value === 'client-limit'"
                    class="text-sm text-white font-medium px-4 py-2 rounded bg-sky-600 inline-flex gap-1 items-center hover:bg-sky-500"
                    @click="takeOver">
                    <i class="i-mdi-swap-horizontal" /> 改用此标签观看
                </button>
                <button class="text-sm text-white font-medium px-4 py-2 rounded bg-slate-700 inline-flex gap-1 items-center hover:bg-slate-600"
                    @click="back">
                    <i class="i-mdi-arrow-left" /> 返回首页
                </button>
            </div>
        </div>

        <!-- 等待中央浮层 -->
        <div v-else-if="!hasStream"
            class="bg-slate-900/80 flex flex-col items-center inset-0 justify-center absolute z-0">
            <i class="i-mdi-loading text-4xl text-sky-400 mb-4 animate-spin" />
            <div class="text-lg mb-2">
                {{ stateText }}
            </div>
            <div class="text-sm text-slate-400">
                <span :class="sig.connected.value ? 'text-emerald-400' : 'text-amber-400'">●</span>
                信令 {{ sig.connected.value ? '已连' : '重连中' }}
                <span class="mx-2">·</span>
                <span :class="sig.peerJoined.value ? 'text-emerald-400' : 'text-slate-500'">●</span>
                主机 {{ sig.peerJoined.value ? '在线' : '离线' }}
            </div>
            <div v-if="viewer.error.value" class="text-red-400 mt-4">
                {{ viewer.error.value }}
            </div>
        </div>

        <div v-else-if="showControls"
            class="text-xs font-mono px-3 py-1.5 rounded bg-black/60 bottom-4 right-4 absolute z-10">
            <span :class="sig.connected.value ? 'text-emerald-400' : 'text-amber-400'">●</span>
            {{ viewer.connectionState.value }}
        </div>

        <!-- 主机锁屏/熄屏导致画面暂停：保留最后一帧，叠加提示，解锁后自动消失 -->
        <div v-if="hasStream && viewer.videoPaused.value"
            class="bg-black/70 flex flex-col items-center inset-0 justify-center absolute z-20">
            <i class="i-mdi-monitor-off text-4xl text-amber-400 mb-3" />
            <div class="text-lg">
                主机画面已暂停
            </div>
            <div class="text-sm text-slate-400 mt-1">
                主机可能已锁屏或熄屏，恢复后将自动继续
            </div>
        </div>
    </div>
</template>
