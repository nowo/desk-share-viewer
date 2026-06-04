import { createRouter, createWebHashHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Host from './pages/Host.vue'
import Viewer from './pages/Viewer.vue'

export default createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', component: Home },
        { path: '/host', component: Host },
        // 短路径：6 位数字 = 观众入口；正则约束防止跟其他静态路由冲突
        { path: '/:roomId(\\d{6})', component: Viewer, props: true },
        // 老路径兼容：以前发出去的 QR / 链接还能用
        { path: '/viewer/:roomId(\\d{6})', component: Viewer, props: true },
        // 兜底：其他任何路径回首页
        { path: '/:catchAll(.*)', redirect: '/' },
    ],
})
