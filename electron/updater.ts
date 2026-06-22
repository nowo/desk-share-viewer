// 轻量更新检查：查 GitHub Release 最新版，跟当前版本比对
// 不做自动下载/安装（macOS ad-hoc 签名无法静默更新），只返回结果由 UI 提示跳转下载页
import { app } from 'electron'

const REPO = 'nowo/desk-share-viewer'
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`

export interface UpdateResult {
    hasUpdate: boolean
    currentVersion: string
    latestVersion?: string
    releaseUrl?: string
    notes?: string
    error?: string
}

// 解析 x.y.z（剥掉前缀 v），缺位补 0
const parseVer = (v: string): number[] => v.replace(/^v/i, '').split('.').map(n => Number.parseInt(n, 10) || 0)

const isNewer = (latest: string, current: string): boolean => {
    const a = parseVer(latest)
    const b = parseVer(current)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] || 0) - (b[i] || 0)
        if (diff !== 0) return diff > 0
    }
    return false
}

export async function checkForUpdate(): Promise<UpdateResult> {
    const currentVersion = app.getVersion()
    try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(LATEST_API, {
            signal: ctrl.signal,
            headers: {
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'desk-share-viewer',
            },
        })
        clearTimeout(timer)

        if (!res.ok) {
            return { hasUpdate: false, currentVersion, error: `GitHub API ${res.status}` }
        }
        const data = await res.json() as { tag_name?: string, html_url?: string, body?: string }
        const latestVersion = data.tag_name || ''
        if (!latestVersion) {
            return { hasUpdate: false, currentVersion, error: '未获取到版本号' }
        }
        return {
            hasUpdate: isNewer(latestVersion, currentVersion),
            currentVersion,
            latestVersion,
            releaseUrl: data.html_url || RELEASES_PAGE,
            notes: data.body || '',
        }
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? '检查更新超时' : (e?.message || '检查更新失败')
        return { hasUpdate: false, currentVersion, error: msg }
    }
}
