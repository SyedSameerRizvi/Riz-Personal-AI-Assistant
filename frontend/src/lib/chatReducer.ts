import type { Decision, HistoryMessage, ServerEvent, Stats, ToolRequest } from './types'

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; tool: string; args: Record<string, string>; decision: Decision; summary: string }
  | { kind: 'error'; message: string }

export interface ChatState {
  items: ChatItem[]
  pending: ToolRequest | null
  busy: boolean
  lastStats: Stats | null
}

export type ChatAction =
  | ServerEvent
  | { type: 'load'; messages: HistoryMessage[]; pending: ToolRequest | null }
  | { type: 'user'; text: string }
  | { type: 'approve' }
  | { type: 'regenerate' }
  | { type: 'reset' }

export const initialChatState: ChatState = { items: [], pending: null, busy: false, lastStats: null }

function fromHistory(m: HistoryMessage): ChatItem {
  if (m.role === 'tool') {
    return { kind: 'tool', tool: m.tool, args: m.args, decision: m.decision, summary: m.summary }
  }
  return m.role === 'user' ? { kind: 'user', text: m.content } : { kind: 'assistant', text: m.content }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'reset':
      return initialChatState
    case 'load':
      return {
        items: action.messages.map(fromHistory),
        pending: action.pending,
        busy: false,
        lastStats: null,
      }
    case 'user':
      return {
        ...state,
        items: [...state.items, { kind: 'user', text: action.text }],
        busy: true,
        lastStats: null,
      }
    case 'approve':
      return { ...state, pending: null, busy: true }
    case 'regenerate': {
      let last = -1
      state.items.forEach((item, i) => {
        if (item.kind === 'user') last = i
      })
      if (last < 0) return state
      return { ...state, items: state.items.slice(0, last + 1), busy: true, lastStats: null }
    }
    case 'token': {
      const items = [...state.items]
      const tail = items.at(-1)
      if (tail?.kind === 'assistant') items[items.length - 1] = { ...tail, text: tail.text + action.text }
      else items.push({ kind: 'assistant', text: action.text })
      return { ...state, items, busy: true }
    }
    case 'tool_request': {
      const { type: _t, chat_id: _c, ...request } = action
      return { ...state, pending: request, busy: false }
    }
    case 'tool_result': {
      const { tool, args, decision, summary } = action
      return {
        ...state,
        pending: null,
        items: [...state.items, { kind: 'tool', tool, args, decision, summary }],
      }
    }
    case 'done':
      return { ...state, busy: false, lastStats: action.stats ?? state.lastStats }
    case 'error':
      return {
        ...state,
        busy: false,
        items: [...state.items, { kind: 'error', message: action.message }],
      }
  }
}
