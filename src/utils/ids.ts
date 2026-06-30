// 6 位纯数字房间号
export const newRoomId = (): string => {
    let s = ''
    const arr = new Uint8Array(6)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 6; i++) s += String(arr[i]! % 10)
    return s
}

const randHex = (bytes: number): string => {
    const arr = new Uint8Array(bytes)
    crypto.getRandomValues(arr)
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

// 持久的浏览器标识：同浏览器（同 origin）所有标签共享，用于服务器限制「一个浏览器最多几个观众」
// 用 getRandomValues 而非 crypto.randomUUID —— 观众端 http+LAN IP 非 secure context，randomUUID 不可用
const CLIENT_KEY = 'desk-client-id'
export const getClientId = (): string => {
    let id = localStorage.getItem(CLIENT_KEY)
    if (!id) {
        id = randHex(16)
        localStorage.setItem(CLIENT_KEY, id)
    }
    return id
}

// per-标签 标识：sessionStorage 持久（刷新保留、每个标签独立），用于区分「同标签重连」与「另开标签」
const TAB_KEY = 'desk-tab-id'
export const getTabId = (): string => {
    let id = sessionStorage.getItem(TAB_KEY)
    if (!id) {
        id = randHex(8)
        sessionStorage.setItem(TAB_KEY, id)
    }
    return id
}
