import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import 'virtual:uno.css'

const app = createApp(App)

// 捕获所有 Vue 渲染/lifecycle 异常，强制把堆栈打到 console（防止"空白页"无声失败）
app.config.errorHandler = (err, _instance, info) => {
    console.error('[vue-error]', info, err)
}
window.addEventListener('error', (e) => {
    console.error('[window-error]', e.message, e.error)
})
window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled-promise]', e.reason)
})

app.use(router)
app.mount('#app')
