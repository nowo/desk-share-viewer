#!/usr/bin/env bash
# 编 sidecars/ 下所有 sidecar binary
# Electron 直接从源位置读：sidecars/desk-display/.build/release/desk-display
#
# 模式：
#   ./prep-sidecars.sh             单架构（当前机器，快，开发用）
#   ./prep-sidecars.sh universal   通用二进制（arm64 + x86_64 lipo，发布用）
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-single}"

if [[ "$MODE" == "universal" ]]; then
    echo "==> building sidecar: desk-display (universal: arm64 + x86_64)"
    bash sidecars/desk-display/build.sh
else
    echo "==> building sidecar: desk-display (single arch: $(uname -m))"
    bash sidecars/desk-display/build.sh --single
fi

echo "ready: sidecars/desk-display/.build/release/desk-display"
file sidecars/desk-display/.build/release/desk-display
