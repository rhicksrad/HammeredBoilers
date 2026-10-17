import type { Game } from './types'

// The crew lives on Indiana time, so every date shows in Eastern no matter where the phone is.
export const TZ = 'America/Indiana/Indianapolis'

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts })
const dayFmt = fmt({ weekday: 'short', month: 'short', day: 'numeric' })
const longDayFmt = fmt({ weekday: 'long', month: 'long', day: 'numeric' })
const timeFmt = fmt({ hour: 'numeric', minute: '2-digit' })
const weekdayFmt = fmt({ weekday: 'short' })
const fullDayFmt = fmt({ dateStyle: 'full' })
const ymdFmt = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })

export const gameDay = (g: Game, long = false) => (long ? longDayFmt : dayFmt).format(new Date(g.kickoff))
export const gameTime = (g: Game) => (g.time_tbd ? 'Time TBA' : timeFmt.format(new Date(g.kickoff)))
export const clock = (iso: string) => timeFmt.format(new Date(iso))
export const ymd = (d: Date) => ymdFmt.format(d) // MM/DD/YYYY in Eastern, good for same-day checks
export const fullDay = (iso: string) => fullDayFmt.format(new Date(iso)) // "Saturday, October 18, 2026"

export function when(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (ymd(d) === ymd(now)) return clock(iso)
  const diffDays = (now.getTime() - d.getTime()) / 86400000
  if (diffDays < 6) return `${weekdayFmt.format(d)} ${clock(iso)}`
  return `${dayFmt.format(d)}, ${clock(iso)}`
}

// A game stays "current" until 6 hours after kickoff (TBA games: until the day is over).
export function gameEnd(g: Game) {
  const k = new Date(g.kickoff).getTime()
  return g.time_tbd ? k + 30 * 3600_000 : k + 6 * 3600_000
}
export const isPast = (g: Game) => g.status === 'final' || gameEnd(g) < Date.now()
export const isGameday = (g: Game) => !isPast(g) && ymd(new Date(g.kickoff)) === ymd(new Date())

export function result(g: Game) {
  if (g.purdue_score == null || g.opp_score == null) return null
  const w = g.purdue_score > g.opp_score ? 'W' : g.purdue_score < g.opp_score ? 'L' : 'T'
  return { w, text: `${w} ${g.purdue_score}–${g.opp_score}` }
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
