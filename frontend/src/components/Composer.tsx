import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ComposerProps {
  busy: boolean
  pending: boolean
  hotkey?: string
  onSend: (text: string) => void
  onStop: () => void
}

const prettyKey = (k: string) =>
  k
    .split('+')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('+')

export function Composer({ busy, pending, hotkey, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  useEffect(() => {
    if (!pending && !busy) ref.current?.focus()
  }, [pending, busy])

  const submit = () => {
    const value = text.trim()
    if (!value || busy || pending) return
    onSend(value)
    setText('')
  }

  return (
    <div className="shrink-0 px-4 pb-4 sm:px-6">
      <div className="mx-auto flex max-w-[740px] flex-col gap-2">
        <div
          className={cn(
            'flex flex-col gap-2 rounded-2xl border border-border bg-panel py-3 pr-3 pl-4 transition-colors focus-within:border-ring/60',
            pending && 'opacity-70',
          )}
        >
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <textarea
            id="composer"
            ref={ref}
            rows={2}
            value={text}
            disabled={pending}
            placeholder={pending ? 'Answer the approval above first' : 'Message Riz…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            className="resize-none bg-transparent text-[15px] leading-normal text-foreground outline-none focus-visible:outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-2">
            <span className="hidden grow text-xs text-faint sm:block">
              Enter to send · Shift+Enter for a new line
              {hotkey ? ` · ${prettyKey(hotkey)} hides the window` : ''}
            </span>
            <span className="grow sm:hidden" />
            {busy ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={onStop}
                className="flex size-10 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-background text-foreground hover:bg-raised"
              >
                <Square className="size-4 fill-current" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send message"
                onClick={submit}
                disabled={!text.trim() || pending}
                className="flex size-10 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowUp className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-faint">
          Runs locally with Ollama. Nothing leaves this PC.
        </p>
      </div>
    </div>
  )
}
