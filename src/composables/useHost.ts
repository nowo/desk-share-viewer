import type { Signaling } from './useSignaling'
// 主机端：抓屏 + 一对多 Mesh WebRTC（每个观众一条独立连接）+ replaceTrack 换屏 + ICE restart + Mac 防休眠
import { onBeforeUnmount, ref } from 'vue'
import { allowSleep, preventSleep } from '~/utils/bridge'
import { captureSource } from '~/utils/capture'
import { ICE_SERVERS } from '~/utils/webrtc'

// 画质预设 —— LAN 直连建议 high，多观众时建议降到 medium 减轻主机编码负载
export interface QualityPreset {
    maxWidth: number
    maxHeight: number
    maxFrameRate: number
    maxBitrate: number // bps
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
    'low': { maxWidth: 1280, maxHeight: 720, maxFrameRate: 30, maxBitrate: 1_500_000 },
    'medium': { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30, maxBitrate: 3_000_000 },
    'high': { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30, maxBitrate: 8_000_000 },
    'ultra': { maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30, maxBitrate: 12_000_000 },
    '4k': { maxWidth: 3840, maxHeight: 2160, maxFrameRate: 30, maxBitrate: 20_000_000 },
}

// 当前用的预设 —— UI 可改
let currentPreset: QualityPreset = QUALITY_PRESETS.high!

// 一个观众一条 mesh 连接
interface PeerConn {
    pc: RTCPeerConnection
    sender: RTCRtpSender | null
    pendingIce: RTCIceCandidateInit[]
}

export const useHost = (signaling: Signaling) => {
    const sharing = ref(false)
    const stream = ref<MediaStream | null>(null)
    const trackEnded = ref(false)
    const error = ref<string | null>(null)
    const sleepLocked = ref(false)
    // 已建立 WebRTC 连接（connected）的观众数
    const connectedCount = ref(0)

    // peerId → 该观众的连接
    const peers = new Map<string, PeerConn>()
    // 已加入信令但可能还没建连的观众（主机后开始共享时据此补建连）
    const pendingViewers = new Set<string>()

    const updateConnectedCount = () => {
        let n = 0
        for (const { pc } of peers.values()) {
            if (pc.connectionState === 'connected') n++
        }
        connectedCount.value = n
    }

    // 把当前 preset 的 maxBitrate 写到某条连接的 sender —— 让 encoder 拉满
    const applyBitrate = async (entry: PeerConn) => {
        if (!entry.sender) return
        try {
            const params = entry.sender.getParameters()
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}]
            }
            params.encodings[0]!.maxBitrate = currentPreset.maxBitrate
            params.encodings[0]!.priority = 'high'
            // 降级时优先丢帧不丢分辨率
            params.degradationPreference = 'maintain-resolution'
            await entry.sender.setParameters(params)
        } catch (e) {
            console.warn('setParameters failed:', e)
        }
    }

    const sendOffer = async (peerId: string, iceRestart = false) => {
        const entry = peers.get(peerId)
        if (!entry) return
        const offer = await entry.pc.createOffer({ iceRestart })
        await entry.pc.setLocalDescription(offer)
        signaling.send({ type: 'offer', to: peerId, sdp: offer })
    }

    // 为某个观众建立连接并发 offer（需已有 stream）
    const createPeer = async (peerId: string) => {
        if (peers.has(peerId) || !stream.value) return
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        const entry: PeerConn = { pc, sender: null, pendingIce: [] }
        peers.set(peerId, entry)

        pc.onicecandidate = (e) => {
            if (e.candidate) signaling.send({ type: 'ice', to: peerId, candidate: e.candidate.toJSON() })
        }
        pc.onconnectionstatechange = () => updateConnectedCount()
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                try {
                    pc.restartIce()
                } catch {}
                void sendOffer(peerId, true)
            }
        }

        const videoTrack = stream.value.getVideoTracks()[0]
        if (videoTrack) entry.sender = pc.addTrack(videoTrack, stream.value)
        await applyBitrate(entry)
        await sendOffer(peerId)
    }

    const closePeer = (peerId: string) => {
        const entry = peers.get(peerId)
        if (!entry) return
        try {
            entry.pc.close()
        } catch {}
        peers.delete(peerId)
        updateConnectedCount()
    }

    const setQuality = async (presetName: keyof typeof QUALITY_PRESETS) => {
        const preset = QUALITY_PRESETS[presetName]
        if (!preset) return
        currentPreset = preset
        for (const entry of peers.values()) await applyBitrate(entry)
    }

    const capture = (sourceId: string): Promise<MediaStream> => captureSource(sourceId, currentPreset)

    // 抓屏后给视频 track 挂中断监听（系统停止采集时置 trackEnded）
    const watchTrackEnded = (s: MediaStream) => {
        const v = s.getVideoTracks()[0]
        if (v) {
            v.onended = () => {
                trackEnded.value = true
            }
        }
    }

    const startShare = async (sourceId?: string) => {
        error.value = null
        trackEnded.value = false
        try {
            if (!sourceId) {
                throw new Error('未选择共享源')
            }
            const newStream = await capture(sourceId)
            stream.value = newStream
            watchTrackEnded(newStream)
            // 为已加入信令的观众逐个建连
            for (const peerId of pendingViewers) await createPeer(peerId)
            sharing.value = true
            sleepLocked.value = await preventSleep()
        } catch (e: any) {
            error.value = e?.message || '抓屏失败'
        }
    }

    const reShare = async (sourceId?: string) => {
        error.value = null
        try {
            if (!sourceId) {
                throw new Error('未选择共享源')
            }
            const newStream = await capture(sourceId)
            stream.value?.getTracks().forEach(t => t.stop())
            stream.value = newStream
            watchTrackEnded(newStream)
            // 换屏走 replaceTrack —— 所有观众无需重新协商
            const videoTrack = newStream.getVideoTracks()[0]
            if (videoTrack) {
                for (const entry of peers.values()) {
                    if (entry.sender) await entry.sender.replaceTrack(videoTrack)
                }
            }
            trackEnded.value = false
        } catch (e: any) {
            error.value = e?.message || '抓屏失败'
        }
    }

    // 关闭并清空所有观众连接（换房间号时调用，不动 stream / sharing）
    const resetPeers = () => {
        for (const entry of peers.values()) {
            try {
                entry.pc.close()
            } catch {}
        }
        peers.clear()
        pendingViewers.clear()
        connectedCount.value = 0
    }

    const stopShare = async () => {
        sharing.value = false
        stream.value?.getTracks().forEach(t => t.stop())
        stream.value = null
        resetPeers()
        await allowSleep()
        sleepLocked.value = false
    }

    const handleAnswer = async (from: string, sdp: RTCSessionDescriptionInit) => {
        const entry = peers.get(from)
        if (!entry) return
        await entry.pc.setRemoteDescription(sdp)
        for (const c of entry.pendingIce.splice(0)) {
            try {
                await entry.pc.addIceCandidate(c)
            } catch {}
        }
    }

    const handleIce = async (from: string, candidate: RTCIceCandidateInit) => {
        const entry = peers.get(from)
        if (!entry) return
        if (!entry.pc.remoteDescription) {
            entry.pendingIce.push(candidate)
            return
        }
        try {
            await entry.pc.addIceCandidate(candidate)
        } catch {}
    }

    const handlePeerJoin = async (peerId: string) => {
        pendingViewers.add(peerId)
        // 已在共享 → 立即为新观众建连；否则等 startShare
        if (stream.value) await createPeer(peerId)
    }

    const handlePeerLeave = (peerId: string) => {
        pendingViewers.delete(peerId)
        closePeer(peerId)
    }

    signaling.onMessage(async (m) => {
        if (m.type === 'answer' && m.from) await handleAnswer(m.from, m.sdp)
        else if (m.type === 'ice' && m.from) await handleIce(m.from, m.candidate)
        else if (m.type === 'peer-join' && m.peerId) await handlePeerJoin(m.peerId)
        else if (m.type === 'peer-leave' && m.peerId) handlePeerLeave(m.peerId)
    })

    onBeforeUnmount(() => {
        void stopShare()
    })

    return {
        sharing,
        stream,
        trackEnded,
        error,
        sleepLocked,
        connectedCount,
        startShare,
        reShare,
        stopShare,
        setQuality,
        resetPeers,
    }
}
