import {
  BarChart3,
  Database,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Logo } from '@/components/Logo'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { groupChats } from '@/lib/groupChats'
import type { Chat, Status } from '@/lib/types'
import { cn } from '@/lib/utils'

export type View = 'chat' | 'dashboard' | 'memory' | 'settings'

interface SidebarProps {
  chats: Chat[]
  activeChatId: string | null
  view: View
  status: Status | null
  modelSetting: string | undefined
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onNavigate: (view: View) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (chat: Chat) => void
  onDelete: (id: string) => void
  onClose?: () => void
}

const NAV: { view: View; label: string; icon: typeof BarChart3 }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { view: 'memory', label: 'Memory', icon: Database },
  { view: 'settings', label: 'Settings', icon: SlidersHorizontal },
]

export function Sidebar(props: SidebarProps) {
  const { chats, activeChatId, view, status, modelSetting } = props
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Chat | null>(null)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const shown = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats
    return groupChats(shown, new Date())
  }, [chats, query])

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-full flex-col gap-3.5 border-r border-border bg-panel px-3 py-4"
    >
      <div className="flex items-center gap-2.5 px-1.5 py-1">
        <Logo />
        <span className="font-display grow text-[26px] leading-none">Riz</span>
        {props.onClose && (
          <Button variant="ghost" size="icon" aria-label="Close sidebar" onClick={props.onClose}>
            <PanelLeftClose className="size-[18px]" />
          </Button>
        )}
      </div>

      <Button className="h-11 justify-start rounded-[10px] px-3.5" onClick={props.onNewChat}>
        <Plus className="size-[18px]" />
        <span className="grow text-left">New chat</span>
        <kbd className="font-sans text-xs font-medium opacity-80">Ctrl N</kbd>
      </Button>

      <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-faint focus-within:border-ring">
        <Search className="size-4" aria-hidden="true" />
        <span className="sr-only">Search chats</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          className="min-w-0 grow bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
        />
      </label>

      <div className="-mx-1 flex grow flex-col gap-3.5 overflow-y-auto px-1">
        {groups.length === 0 && (
          <p className="px-2.5 py-2 text-[13px] text-faint">
            {query ? 'No chats match your search.' : 'No chats yet. Start one with New chat.'}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} className="flex flex-col gap-0.5" aria-label={group.label}>
            <h2 className="px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-faint uppercase">{group.label}</h2>
            {group.chats.map((chat) => {
              const active = view === 'chat' && chat.id === activeChatId
              if (renaming === chat.id) {
                return (
                  <RenameInput
                    key={chat.id}
                    initial={chat.title}
                    onDone={(title) => {
                      setRenaming(null)
                      if (title && title !== chat.title) props.onRename(chat.id, title)
                    }}
                  />
                )
              }
              return (
                <div
                  key={chat.id}
                  className={cn(
                    'group flex items-center rounded-lg',
                    active ? 'bg-raised text-foreground' : 'text-muted-foreground hover:bg-raised/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => props.onSelectChat(chat.id)}
                    aria-current={active ? 'page' : undefined}
                    className="flex min-h-9 min-w-0 grow cursor-pointer items-center gap-2 py-2 pl-2.5 text-left text-sm"
                  >
                    {chat.pinned && <Pin className="size-3.5 shrink-0" aria-label="Pinned" />}
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Options for ${chat.title}`}
                        className="mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenaming(chat.id)}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => props.onTogglePin(chat)}>
                        {chat.pinned ? <PinOff /> : <Pin />} {chat.pinned ? 'Unpin' : 'Pin'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setToDelete(chat)}
                        className="text-destructive [&_svg]:text-destructive"
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border pt-2.5">
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            onClick={() => props.onNavigate(v)}
            aria-current={view === v ? 'page' : undefined}
            className={cn(
              'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm',
              view === v ? 'bg-raised text-foreground' : 'text-muted-foreground hover:bg-raised/60',
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <StatusFooter status={status} modelSetting={modelSetting} />

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>
            “{toDelete?.title}” and its messages will be removed. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && props.onDelete(toDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  )
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <input
      // biome-ignore lint: focusing the field the user just asked to edit
      autoFocus
      aria-label="Chat title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(value.trim())
        if (e.key === 'Escape') onDone(initial)
      }}
      className="h-9 rounded-lg border border-ring bg-background px-2.5 text-sm text-foreground outline-none"
    />
  )
}

function StatusFooter({ status, modelSetting }: { status: Status | null; modelSetting?: string }) {
  const online = status?.ollama ?? false
  const model = status?.model ?? modelSetting ?? '…'
  let detail = 'Checking Ollama…'
  if (status) {
    if (!online) detail = 'Ollama offline'
    else if (status.vram_used_gb != null && status.vram_total_gb != null)
      detail = `Ollama running · GPU ${status.vram_used_gb} / ${status.vram_total_gb} GB`
    else if (!status.model) detail = 'Ollama running · model not loaded'
    else detail = 'Ollama running'
  }
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-background p-2.5">
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', online ? 'bg-ok' : 'bg-faint')}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono text-[13px] font-medium">{model}</span>
        <span className="truncate text-xs text-faint">{detail}</span>
      </div>
    </div>
  )
}
