// 平移缩放：滚轮缩放 + 拖拽平移，主机本地预览放大层和观众端共用
import { computed, ref } from 'vue'

export const usePanZoom = (opts: { min?: number, max?: number } = {}) => {
    const min = opts.min ?? 1
    const max = opts.max ?? 8

    const scale = ref(1)
    const tx = ref(0)
    const ty = ref(0)
    const dragging = ref(false)
    let lastX = 0
    let lastY = 0

    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

    const reset = () => {
        scale.value = 1
        tx.value = 0
        ty.value = 0
    }

    const setScale = (next: number) => {
        scale.value = clamp(next, min, max)
        // 缩回 1× 自动复位平移，避免留在偏移状态
        if (scale.value === 1) {
            tx.value = 0
            ty.value = 0
        }
    }

    const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        setScale(scale.value * (e.deltaY < 0 ? 1.2 : 1 / 1.2))
    }
    const zoomIn = () => setScale(scale.value * 1.3)
    const zoomOut = () => setScale(scale.value / 1.3)

    // 拖拽平移（仅放大后可拖）
    const onPointerDown = (e: PointerEvent) => {
        if (scale.value <= 1) return
        dragging.value = true
        lastX = e.clientX
        lastY = e.clientY
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
        if (!dragging.value) return
        tx.value += e.clientX - lastX
        ty.value += e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
        dragging.value = false
        ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    }

    const transform = computed(() => `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`)
    const cursor = computed(() => (scale.value > 1 ? (dragging.value ? 'grabbing' : 'grab') : 'zoom-in'))

    return {
        scale,
        dragging,
        transform,
        cursor,
        reset,
        setScale,
        onWheel,
        zoomIn,
        zoomOut,
        onPointerDown,
        onPointerMove,
        onPointerUp,
    }
}
