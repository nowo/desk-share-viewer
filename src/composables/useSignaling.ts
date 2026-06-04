// WebSocket 信令客户端：自动重连（指数退避）+ 心跳 + 重连后自动重 join
import { ref } from 'vue'
import { getSignalPort } from '~/utils/bridge'

type Role = 'host' | 'viewer'

export interface ISignalMsg {
    type: string
    [k: string]: any
}

export const useSignaling = () => {
    const ws = ref<WebSocket | null>(null)
    const connected = ref(false)
    const peerJoined = ref(false)
    const lastError = ref<string | null>(null)

    let currentRoom: string | null = null
    let currentRole: Role | null = null
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let manualClose = false
    let signalHost: string | null = null
    const handlers = new Set<(m: ISignalMsg) => void>()

    const buildUrl = async (): Promise<string> => {
        const port = await getSignalPort()
        // 优先用显式传入的 host，否则用当前 hostname（观众端浏览器场景）
        const host = signalHost || window.location.hostname || '127.0.0.1'
        return `ws://${host}:${port}/signal`
    }

    const setSignalHost = (h: string) => { signalHost = h }

    const send = (msg: ISignalMsg) => {
        if (ws.value?.readyState === WebSocket.OPEN) {
            ws.value.send(JSON.stringify(msg))
        }
    }

    const startPing = () => {
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = setInterval(() => send({ type: 'ping' }), 20_000)
    }
    const stopPing = () => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    }

    const scheduleReconnect = () => {
        if (manualClose || reconnectTimer) return
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 5))
        reconnectAttempt++
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (currentRoom && currentRole) open()
        }, delay)
    }

    const open = async () => {
        manualClose = false
        const url = await buildUrl()
        const sock = new WebSocket(url)
        ws.value = sock

        sock.onopen = () => {
            connected.value = true
            lastError.value = null
            reconnectAttempt = 0
            startPing()
            if (currentRoom && currentRole) {
                send({ type: 'join', room: currentRoom, role: currentRole })
            }
        }

        sock.onmessage = (e) => {
            let msg: ISignalMsg
            try { msg = JSON.parse(e.data) } catch { return }
            if (msg.type === 'pong') return
            if (msg.type === 'peer-join') peerJoined.value = true
            if (msg.type === 'peer-leave') peerJoined.value = false
            if (msg.type === 'error') lastError.value = msg.message
            handlers.forEach(h => h(msg))
        }

        sock.onclose = () => {
            connected.value = false
            stopPing()
            ws.value = null
            scheduleReconnect()
        }

        sock.onerror = () => {
            lastError.value = 'WebSocket 错误'
        }
    }

    const connect = (opts: { room: string, role: Role, signalHost?: string }) => {
        currentRoom = opts.room
        currentRole = opts.role
        if (opts.signalHost) signalHost = opts.signalHost
        void open()
    }

    const close = () => {
        manualClose = true
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        stopPing()
        ws.value?.close()
        ws.value = null
        connected.value = false
        peerJoined.value = false
    }

    const onMessage = (fn: (m: ISignalMsg) => void) => {
        handlers.add(fn)
        return () => handlers.delete(fn)
    }

    return { connected, peerJoined, lastError, connect, close, send, onMessage, setSignalHost }
}

export type Signaling = ReturnType<typeof useSignaling>
