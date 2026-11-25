import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import * as api from '@/lib/api'
import type { Chat, Memory as Fact, MemoryKind } from '@/lib/types'
import { cn } from '@/lib/utils'

const KINDS: MemoryKind[] = ['preference', 'project', 'personal']
const label = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

function when(iso: string) {
  const then = new Date(iso)
  const now = new Date()
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(then)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function Memory({ chats }: { chats: Chat[] }) {
  const [facts, setFacts] = useState<Fact[]>([])
  const [kind, setKind] = useState<MemoryKind | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [toDelete, setToDelete] = useState<Fact | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(() => {
    api
      .listMemory({ kind: kind ?? undefined, q: query.trim() || undefined })
      .then((f) => {
        setFacts(f)
        setLoaded(true)
      })
      .catch(() => {})
  }, [kind, query])

  useEffect(() => {
    const t = window.setTimeout(load, query ? 200 : 0)
    return () => window.clearTimeout(t)
  }, [load, query])

  const chatTitle = (id: string | null) => chats.find((c) => c.id === id)?.title

  return (
    <div className="min-h-0 grow overflow-y-auto">
      <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-4 py-7 sm:px-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grow">
            <h1 className="text-[22px] font-semibold">Memory</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Facts Riz saved about you. It recalls them to tailor its answers.
            </p>
          </div>
          <Button onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
            Add a fact
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-10 min-w-0 flex-[1_1_260px] items-center gap-2 rounded-[10px] border border-border px-3 text-faint focus-within:border-ring">
            <Search className="size-4" aria-hidden="true" />
            <span className="sr-only">Search memory</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory"
              className="min-w-0 grow bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
            />
          </label>
          <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-1.5">
            {[null, ...KINDS].map((k) => (
              <button
                key={k ?? 'all'}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  'h-[34px] cursor-pointer rounded-full border px-3 text-[13px] font-medium transition-colors',
                  kind === k
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {k ? label(k) : 'All'}
              </button>
            ))}
          </div>
        </div>

        {adding && (
          <FactEditor
            initialText=""
            initialKind={kind ?? 'preference'}
            saveLabel="Add fact"
            onCancel={() => setAdding(false)}
            onSave={async (text, k) => {
              await api.createMemory(text, k)
              setAdding(false)
              load()
            }}
          />
        )}

        {facts.length > 0 ? (
          <ul className="overflow-hidden rounded-[14px] border border-border">
            {facts.map((fact) =>
              editing === fact.id ? (
                <li key={fact.id} className="border-b border-border p-3 last:border-b-0">
                  <FactEditor
                    bare
                    initialText={fact.text}
                    initialKind={fact.kind}
                    saveLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSave={async (text, k) => {
                      await api.updateMemory(fact.id, text, k)
                      setEditing(null)
                      load()
                    }}
                  />
                </li>
              ) : (
                <li
                  key={fact.id}
                  className="flex items-center gap-3.5 border-b border-border px-4 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 grow flex-col gap-1">
                    <span className="text-[15px] leading-normal [overflow-wrap:anywhere]">{fact.text}</span>
                    <span className="text-xs text-faint">
                      {label(fact.kind)} · saved {when(fact.created_at)}
                      {chatTitle(fact.source_chat_id) ? ` from “${chatTitle(fact.source_chat_id)}”` : ''}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit fact"
                    onClick={() => setEditing(fact.id)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete fact"
                    onClick={() => setToDelete(fact)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ),
            )}
          </ul>
        ) : (
          loaded && (
            <div className="rounded-[14px] border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              {query || kind
                ? 'No facts match.'
                : 'Nothing saved yet. Tell Riz something like “remember I prefer short answers”, or add a fact yourself.'}
            </div>
          )
        )}

        <p className="text-xs text-faint">
          {facts.length} {facts.length === 1 ? 'fact' : 'facts'} · stored on this PC in{' '}
          <code className="font-mono">riz.db</code>
        </p>
      </div>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this fact?</AlertDialogTitle>
          <AlertDialogDescription>
            Riz will forget “{toDelete?.text}”. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete) await api.deleteMemory(toDelete.id)
                load()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FactEditor({
  initialText,
  initialKind,
  saveLabel,
  bare,
  onSave,
  onCancel,
}: {
  initialText: string
  initialKind: MemoryKind
  saveLabel: string
  bare?: boolean
  onSave: (text: string, kind: MemoryKind) => Promise<void>
  onCancel: () => void
}) {
  const [text, setText] = useState(initialText)
  const [kind, setKind] = useState<MemoryKind>(initialKind)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await onSave(text.trim(), kind)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className={cn('flex flex-col gap-3', !bare && 'rounded-[14px] border border-border bg-panel p-4')}>
      <label htmlFor="fact-text" className="sr-only">
        Fact
      </label>
      <Textarea
        id="fact-text"
        // biome-ignore lint: focus the field the user just opened
        autoFocus
        rows={2}
        value={text}
        placeholder="e.g. Prefers short answers with bullet points."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') onCancel()
        }}
        className="resize-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Kind" className="flex gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                'h-8 cursor-pointer rounded-full border px-3 text-[13px] transition-colors',
                kind === k
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {label(k)}
            </button>
          ))}
        </div>
        <span className="grow" />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!text.trim() || saving}>
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
