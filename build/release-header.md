## 📦 安装

下载对应平台 / 架构的安装包：

| 系统 | 架构 | 文件 | 安装方式 |
|---|---|---|---|
| **macOS** | Apple Silicon | `*-arm64.dmg` | 拖进 Applications，首次打开见下方注意事项 |
| macOS | Intel | `*-x64.dmg` | 同上 |
| **Windows** | x64 / arm64 | `*-setup.exe` | 双击运行；SmartScreen 拦截 → 「更多信息」→「仍要运行」 |
| **Linux** | x64 / arm64 | `*.AppImage` | `chmod +x *.AppImage && ./*.AppImage` |
| Linux (Debian/Ubuntu) | x64 / arm64 | `*.deb` | `sudo dpkg -i *.deb` |

### macOS 首次打开

ad-hoc 签名的 app，macOS 15 / 26 起 Gatekeeper 会误报「已损坏」。终端跑一行清除隔离属性即可：

```bash
xattr -cr /Applications/desk-share-viewer.app
```

之后正常双击打开，不会再拦。

> ⚠️ 不要用「右键 → 打开」—— 新版 macOS 已经堵了这个老办法，会显示同样的「已损坏」对话框。

### 虚拟显示器仅 macOS 可用

虚拟显示器功能依赖 macOS SkyLight 私有 API，**Windows / Linux 上不显示该面板**。其他平台请直接选真实显示器或单个应用窗口共享。

---
