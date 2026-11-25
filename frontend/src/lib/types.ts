export interface Chat {
  id: string
  title: string
  pinned: boolean
  created_at: string
  updated_at: string
}

export type MemoryKind = 'preference' | 'project' | 'personal'

export interface Memory {
  id: number
  text: string
  kind: MemoryKind
  source_chat_id: string | null
  created_at: string
  updated_at?: string
}

export type Settings = Record<'user_name' | 'model' | 'theme' | 'hotkey' | 'start_with_windows', string>

export type Decision = 'auto' | 'allowed' | 'denied'

export interface WritePreview {
  old_lines: number
  new_lines: number
  diff: string
}

export interface ToolRequest {
  call_id: string
  tool: string
  args: Record<string, string>
  preview: WritePreview | null
}

export interface ToolRow {
  role: 'tool'
  tool: string
  args: Record<string, string>
  decision: Decision
  summary: string
}

export type HistoryMessage = { role: 'user' | 'assistant'; content: string } | ToolRow

export interface Stats {
  output_tokens: number
  tok_per_s: number
  total_ms: number
}

export type ServerEvent =
  | { type: 'token'; chat_id: string; text: string }
  | ({ type: 'tool_request'; chat_id: string } & ToolRequest)
  | ({ type: 'tool_result'; chat_id: string } & Omit<ToolRow, 'role'>)
  | { type: 'done'; chat_id: string; stats: Stats | null }
  | { type: 'error'; chat_id: string; message: string }

export type ApproveDecision = { decision: 'allow' | 'deny' | 'pick'; path: string | null }

export type ClientMessage =
  | { type: 'send'; chat_id: string; text: string }
  | ({ type: 'approve'; chat_id: string } & ApproveDecision)
  | { type: 'stop'; chat_id: string }
  | { type: 'regenerate'; chat_id: string }

export type Range = '7d' | '30d' | 'all'

export interface DashboardStats {
  tokens_per_day: { day: string; input: number; output: number; messages: number; chats: number }[]
  speed: { day: string; tok_per_s: number | null; first_token_ms: number | null }[]
  tools: { tool: string; allowed: number; denied: number; auto: number }[]
  totals: { messages: number; chats: number }
}

export interface Status {
  ollama: boolean
  model: string | null
  vram_used_gb: number | null
  vram_total_gb: number | null
}
