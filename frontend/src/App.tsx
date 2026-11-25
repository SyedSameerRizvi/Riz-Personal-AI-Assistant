import { Menu } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatView } from '@/components/ChatView'
import { Sidebar, type View } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as api from '@/lib/api'
import type { Chat, ClientMessage, ServerEvent, Settings, Status } from '@/lib/types'
import { type ChatSocket, connect } from '@/lib/ws'
import { useTheme } from '@/lib/useTheme'

const STATUS_POLL_MS = 10_000

export default function App() {
  const [view, setView] = useState<View>('chat')
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useTheme(settings?.theme)

  // One WebSocket for the whole app; views subscribe to its events.
  const listeners = useRef(new Set<(e: ServerEvent) => void>())
  const socket = useRef<ChatSocket | null>(null)
  useEffect(() => {
    const s = connect((e) => listeners.current.forEach((fn) => fn(e)))
    socket.current = s
    return () => s.close()
  }, [])
  const send = useCallback((m: ClientMessage) => socket.current?.send(m), [])
  const subscribe = useCallback((fn: (e: ServerEvent) => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const refreshChats = useCallback(() => {
    api.listChats().then(setChats).catch(() => {})
  }, [])

  useEffect(() => {
    refreshChats()
    api.getSettings().then(setSettings).catch(() => {})
  }, [refreshChats])

  useEffect(() => {
    const poll = () => api.getStatus().then(setStatus).catch(() => setStatus(null))
    poll()
    const id = window.setInterval(poll, STATUS_POLL_MS)
    return () => window.clearInterval(id)
  }, [])

  const newChat = useCallback(() => {
    setActiveChatId(null)
    setView('chat')
    setSidebarOpen(false)
  }, [])

  // Titles change after the first message, and order changes with activity.
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'done' || e.type === 'tool_request' || e.type === 'error') refreshChats()
      }),
    [subscribe, refreshChats],
  )

  const createChat = useCallback(async () => {
    const chat = await api.createChat()
    setActiveChatId(chat.id)
    refreshChats()
    return chat.id
  }, [refreshChats])

  const activeTitle = useMemo(
    () => chats.find((c) => c.id === activeChatId)?.title ?? 'New chat',
    [chats, activeChatId],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newChat])

  const sidebar = (onClose?: () => void) => (
    <Sidebar
      chats={chats}
      activeChatId={activeChatId}
      view={view}
      status={status}
      modelSetting={settings?.model}
      onClose={onClose}
      onNewChat={newChat}
      onSelectChat={(id) => {
        setActiveChatId(id)
        setView('chat')
        setSidebarOpen(false)
      }}
      onNavigate={(v) => {
        setView(v)
        setSidebarOpen(false)
      }}
      onRename={async (id, title) => {
        await api.updateChat(id, { title })
        refreshChats()
      }}
      onTogglePin={async (chat) => {
        await api.updateChat(chat.id, { pinned: !chat.pinned })
        refreshChats()
      }}
      onDelete={async (id) => {
        await api.deleteChat(id)
        if (id === activeChatId) setActiveChatId(null)
        refreshChats()
      }}
    />
  )

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full bg-background text-foreground">
        <div className="hidden w-[272px] shrink-0 md:flex">{sidebar()}</div>
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div className="flex w-[min(300px,85vw)]">{sidebar(() => setSidebarOpen(false))}</div>
            <button
              type="button"
              aria-label="Close sidebar"
              className="grow bg-black/40"
              onClick={() => setSidebarOpen(false)}
            />
          </div>
        )}
        <main className="flex min-w-0 grow flex-col">
          {view !== 'chat' && (
          <div className="flex h-14 items-center gap-2 border-b border-border px-3 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <span className="text-[15px] font-semibold">Riz</span>
          </div>
          )}
          {view === 'chat' ? (
            <ChatView
              chatId={activeChatId}
              title={activeTitle}
              model={settings?.model}
              hotkey={settings?.hotkey}
              send={send}
              subscribe={subscribe}
              createChat={createChat}
              onOpenMemory={() => setView('memory')}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          ) : (
            <div className="flex min-h-0 grow flex-col">
              <p className="m-auto text-sm text-muted-foreground">{view} page</p>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  )
}
