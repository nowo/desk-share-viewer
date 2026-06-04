// desk-display sidecar 生命周期：spawn + 解析首行 JSON + 通过 stdin "quit\n" 优雅关闭
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'

export interface DisplayInfo {
    display_id: number
    width: number
    height: number
    name: string
}

export interface OpenOpts {
    width?: number
    height?: number
    hz?: number
    name?: string
}

let child: ChildProcess | null = null

function sidecarPath(): string {
    // dev：从源码 sidecar 输出取
    if (!app.isPackaged) {
        return path.resolve(process.cwd(), 'sidecars/desk-display/.build/release/desk-display')
    }
    // packaged：放到 resources 里
    return path.join(process.resourcesPath, 'desk-display')
}

export async function openVirtualDisplay(opts: OpenOpts = {}): Promise<DisplayInfo> {
    if (child) await closeVirtualDisplay()

    const args: string[] = []
    if (opts.width)  { args.push('--width',  String(opts.width)) }
    if (opts.height) { args.push('--height', String(opts.height)) }
    if (opts.hz)     { args.push('--hz',     String(opts.hz)) }
    if (opts.name)   { args.push('--name',   opts.name) }

    return new Promise<DisplayInfo>((resolve, reject) => {
        const proc = spawn(sidecarPath(), args, { stdio: ['pipe', 'pipe', 'pipe'] })
        let stdoutBuf = ''
        let settled = false

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true
                proc.kill('SIGTERM')
                reject(new Error('sidecar timed out (5s)'))
            }
        }, 5000)

        proc.stdout!.on('data', (data: Buffer) => {
            if (settled) return
            stdoutBuf += data.toString()
            const newlineIdx = stdoutBuf.indexOf('\n')
            if (newlineIdx === -1) return
            const line = stdoutBuf.slice(0, newlineIdx).trim()
            try {
                const info = JSON.parse(line) as DisplayInfo
                settled = true
                clearTimeout(timer)
                child = proc
                resolve(info)
            } catch (e) {
                settled = true
                clearTimeout(timer)
                proc.kill('SIGTERM')
                reject(new Error(`parse stdout '${line}': ${e}`))
            }
        })

        proc.stderr!.on('data', (data: Buffer) => {
            process.stderr.write(`[desk-display] ${data}`)
        })

        proc.on('error', (e) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reject(e)
        })

        proc.on('exit', (code) => {
            if (child === proc) child = null
            if (!settled) {
                settled = true
                clearTimeout(timer)
                reject(new Error(`sidecar exited early with code ${code}`))
            }
        })
    })
}

export async function closeVirtualDisplay(): Promise<void> {
    if (!child) return
    const proc = child
    return new Promise((resolve) => {
        proc.once('exit', () => { child = null; resolve() })
        try { proc.stdin?.write('quit\n') } catch {}
        // 兜底：3 秒后强杀
        setTimeout(() => { try { proc.kill('SIGTERM') } catch {} }, 3000)
    })
}

export function virtualDisplayStatus(): boolean {
    return child !== null
}

export function killAll() {
    if (child) { try { child.kill('SIGTERM') } catch {}; child = null }
}
