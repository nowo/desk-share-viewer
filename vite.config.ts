import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import unocss from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
    // Electron 用 file:// 加载，资源路径必须相对
    base: './',
    plugins: [vue(), unocss()],
    resolve: {
        alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
        port: 1420,
        strictPort: true,
        host: '0.0.0.0',
    },
    clearScreen: false,
    build: {
        target: 'es2022',
        minify: 'esbuild',
    },
})
