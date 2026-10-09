import type { Profile } from '../lib/types'

export const EMOJIS = ['🚂', '🔨', '🍺', '🌭', '🍔', '🔥', '🏈', '🥃', '🦬', '🐺', '🤠', '😎', '🍗', '🧊', '🎺', '🥁', '⚙️', '👑', '🌽', '🍕']

export function Avatar({ p, size = 32 }: { p?: Profile | null; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.55 }} title={p?.display_name}>
      {p?.emoji ?? '❔'}
    </span>
  )
}

export const nameOf = (p?: Profile | null) => p?.display_name ?? 'Someone'
