import type {
  Chat,
  DashboardStats,
  HistoryMessage,
  Memory,
  MemoryKind,
  Range,
  Settings,
  Status,
  ToolRequest,
} from './types'

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // keep statusText
    }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const listChats = () => request<Chat[]>('GET', '/api/chats')
export const createChat = () => request<Chat>('POST', '/api/chats', {})
export const updateChat = (id: string, patch: { title?: string; pinned?: boolean }) =>
  request<Chat>('PATCH', `/api/chats/${id}`, patch)
export const deleteChat = (id: string) => request<{ ok: true }>('DELETE', `/api/chats/${id}`)
export const getMessages = (id: string) =>
  request<{ messages: HistoryMessage[]; pending: ToolRequest | null }>(
    'GET',
    `/api/chats/${id}/messages`,
  )

export const listMemory = (params: { kind?: MemoryKind; q?: string } = {}) => {
  const qs = new URLSearchParams()
  if (params.kind) qs.set('kind', params.kind)
  if (params.q) qs.set('q', params.q)
  const s = qs.toString()
  return request<Memory[]>('GET', `/api/memory${s ? `?${s}` : ''}`)
}
export const createMemory = (text: string, kind: MemoryKind) =>
  request<Memory>('POST', '/api/memory', { text, kind })
export const updateMemory = (id: number, text: string, kind: MemoryKind) =>
  request<{ ok: true }>('PATCH', `/api/memory/${id}`, { text, kind })
export const deleteMemory = (id: number) => request<{ ok: true }>('DELETE', `/api/memory/${id}`)

export const getSettings = () => request<Settings>('GET', '/api/settings')
export const updateSettings = (values: Partial<Settings>) =>
  request<Settings>('PATCH', '/api/settings', values)

export const getStats = (range: Range) => request<DashboardStats>('GET', `/api/stats?range=${range}`)
export const getStatus = () => request<Status>('GET', '/api/status')
