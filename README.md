# desk-share-viewer

![license](https://img.shields.io/badge/license-MIT-blue.svg)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)
![electron](https://img.shields.io/badge/electron-33-47848F.svg)

桌面屏幕共享 + macOS 虚拟显示器一体工具。主机端跑桌面应用，观众端用浏览器看，全程 LAN 内 P2P 推流，开箱即用，无需登录、无需后端、无需第三方信令服务。

## 💡 为什么写这个？

平时主力机是工作电脑，桌上还闲置着一台一体机想利用起来当辅助屏 —— 但这台一体机**没有 HDMI 输入接口**，没法当外接显示器接进主力机。

后来摸索出一套现成组合方案：

| 组件 | 项目 | 作用 |
|---|---|---|
| 虚拟显示器 | [DeskPad](https://github.com/Stengo/DeskPad) | 在 macOS 创建一块虚拟屏，可以把窗口拖进去 |
| 屏幕推流 | [Deskreen](https://github.com/pavlobu/deskreen) | 把这块虚拟屏通过 LAN 推到一体机浏览器里显示 |

基本能用，但持续用下来碰到一个挺打断节奏的问题：

> **去吃饭、中午休息会将主力机锁屏，一段时间后再回来用，Deskreen 经常需要重新连接** —— 每次都得手动跑去一体机点浏览器、刷新页面、重开 URL，体感很碎。

于是写了 desk-share-viewer，把这两件事**合在一个桌面 app 里**，同时把"自动恢复"做厚一点：

- 🧩 虚拟显示器走 SkyLight 私有 API（DeskPad 同款机制）
- 📡 LAN P2P 推流走 WebRTC（Deskreen 同款思路，独立实现）
- 🔢 **房间号可固定**（六位数字，本地持久化）—— 一体机浏览器存个书签反复用，URL 一直不变
- 🔁 **信令断线自动指数退避重连 + WebRTC ICE restart** —— 主力机睡醒后大概率能自愈，不用手动重连
- 🟡 **锁屏期间观众端有明确反馈** —— 主力机锁屏 / 熄屏时观众端不再是莫名定格，而是浮出「画面已暂停，恢复后自动继续」，解锁后画面自动接回

## ✨ 特性

- 🖥️ **macOS 虚拟显示器** *(仅 macOS)* —— 通过 SkyLight 私有 API 创建一块隐藏显示器，把要演示的窗口拖进去，避免桌面通知 / 微信弹窗泄露
- 📡 **WebRTC P2P 推流** —— 端到端直传，画质码率可调（720p / 1080p / 1440p / 4K）
- 🌐 **内置 LAN 信令 + 静态 server** —— 主机起来后，同 WiFi 任意设备浏览器输 URL 就能加入
- 🔢 **6 位数字房间号 + QR 码** —— 手机扫一扫即入
- 🔁 **断线自恢复 + 状态反馈** —— WebSocket 指数退避重连 + ICE restart + replaceTrack 换屏不掉房间；观众端能识别主机**锁屏 / 熄屏**（提示「画面已暂停，恢复后自动继续」）与**主机离开**（提示「等待重连」），不再是无声定格
- 💤 **共享期防休眠** —— Electron powerSaveBlocker
- 🌏 **中英文** —— 菜单栏跟随系统语言切换
- 🪟 **跨端主机** —— macOS / Windows / Linux 都能跑（虚拟显示器仅 macOS）

## 📸 截图

> TODO：补 host 页 / viewer 页 / DMG 安装窗口截图 + 一张演示 GIF

## 📦 下载安装

去 [Releases](https://github.com/nowo/desk-share-viewer/releases) 页面拿对应平台 / 架构的包：

| 系统 | 架构 | 文件 |
|---|---|---|
| **macOS** | Apple Silicon | `desk-share-viewer-<version>-arm64.dmg` |
| macOS | Intel | `desk-share-viewer-<version>-x64.dmg` |
| **Windows** | x64 / arm64 | `desk-share-viewer-<version>-<arch>-setup.exe` |
| **Linux** | x64 / arm64 | `desk-share-viewer-<version>.AppImage` |
| Linux (Debian/Ubuntu) | x64 / arm64 | `desk-share-viewer-<version>_<arch>.deb` |

Mac 不确定芯片：苹果菜单「关于本机 → 芯片」一行能看到。

### 首次打开

**macOS** —— app 是 ad-hoc 签名（没花 $99 走 Apple Developer），从浏览器下载后 macOS Gatekeeper 会拦，**双击会报「已损坏」**。终端跑一行清除隔离属性即可：

```bash
xattr -cr /Applications/desk-share-viewer.app
```

之后正常双击打开，再不会拦。

> ⚠️ 不要走「右键 → 打开」—— macOS 15/26 起这个老办法已经失效，会显示同样的「已损坏」对话框。

**Windows** —— 双击 `*-setup.exe` 安装，SmartScreen 会拦截：「更多信息」→「仍要运行」放行（未做 EV 代码签名）。

**Linux** —— AppImage 加可执行权限即可运行：

```bash
chmod +x desk-share-viewer-*.AppImage
./desk-share-viewer-*.AppImage
```

或者用 `.deb`：`sudo dpkg -i desk-share-viewer-*.deb`

## 🚀 使用流程

### 主机端

1. 启动 desk-share-viewer
2. *(macOS only)* 点「打开虚拟屏」→ 系统设置里能看到「desk virtual display」→ 把要演示的 app 窗口拖进虚拟屏
3. 点「开始共享屏幕」→ 自定义 picker 弹出：
   - macOS：选「desk virtual display」（带「虚拟屏」橙色标签）或任一真实显示器 / 窗口
   - Windows / Linux：选任一真实显示器 / 窗口
4. 显示 6 位房间号 + QR 码

### 观众端

任何浏览器（同 WiFi）扫 QR 或访问：

```
http://<主机IP>:1420/#/<6位房间号>
```

例：`http://192.168.1.5:1420/#/061397`

自动连信令 + WebRTC 协商 → 看到主机虚拟屏的画面。

### 画质档位

| 档位 | 分辨率 | 码率 | 适用 |
|---|---|---|---|
| 低 | 720p | 1.5 Mbps | 弱网 |
| 中 | 1080p | 3 Mbps | 一般家庭 WiFi |
| **高（默认）** | 1080p | 8 Mbps | LAN 直连 |
| 极致 | 1440p | 12 Mbps | 大屏共享 |
| 4K | 2160p | 20 Mbps | Retina 5K 主屏 |

可实时切换，不掉房间。

## ⚠️ 重要警告

**本项目使用 macOS 私有 API**（SkyLight.framework 的 `SLVirtualDisplay*`）：

- ⚠️ Apple **随时可能在 macOS 升级中删掉**这些 API，届时虚拟显示器功能将失效
- ⚠️ 不能上 Mac App Store（私有 API 会被审核拒绝）
- ⚠️ Apple 不保证这些 API 的稳定性 / 安全性
- ⚠️ 实测兼容范围：macOS 12 ~ 15.5（Sequoia）
- ✅ 仅做屏幕共享 / 不操作其他系统资源，不会损害你的 Mac

如果不愿承担风险，可以选用社区维护的等价工具：[DeskPad](https://github.com/Stengo/DeskPad)（仅虚拟屏）+ [Deskreen](https://github.com/pavlobu/deskreen)（仅推流）。

## 🛠️ 开发

### 前置

- macOS 12+ / Windows 10+ / 主流 Linux 发行版
- Node.js 20+ + pnpm 10+
- *(仅 macOS 上需要)* Xcode Command Line Tools（编 ObjC sidecar 用）：`xcode-select --install`

### 启动 dev

```bash
git clone https://github.com/nowo/desk-share-viewer.git
cd desk-share-viewer
pnpm install
pnpm dev
```

第一次共享屏幕时 macOS 弹一次 Screen Recording 权限请求 → 允许。

### 打包 DMG

```bash
pnpm build
```

产出在 `release/` 目录，按当前运行平台决定打什么包：
- macOS → `*-arm64.dmg` + `*-x64.dmg`
- Windows → `*-arm64-setup.exe` + `*-x64-setup.exe`
- Linux → `*.AppImage` + `*.deb`

跨平台发版由 GitHub Actions matrix 三平台并行打包统一上传到 Release，本地一般只编当前平台。

### 项目结构

```
desk-share-viewer/
├── build/                       icon + DMG 背景 + 多语言 lproj
├── electron/                    Electron 主进程
│   ├── main.ts                  入口 + IPC handlers + 菜单
│   ├── preload.ts               contextBridge 暴露 window.desk.*
│   ├── signaling.ts             Node ws 信令服务（LAN 0.0.0.0:51234）
│   ├── virtual-display.ts       spawn sidecar 管生命周期
│   ├── sleep-lock.ts            powerSaveBlocker 防休眠
│   └── static-server.ts         http 静态 server（LAN 0.0.0.0:1420）
├── sidecars/desk-display/       macOS 虚拟显示器 sidecar
│   ├── src/SkyLightPrivate.h    私有 ObjC 类声明
│   ├── src/main.m               主逻辑
│   └── build.sh                 clang 编译
├── src/                         Vue 前端
│   ├── components/SourcePicker.vue
│   ├── composables/{useHost,useViewer,useSignaling,useVirtualDisplay}.ts
│   ├── pages/{Home,Host,Viewer}.vue
│   ├── utils/{ids,bridge}.ts
│   └── App.vue / main.ts / router.ts
└── package.json                 含 electron-builder 配置
```

### 技术栈

- **Electron 33** + **Vue 3** + **Vite 6** + **UnoCSS**（含 MDI 图标）
- **Node `ws`** 信令服务 + **Node http** 静态 server
- **Objective-C CLI sidecar** —— 调 SkyLight 私有 API

runtime deps 只有 4 个：`vue` / `vue-router` / `qrcode` / `ws`。包体 ~100MB（Electron 占大头）。

## 🤝 致谢

- [DeskPad](https://github.com/Stengo/DeskPad) by Stengo —— 虚拟显示器调 SkyLight 私有 API 的接法是从这学的（MIT）
- [Deskreen](https://github.com/pavlobu/deskreen) by pavlobu —— 房间号 + WebRTC LAN 推流的设计灵感（AGPL）
- [iconify-mdi](https://icon-sets.iconify.design/mdi/) —— 图标
- Electron / Vue / WebRTC / UnoCSS 生态

## 📄 许可

[MIT](./LICENSE) © 2026 nowo

----

> 这是一个个人项目，bug / 建议 欢迎到 [Issues](https://github.com/nowo/desk-share-viewer/issues) 反馈，但响应不一定及时。
