#!/bin/bash
# 解除 ad-hoc 签名 app 的下载隔离属性，绕过新版 macOS Gatekeeper 的「已损坏」误报
# 先把 desk-share-viewer 拖进「应用程序」，再双击本文件即可

APP="/Applications/desk-share-viewer.app"

if [ ! -d "$APP" ]; then
    echo "⚠️  没找到 $APP"
    echo "请先把 desk-share-viewer 拖进左侧的「应用程序」，再双击我。"
    echo ""
    read -n 1 -s -r -p "按任意键关闭…"
    exit 1
fi

xattr -cr "$APP"
echo "✅ 已解除隔离，正在打开 desk-share-viewer…"
open "$APP"
sleep 1
