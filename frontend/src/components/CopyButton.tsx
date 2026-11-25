import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard not available; nothing to do
    }
  }
  return { copied, copy }
}

export function CopyButton({
  getText,
  label,
  showText = false,
  className,
}: {
  getText: () => string
  label: string
  showText?: boolean
  className?: string
}) {
  const { copied, copy } = useCopy()
  const Icon = copied ? Check : Copy
  return (
    <button
      type="button"
      aria-label={showText ? undefined : copied ? 'Copied' : label}
      onClick={() => copy(getText())}
      className={cn(
        'flex cursor-pointer items-center justify-center gap-1.5 rounded-md text-faint transition-colors hover:bg-raised hover:text-foreground',
        showText ? 'h-7 px-2 text-xs' : 'size-9',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {showText && (copied ? 'Copied' : 'Copy')}
    </button>
  )
}
