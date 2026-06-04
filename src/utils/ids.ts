// 6 位纯数字房间号
export const newRoomId = (): string => {
    let s = ''
    const arr = new Uint8Array(6)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 6; i++) s += String(arr[i]! % 10)
    return s
}
