// Node WebSocket signaling server —— 一对多：一个 host ↔ 多个 viewer
// 客户端 → 服务器:
//   { type: 'join', room, role: 'host' | 'viewer' }
//   { type: 'offer'|'ice', to, ... }       (host → 指定 viewer，to=viewer peerId)
//   { type: 'answer'|'ice', ... }          (viewer → host，服务器注入 from)
//   { type: 'control', ... }               (host 广播给所有 viewer)
//   { type: 'ping' }
// 服务器 → 客户端:
//   { type: 'joined', role, peerId }                  (告知自身 peerId)
//   { type: 'peer-join', peerId? }                    (host 收到带 peerId=新观众；viewer 收到表示主机在线)
//   { type: 'peer-leave', peerId? }                   (host 收到带 peerId=该观众离开；viewer 收到表示主机离开)
//   { type: 'offer'|'answer'|'ice'|'control', from? } (透传，viewer→host 带 from)
//   { type: 'kicked'|'error'|'pong' }
import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'

// 房间最多观众数：超过 10 路 mesh 主机编码扛不住，拒绝新连接
const MAX_VIEWERS = 10
// 同一浏览器（clientId）最多观众数 —— 默认 1（防一人开多个标签占名额）
// 测试时调大即可用同一浏览器多标签模拟多个观众
const MAX_PER_CLIENT = 1

type Role = 'host' | 'viewer'

interface Peer {
    sock: WebSocket
    id: string
    clientId?: string // viewer 才有，用于「每浏览器限额」
    tabId?: string // viewer 才有，区分同标签重连 vs 另开标签
}

interface Room {
    host?: Peer
    viewers: Map<string, Peer> // peerId → viewer
}

interface ConnInfo {
    roomId: string
    role: Role
    peerId: string
}

const rooms = new Map<string, Room>()
// 每条连接的归属信息，close / 转发时用
const conns = new Map<WebSocket, ConnInfo>()

const safeSend = (sock: WebSocket, data: any) => {
    if (sock.readyState === WebSocket.OPEN) {
        try {
            sock.send(JSON.stringify(data))
        } catch {}
    }
}

const removeFromRoom = (sock: WebSocket) => {
    const info = conns.get(sock)
    if (!info) return
    conns.delete(sock)
    const room = rooms.get(info.roomId)
    if (!room) return
    if (info.role === 'host') {
        if (room.host?.sock === sock) {
            room.host = undefined
            // 主机离开 → 通知所有观众（无 peerId）
            for (const v of room.viewers.values()) safeSend(v.sock, { type: 'peer-leave' })
        }
    } else if (room.viewers.delete(info.peerId)) {
        // 观众离开 → 通知主机（带 peerId）
        if (room.host) safeSend(room.host.sock, { type: 'peer-leave', peerId: info.peerId })
    }
    if (!room.host && room.viewers.size === 0) rooms.delete(info.roomId)
}

export function startSignaling(port: number): WebSocketServer {
    const wss = new WebSocketServer({ port, host: '0.0.0.0', path: '/signal' })

    // 端口被占等监听错误：打日志兜底，避免未捕获异常拖垮主进程
    wss.on('error', (e) => {
        console.error(`[signaling] listen error on ${port}:`, e)
    })

    wss.on('connection', (sock) => {
        sock.on('message', (raw) => {
            let msg: any
            try {
                msg = JSON.parse(raw.toString())
            } catch {
                return
            }
            if (!msg || typeof msg !== 'object') return

            if (msg.type === 'ping') {
                safeSend(sock, { type: 'pong' })
                return
            }

            if (msg.type === 'join') {
                const { room: roomId, role } = msg as { room: string, role: Role }
                if (!roomId || (role !== 'host' && role !== 'viewer')) {
                    safeSend(sock, { type: 'error', message: 'invalid join' })
                    return
                }
                // 解绑旧连接
                removeFromRoom(sock)
                let room = rooms.get(roomId)
                if (!room) {
                    room = { viewers: new Map() }
                    rooms.set(roomId, room)
                }
                const peerId = randomUUID()
                conns.set(sock, { roomId, role, peerId })

                if (role === 'host') {
                    // 同房间只允许一个 host：踢掉旧的
                    if (room.host && room.host.sock !== sock) {
                        safeSend(room.host.sock, { type: 'kicked', reason: 'replaced-by-new-connection' })
                        conns.delete(room.host.sock)
                    }
                    room.host = { sock, id: peerId }
                    safeSend(sock, { type: 'joined', role, peerId })
                    // 主机（重）上线：把已有观众补发给它建连，并通知各观众主机在线
                    for (const v of room.viewers.values()) {
                        safeSend(sock, { type: 'peer-join', peerId: v.id })
                        safeSend(v.sock, { type: 'peer-join' })
                    }
                } else {
                    const clientId = typeof msg.clientId === 'string' && msg.clientId ? msg.clientId : peerId
                    const tabId = typeof msg.tabId === 'string' && msg.tabId ? msg.tabId : peerId
                    // 同标签重连：踢掉自己的旧（幽灵）连接，避免重连时被自己挡住触发 client-limit
                    for (const [vid, v] of [...room.viewers]) {
                        if (v.clientId === clientId && v.tabId === tabId) {
                            safeSend(v.sock, { type: 'kicked', reason: 'replaced-by-reconnect' })
                            conns.delete(v.sock)
                            room.viewers.delete(vid)
                            if (room.host) safeSend(room.host.sock, { type: 'peer-leave', peerId: vid })
                        }
                    }
                    const sameClient = [...room.viewers.values()].filter(v => v.clientId === clientId).length
                    const reason = room.viewers.size >= MAX_VIEWERS
                        ? 'room-full'
                        : sameClient >= MAX_PER_CLIENT ? 'client-limit' : null
                    if (reason) {
                        safeSend(sock, { type: 'rejected', reason })
                        conns.delete(sock)
                        if (!room.host && room.viewers.size === 0) rooms.delete(roomId)
                        return
                    }
                    room.viewers.set(peerId, { sock, id: peerId, clientId, tabId })
                    safeSend(sock, { type: 'joined', role, peerId })
                    // 通知主机有新观众；同时若主机在线，告诉观众
                    if (room.host) {
                        safeSend(room.host.sock, { type: 'peer-join', peerId })
                        safeSend(sock, { type: 'peer-join' })
                    }
                }
                return
            }

            const info = conns.get(sock)
            if (!info) {
                safeSend(sock, { type: 'error', message: 'not in any room' })
                return
            }
            const room = rooms.get(info.roomId)
            if (!room) return

            if (info.role === 'host') {
                // 主机 → 指定观众（offer / ice）或广播（control）
                if (msg.type === 'offer' || msg.type === 'ice') {
                    const v = room.viewers.get(msg.to)
                    if (v) safeSend(v.sock, { ...msg, to: undefined })
                } else if (msg.type === 'control') {
                    for (const v of room.viewers.values()) safeSend(v.sock, msg)
                }
            } else {
                // 观众 → 主机（answer / ice），注入 from 让主机区分来源
                if (msg.type === 'answer' || msg.type === 'ice') {
                    if (room.host) safeSend(room.host.sock, { ...msg, from: info.peerId })
                }
            }
        })

        sock.on('close', () => {
            removeFromRoom(sock)
        })
    })

    return wss
}
