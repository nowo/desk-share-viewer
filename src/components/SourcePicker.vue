<script lang="ts" setup>
// 自定义屏幕/窗口选择器
// - 用 display_id 匹配虚拟屏 ↔ source
// - 显示分辨率 / 「主屏」「虚拟屏」「外接」等标签
// - 缩略图空时给彩色占位，提示用户授屏幕录制权限
import { computed, onMounted, ref } from 'vue'

interface Source {
    id: string
    name: string
    display_id: string
    thumbnail: string
    appIcon: string | null
}

interface Display {
    id: number
    label: string
    bounds: { x: number, y: number, width: number, height: number }
    internal: boolean
}

const props = defineProps<{ virtualDisplayId?: number | null }>()
const emit = defineEmits<{
    (e: 'pick', source: Source): void
    (e: 'cancel'): void
}>()

const screens = ref<Source[]>([])
const windows = ref<Source[]>([])
const displays = ref<Display[]>([])
const loading = ref(true)
const tab = ref<'screen' | 'window'>('screen')

onMounted(async () => {
    try {
        const data = await (window as any).desk.getDisplaySources() as {
            sources: Source[], displays: Display[],
        }
        screens.value = data.sources.filter(s => s.id.startsWith('screen:'))
        windows.value = data.sources.filter(s => s.id.startsWith('window:'))
        displays.value = data.displays
    } finally {
        loading.value = false
    }
})

const displayById = computed(() => {
    const m = new Map<string, Display>()
    for (const d of displays.value) m.set(String(d.id), d)
    return m
})

const labelOf = (source: Source): string => {
    const d = displayById.value.get(source.display_id)
    if (!d) return source.name
    const w = d.bounds.width
    const h = d.bounds.height
    return `${w}×${h}`
}

const tagOf = (source: Source): { text: string, cls: string } | null => {
    const id = Number(source.display_id)
    if (props.virtualDisplayId && id === props.virtualDisplayId) {
        return { text: '虚拟屏', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
    }
    const d = displayById.value.get(source.display_id)
    if (d?.internal) return { text: '主屏', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' }
    if (d) return { text: '外接', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
    return null
}

const isVirtual = (source: Source): boolean =>
    !!props.virtualDisplayId && Number(source.display_id) === props.virtualDisplayId

const thumbnailEmpty = (s: Source) => {
    // 1x1 png 的 dataURL 约 122 字节；正常截屏 >10KB
    return !s.thumbnail || s.thumbnail.length < 500
}

const allThumbsEmpty = computed(() => screens.value.length > 0 && screens.value.every(thumbnailEmpty))

const select = (s: Source) => emit('pick', s)
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
         @click.self="emit('cancel')">
        <div class="w-full max-w-5xl rounded-xl bg-slate-900 p-6 text-slate-100 shadow-2xl">
            <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-bold">选择要共享的内容</h2>
                <button class="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        @click="emit('cancel')">
                    <i class="i-mdi-close" />
                </button>
            </div>

            <!-- 权限提示 -->
            <div v-if="!loading && allThumbsEmpty"
                 class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                <i class="i-mdi-alert mr-2" />
                缩略图为空 —— Electron 还没拿到屏幕录制权限。
                打开「系统设置 → 隐私与安全性 → 屏幕与系统音频录制」，找到 <strong>Electron</strong> 或 <strong>desk</strong>，
                打开开关后**重启 desk app**。看不到名字就点底部「+」手动加 dev binary。
            </div>

            <div class="mb-4 flex gap-1 border-b border-slate-700">
                <button class="border-b-2 px-4 py-2 text-sm font-medium"
                        :class="tab === 'screen' ? 'border-sky-500 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'"
                        @click="tab = 'screen'">
                    整个屏幕（{{ screens.length }}）
                </button>
                <button class="border-b-2 px-4 py-2 text-sm font-medium"
                        :class="tab === 'window' ? 'border-sky-500 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'"
                        @click="tab = 'window'">
                    窗口（{{ windows.length }}）
                </button>
            </div>

            <div v-if="loading" class="py-16 text-center text-slate-400">加载中…</div>

            <div v-else class="max-h-[500px] overflow-auto">
                <!-- 整个屏幕 -->
                <div v-if="tab === 'screen'" class="grid grid-cols-2 gap-4 md:grid-cols-3">
                    <div v-for="(s, i) in screens" :key="s.id"
                         class="cursor-pointer overflow-hidden rounded-lg border-2 transition hover:shadow-lg"
                         :class="isVirtual(s)
                             ? 'border-amber-500 bg-amber-500/5 hover:border-amber-400'
                             : 'border-slate-700 hover:border-sky-500'"
                         @click="select(s)">
                        <div class="relative aspect-video bg-black">
                            <img v-if="!thumbnailEmpty(s)" :src="s.thumbnail" class="h-full w-full object-contain" :alt="s.name">
                            <div v-else
                                 class="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br"
                                 :class="isVirtual(s) ? 'from-amber-900/40 to-amber-700/20' : 'from-slate-800 to-slate-900'">
                                <i class="i-mdi-monitor mb-2 text-4xl"
                                   :class="isVirtual(s) ? 'text-amber-400' : 'text-slate-500'" />
                                <div class="text-2xl font-bold opacity-50">{{ i + 1 }}</div>
                            </div>
                            <!-- 角标 -->
                            <span v-if="tagOf(s)"
                                  class="absolute right-2 top-2 rounded border px-2 py-0.5 text-xs font-medium"
                                  :class="tagOf(s)!.cls">
                                {{ tagOf(s)!.text }}
                            </span>
                        </div>
                        <div class="border-t border-slate-700 bg-slate-800 px-3 py-2">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium">{{ s.name }}</span>
                                <span class="font-mono text-xs text-slate-500">{{ labelOf(s) }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 窗口 -->
                <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    <div v-for="s in windows" :key="s.id"
                         class="cursor-pointer overflow-hidden rounded-lg border border-slate-700 transition hover:border-sky-500 hover:shadow-lg"
                         @click="select(s)">
                        <div class="aspect-video bg-black">
                            <img v-if="!thumbnailEmpty(s)" :src="s.thumbnail" class="h-full w-full object-contain" :alt="s.name">
                            <div v-else class="flex h-full w-full items-center justify-center bg-slate-800">
                                <i class="i-mdi-fullscreen text-3xl text-slate-500" />
                            </div>
                        </div>
                        <div class="flex items-center gap-2 border-t border-slate-700 bg-slate-800 p-2 text-xs">
                            <img v-if="s.appIcon" :src="s.appIcon" class="h-4 w-4">
                            <span class="truncate">{{ s.name }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
