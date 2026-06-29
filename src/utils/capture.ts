// 屏幕 / 窗口抓流：Electron / Chromium 老式 getUserMedia + chromeMediaSourceId 路径
// mandatory.maxWidth/maxHeight 不设的话 Chrome 默认只抓 720p，明确设到目标分辨率才能拿原画
export interface CaptureOpts {
    maxWidth: number
    maxHeight: number
    maxFrameRate: number
}

export const captureSource = (sourceId: string, opts: CaptureOpts): Promise<MediaStream> =>
    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxWidth: opts.maxWidth,
                maxHeight: opts.maxHeight,
                minWidth: Math.min(1280, opts.maxWidth),
                minHeight: Math.min(720, opts.maxHeight),
                maxFrameRate: opts.maxFrameRate,
            },
        } as any,
    })
