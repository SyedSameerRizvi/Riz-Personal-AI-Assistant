import type { Chat } from './types'

export type GroupLabel = 'Pinned' | 'Today' | 'Yesterday' | 'Last 7 days' | 'Older'

const DAY = 24 * 60 * 60 * 1000

export function groupChats(chats: Chat[], now: Date): { label: GroupLabel; chats: Chat[] }[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const buckets: Record<GroupLabel, Chat[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    Older: [],
  }
  const sorted = [...chats].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )
  for (const chat of sorted) {
    const t = new Date(chat.updated_at).getTime()
    if (chat.pinned) buckets.Pinned.push(chat)
    else if (t >= today) buckets.Today.push(chat)
    else if (t >= today - DAY) buckets.Yesterday.push(chat)
    else if (t >= today - 6 * DAY) buckets['Last 7 days'].push(chat)
    else buckets.Older.push(chat)
  }
  return (Object.keys(buckets) as GroupLabel[])
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, chats: buckets[label] }))
}
