import { ThinkingOrb } from 'thinking-orbs'
import { Logo } from '@/components/Logo'

export type Activity = 'thinking' | 'responding'

/** Riz's avatar: the logo at rest, a live thinking orb while it works. */
export function RizAvatar({ activity }: { activity?: Activity }) {
  if (!activity) return <Logo />
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#0d0d0b] ring-1 ring-[#ff6b1a]/50">
      <ThinkingOrb
        state={activity === 'thinking' ? 'working' : 'composing'}
        size={20}
        theme="dark"
        aria-label={activity === 'thinking' ? 'Riz is thinking' : 'Riz is responding'}
      />
    </span>
  )
}
