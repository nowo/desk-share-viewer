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
    // host：至少有一个观众；viewer：主机在线
    const peerJoined = ref(false)
    // host 端在线观众数（viewer 端恒 0）
    const peerCount = ref(0)

    let currentRoom: string | null = null
    let currentRole: Role | null = null
    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let manualClose = false
    // host 端维护的观众 peerId 集合（用于计数，重连后由服务器补发 peer-join 重建）
    const viewerIds = new Set<string>()
    const handlers = new Set<(m: ISignalMsg) => void>()
    // 发送队列：WS 还没 open 时缓存消息，open 后一起 flush
    // 修 bug：首次共享时 startShare 内部 sendOffer 在 sig.connect 之前触发，
    // 没队列的话这条 offer 被静默丢弃，观众端就看不到画面
    const pendingQueue: ISignalMsg[] = []
    const MAX_QUEUE = 32

    const buildUrl = async (): Promise<string> => {
        const port = await getSignalPort()
        // 主机端 file:// 下 hostname 为空 → 回退 127.0.0.1；观众端用 URL 里的 host
        const host = window.location.hostname || '127.0.0.1'
        return `ws://${host}:${port}/signal`
    }

    const send = (msg: ISignalMsg) => {
        if (ws.value?.readyState === WebSocket.OPEN) {
            ws.value.send(JSON.stringify(msg))
        } else if (msg.type !== 'ping') {
            // ping 不入队（保活无关业务）；其他消息缓存等 WS open 后 flush
            if (pendingQueue.length < MAX_QUEUE) pendingQueue.push(msg)
        }
    }

    const startPing = () => {
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = setInterval(send, 20_000, { type: 'ping' })
    }
    const stopPing = () => {
        if (pingTimer) {
            clearInterval(pingTimer)
            pingTimer = null
        }
    }

    // open 用 function 声明，scheduleReconnect 里能 hoist 引用
    async function open() {
        manualClose = false
        const url = await buildUrl()
        const sock = new WebSocket(url)
        ws.value = sock

        sock.onopen = () => {
            connected.value = true
            reconnectAttempt = 0
            // 重连：清空旧观众计数，等服务器重新补发 peer-join 重建
            viewerIds.clear()
            peerCount.value = 0
            peerJoined.value = false
            startPing()
            // join 必须最先发（服务器据此把这条连接绑到房间）
            if (currentRoom && currentRole) {
                sock.send(JSON.stringify({ type: 'join', room: currentRoom, role: currentRole }))
            }
            // flush 缓存的消息（offer / ice / 等）
            while (pendingQueue.length > 0) {
                const msg = pendingQueue.shift()!
                sock.send(JSON.stringify(msg))
            }
        }

        sock.onmessage = (e) => {
            let msg: ISignalMsg
            try {
                msg = JSON.parse(e.data)
            } catch {
                return
            }
            if (msg.type === 'pong') return
            if (msg.type === 'peer-join') {
                // host：msg.peerId=新观众；viewer：无 peerId，表示主机在线
                if (currentRole === 'host' && msg.peerId) {
                    viewerIds.add(msg.peerId)
                    peerCount.value = viewerIds.size
                }
                peerJoined.value = currentRole === 'host' ? viewerIds.size > 0 : true
            } else if (msg.type === 'peer-leave') {
                if (currentRole === 'host') {
                    if (msg.peerId) viewerIds.delete(msg.peerId)
                    peerCount.value = viewerIds.size
                    peerJoined.value = viewerIds.size > 0
                } else {
                    peerJoined.value = false
                }
            }
            handlers.forEach(h => h(msg))
        }

        sock.onclose = () => {
            connected.value = false
            stopPing()
            ws.value = null
            scheduleReconnect()
        }
    }

    // function 声明，open 里 sock.onclose 引用得到 hoist
    function scheduleReconnect() {
        if (manualClose || reconnectTimer) return
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt, 5))
        reconnectAttempt++
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            if (currentRoom && currentRole) open()
        }, delay)
    }

    const connect = (opts: { room: string, role: Role }) => {
        currentRoom = opts.room
        currentRole = opts.role
        void open()
    }

    const close = () => {
        manualClose = true
        if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
        }
        stopPing()
        ws.value?.close()
        ws.value = null
        connected.value = false
        peerJoined.value = false
        viewerIds.clear()
        peerCount.value = 0
        pendingQueue.length = 0
    }

    const onMessage = (fn: (m: ISignalMsg) => void) => {
        handlers.add(fn)
        return () => handlers.delete(fn)
    }

    return { connected, peerJoined, peerCount, connect, close, send, onMessage }
}

export type Signaling = ReturnType<typeof useSignaling>
