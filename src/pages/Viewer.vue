<script lang="ts" setup>
// 观众端：全屏视频 + 状态浮层
// signal host 直接用 window.location.hostname（URL 里的 IP / 域名）
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSignaling } from '~/composables/useSignaling'
import { useViewer } from '~/composables/useViewer'

const route = useRoute()
const router = useRouter()
const roomId = computed(() => String(route.params.roomId || ''))

const sig = useSignaling()
const viewer = useViewer(sig)
const videoEl = useTemplateRef<HTMLVideoElement>('videoEl')

watchEffect(() => {
    if (videoEl.value && viewer.remoteStream.value) {
        videoEl.value.srcObject = viewer.remoteStream.value
        // 显式 play() —— 某些场景下 autoplay 不自动触发，需要主动调
        videoEl.value.play().catch(e => console.warn('[viewer] video.play() failed:', e))
    }
})

onMounted(() => {
    if (!/^\d{6}$/.test(roomId.value)) {
        router.push('/')
        return
    }
    // signalHost 不传 → useSignaling 自动用 window.location.hostname
    sig.connect({ room: roomId.value, role: 'viewer' })
})

onBeforeUnmount(() => sig.close())

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
    if (!sig.peerJoined.value) return `等待主机加入房间 ${roomId.value}`
    if (viewer.connectionState.value === 'connected') return ''
    if (viewer.connectionState.value === 'failed') return '连接失败，等待主机重连'
    return 'WebRTC 协商中…'
})

const hasStream = computed(() => !!viewer.remoteStream.value)
</script>

<template>
    <div class="text-white bg-black h-screen w-screen relative overflow-hidden"
        @mousemove="hideSoon" @touchstart="hideSoon">
        <!-- muted 是为了通过浏览器自动播放策略；流本身无音轨，加 muted 无副作用 -->
        <video ref="videoEl" autoplay muted playsinline
            class="h-full w-full inset-0 absolute object-contain"
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

        <!-- 等待中央浮层 -->
        <div v-if="!hasStream"
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
    </div>
</template>
