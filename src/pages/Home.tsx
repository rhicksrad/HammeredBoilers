import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Camera, ChevronRight, ClipboardList, MapPin, MessageCircle, Plus, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { lastSync, syncHomeGames } from '../lib/schedule'
import { gameDay, gameTime, isGameday, isPast, result, when } from '../lib/format'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { Game, GameStats } from '../lib/types'
import { Countdown, PURDUE_LOGO, TeamLogo, TempStrip, WeatherChip } from '../components/GameBits'
import { InstallBanner } from '../components/Install'

export default function Home() {
  const [games, setGames] = useState<Game[] | null>(null)
  const [stats, setStats] = useState<Record<string, GameStats>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([
      supabase.from('games').select('*').order('kickoff'),
      supabase.from('game_stats').select('*'),
    ])
    setGames((g.data ?? []) as Game[])
    setStats(Object.fromEntries(((s.data ?? []) as GameStats[]).map((x) => [x.game_id, x])))
  }, [])

  const sync = useCallback(async (force: boolean) => {
    setSyncing(true)
    try {
      const n = await syncHomeGames(force)
      if (n != null) { setSyncMsg(null); await load() }
    } catch (e) {
      setSyncMsg(`Couldn't reach ESPN (${(e as Error).message}). Showing what we've got.`)
    } finally {
      setSyncing(false)
    }
  }, [load])

  useEffect(() => { load().then(() => sync(false)) }, [load, sync])

  useLiveTable<Game>('games', undefined, {
    onUpsert: (g) => setGames((all) => (all ? upsertById(all, g).sort((a, b) => a.kickoff.localeCompare(b.kickoff)) : all)),
    onDelete: (id) => setGames((all) => all?.filter((g) => g.id !== id) ?? all),
  })

  const { next, upcoming, past } = useMemo(() => {
    const list = games ?? []
    const up = list.filter((g) => !isPast(g))
    return { next: up[0], upcoming: up.slice(1), past: list.filter(isPast).reverse() }
  }, [games])

  if (!games) return <div className="loading">Loading the schedule…</div>

  const last = lastSync()
  return (
    <div className="stack-lg">
      <InstallBanner />
      {next ? <Hero game={next} stats={stats[next.id]} /> : (
        <div className="card hero-empty">
          <h2 className="display">No home games on the board</h2>
          <p className="muted">It's the offseason. Hang out in the Playground, or add a game below.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title">Upcoming home games</h2>
          <div className="game-list">
            {upcoming.map((g) => <GameRow key={g.id} game={g} stats={stats[g.id]} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="section-title">Past tailgates</h2>
          <p className="muted small section-sub">Every game keeps its lists, chat, and photos.</p>
          <div className="game-list">
            {past.map((g) => <GameRow key={g.id} game={g} stats={stats[g.id]} />)}
          </div>
        </section>
      )}

      <section className="sync-bar">
        <span className="muted small">
          {syncMsg ?? (last ? `Schedule synced from ESPN ${when(last.toISOString())}` : 'Schedule comes from ESPN')}
        </span>
        <button className="btn ghost sm" disabled={syncing} onClick={() => sync(true)}>
          <RefreshCw size={14} className={syncing ? 'pulse' : ''} aria-hidden="true" />
          {syncing ? 'Syncing…' : 'Refresh schedule'}
        </button>
      </section>

      <AddGame onAdded={load} />
    </div>
  )
}

function Hero({ game, stats }: { game: Game; stats?: GameStats }) {
  const today = isGameday(game)
  return (
    <section className="hero card">
      <div className="hero-kicker">
        {today ? <span className="badge live">Gameday</span> : <span className="badge">Next home tailgate</span>}
        <WeatherChip game={game} />
      </div>
      <div className="matchup">
        <div className="team"><TeamLogo src={PURDUE_LOGO} alt="Purdue" size={84} /><span>Purdue</span></div>
        <div className="vs">vs</div>
        <div className="team"><TeamLogo src={game.opponent_logo} alt={game.opponent} size={84} /><span>{game.opponent}</span></div>
      </div>
      <div className="hero-when">
        <span>{gameDay(game, true)}</span>
        <span className="dot">•</span>
        <span>{gameTime(game)}</span>
        {game.tv && <><span className="dot">•</span><span>{game.tv}</span></>}
      </div>
      {game.lot && <div className="hero-lot"><MapPin size={15} aria-hidden="true" />{game.lot}</div>}
      <TempStrip game={game} />
      <Countdown game={game} />
      {stats && (
        <div className="hero-stats">
          <Stat n={`${stats.food_claimed}/${stats.food_total}`} label="Food covered" ok={stats.food_claimed >= stats.food_total} />
          <Stat n={String(stats.asks_open)} label="Open asks" ok={stats.asks_open === 0} />
          <Stat n={String(stats.message_count)} label="Messages" />
        </div>
      )}
      <Link to={`/game/${game.id}`} className="btn gold big">Open the gameday board<ArrowRight size={18} aria-hidden="true" /></Link>
    </section>
  )
}

function Stat({ n, label, ok }: { n: string; label: string; ok?: boolean }) {
  return (
    <div className={`stat ${ok === true ? 'ok' : ok === false ? 'warn' : ''}`}>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
    </div>
  )
}

function GameRow({ game, stats }: { game: Game; stats?: GameStats }) {
  const r = result(game)
  const past = isPast(game)
  return (
    <Link to={`/game/${game.id}`} className="game-row card">
      <TeamLogo src={game.opponent_logo} alt={game.opponent} size={44} />
      <div className="gr-main">
        <div className="gr-opp">vs {game.opponent}</div>
        <div className="muted small">{gameDay(game)} · {gameTime(game)}{game.tv ? ` · ${game.tv}` : ''}</div>
      </div>
      <div className="gr-meta">
        {r && <span className={`result ${r.w}`}>{r.text}</span>}
        {stats && (
          <span className="gr-stats">
            {past ? <>
              <span title="Messages"><MessageCircle size={13} aria-hidden="true" />{stats.message_count}</span>
              <span title="Photos"><Camera size={13} aria-hidden="true" />{stats.photo_count}</span>
            </> : <>
              <span title="Food covered"><UtensilsCrossed size={13} aria-hidden="true" />{stats.food_claimed}/{stats.food_total}</span>
              <span title="Open asks"><ClipboardList size={13} aria-hidden="true" />{stats.asks_open}</span>
            </>}
          </span>
        )}
      </div>
      <ChevronRight size={18} className="chev" aria-hidden="true" />
    </Link>
  )
}

function AddGame({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [err, setErr] = useState<string | null>(null)

  if (!open) {
    return (
      <button className="btn ghost sm add-game-toggle" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden="true" />Add a game (bowl game, road trip, hoops…)
      </button>
    )
  }
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault()
        // Treat the typed time as Indiana time.
        const local = new Date(`${date}T${time || '12:00'}:00`) // wall time, parsed in the browser's zone
        const browserAhead = -local.getTimezoneOffset()
        const kickoff = new Date(local.getTime() + (browserAhead - tzOffsetMinutes(local)) * 60000)
        const { error } = await supabase.from('games').insert({ opponent: opponent.trim(), kickoff: kickoff.toISOString(), time_tbd: !time })
        if (error) return setErr(error.message)
        setOpen(false); setOpponent(''); setDate(''); setTime(''); onAdded()
      }}
    >
      <h3 className="display">Add a game</h3>
      <div className="grid-3">
        <input className="input" required placeholder="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
        <input className="input" required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} title="Leave blank if TBA" />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button className="btn gold">Add game</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

/** Minutes Indiana is ahead of UTC (negative, e.g. -240) on the given date. */
function tzOffsetMinutes(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Indiana/Indianapolis', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5'
  const m = parts.match(/GMT([+-]\d+)(?::(\d+))?/)
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : -300
}
