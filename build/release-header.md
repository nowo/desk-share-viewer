## 📦 安装

下载对应架构的 DMG，把 app 拖进 Applications。

| Mac 类型 | 文件 |
|---|---|
| M 系列（M1/M2/M3/M4） | `desk-share-viewer-<ver>-arm64.dmg` |
| Intel | `desk-share-viewer-<ver>-x64.dmg` |

**首次打开前，终端跑一行清除隔离属性**（macOS 15/26 起 Gatekeeper 会对 ad-hoc 签名的 app 误报「已损坏」）：

```bash
xattr -cr /Applications/desk-share-viewer.app
```

之后正常双击打开，不会再拦。

---
