import { Check, X } from 'lucide-react'
import { toolMeta, toolTarget } from '@/lib/tools'
import type { Decision } from '@/lib/types'

interface ToolChipProps {
  tool: string
  args: Record<string, string>
  decision: Decision
  summary: string
}

export function ToolChip({ tool, args, decision, summary }: ToolChipProps) {
  const { title, done, icon: Icon } = toolMeta(tool)
  const target = toolTarget(tool, args)
  return (
    <div
      title={summary || undefined}
      className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-border px-3 py-2 text-[13px] text-muted-foreground"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="shrink-0">{decision === 'denied' ? title : done}</span>
      <code className="min-w-0 truncate font-mono text-xs text-foreground">{target}</code>
      <span className="grow" />
      {decision === 'allowed' && (
        <span className="flex shrink-0 items-center gap-1 text-ok">
          <Check className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
          Allowed by you
        </span>
      )}
      {decision === 'denied' && (
        <span className="flex shrink-0 items-center gap-1">
          <X className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
          Denied
        </span>
      )}
    </div>
  )
}
