import { chatReducer, initialChatState } from './chatReducer'

const C = 'c1'

test('tokens accumulate into one assistant reply after the user message', () => {
  let s = chatReducer(initialChatState, { type: 'user', text: 'hi' })
  expect(s.busy).toBe(true)
  s = chatReducer(s, { type: 'token', chat_id: C, text: 'Hel' })
  s = chatReducer(s, { type: 'token', chat_id: C, text: 'lo' })
  expect(s.items).toEqual([
    { kind: 'user', text: 'hi' },
    { kind: 'assistant', text: 'Hello' },
  ])
})

test('tool_request sets pending and stops busy; tool_result clears it and adds a tool item', () => {
  let s = chatReducer(initialChatState, { type: 'user', text: 'read' })
  s = chatReducer(s, {
    type: 'tool_request',
    chat_id: C,
    call_id: '1',
    tool: 'read_file',
    args: { path: 'x' },
    preview: null,
  })
  expect(s.pending?.tool).toBe('read_file')
  expect(s.busy).toBe(false)
  s = chatReducer(s, {
    type: 'tool_result',
    chat_id: C,
    tool: 'read_file',
    args: { path: 'x' },
    decision: 'allowed',
    summary: 'text',
  })
  expect(s.pending).toBeNull()
  expect(s.items.at(-1)).toEqual({
    kind: 'tool',
    tool: 'read_file',
    args: { path: 'x' },
    decision: 'allowed',
    summary: 'text',
  })
})

test('a token after a tool item starts a new assistant reply', () => {
  let s = chatReducer(initialChatState, { type: 'user', text: 'go' })
  s = chatReducer(s, { type: 'token', chat_id: C, text: 'Let me check.' })
  s = chatReducer(s, {
    type: 'tool_result',
    chat_id: C,
    tool: 'recall_memory',
    args: { query: 'x' },
    decision: 'auto',
    summary: '',
  })
  s = chatReducer(s, { type: 'token', chat_id: C, text: 'Done.' })
  expect(s.items.map((i) => i.kind)).toEqual(['user', 'assistant', 'tool', 'assistant'])
})

test('error adds an error item and stops busy', () => {
  let s = chatReducer(initialChatState, { type: 'user', text: 'hi' })
  s = chatReducer(s, { type: 'error', chat_id: C, message: "Can't reach Ollama. Is it running?" })
  expect(s.busy).toBe(false)
  expect(s.items.at(-1)).toEqual({ kind: 'error', message: "Can't reach Ollama. Is it running?" })
})

test('done stores stats and stops busy', () => {
  let s = chatReducer(initialChatState, { type: 'user', text: 'hi' })
  const stats = { output_tokens: 10, tok_per_s: 31, total_ms: 2400 }
  s = chatReducer(s, { type: 'done', chat_id: C, stats })
  expect(s.busy).toBe(false)
  expect(s.lastStats).toEqual(stats)
})

test('load with pending restores the approval card (restart case)', () => {
  const pending = { call_id: '1', tool: 'write_file', args: { path: 'a' }, preview: null }
  const s = chatReducer(initialChatState, {
    type: 'load',
    messages: [
      { role: 'user', content: 'write it' },
      { role: 'tool', tool: 'recall_memory', args: {}, decision: 'auto', summary: '' },
      { role: 'assistant', content: 'ok' },
    ],
    pending,
  })
  expect(s.pending).toEqual(pending)
  expect(s.busy).toBe(false)
  expect(s.items.map((i) => i.kind)).toEqual(['user', 'tool', 'assistant'])
})

test('regenerate drops everything after the last user message', () => {
  let s = chatReducer(initialChatState, { type: 'user', text: 'hi' })
  s = chatReducer(s, { type: 'token', chat_id: C, text: 'first' })
  s = chatReducer(s, { type: 'done', chat_id: C, stats: null })
  s = chatReducer(s, { type: 'regenerate' })
  expect(s.items).toEqual([{ kind: 'user', text: 'hi' }])
  expect(s.busy).toBe(true)
})
