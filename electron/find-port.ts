// 端口探测：从首选端口起逐个试，返回第一个能绑定的端口
// 用于生产环境避开被占用的端口（信令 / 静态 server）
import { createServer } from 'node:net'

const canBind = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const srv = createServer()
        srv.once('error', () => resolve(false))
        srv.once('listening', () => srv.close(() => resolve(true)))
        srv.listen(port, '0.0.0.0')
    })

// 从 preferred 起最多试 maxTries 个端口；都被占就返回 preferred（由实际 server 的 error 兜底）
export async function findFreePort(preferred: number, maxTries = 20): Promise<number> {
    for (let port = preferred; port < preferred + maxTries; port++) {
        if (await canBind(port)) return port
    }
    return preferred
}
