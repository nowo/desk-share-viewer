import type { Signaling } from './useSignaling'
// 观众端：接收 offer，回 answer
import { onBeforeUnmount, ref } from 'vue'
import { ICE_SERVERS } from '~/utils/webrtc'

export const useViewer = (signaling: Signaling) => {
    const remoteStream = ref<MediaStream | null>(null)
    const connectionState = ref<RTCPeerConnectionState>('new')
    const error = ref<string | null>(null)
    // 主机画面是否暂停出帧（主机锁屏 / 熄屏时屏幕采集被系统暂停 → track mute）
    const videoPaused = ref(false)

    let pc: RTCPeerConnection | null = null
    const pendingIce: RTCIceCandidateInit[] = []

    const createPC = () => {
        if (pc) return pc
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        conn.onicecandidate = (e) => {
            if (e.candidate) signaling.send({ type: 'ice', candidate: e.candidate.toJSON() })
        }
        conn.onconnectionstatechange = () => (connectionState.value = conn.connectionState)
        conn.ontrack = (e) => {
            remoteStream.value = e.streams[0] || new MediaStream([e.track])
            // 监听帧暂停/恢复：主机锁屏熄屏会让 track mute，解锁后 unmute 自动恢复
            const track = e.track
            videoPaused.value = false
            track.onmute = () => (videoPaused.value = true)
            track.onunmute = () => (videoPaused.value = false)
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
            try {
                await conn.addIceCandidate(c)
            } catch {}
        }
    }

    const handleIce = async (candidate: RTCIceCandidateInit) => {
        if (!pc || !pc.remoteDescription) {
            pendingIce.push(candidate)
            return
        }
        try {
            await pc.addIceCandidate(candidate)
        } catch {}
    }

    const reset = () => {
        pc?.close()
        pc = null
        remoteStream.value = null
        connectionState.value = 'closed'
        videoPaused.value = false
    }

    signaling.onMessage(async (m) => {
        if (m.type === 'offer') {
            await handleOffer(m.sdp)
        } else if (m.type === 'ice') {
            await handleIce(m.candidate)
        } else if (m.type === 'peer-leave') {
            // 主机停止共享 / 退出：清掉旧画面与连接，等主机回来重新协商
            reset()
        } else if (m.type === 'kicked') {
            error.value = '当前会话被新连接替换'
            reset()
        }
    })

    onBeforeUnmount(reset)

    return { remoteStream, connectionState, error, videoPaused }
}
