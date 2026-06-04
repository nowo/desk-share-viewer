// 静态文件 server：production 模式下给 LAN 观众提供 viewer URL
// dev 模式不启（Vite 已经占着 1420 了）
import { createServer, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.eot':  'application/vnd.ms-fontobject',
    '.ico':  'image/x-icon',
}

export function startStaticServer(rootDir: string, port: number): Server {
    const server = createServer(async (req, res) => {
        try {
            const reqPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0])
            // 默认 index
            const safe = reqPath === '/' ? '/index.html' : reqPath
            const filePath = path.join(rootDir, safe)
            // 防 path traversal
            if (!filePath.startsWith(rootDir)) {
                res.writeHead(403); res.end('forbidden'); return
            }
            try {
                const st = await stat(filePath)
                if (st.isFile()) {
                    const ext = path.extname(filePath).toLowerCase()
                    res.writeHead(200, {
                        'Content-Type': MIME[ext] || 'application/octet-stream',
                        'Cache-Control': 'no-cache',
                    })
                    res.end(await readFile(filePath))
                    return
                }
            } catch { /* fallthrough to SPA index */ }
            // SPA 兜底
            const indexPath = path.join(rootDir, 'index.html')
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(await readFile(indexPath))
        } catch (e) {
            res.writeHead(500); res.end(String(e))
        }
    })
    server.listen(port, '0.0.0.0', () => {
        console.log(`[static] serving ${rootDir} on 0.0.0.0:${port}`)
    })
    return server
}
