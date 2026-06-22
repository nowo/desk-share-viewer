import type { Server as HttpServer } from 'node:http'
import type { WebSocketServer } from 'ws'
import type { DisplayInfo, OpenOpts } from './virtual-display'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import process from 'node:process'
// Electron 主进程入口
// - 启动 Vite dev 加载的页面（或打包后的本地文件）
// - 启 WebSocket 信令服务
// - 暴露 IPC 给 renderer：get-lan-ip / virtual display / sleep-lock / open-in-browser / get-display-sources
import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, screen, shell } from 'electron'
import { startSignaling } from './signaling'
import { allowSleep, preventSleep } from './sleep-lock'
import { startStaticServer } from './static-server'
import { checkForUpdate } from './updater'
import {
    closeVirtualDisplay,
    isVirtualDisplaySupported,
    killAll as killVirtualDisplay,
    openVirtualDisplay,
    virtualDisplayStatus,
} from './virtual-display'

const SIGNAL_PORT = 51234
const HTTP_PORT = 1420 // 跟 dev 模式 Vite 一致，dev/prod 观众 URL 统一

let mainWindow: BrowserWindow | null = null
let wss: WebSocketServer | null = null
let staticServer: HttpServer | null = null

const isDev = !app.isPackaged

function getLanIp(): string | null {
    const ifaces = networkInterfaces()
    for (const name of Object.keys(ifaces)) {
        for (const ni of ifaces[name] ?? []) {
            if (ni.family === 'IPv4' && !ni.internal) {
                return ni.address
            }
        }
    }
    return null
}

function registerIpc() {
    ipcMain.handle('get-lan-ip', () => getLanIp())
    ipcMain.handle('signal-port', () => SIGNAL_PORT)
    ipcMain.handle('prevent-sleep', () => preventSleep())
    ipcMain.handle('allow-sleep', () => {
        allowSleep()
    })
    ipcMain.handle('open-in-browser', async (_e, url: string) => {
        await shell.openExternal(url)
    })
    ipcMain.handle('update:check', () => checkForUpdate())

    ipcMain.handle('virtual-display:supported', () => isVirtualDisplaySupported())
    ipcMain.handle('virtual-display:open', async (_e, opts: OpenOpts): Promise<DisplayInfo> => {
        return openVirtualDisplay(opts || {})
    })
    ipcMain.handle('virtual-display:close', async () => {
        await closeVirtualDisplay()
    })
    ipcMain.handle('virtual-display:status', () => virtualDisplayStatus())

    // 屏幕选择器：列出所有屏幕 + 窗口（含虚拟屏）— 关键！
    ipcMain.handle('get-display-sources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true,
        })
        // 同时返回屏幕元信息，便于 UI 区分主屏 / 虚拟屏
        const displays = screen.getAllDisplays().map(d => ({
            id: d.id,
            label: d.label,
            bounds: d.bounds,
            internal: d.internal,
        }))
        return {
            sources: sources.map(s => ({
                id: s.id,
                name: s.name,
                display_id: (s as any).display_id ?? '',
                thumbnail: s.thumbnail.toDataURL(),
                appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
            })),
            displays,
        }
    })
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
        mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

// macOS 菜单栏 app 名 + Quit / About / Hide 等也本地化
function buildAppMenu() {
    if (process.platform !== 'darwin') return
    const isZh = app.getLocale().startsWith('zh')
    const appName = isZh ? '桌面共享' : 'desk share viewer'
    const tr = isZh
        ? { about: '关于', hide: '隐藏', hideOthers: '隐藏其他', showAll: '全部显示', quit: '退出', services: '服务', preferences: '偏好设置', checkUpdate: '检查更新…' }
        : { about: 'About', hide: 'Hide', hideOthers: 'Hide Others', showAll: 'Show All', quit: 'Quit', services: 'Services', preferences: 'Preferences', checkUpdate: 'Check for Updates…' }

    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: appName,
            submenu: [
                { label: `${tr.about} ${appName}`, role: 'about' },
                { type: 'separator' },
                { label: tr.checkUpdate, click: () => mainWindow?.webContents.send('update:menu-check') },
                { type: 'separator' },
                { label: tr.services, role: 'services', submenu: [] },
                { type: 'separator' },
                { label: `${tr.hide} ${appName}`, accelerator: 'Command+H', role: 'hide' },
                { label: tr.hideOthers, accelerator: 'Command+Alt+H', role: 'hideOthers' },
                { label: tr.showAll, role: 'unhide' },
                { type: 'separator' },
                { label: `${tr.quit} ${appName}`, accelerator: 'Command+Q', role: 'quit' },
            ],
        },
        {
            label: isZh ? '编辑' : 'Edit',
            submenu: [
                { label: isZh ? '撤销' : 'Undo', accelerator: 'Command+Z', role: 'undo' },
                { label: isZh ? '重做' : 'Redo', accelerator: 'Shift+Command+Z', role: 'redo' },
                { type: 'separator' },
                { label: isZh ? '剪切' : 'Cut', accelerator: 'Command+X', role: 'cut' },
                { label: isZh ? '复制' : 'Copy', accelerator: 'Command+C', role: 'copy' },
                { label: isZh ? '粘贴' : 'Paste', accelerator: 'Command+V', role: 'paste' },
                { label: isZh ? '全选' : 'Select All', accelerator: 'Command+A', role: 'selectAll' },
            ],
        },
        {
            label: isZh ? '视图' : 'View',
            submenu: [
                { label: isZh ? '重新载入' : 'Reload', accelerator: 'Command+R', role: 'reload' },
                { label: isZh ? '开发者工具' : 'Toggle Developer Tools', accelerator: 'Alt+Command+I', role: 'toggleDevTools' },
                { type: 'separator' },
                { label: isZh ? '进入全屏' : 'Toggle Full Screen', accelerator: 'Ctrl+Command+F', role: 'togglefullscreen' },
            ],
        },
        {
            label: isZh ? '窗口' : 'Window',
            submenu: [
                { label: isZh ? '最小化' : 'Minimize', accelerator: 'Command+M', role: 'minimize' },
                { label: isZh ? '关闭' : 'Close', accelerator: 'Command+W', role: 'close' },
            ],
        },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
    buildAppMenu()
    registerIpc()
    wss = startSignaling(SIGNAL_PORT)
    console.warn(`[signaling] listening on 0.0.0.0:${SIGNAL_PORT}/signal`)

    // production：起静态 server 让 LAN 浏览器能访问 viewer URL
    // dev：Vite 已经在 1420 监听了，不重复起
    if (!isDev) {
        const distDir = path.join(__dirname, '../dist')
        staticServer = startStaticServer(distDir, HTTP_PORT)
    }

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    killVirtualDisplay()
    allowSleep()
    try {
        wss?.close()
    } catch {}
    try {
        staticServer?.close()
    } catch {}
})
