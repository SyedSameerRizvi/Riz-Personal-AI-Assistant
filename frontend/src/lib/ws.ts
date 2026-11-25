import type { ClientMessage, ServerEvent } from './types'

const RETRY_MS = 1000

/** One WebSocket to the backend that reconnects after a drop and queues sends meanwhile. */
export function connect(onEvent: (e: ServerEvent) => void, onOpen?: () => void) {
  let socket: WebSocket | null = null
  let closed = false
  let timer: number | undefined
  const queue: ClientMessage[] = []

  const open = () => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${window.location.host}/ws`)
    socket.onopen = () => {
      while (queue.length) socket?.send(JSON.stringify(queue.shift()))
      onOpen?.()
    }
    socket.onmessage = (msg) => onEvent(JSON.parse(msg.data) as ServerEvent)
    socket.onclose = () => {
      if (!closed) timer = window.setTimeout(open, RETRY_MS)
    }
  }
  open()

  return {
    send(m: ClientMessage) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m))
      else queue.push(m)
    },
    close() {
      closed = true
      window.clearTimeout(timer)
      socket?.close()
    },
  }
}

export type ChatSocket = ReturnType<typeof connect>
