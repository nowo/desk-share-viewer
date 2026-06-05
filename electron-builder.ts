// electron-builder 配置，从 package.json 抽出来便于扩展（跨端时会更长）
// 改这里不用动 package.json，electron-builder 自动识别 .ts / .js / .yml 同名配置
import type { Configuration } from 'electron-builder'

const LANGS = ['en', 'zh-Hans', 'zh-CN'] as const

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

    extraResources: [
        // macOS 虚拟显示器 sidecar
        { from: 'sidecars/desk-display/.build/release/desk-display', to: 'desk-display' },
        // macOS App Bundle 本地化字符串
        ...LANGS.map(lang => ({
            from: `build/${lang}.lproj/InfoPlist.strings`,
            to: `${lang}.lproj/InfoPlist.strings`,
        })),
    ],

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
        window: { width: 540, height: 380 },
        contents: [
            { x: 140, y: 200, type: 'file' },
            { x: 400, y: 200, type: 'link', path: '/Applications' },
        ],
    },
}

export default config
