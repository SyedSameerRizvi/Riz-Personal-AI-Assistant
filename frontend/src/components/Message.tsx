import { RotateCcw } from 'lucide-react'
import { type ComponentProps, isValidElement, type ReactElement, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import { CopyButton } from '@/components/CopyButton'
import { Logo } from '@/components/Logo'
import { Tooltip } from '@/components/ui/tooltip'
import type { Stats } from '@/lib/types'
import { cn } from '@/lib/utils'

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="max-w-[80%] self-end rounded-2xl rounded-br-[4px] bg-raised px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
      {text}
    </div>
  )
}

export function AssistantRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Logo />
      <div className="flex min-w-0 grow flex-col gap-3">{children}</div>
    </div>
  )
}

function CodeBlock(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const child = props.children as ReactElement<{ className?: string }> | undefined
  const className = isValidElement(child) ? (child.props.className ?? '') : ''
  const language = /language-([\w-]+)/.exec(className)?.[1] ?? 'text'
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border">
      <div className="flex h-9 items-center border-b border-border bg-panel pr-1.5 pl-3.5 text-xs text-muted-foreground">
        <span className="grow">{language}</span>
        <CopyButton showText label="Copy code" getText={() => ref.current?.innerText ?? ''} />
      </div>
      <pre
        ref={ref}
        className="m-0 overflow-x-auto bg-code px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-code-foreground"
      >
        {props.children}
      </pre>
    </div>
  )
}

export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
      components={{
        pre: CodeBlock,
        a: (p) => <a {...p} target="_blank" rel="noreferrer" />,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

export function AssistantText({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={cn('prose-riz', streaming && 'riz-streaming')}>
      <Markdown text={text} />
      {streaming && <span className="riz-caret" aria-hidden="true" />}
    </div>
  )
}

export function ReplyActions({
  text,
  stats,
  onRegenerate,
}: {
  text: string
  stats: Stats | null
  onRegenerate?: () => void
}) {
  return (
    <div className="-ml-2 flex items-center gap-0.5">
      <CopyButton label="Copy reply" getText={() => text} />
      {onRegenerate && (
        <Tooltip label="Regenerate">
          <button
            type="button"
            aria-label="Regenerate reply"
            onClick={onRegenerate}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-raised hover:text-foreground"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        </Tooltip>
      )}
      {stats && (
        <span className="ml-1.5 text-xs text-faint">
          {stats.tok_per_s} tok/s · {(stats.total_ms / 1000).toFixed(1)} s
        </span>
      )}
    </div>
  )
}
