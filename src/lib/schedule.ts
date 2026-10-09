import { supabase } from './supabase'

// ESPN's public schedule feed (CORS-open). Purdue's team id is 2509.
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/2509/schedule'
const LAST_SYNC_KEY = 'hb:lastScheduleSync'
const SYNC_EVERY_MS = 3 * 3600_000

type Competitor = {
  homeAway: 'home' | 'away'
  team: { id: string; location?: string; displayName: string; shortDisplayName?: string; logos?: { href: string }[]; logo?: string }
  score?: number | string | { value?: number; displayValue?: string }
}

const scoreOf = (c: Competitor) => {
  const s = c.score
  if (s == null) return null
  const n = typeof s === 'object' ? (s.value ?? Number(s.displayValue)) : Number(s)
  return Number.isFinite(n) ? n : null
}

export function lastSync(): Date | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY)
    return v ? new Date(Number(v)) : null
  } catch {
    return null
  }
}

/** Pulls Purdue's schedule and upserts every home game. Lot/notes typed in by the crew are never touched. */
export async function syncHomeGames(force = false): Promise<number | null> {
  const last = lastSync()
  if (!force && last && Date.now() - last.getTime() < SYNC_EVERY_MS) return null

  const res = await fetch(ESPN)
  if (!res.ok) throw new Error(`ESPN schedule returned ${res.status}`)
  const data = await res.json()

  const rows = (data.events ?? []).flatMap((e: any) => {
    const c = e.competitions?.[0]
    if (!c || c.neutralSite) return []
    const comps: Competitor[] = c.competitors ?? []
    const us = comps.find((x) => x.team?.id === '2509')
    const them = comps.find((x) => x.team?.id !== '2509')
    if (!us || !them || us.homeAway !== 'home') return []
    const state = c.status?.type?.state
    return [{
      espn_id: String(e.id),
      opponent: them.team.location || them.team.shortDisplayName || them.team.displayName,
      opponent_logo: them.team.logos?.[0]?.href ?? them.team.logo ?? null,
      kickoff: e.date,
      time_tbd: c.timeValid === false,
      venue: c.venue?.fullName ?? null,
      tv: c.broadcasts?.map((b: any) => b.media?.shortName).filter(Boolean).join(' / ') || null,
      status: state === 'post' ? 'final' : state === 'in' ? 'in' : 'scheduled',
      purdue_score: scoreOf(us),
      opp_score: scoreOf(them),
    }]
  })

  if (rows.length) {
    const { error } = await supabase.from('games').upsert(rows, { onConflict: 'espn_id' })
    if (error) throw error
  }
  try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())) } catch { /* private mode */ }
  return rows.length
}
