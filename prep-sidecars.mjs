#!/usr/bin/env node
// 编 sidecars/ 下的 sidecar binary（跨平台入口，替代旧的 prep-sidecars.sh）
// Electron 直接从源位置读：sidecars/desk-display/.build/release/desk-display
//
// 模式：
//   node prep-sidecars.mjs            单架构（当前机器，快，开发用）
//   node prep-sidecars.mjs universal  通用二进制（arm64 + x86_64 lipo，发布用）
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// 非 macOS 跳过 —— sidecar 用 SkyLight 私有 API，只能在 mac 上编/跑
if (process.platform !== 'darwin') {
    console.warn(`==> non-macOS (${process.platform}), skip sidecar build`)
    process.exit(0)
}

const universal = process.argv[2] === 'universal'
console.warn(`==> building sidecar: desk-display (${universal ? 'universal: arm64 + x86_64' : 'single arch'})`)

const args = ['sidecars/desk-display/build.sh']
if (!universal) args.push('--single')

const r = spawnSync('bash', args, { stdio: 'inherit', cwd: root })
if (r.status !== 0) process.exit(r.status ?? 1)

console.warn('ready: sidecars/desk-display/.build/release/desk-display')
