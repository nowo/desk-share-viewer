# Changelog


## v0.1.5

[compare changes](https://github.com/nowo/desk-share-viewer/compare/v0.1.4...v0.1.5)

### 🚀 Enhancements

- **port:** 生产环境端口被占用时自动顺延，避免与用户已有服务冲突 ([4a9b8ff](https://github.com/nowo/desk-share-viewer/commit/4a9b8ff))
- **viewer:** 浏览器观众端隐藏主机入口并拦截 /host 路由 ([5ccd12d](https://github.com/nowo/desk-share-viewer/commit/5ccd12d))
- **host:** 一键复制二维码卡片，合成含房间号+网址的图片发给朋友 ([3ad8484](https://github.com/nowo/desk-share-viewer/commit/3ad8484))

### 🔥 Performance

- **router:** Host/Viewer 路由懒加载，观众端不再下载主机专用代码 ([dd9b053](https://github.com/nowo/desk-share-viewer/commit/dd9b053))

### 🩹 Fixes

- **zoom:** 主机本地预览放大时若共享中断自动退出放大模式 ([e1297b2](https://github.com/nowo/desk-share-viewer/commit/e1297b2))

### 📦 Build

- **dmg:** 内置「首次打开」助手脚本自动解除 Gatekeeper 隔离 ([f4a2888](https://github.com/nowo/desk-share-viewer/commit/f4a2888))

### ❤️ Contributors

- Nowo ([@nowo](https://github.com/nowo))

## v0.1.4

[compare changes](https://github.com/nowo/desk-share-viewer/compare/v0.1.3...v0.1.4)

### 🚀 Enhancements

- **zoom:** 本地预览与观众端放大查看，主机可控制观众是否允许放大 ([60c50e4](https://github.com/nowo/desk-share-viewer/commit/60c50e4))
- **update:** 轻量检查更新，查 GitHub Release 有新版提示跳转下载 ([6581241](https://github.com/nowo/desk-share-viewer/commit/6581241))

### 🏡 Chore

- **release:** Pnpm release 加 --no-github，避免和 CI 创建 release 重复 ([c9cfede](https://github.com/nowo/desk-share-viewer/commit/c9cfede))

### ❤️ Contributors

- Nowo ([@nowo](https://github.com/nowo))

## v0.1.3

[compare changes](https://github.com/nowo/desk-share-viewer/compare/v0.1.2...v0.1.3)

### 🩹 Fixes

- **build:** Windows ico 补齐 10 个尺寸 (16~256)，修复任务栏/资源管理器图标模糊 ([e94847f](https://github.com/nowo/desk-share-viewer/commit/e94847f))

### ❤️ Contributors

- Nowo ([@nowo](https://github.com/nowo))

## v0.1.2

[compare changes](https://github.com/nowo/desk-share-viewer/compare/v0.1.1...v0.1.2)

### 🚀 Enhancements

- **build:** Electron-builder 配置加 win/linux target + 图标素材 ([15d2be4](https://github.com/nowo/desk-share-viewer/commit/15d2be4))
- **electron:** 虚拟显示器加平台守卫，非 macOS 上 IPC 暴露 supported=false ([39d3c8d](https://github.com/nowo/desk-share-viewer/commit/39d3c8d))
- **ui:** 虚拟显示器面板按平台条件渲染，非 macOS 自动隐藏 ([d5573bd](https://github.com/nowo/desk-share-viewer/commit/d5573bd))

### 💅 Refactors

- Electron-builder 配置从 package.json 抽到 electron-builder.ts ([2600441](https://github.com/nowo/desk-share-viewer/commit/2600441))

### 📖 Documentation

- 修正首次打开说明 ([7d4ac2c](https://github.com/nowo/desk-share-viewer/commit/7d4ac2c))
- README + release-header 加 windows / linux 安装说明 ([85ae280](https://github.com/nowo/desk-share-viewer/commit/85ae280))

### 🏡 Chore

- **release:** 改用 changelogen 接管 release notes 和发版 ([69c63ea](https://github.com/nowo/desk-share-viewer/commit/69c63ea))
- 接入 eslint (Antfu config) 并按规则改造代码 ([1dbaf4a](https://github.com/nowo/desk-share-viewer/commit/1dbaf4a))

### 🤖 CI

- **release:** Release notes 顶部固定加上安装说明 ([9deeec6](https://github.com/nowo/desk-share-viewer/commit/9deeec6))
- **release:** Workflow 改 matrix 构建 mac / windows / linux ([d44e472](https://github.com/nowo/desk-share-viewer/commit/d44e472))

### ❤️ Contributors

- Nowo ([@nowo](https://github.com/nowo))

