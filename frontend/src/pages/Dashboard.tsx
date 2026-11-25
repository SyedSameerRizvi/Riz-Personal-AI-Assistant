import { Check, CircleOff } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import * as api from '@/lib/api'
import type { DashboardStats, Range, Settings, Status } from '@/lib/types'
import { useCssVars } from '@/lib/useCssVars'
import { cn } from '@/lib/utils'

const RANGE_LABEL: Record<Range, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', all: 'All time' }
const APPROVAL_TOOLS = ['read_file', 'write_file', 'run_command', 'delete_file']
const COLOR_VARS = ['chart-a', 'chart-b', 'chart-grid', 'faint', 'muted-text', 'panel', 'raised'] as const

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function parseDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function dayLabel(day: string, range: Range) {
  const date = parseDay(day)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (range === '7d')
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Dashboard({ settings, status }: { settings: Settings | null; status: Status | null }) {
  const [range, setRange] = useState<Range>('7d')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [today, setToday] = useState<DashboardStats['tokens_per_day'][number] | null>(null)
  const [loading, setLoading] = useState(true)
  const colors = useCssVars(COLOR_VARS)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getStats(range)
      .then((s) => !cancelled && setStats(s))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range])

  useEffect(() => {
    api
      .getStats('7d')
      .then((s) => setToday(s.tokens_per_day.at(-1) ?? null))
      .catch(() => {})
  }, [])

  const days = useMemo(
    () =>
      (stats?.tokens_per_day ?? []).map((d, i) => ({
        ...d,
        label: dayLabel(d.day, range),
        tok_per_s: stats?.speed[i]?.tok_per_s ?? null,
        first_token_ms: stats?.speed[i]?.first_token_ms ?? null,
      })),
    [stats, range],
  )

  const speedDays = days.filter((d) => d.tok_per_s != null)
  const avgSpeed = speedDays.length
    ? speedDays.reduce((a, d) => a + (d.tok_per_s ?? 0), 0) / speedDays.length
    : null
  const avgFirst = speedDays.length
    ? speedDays.reduce((a, d) => a + (d.first_token_ms ?? 0), 0) / speedDays.length
    : null

  const approvals = (stats?.tools ?? [])
    .filter((t) => APPROVAL_TOOLS.includes(t.tool))
    .map((t) => {
      const calls = t.allowed + t.denied
      const pct = calls ? Math.round((t.allowed / calls) * 100) : 0
      return { ...t, calls, pct, labelText: `${calls} ${calls === 1 ? 'call' : 'calls'} · ${pct}% approved` }
    })
  const autoRuns = (stats?.tools ?? []).filter((t) => !APPROVAL_TOOLS.includes(t.tool))
  const autoTotal = autoRuns.reduce((a, t) => a + t.auto, 0)

  const online = status?.ollama ?? false
  const used = status?.vram_used_gb ?? null
  const total = status?.vram_total_gb ?? null
  const totals = stats?.totals

  return (
    <div className="min-h-0 grow overflow-y-auto">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-7 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grow">
            <h1 className="text-[22px] font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {totals
                ? `${RANGE_LABEL[range]}: ${totals.messages} ${totals.messages === 1 ? 'message' : 'messages'} across ${totals.chats} ${totals.chats === 1 ? 'chat' : 'chats'}`
                : 'Loading…'}
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => v && setRange(v as Range)}
            aria-label="Time range"
          >
            <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
            <ToggleGroupItem value="all">All time</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <Tile label="Model">
            <span className="truncate font-mono text-lg font-semibold">
              {status?.model ?? settings?.model ?? '…'}
            </span>
            <span className="text-xs text-faint">
              {status?.model ? `Loaded${used != null ? ` · ${used} GB` : ''}` : 'Not loaded right now'}
            </span>
          </Tile>
          <Tile label="GPU memory">
            <span className="text-lg font-semibold">
              {used != null ? used.toFixed(1) : '–'}{' '}
              <span className="text-sm font-medium text-muted-foreground">
                / {total != null ? `${total.toFixed(1)} GB` : 'unknown'}
              </span>
            </span>
            <div
              role="meter"
              aria-label="GPU memory used"
              aria-valuemin={0}
              aria-valuemax={total ?? 0}
              aria-valuenow={used ?? 0}
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${used != null && total ? Math.min(100, (used / total) * 100) : 0}%`,
                  background: colors['chart-a'],
                }}
              />
            </div>
          </Tile>
          <Tile label="Ollama">
            <span className="flex items-center gap-2 text-lg font-semibold">
              {online ? (
                <Check className="size-4 text-ok" strokeWidth={2.4} aria-hidden="true" />
              ) : (
                <CircleOff className="size-4 text-faint" aria-hidden="true" />
              )}
              {online ? 'Running' : 'Offline'}
            </span>
            <span className="font-mono text-xs text-faint">localhost:11434</span>
          </Tile>
          <Tile label="Today">
            <span className="text-lg font-semibold">
              {today ? `${today.messages} ${today.messages === 1 ? 'message' : 'messages'}` : '–'}
            </span>
            <span className="text-xs text-faint">
              {today
                ? `${compact.format(today.input + today.output)} tokens · ${today.chats} ${today.chats === 1 ? 'chat' : 'chats'}`
                : ''}
            </span>
          </Tile>
        </div>

        <div className={cn('flex flex-col gap-3.5 transition-opacity', loading && stats && 'opacity-60')}>
          <div className="flex flex-wrap gap-3.5">
            <ChartCard
              className="min-w-0 flex-[3_1_420px]"
              title="Tokens per day"
              legend={[
                { label: 'Input', color: colors['chart-a'] },
                { label: 'Output', color: colors['chart-b'] },
              ]}
              table={
                <DataTable
                  head={['Day', 'Input', 'Output']}
                  rows={days.map((d) => [d.label, d.input.toLocaleString(), d.output.toLocaleString()])}
                />
              }
            >
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={days} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={colors['chart-grid']} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: colors['chart-grid'] }}
                    tick={{ fill: colors['muted-text'], fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors.faint, fontSize: 11 }}
                    tickFormatter={(v: number) => compact.format(v)}
                    width={52}
                  />
                  <Tooltip
                    cursor={{ fill: colors.raised, opacity: 0.5 }}
                    content={(p) => <ChartTooltip {...p} format={(v) => v.toLocaleString()} />}
                  />
                  <Bar
                    dataKey="input"
                    name="Input"
                    stackId="t"
                    fill={colors['chart-a']}
                    stroke={colors.panel}
                    strokeWidth={2}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="output"
                    name="Output"
                    stackId="t"
                    fill={colors['chart-b']}
                    stroke={colors.panel}
                    strokeWidth={2}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              className="min-w-0 flex-[2_1_300px]"
              title="Generation speed"
              subtitle={
                <>
                  <span className="text-[22px] font-semibold text-foreground">
                    {avgSpeed != null ? avgSpeed.toFixed(1) : '–'}
                  </span>{' '}
                  tok/s average
                  {avgFirst != null && ` · first token in ${(avgFirst / 1000).toFixed(1)} s`}
                </>
              }
              table={
                <DataTable
                  head={['Day', 'tok/s', 'First token']}
                  rows={days.map((d) => [
                    d.label,
                    d.tok_per_s != null ? d.tok_per_s.toFixed(1) : '–',
                    d.first_token_ms != null ? `${(d.first_token_ms / 1000).toFixed(1)} s` : '–',
                  ])}
                />
              }
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={days} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={colors['chart-grid']} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={{ stroke: colors['chart-grid'] }}
                    tick={{ fill: colors['muted-text'], fontSize: 11 }}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors.faint, fontSize: 11 }}
                    width={44}
                    allowDecimals={false}
                    tickCount={4}
                    domain={[
                      (min: number) => Math.max(0, Math.floor(min - 2)),
                      (max: number) => Math.ceil(max + 2),
                    ]}
                  />
                  <Tooltip
                    cursor={{ stroke: colors.faint, strokeWidth: 1 }}
                    content={(p) => <ChartTooltip {...p} format={(v) => `${v.toFixed(1)} tok/s`} line />}
                  />
                  <Line
                    type="monotone"
                    dataKey="tok_per_s"
                    name="Speed"
                    stroke={colors['chart-a']}
                    strokeWidth={2}
                    dot={{ r: 4, fill: colors['chart-a'], stroke: colors.panel, strokeWidth: 2 }}
                    activeDot={{ r: 5, stroke: colors.panel, strokeWidth: 2 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard
            title="Tool calls and approvals"
            legend={[
              { label: 'Approved', color: colors['chart-a'] },
              { label: 'Denied', color: colors['chart-b'] },
            ]}
            table={
              <DataTable
                head={['Tool', 'Approved', 'Denied', 'Approval rate']}
                rows={approvals.map((t) => [t.tool, String(t.allowed), String(t.denied), `${t.pct}%`])}
              />
            }
            footer={
              autoTotal > 0 ? (
                <p className="text-xs text-faint">
                  {autoRuns.map((t, i) => (
                    <span key={t.tool}>
                      {i > 0 && ' and '}
                      <code className="font-mono">{t.tool}</code>
                    </span>
                  ))}{' '}
                  ran {autoTotal} {autoTotal === 1 ? 'time' : 'times'} without asking, as set.
                </p>
              ) : null
            }
          >
            {approvals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No file or command actions in this range yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={approvals.length * 46 + 16}>
                <BarChart
                  layout="vertical"
                  data={approvals}
                  margin={{ top: 0, right: 170, left: 0, bottom: 0 }}
                  barCategoryGap={12}
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="tool"
                    width={120}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: colors['muted-text'], fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}
                  />
                  <Tooltip
                    cursor={{ fill: colors.raised, opacity: 0.5 }}
                    content={(p) => <ChartTooltip {...p} format={(v) => String(v)} />}
                  />
                  <Bar
                    dataKey="allowed"
                    name="Approved"
                    stackId="a"
                    fill={colors['chart-a']}
                    stroke={colors.panel}
                    strokeWidth={2}
                    radius={[4, 0, 0, 4]}
                  />
                  <Bar
                    dataKey="denied"
                    name="Denied"
                    stackId="a"
                    fill={colors['chart-b']}
                    stroke={colors.panel}
                    strokeWidth={2}
                    radius={[0, 4, 4, 0]}
                  >
                    <LabelList dataKey="labelText" position="right" fill={colors['muted-text']} fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </Card>
  )
}

function ChartCard({
  title,
  subtitle,
  legend,
  table,
  footer,
  className,
  children,
}: {
  title: string
  subtitle?: ReactNode
  legend?: { label: string; color: string }[]
  table: ReactNode
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-[18px]', className)}>
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="grow">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {legend?.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="h-7 cursor-pointer px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>
      {asTable ? table : children}
      {footer}
    </section>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn('border-b border-border py-2 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              {r.map((c, j) => (
                <td key={j} className={cn('py-1.5', j > 0 && 'text-right tabular-nums')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
  line: _line,
}: {
  active?: boolean
  // biome-ignore lint: recharts payload entries
  payload?: readonly any[]
  label?: string | number
  format: (v: number) => string
  line?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-0.5 w-3 rounded"
            style={{ background: p.color ?? (p.payload as { fill?: string })?.fill }}
          />
          <span className="font-semibold text-foreground tabular-nums">
            {typeof p.value === 'number' ? format(p.value) : '–'}
          </span>
          <span className="text-muted-foreground">{p.name}</span>
        </div>
      ))}
    </div>
  )
}
