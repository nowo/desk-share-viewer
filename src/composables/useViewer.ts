// 观众端：接收 offer，回 answer
import { onBeforeUnmount, ref } from 'vue'
import type { Signaling } from './useSignaling'

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
]

export const useViewer = (signaling: Signaling) => {
    const remoteStream = ref<MediaStream | null>(null)
    const connectionState = ref<RTCPeerConnectionState>('new')
    const iceState = ref<RTCIceConnectionState>('new')
    const error = ref<string | null>(null)

    let pc: RTCPeerConnection | null = null
    const pendingIce: RTCIceCandidateInit[] = []

    const createPC = () => {
        if (pc) return pc
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        conn.onicecandidate = (e) => {
            if (e.candidate) signaling.send({ type: 'ice', candidate: e.candidate.toJSON() })
        }
        conn.onconnectionstatechange = () => (connectionState.value = conn.connectionState)
        conn.oniceconnectionstatechange = () => (iceState.value = conn.iceConnectionState)
        conn.ontrack = (e) => {
            remoteStream.value = e.streams[0] || new MediaStream([e.track])
        }
        pc = conn
        return conn
    }

    const handleOffer = async (sdp: RTCSessionDescriptionInit) => {
        const conn = createPC()
        await conn.setRemoteDescription(sdp)
        const answer = await conn.createAnswer()
        await conn.setLocalDescription(answer)
        signaling.send({ type: 'answer', sdp: answer })
        for (const c of pendingIce.splice(0)) {
            try { await conn.addIceCandidate(c) } catch {}
        }
    }

    const handleIce = async (candidate: RTCIceCandidateInit) => {
        if (!pc || !pc.remoteDescription) {
            pendingIce.push(candidate)
            return
        }
        try { await pc.addIceCandidate(candidate) } catch {}
    }

    const reset = () => {
        pc?.close()
        pc = null
        remoteStream.value = null
        connectionState.value = 'closed'
        iceState.value = 'closed'
    }

    signaling.onMessage(async (m) => {
        if (m.type === 'offer') await handleOffer(m.sdp)
        else if (m.type === 'ice') await handleIce(m.candidate)
        else if (m.type === 'kicked') {
            error.value = '当前会话被新连接替换'
            reset()
        }
    })

    onBeforeUnmount(reset)

    return { remoteStream, connectionState, iceState, error, reset }
}
