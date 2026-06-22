// electron-builder 配置，从 package.json 抽出来便于扩展（跨端时会更长）
// 改这里不用动 package.json，electron-builder 自动识别 .ts / .js / .yml 同名配置
import type { Configuration } from 'electron-builder'
import process from 'node:process'

const LANGS = ['en', 'zh-Hans', 'zh-CN'] as const

const isMac = process.platform === 'darwin'

// 虚拟显示器 sidecar + macOS App Bundle lproj 都只在 macOS 打包时打进 app
// 其他平台 extraResources 留空
const macExtraResources = [
    { from: 'sidecars/desk-display/.build/release/desk-display', to: 'desk-display' },
    ...LANGS.map(lang => ({
        from: `build/${lang}.lproj/InfoPlist.strings`,
        to: `${lang}.lproj/InfoPlist.strings`,
    })),
]

const config: Configuration = {
    appId: 'io.github.nowo.desk-share-viewer',
    productName: 'desk-share-viewer',

    directories: {
        output: 'release',
    },

    files: [
        'dist-electron/**/*',
        'dist/**/*',
    ],

    extraResources: isMac ? macExtraResources : [],

    mac: {
        category: 'public.app-category.utilities',
        icon: 'build/icon.icns',
        identity: null, // ad-hoc 签名，跳过 Apple Developer
        target: [
            { target: 'dmg', arch: ['arm64', 'x64'] },
        ],
        extendInfo: {
            CFBundleDevelopmentRegion: 'en',
            CFBundleLocalizations: LANGS,
            NSCameraUsageDescription: 'desk 需要请求媒体捕获能力以启用屏幕共享',
            NSMicrophoneUsageDescription: 'desk 需要音频共享能力',
            NSScreenCaptureUsageDescription: 'desk 需要屏幕捕获权限以共享屏幕',
        },
    },

    dmg: {
        artifactName: '${productName}-${version}-${arch}.dmg',
        title: '${productName} ${version} ${arch}', // 加 arch 避免双架构串行打包撞 /Volumes mount 点
        icon: 'build/icon.icns',
        background: 'build/dmg-background.png',
        window: { width: 540, height: 460 },
        contents: [
            { x: 140, y: 210, type: 'file' },
            { x: 400, y: 210, type: 'link', path: '/Applications' },
            // 解除隔离的小助手：ad-hoc 签名下新版 macOS 会误报「已损坏」，双击它自动 xattr -cr
            { x: 270, y: 360, type: 'file', path: 'build/首次打开.command' },
        ],
    },

    win: {
        icon: 'build/icon.ico',
        target: [
            { target: 'nsis', arch: ['x64', 'arm64'] },
        ],
    },

    nsis: {
        artifactName: '${productName}-${version}-${arch}-setup.${ext}',
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
    },

    linux: {
        icon: 'build/icon.png',
        category: 'Utility',
        target: [
            { target: 'AppImage', arch: ['x64', 'arm64'] },
            { target: 'deb', arch: ['x64', 'arm64'] },
        ],
    },
}

export default config
