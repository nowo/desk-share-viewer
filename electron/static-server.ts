import type { Server, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
// 静态文件 server：production 模式下给 LAN 观众提供 viewer URL
// dev 模式不启（Vite 已经占着 1420 了）
import { createServer } from 'node:http'
import path from 'node:path'

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.ico': 'image/x-icon',
}

export function startStaticServer(rootDir: string, port: number, signalPort: number): Server {
    // index.html 注入真实信令端口，观众端浏览器据此连信令（端口可能因占用被顺延）
    const injectSignalPort = (html: string): string =>
        html.replace('</head>', `<script>window.__DESK_SIGNAL_PORT__=${signalPort}</script></head>`)

    const serveIndex = async (res: ServerResponse) => {
        const indexPath = path.join(rootDir, 'index.html')
        const html = injectSignalPort(await readFile(indexPath, 'utf-8'))
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
        res.end(html)
    }

    const server = createServer(async (req, res) => {
        try {
            const reqPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0])
            if (reqPath === '/') {
                await serveIndex(res)
                return
            }
            const filePath = path.join(rootDir, reqPath)
            // 防 path traversal：必须严格落在 rootDir 目录内（带分隔符避免 /dist 命中 /dist-evil）
            if (!filePath.startsWith(rootDir + path.sep)) {
                res.writeHead(403)
                res.end('forbidden')
                return
            }
            try {
                const st = await stat(filePath)
                if (st.isFile()) {
                    const ext = path.extname(filePath).toLowerCase()
                    // index.html 也要注入端口
                    if (ext === '.html') {
                        await serveIndex(res)
                        return
                    }
                    res.writeHead(200, {
                        'Content-Type': MIME[ext] || 'application/octet-stream',
                        'Cache-Control': 'no-cache',
                    })
                    res.end(await readFile(filePath))
                    return
                }
            } catch { /* fallthrough to SPA index */ }
            // SPA 兜底
            await serveIndex(res)
        } catch (e) {
            res.writeHead(500)
            res.end(String(e))
        }
    })
    server.on('error', (e) => {
        console.error(`[static] listen error on ${port}:`, e)
    })
    server.listen(port, '0.0.0.0', () => {
        console.warn(`[static] serving ${rootDir} on 0.0.0.0:${port}`)
    })
    return server
}
