# desk-display

macOS 虚拟显示器 CLI sidecar —— 调 SkyLight.framework 的私有 ObjC 类创建一块虚拟显示器，进程存活期间显示器存在，进程退出自动清理。

**Phase 1 状态：✅ 已通过手动验证（macOS 15.5 / Sequoia / arm64）**

## 构建

```bash
./build.sh --single    # 当前架构调试
./build.sh             # 通用二进制（arm64 + x86_64 via lipo）
```

产物：`.build/release/desk-display`

## 用法

```bash
./.build/release/desk-display [--width N] [--height N] [--hz N] [--name STR]
```

- **stdout**：单行 JSON `{"display_id":N,"width":W,"height":H,"name":"..."}`
- **stderr**：进度日志，前缀 `[desk-display]`
- **终止方式**：`Ctrl+C` / `SIGTERM` / `SIGHUP` / stdin 关闭 / stdin 输入 `quit\n`

例：

```bash
./.build/release/desk-display --width 2560 --height 1440 --hz 60 --name "demo screen"
```

## 实现要点（踩过的坑）

### 1. macOS 15 起 API 换了地方

| macOS 11~14 | macOS 15+ |
|---|---|
| `CoreGraphics.framework` | `SkyLight.framework`（在 `PrivateFrameworks`）|
| `CGVirtualDisplayCreate(descriptor)` C 函数 | `[[SLVirtualDisplay alloc] initWithConfiguration:error:]` ObjC 类 |
| 一个 `CGVirtualDisplayDescriptor` 配置全部 | 拆三层：`Configuration` → `Mode` → `Settings` |
| `terminationHandler` block | `[display destroy]` 实例方法 |

如果按老的 `CGVirtualDisplay*` 写，在新版 macOS 上 **段错误**（链接器 `-Wl,-undefined,dynamic_lookup` 推迟到运行时，到时调 NULL 函数指针就崩）。

### 2. 不用 Swift / SPM

Apple CommandLineTools 6.1.2 的 `/Library/Developer/CommandLineTools/usr/include/swift/` 下有**两个完全相同**的 modulemap 文件（`module.modulemap` 和 `bridging.modulemap`），都定义 `SwiftBridging` 模块 —— **所有 Swift 项目 `import Foundation` 必炸**。这是 Apple 安装 bug。

解法：用纯 Objective-C + clang，绕开 Swift 模块系统。

### 3. 私有符号链接技巧

SkyLight 框架在 `/System/Library/PrivateFrameworks/`，要传：
```
-F /System/Library/PrivateFrameworks
-framework SkyLight
-Wl,-undefined,dynamic_lookup
```

最后那个 flag 关键：让链接器对 ObjC 类的实例化代码生成"暂时不验证、运行时再解析"的弱引用。

### 4. API 签名是 introspect 出来的

ObjC 类的真实方法签名通过 `class_copyMethodList` / `class_copyPropertyList` 运行时 dump 出来，详见 git 历史中的 `src/probe_sl.m`（已删除，只在第一轮探查时用过）。

## 文件

```
desk-display/
├── src/
│   ├── SkyLightPrivate.h   私有 ObjC 类与结构体声明
│   └── main.m              CLI 主逻辑（~150 行）
├── build.sh                clang 编译脚本
├── README.md
└── .gitignore
```

## 集成方式

被 desk-share-viewer Electron 主进程通过 `child_process.spawn` 调用：

1. `electron/virtual-display.ts` spawn 这个 binary，读 stdout 第一行 JSON 拿 `display_id`
2. 关闭 desk-share-viewer 时主进程往 sidecar stdin 写 `quit\n`，sidecar 自己 `[display destroy]` 后退出（兜底超时 SIGTERM）
3. Vue 前端通过 IPC（`window.desk.openVirtualDisplay` / `closeVirtualDisplay`）暴露开关
4. WebRTC 流程不变 —— Vue picker 列出所有 sources 含「desk virtual display」，用户挑这块就推流

## 失效预案

私有 API 永远有被 Apple 干掉的风险。如果未来某次 macOS 升级后这套不工作了，可以走的路线：

- 用 `dlsym` + `NSClassFromString` + `objc_msgSend` 做完全运行时反射（无编译期依赖，更难被静态扫描禁用）
- 用 DriverKit IDDCx 写系统扩展（最稳定但要 Apple Developer 账号签名 + 用户授权安装）
- 用 `BetterDisplay` / `Lunar` 这类第三方工具的虚拟显示器，desk 只做推流层
