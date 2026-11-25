import { groupChats } from './groupChats'

const now = new Date('2026-11-25T12:00:00')
const c = (id: string, updated_at: string, pinned = false) => ({
  id,
  title: id,
  pinned,
  created_at: updated_at,
  updated_at,
})

test('groups by recency with pinned first and empties omitted', () => {
  const g = groupChats(
    [
      c('p', '2026-01-01T00:00:00', true),
      c('t', '2026-11-25T08:00:00'),
      c('y', '2026-11-24T20:00:00'),
      c('w', '2026-11-20T10:00:00'),
      c('o', '2026-10-01T10:00:00'),
    ],
    now,
  )
  expect(g.map((x) => [x.label, x.chats.map((ch) => ch.id)])).toEqual([
    ['Pinned', ['p']],
    ['Today', ['t']],
    ['Yesterday', ['y']],
    ['Last 7 days', ['w']],
    ['Older', ['o']],
  ])
})

test('omits empty groups and sorts newest first', () => {
  const g = groupChats([c('a', '2026-11-25T08:00:00'), c('b', '2026-11-25T10:00:00')], now)
  expect(g).toEqual([{ label: 'Today', chats: [expect.objectContaining({ id: 'b' }), expect.objectContaining({ id: 'a' })] }])
})
