import {
  Anvil, Beer, Bird, Bolt, Cog, Crown, Dices, Dog, Drum, Drumstick, Fish, Flame, Ghost, GlassWater, Glasses,
  Guitar, Ham, Hamburger, Hammer, Martini, Medal, Megaphone, Mic, Music, Pickaxe, Pizza, Popcorn, Rocket, Shield,
  Skull, Smile, Snowflake, Star, Swords, TrainFront, Trophy, Truck, Wheat, Wine, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Profile } from '../lib/types'
import { useSignedUrls } from '../lib/signedUrls'

// Badge tints, tuned to read on the near-black UI.
const TINT = {
  gold: '#cfb991', rust: '#e0875a', amber: '#e2a644', green: '#7cc48a',
  blue: '#7fb0e6', purple: '#b49be6', steel: '#a7adb7', rose: '#e68aa0',
}
type Tint = keyof typeof TINT

/** The avatar badges people pick from. The key is what gets saved in profiles.emoji. */
export const BADGES: { key: string; Icon: LucideIcon; tint: Tint; label: string }[] = [
  { key: 'train', Icon: TrainFront, tint: 'gold', label: 'Train' },
  { key: 'hammer', Icon: Hammer, tint: 'gold', label: 'Hammer' },
  { key: 'anvil', Icon: Anvil, tint: 'steel', label: 'Anvil' },
  { key: 'pickaxe', Icon: Pickaxe, tint: 'steel', label: 'Pickaxe' },
  { key: 'wrench', Icon: Wrench, tint: 'steel', label: 'Wrench' },
  { key: 'cog', Icon: Cog, tint: 'steel', label: 'Gear' },
  { key: 'bolt', Icon: Bolt, tint: 'steel', label: 'Bolt' },
  { key: 'beer', Icon: Beer, tint: 'amber', label: 'Beer' },
  { key: 'glass', Icon: GlassWater, tint: 'amber', label: 'Whiskey' },
  { key: 'martini', Icon: Martini, tint: 'purple', label: 'Martini' },
  { key: 'wine', Icon: Wine, tint: 'rose', label: 'Wine' },
  { key: 'burger', Icon: Hamburger, tint: 'amber', label: 'Burger' },
  { key: 'ham', Icon: Ham, tint: 'rose', label: 'Ham' },
  { key: 'drumstick', Icon: Drumstick, tint: 'rust', label: 'Drumstick' },
  { key: 'pizza', Icon: Pizza, tint: 'rust', label: 'Pizza' },
  { key: 'popcorn', Icon: Popcorn, tint: 'amber', label: 'Popcorn' },
  { key: 'flame', Icon: Flame, tint: 'rust', label: 'Flame' },
  { key: 'truck', Icon: Truck, tint: 'blue', label: 'Truck' },
  { key: 'trophy', Icon: Trophy, tint: 'gold', label: 'Trophy' },
  { key: 'medal', Icon: Medal, tint: 'gold', label: 'Medal' },
  { key: 'crown', Icon: Crown, tint: 'gold', label: 'Crown' },
  { key: 'shield', Icon: Shield, tint: 'blue', label: 'Shield' },
  { key: 'swords', Icon: Swords, tint: 'steel', label: 'Swords' },
  { key: 'megaphone', Icon: Megaphone, tint: 'rust', label: 'Megaphone' },
  { key: 'star', Icon: Star, tint: 'gold', label: 'Star' },
  { key: 'zap', Icon: Zap, tint: 'amber', label: 'Lightning' },
  { key: 'music', Icon: Music, tint: 'purple', label: 'Music' },
  { key: 'drum', Icon: Drum, tint: 'purple', label: 'Drum' },
  { key: 'guitar', Icon: Guitar, tint: 'purple', label: 'Guitar' },
  { key: 'mic', Icon: Mic, tint: 'purple', label: 'Mic' },
  { key: 'dice', Icon: Dices, tint: 'green', label: 'Dice' },
  { key: 'glasses', Icon: Glasses, tint: 'blue', label: 'Shades' },
  { key: 'smile', Icon: Smile, tint: 'green', label: 'Smile' },
  { key: 'skull', Icon: Skull, tint: 'steel', label: 'Skull' },
  { key: 'ghost', Icon: Ghost, tint: 'steel', label: 'Ghost' },
  { key: 'dog', Icon: Dog, tint: 'amber', label: 'Dog' },
  { key: 'bird', Icon: Bird, tint: 'blue', label: 'Bird' },
  { key: 'fish', Icon: Fish, tint: 'blue', label: 'Fish' },
  { key: 'snowflake', Icon: Snowflake, tint: 'blue', label: 'Ice' },
  { key: 'wheat', Icon: Wheat, tint: 'green', label: 'Corn' },
  { key: 'rocket', Icon: Rocket, tint: 'rust', label: 'Rocket' },
]
const BY_KEY = Object.fromEntries(BADGES.map((b) => [b.key, b]))

// Emoji people picked before the badges existed, so everyone's avatar carries over.
const FROM_EMOJI: Record<string, string> = {
  '🚂': 'train', '🔨': 'hammer', '🍺': 'beer', '🌭': 'ham', '🍔': 'burger', '🔥': 'flame', '🏈': 'trophy',
  '🥃': 'glass', '🦬': 'shield', '🐺': 'dog', '🤠': 'smile', '😎': 'glasses', '🍗': 'drumstick', '🧊': 'snowflake',
  '🎺': 'music', '🥁': 'drum', '⚙️': 'cog', '⚙': 'cog', '👑': 'crown', '🌽': 'wheat', '🍕': 'pizza',
}
export const DEFAULT_BADGE = 'train'

/** The badge for a saved profiles.emoji value (a badge key or an old emoji), if there is one. */
export const badgeFor = (value?: string | null) => (value ? BY_KEY[value] ?? BY_KEY[FROM_EMOJI[value] ?? ''] : undefined)

const initials = (name?: string) =>
  (name ?? '?').trim().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
    .slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'

/** A crew member's avatar: their photo, else their badge, else gold initials. */
export function Avatar({ p, size = 32, className = '' }: { p?: Profile | null; size?: number; className?: string }) {
  const url = useSignedUrls(p?.avatar_path ? [p.avatar_path] : [])(p?.avatar_path)
  const style = { width: size, height: size }
  const title = p?.display_name
  if (url) {
    return <img className={`avatar photo ${className}`} style={style} src={url} alt="" title={title} draggable={false} />
  }
  return <Badge value={p?.emoji} name={p?.display_name} size={size} className={className} title={title} />
}

/** A badge on its own (the picker uses this too). Unknown values fall back to initials. */
export function Badge({ value, name, size = 32, className = '', title }: {
  value?: string | null; name?: string; size?: number; className?: string; title?: string
}) {
  const b = badgeFor(value)
  const style = { width: size, height: size, '--tint': TINT[b?.tint ?? 'gold'] } as React.CSSProperties
  return (
    <span className={`avatar ${b ? 'badge-av' : 'initials'} ${className}`} style={style} title={title}>
      {b
        ? <b.Icon size={Math.round(size * 0.52)} strokeWidth={size < 28 ? 2.25 : 1.9} aria-hidden="true" />
        : <span style={{ fontSize: Math.round(size * 0.4) }}>{initials(name)}</span>}
    </span>
  )
}

export const nameOf = (p?: Profile | null) => p?.display_name ?? 'Someone'
