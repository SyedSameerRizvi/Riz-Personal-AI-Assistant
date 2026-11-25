import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { Composer } from '@/components/Composer'
import { Logo } from '@/components/Logo'
import { AssistantRow, AssistantText, ReplyActions, UserMessage } from '@/components/Message'
import * as api from '@/lib/api'
import { type ChatItem, chatReducer, initialChatState } from '@/lib/chatReducer'
import type { ApproveDecision, ClientMessage, ServerEvent, Stats, ToolRequest } from '@/lib/types'

interface ChatViewProps {
  chatId: string | null
  title: string
  model?: string
  hotkey?: string
  send: (m: ClientMessage) => void
  subscribe: (fn: (e: ServerEvent) => void) => () => void
  createChat: () => Promise<string>
  onOpenMemory: () => void
}

type Block =
  | { kind: 'user'; text: string; key: number }
  | { kind: 'turn'; items: ChatItem[]; key: number }

/** Groups everything between two user messages into one assistant turn. */
function toBlocks(items: ChatItem[]): Block[] {
  const blocks: Block[] = []
  items.forEach((item, i) => {
    if (item.kind === 'user') blocks.push({ kind: 'user', text: item.text, key: i })
    else {
      const last = blocks.at(-1)
      if (last?.kind === 'turn') last.items.push(item)
      else blocks.push({ kind: 'turn', items: [item], key: i })
    }
  })
  return blocks
}

export function ChatView(props: ChatViewProps) {
  const { chatId, send, subscribe } = props
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const created = useRef<string | null>(null)
  const idRef = useRef(chatId)
  idRef.current = chatId
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    if (chatId === null) {
      dispatch({ type: 'reset' })
      return
    }
    if (created.current === chatId) return // we just made it; keep the optimistic state
    let cancelled = false
    api
      .getMessages(chatId)
      .then((r) => !cancelled && dispatch({ type: 'load', messages: r.messages, pending: r.pending }))
      .catch(() => {})
    stick.current = true
    return () => {
      cancelled = true
    }
  }, [chatId])

  useEffect(
    () =>
      subscribe((e) => {
        if (e.chat_id === idRef.current) dispatch(e)
      }),
    [subscribe],
  )

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })

  const onSend = useCallback(
    async (text: string) => {
      stick.current = true
      let id = idRef.current
      dispatch({ type: 'user', text })
      if (id === null) {
        id = await props.createChat()
        created.current = id
        idRef.current = id
      }
      send({ type: 'send', chat_id: id, text })
    },
    [props, send],
  )

  const onDecide = (d: ApproveDecision) => {
    if (!chatId) return
    dispatch({ type: 'approve' })
    send({ type: 'approve', chat_id: chatId, ...d })
  }
  const onRegenerate = () => {
    if (!chatId) return
    dispatch({ type: 'regenerate' })
    send({ type: 'regenerate', chat_id: chatId })
  }
  const onStop = () => chatId && send({ type: 'stop', chat_id: chatId })

  const blocks = toBlocks(state.items)
  const lastTurn = blocks.findLastIndex((b) => b.kind === 'turn')
  const waiting = state.busy && blocks.at(-1)?.kind === 'user'

  return (
    <div className="flex min-h-0 grow flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <h1 className="truncate text-[15px] font-semibold">{chatId ? props.title : 'New chat'}</h1>
        {props.model && (
          <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            {props.model}
          </span>
        )}
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="min-h-0 grow overflow-y-auto px-4 py-7 sm:px-6"
        aria-live="polite"
      >
        {state.items.length === 0 && !state.pending ? (
          <EmptyState />
        ) : (
          <div className="mx-auto flex max-w-[740px] flex-col gap-[22px]">
            {blocks.map((block, i) =>
              block.kind === 'user' ? (
                <UserMessage key={block.key} text={block.text} />
              ) : (
                <Turn
                  key={block.key}
                  items={block.items}
                  isLast={i === lastTurn}
                  streaming={state.busy && i === blocks.length - 1}
                  stats={i === lastTurn ? state.lastStats : null}
                  onRegenerate={i === lastTurn && !state.busy && !state.pending ? onRegenerate : undefined}
                  onOpenMemory={props.onOpenMemory}
                />
              ),
            )}
            {waiting && (
              <AssistantRow>
                <span className="riz-caret mt-1 text-sm text-faint" aria-label="Riz is thinking" />
              </AssistantRow>
            )}
            {state.pending && (
              <AssistantRow>
                <PendingPlaceholder request={state.pending} onDecide={onDecide} />
              </AssistantRow>
            )}
          </div>
        )}
      </div>

      <Composer
        busy={state.busy}
        pending={state.pending !== null}
        hotkey={props.hotkey}
        onSend={onSend}
        onStop={onStop}
      />
    </div>
  )
}

function Turn({
  items,
  isLast,
  streaming,
  stats,
  onRegenerate,
}: {
  items: ChatItem[]
  isLast: boolean
  streaming: boolean
  stats: Stats | null
  onRegenerate?: () => void
  onOpenMemory: () => void
}) {
  const text = items
    .filter((i) => i.kind === 'assistant')
    .map((i) => (i.kind === 'assistant' ? i.text : ''))
    .join('\n\n')
  const lastText = items.findLastIndex((i) => i.kind === 'assistant')
  return (
    <AssistantRow>
      {items.map((item, i) => {
        if (item.kind === 'assistant')
          return <AssistantText key={i} text={item.text} streaming={streaming && i === lastText} />
        if (item.kind === 'error')
          return (
            <p key={i} role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
              {item.message}
            </p>
          )
        if (item.kind !== 'tool') return null
        return (
          <p key={i} className="text-[13px] text-muted-foreground">
            {item.tool} · {item.decision}
          </p>
        )
      })}
      {isLast && !streaming && text && <ReplyActions text={text} stats={stats} onRegenerate={onRegenerate} />}
    </AssistantRow>
  )
}

function PendingPlaceholder({
  request,
  onDecide,
}: {
  request: ToolRequest
  onDecide: (d: ApproveDecision) => void
}) {
  return (
    <div className="flex gap-2 text-sm">
      {request.tool}
      <button type="button" onClick={() => onDecide({ decision: 'allow', path: null })}>
        Allow
      </button>
      <button type="button" onClick={() => onDecide({ decision: 'deny', path: null })}>
        Deny
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Logo size={44} />
      <h2 className="text-xl font-semibold">How can I help?</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ask anything. Riz can also read and change files or run commands on this PC, and asks you
        first every time.
      </p>
    </div>
  )
}
