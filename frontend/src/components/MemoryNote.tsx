import { Database } from 'lucide-react'

export function MemoryNote({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-fit max-w-full cursor-pointer items-center gap-2 self-start rounded-full bg-primary/12 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-primary/20"
    >
      <Database className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate">
        <span className="text-muted-foreground">Saved to memory:</span> {text}
      </span>
    </button>
  )
}
