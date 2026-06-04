#!/usr/bin/env bash
# 直接 clang 编 Objective-C，绕开 Swift 那套
# （CommandLineTools 当前 Swift modulemap 有重复定义 bug，SPM 完全没法用）
set -euo pipefail

cd "$(dirname "$0")"

OUT_DIR=".build/release"
OUT="$OUT_DIR/desk-display"
SRC="src/main.m"

mkdir -p "$OUT_DIR"

ARCHS=(arm64 x86_64)

build_arch () {
    local arch="$1"
    local out_arch="$OUT_DIR/desk-display-$arch"
    echo "==> build $arch" >&2
    clang \
        -target "${arch}-apple-macos12" \
        -fobjc-arc \
        -O2 \
        -framework Foundation \
        -F /System/Library/PrivateFrameworks \
        -framework SkyLight \
        -Wl,-undefined,dynamic_lookup \
        -o "$out_arch" \
        "$SRC"
    echo "$out_arch"
}

# 单架构（当前机器架构）—— 调试快
if [[ "${1:-}" == "--single" ]]; then
    arch="$(uname -m)"
    out_arch=$(build_arch "$arch")
    cp "$out_arch" "$OUT"
    echo "built single-arch: $OUT ($arch)"
    file "$OUT"
    exit 0
fi

# 默认：通用二进制（arm64 + x86_64）
arts=()
for a in "${ARCHS[@]}"; do
    arts+=("$(build_arch "$a")")
done

echo "==> lipo to universal"
lipo -create "${arts[@]}" -output "$OUT"
file "$OUT"
echo "built: $OUT"
