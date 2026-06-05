// Node WebSocket signaling server — 协议跟之前 Rust axum 版本完全一致
// 客户端 → 服务器:
//   { type: 'join', room, role: 'host' | 'viewer' }
//   { type: 'offer'|'answer'|'ice', ... }
//   { type: 'ping' }
// 服务器 → 客户端:
//   { type: 'joined'|'peer-join'|'peer-leave'|'kicked'|'error'|'pong' }
//   { type: 'offer'|'answer'|'ice' } (透传)
import { WebSocket, WebSocketServer } from 'ws'

type Role = 'host' | 'viewer'

interface Room {
    host?: WebSocket
    viewer?: WebSocket
}

const rooms = new Map<string, Room>()

const safeSend = (sock: WebSocket, data: any) => {
    if (sock.readyState === WebSocket.OPEN) {
        try {
            sock.send(JSON.stringify(data))
        } catch {}
    }
}

const findPeer = (sock: WebSocket): { roomId: string, role: Role, room: Room } | null => {
    for (const [roomId, room] of rooms) {
        if (room.host === sock) return { roomId, role: 'host', room }
        if (room.viewer === sock) return { roomId, role: 'viewer', room }
    }
    return null
}

const removeFromRooms = (sock: WebSocket) => {
    const found = findPeer(sock)
    if (!found) return null
    const { roomId, role, room } = found
    if (role === 'host') room.host = undefined
    else room.viewer = undefined
    if (!room.host && !room.viewer) rooms.delete(roomId)
    return { roomId, role, room }
}

export function startSignaling(port: number): WebSocketServer {
    const wss = new WebSocketServer({ port, host: '0.0.0.0', path: '/signal' })

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
                // 解绑旧
                removeFromRooms(sock)
                let room = rooms.get(roomId)
                if (!room) {
                    room = {}
                    rooms.set(roomId, room)
                }
                // 同角色重连：踢老的
                const existing = role === 'host' ? room.host : room.viewer
                if (existing && existing !== sock) {
                    safeSend(existing, { type: 'kicked', reason: 'replaced-by-new-connection' })
                }
                if (role === 'host') room.host = sock
                else room.viewer = sock
                safeSend(sock, { type: 'joined', room: roomId, role })
                const other = role === 'host' ? room.viewer : room.host
                if (other) {
                    safeSend(other, { type: 'peer-join', room: roomId, peerRole: role })
                    safeSend(sock, { type: 'peer-join', room: roomId, peerRole: role === 'host' ? 'viewer' : 'host' })
                }
                return
            }

            // offer / answer / ice 透传
            if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice') {
                const found = findPeer(sock)
                if (!found) {
                    safeSend(sock, { type: 'error', message: 'not in any room' })
                    return
                }
                const other = found.role === 'host' ? found.room.viewer : found.room.host
                if (other) safeSend(other, msg)
            }
        })

        sock.on('close', () => {
            const removed = removeFromRooms(sock)
            if (!removed) return
            const other = removed.role === 'host' ? removed.room.viewer : removed.room.host
            if (other) safeSend(other, { type: 'peer-leave', room: removed.roomId, peerRole: removed.role })
        })
    })

    return wss
}
