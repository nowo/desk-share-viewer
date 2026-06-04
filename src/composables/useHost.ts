// 主机端：抓屏 + WebRTC + replaceTrack + ICE restart + Mac 防休眠
import { onBeforeUnmount, ref } from 'vue'
import { allowSleep, preventSleep } from '~/utils/bridge'
import type { Signaling } from './useSignaling'

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
]

// 画质预设 —— LAN 直连建议 high，跨网络可降到 medium
export interface QualityPreset {
    maxWidth: number
    maxHeight: number
    maxFrameRate: number
    maxBitrate: number // bps
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
    low:    { maxWidth: 1280, maxHeight: 720,  maxFrameRate: 30, maxBitrate:  1_500_000 },
    medium: { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30, maxBitrate:  3_000_000 },
    high:   { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30, maxBitrate:  8_000_000 },
    ultra:  { maxWidth: 2560, maxHeight: 1440, maxFrameRate: 30, maxBitrate: 12_000_000 },
    '4k':   { maxWidth: 3840, maxHeight: 2160, maxFrameRate: 30, maxBitrate: 20_000_000 },
}

// 当前用的预设 —— UI 可改
let currentPreset: QualityPreset = QUALITY_PRESETS.high!

export const useHost = (signaling: Signaling) => {
    const sharing = ref(false)
    const stream = ref<MediaStream | null>(null)
    const connectionState = ref<RTCPeerConnectionState>('new')
    const iceState = ref<RTCIceConnectionState>('new')
    const trackEnded = ref(false)
    const error = ref<string | null>(null)
    const sleepLocked = ref(false)

    let pc: RTCPeerConnection | null = null
    let videoSender: RTCRtpSender | null = null
    const pendingIce: RTCIceCandidateInit[] = []

    const createPC = () => {
        if (pc) return pc
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        conn.onicecandidate = (e) => {
            if (e.candidate) signaling.send({ type: 'ice', candidate: e.candidate.toJSON() })
        }
        conn.onconnectionstatechange = () => (connectionState.value = conn.connectionState)
        conn.oniceconnectionstatechange = () => {
            iceState.value = conn.iceConnectionState
            if (conn.iceConnectionState === 'failed') {
                try { conn.restartIce() } catch {}
            }
        }
        pc = conn
        return conn
    }

    const sendOffer = async (iceRestart = false) => {
        if (!pc) return
        const offer = await pc.createOffer({ iceRestart })
        await pc.setLocalDescription(offer)
        signaling.send({ type: 'offer', sdp: offer })
    }

    // 把当前 preset 的 maxBitrate 写到 RTCRtpSender —— 让 WebRTC encoder 拉满
    const applyBitrate = async () => {
        if (!videoSender) return
        try {
            const params = videoSender.getParameters()
            if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}]
            }
            params.encodings[0]!.maxBitrate = currentPreset.maxBitrate
            params.encodings[0]!.priority = 'high'
            // 降级时优先丢帧不丢分辨率
            params.degradationPreference = 'maintain-resolution'
            await videoSender.setParameters(params)
        } catch (e) {
            console.warn('setParameters failed:', e)
        }
    }

    const setQuality = async (presetName: keyof typeof QUALITY_PRESETS) => {
        const preset = QUALITY_PRESETS[presetName]
        if (preset) {
            currentPreset = preset
            await applyBitrate()
        }
    }

    const attachTrack = async (newStream: MediaStream) => {
        const conn = createPC()
        const newVideo = newStream.getVideoTracks()[0]!
        const newAudio = newStream.getAudioTracks()[0]

        if (!videoSender) {
            videoSender = conn.addTrack(newVideo, newStream)
            if (newAudio) conn.addTrack(newAudio, newStream)
        } else {
            await videoSender.replaceTrack(newVideo)
            const audioSender = conn.getSenders().find(s => s.track?.kind === 'audio')
            if (audioSender && newAudio) await audioSender.replaceTrack(newAudio)
        }

        newVideo.onended = () => {
            trackEnded.value = true
        }
    }

    const startShare = async (sourceId?: string) => {
        error.value = null
        trackEnded.value = false
        try {
            if (!sourceId) {
                throw new Error('未选择共享源')
            }
            // Electron / Chromium 的老式 getUserMedia + chromeMediaSourceId 路径，
            // mandatory.maxWidth/maxHeight 不设的话 Chrome 默认抓 720p；明确设到 1080p 才能拿原画
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        maxWidth: currentPreset.maxWidth,
                        maxHeight: currentPreset.maxHeight,
                        minWidth: Math.min(1280, currentPreset.maxWidth),
                        minHeight: Math.min(720, currentPreset.maxHeight),
                        maxFrameRate: currentPreset.maxFrameRate,
                    },
                } as any,
            })
            stream.value = newStream
            await attachTrack(newStream)
            await applyBitrate()
            if (pc && pc.signalingState === 'stable' && !pc.remoteDescription) {
                await sendOffer()
            }
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
            // Electron / Chromium 的老式 getUserMedia + chromeMediaSourceId 路径，
            // mandatory.maxWidth/maxHeight 不设的话 Chrome 默认抓 720p；明确设到 1080p 才能拿原画
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        maxWidth: currentPreset.maxWidth,
                        maxHeight: currentPreset.maxHeight,
                        minWidth: Math.min(1280, currentPreset.maxWidth),
                        minHeight: Math.min(720, currentPreset.maxHeight),
                        maxFrameRate: currentPreset.maxFrameRate,
                    },
                } as any,
            })
            stream.value?.getTracks().forEach(t => t.stop())
            stream.value = newStream
            await attachTrack(newStream)
            await applyBitrate()
            trackEnded.value = false
            await sendOffer(true)
        } catch (e: any) {
            error.value = e?.message || '抓屏失败'
        }
    }

    const stopShare = async () => {
        sharing.value = false
        stream.value?.getTracks().forEach(t => t.stop())
        stream.value = null
        videoSender = null
        pc?.close()
        pc = null
        connectionState.value = 'closed'
        iceState.value = 'closed'
        await allowSleep()
        sleepLocked.value = false
    }

    const handleAnswer = async (sdp: RTCSessionDescriptionInit) => {
        if (!pc) return
        await pc.setRemoteDescription(sdp)
        for (const c of pendingIce.splice(0)) {
            try { await pc.addIceCandidate(c) } catch {}
        }
    }

    const handleIce = async (candidate: RTCIceCandidateInit) => {
        if (!pc || !pc.remoteDescription) {
            pendingIce.push(candidate)
            return
        }
        try { await pc.addIceCandidate(candidate) } catch {}
    }

    const handlePeerJoin = async () => {
        if (!pc || !sharing.value) return
        await sendOffer(true)
    }

    signaling.onMessage(async (m) => {
        if (m.type === 'answer') await handleAnswer(m.sdp)
        else if (m.type === 'ice') await handleIce(m.candidate)
        else if (m.type === 'peer-join') await handlePeerJoin()
    })

    onBeforeUnmount(() => {
        void stopShare()
    })

    return {
        sharing, stream, connectionState, iceState, trackEnded, error, sleepLocked,
        startShare, reShare, stopShare, setQuality,
    }
}
