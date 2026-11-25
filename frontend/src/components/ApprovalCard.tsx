import { CircleAlert, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { pickFile } from '@/lib/pickFile'
import { toolMeta, toolTarget } from '@/lib/tools'
import type { ApproveDecision, ToolRequest } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ApprovalCardProps {
  request: ToolRequest
  onDecide: (d: ApproveDecision) => void
}

const plural = (n: number) => `${n} line${n === 1 ? '' : 's'}`

export function ApprovalCard({ request, onDecide }: ApprovalCardProps) {
  const [decided, setDecided] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const { title, icon: Icon } = toolMeta(request.tool)
  const target = toolTarget(request.tool, request.args)
  const preview = request.preview

  const decide = (d: ApproveDecision) => {
    if (decided) return
    setDecided(true)
    onDecide(d)
  }

  const pick = async () => {
    const path = await pickFile()
    if (path) decide({ decision: 'pick', path })
  }

  let note: string | null = null
  if (request.tool === 'write_file' && preview) {
    note =
      preview.old_lines === 0
        ? `Creates a new file with ${plural(preview.new_lines)}.`
        : `Overwrites the existing file: ${plural(preview.old_lines)} become ${plural(preview.new_lines)}.`
  }
  if (request.tool === 'delete_file') note = 'Moves it to the Recycle Bin.'

  return (
    <section
      aria-label={`${title} needs your approval`}
      className="flex min-w-0 flex-col gap-3 rounded-[14px] border border-border bg-panel p-4"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon className="size-[18px]" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="warn">
          <CircleAlert className="size-3" strokeWidth={2.4} aria-hidden="true" />
          Needs your approval
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <code className="rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-[13px] break-all whitespace-pre-wrap">
          {target}
        </code>
        {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
      </div>

      {showDiff && preview && <Diff text={preview.diff} />}

      <div className="flex flex-wrap gap-2">
        <Button disabled={decided} onClick={() => decide({ decision: 'allow', path: null })}>
          Allow
        </Button>
        <Button
          variant="outline"
          disabled={decided}
          onClick={() => decide({ decision: 'deny', path: null })}
        >
          Deny
        </Button>
        {request.tool === 'read_file' && (
          <Button variant="outline" disabled={decided} onClick={pick}>
            <FolderOpen className="size-4" aria-hidden="true" />
            Pick another file…
          </Button>
        )}
        {request.tool === 'write_file' && preview && preview.diff && (
          <Button variant="link" className="px-3" onClick={() => setShowDiff((v) => !v)}>
            {showDiff ? 'Hide changes' : 'Show changes'}
          </Button>
        )}
      </div>
    </section>
  )
}

function Diff({ text }: { text: string }) {
  const lines = text.split('\n').filter((l, i, all) => l !== '' || i < all.length - 1)
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-code py-2 font-mono text-[12.5px] leading-relaxed text-code-foreground">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'px-3 whitespace-pre',
            line.startsWith('+') && !line.startsWith('+++') && 'bg-ok/12 text-ok',
            line.startsWith('-') && !line.startsWith('---') && 'bg-destructive/12 text-destructive',
            (line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---')) && 'text-faint',
          )}
        >
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}
