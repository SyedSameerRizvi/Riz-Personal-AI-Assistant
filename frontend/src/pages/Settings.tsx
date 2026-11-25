import { Check } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Settings as SettingsT } from '@/lib/types'

interface SettingsProps {
  settings: SettingsT | null
  onChange: (values: Partial<SettingsT>) => Promise<void>
}

export function Settings({ settings, onChange }: SettingsProps) {
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = async (key: keyof SettingsT, value: string) => {
    if (!settings || settings[key] === value) return
    try {
      setError(null)
      await onChange({ [key]: value })
      setSaved(key)
      window.setTimeout(() => setSaved((s) => (s === key ? null : s)), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the setting.')
    }
  }

  if (!settings) return <div className="m-auto text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="min-h-0 grow overflow-y-auto">
      <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 py-7 sm:px-8">
        <div>
          <h1 className="font-display text-[38px] leading-[1.1]">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Saved on this PC as soon as you change them.</p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="divide-y divide-border rounded-[14px] border border-border">
          <Row id="user_name" title="Your name" hint="Riz greets you and talks to you by this name." saved={saved === 'user_name'}>
            <TextSetting id="user_name" value={settings.user_name ?? ''} allowEmpty onCommit={(v) => save('user_name', v)} />
          </Row>
          <Row
            id="model"
            title="Model"
            hint={
              <>
                Must be pulled in Ollama first:{' '}
                <code className="font-mono">ollama pull &lt;name&gt;</code>
              </>
            }
            saved={saved === 'model'}
          >
            <TextSetting id="model" value={settings.model} mono onCommit={(v) => save('model', v)} />
          </Row>
          <Row id="theme" title="Theme" hint="System follows Windows light or dark mode." saved={saved === 'theme'}>
            <ToggleGroup
              id="theme"
              type="single"
              value={settings.theme}
              onValueChange={(v) => v && save('theme', v)}
              aria-label="Theme"
            >
              <ToggleGroupItem value="system">System</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row
            id="hotkey"
            title="Show or hide hotkey"
            hint="For example ctrl+space. Applied the next time Riz starts."
            saved={saved === 'hotkey'}
          >
            <TextSetting id="hotkey" value={settings.hotkey} mono onCommit={(v) => save('hotkey', v)} />
          </Row>
          <Row
            id="start_with_windows"
            title="Start with Windows"
            hint="Opens Riz in the tray when you sign in."
            saved={saved === 'start_with_windows'}
          >
            <Switch
              id="start_with_windows"
              checked={settings.start_with_windows === 'true'}
              onCheckedChange={(on) => save('start_with_windows', on ? 'true' : 'false')}
            />
          </Row>
        </div>
      </div>
    </div>
  )
}

function Row({
  id,
  title,
  hint,
  saved,
  children,
}: {
  id: string
  title: string
  hint: ReactNode
  saved: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
      <div className="flex min-w-[220px] grow basis-0 flex-col gap-1">
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          {title}
          {saved && (
            <span className="flex items-center gap-1 text-xs font-normal text-ok">
              <Check className="size-3.5" aria-hidden="true" /> Saved
            </span>
          )}
        </label>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </div>
      {children}
    </div>
  )
}

function TextSetting({
  id,
  value,
  mono,
  allowEmpty,
  onCommit,
}: {
  id: string
  value: string
  mono?: boolean
  allowEmpty?: boolean
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const v = draft.trim()
    if (v || allowEmpty) {
      if (v !== value) onCommit(v)
    }
    else setDraft(value)
  }
  return (
    <Input
      id={id}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={mono ? 'w-full font-mono sm:w-60' : 'w-full sm:w-60'}
      spellCheck={false}
    />
  )
}
