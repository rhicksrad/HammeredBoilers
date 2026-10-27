import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Camera, ChevronRight, Heart, Headphones, MessageCircle, Trophy, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { gameDay, isPast, plural, result } from '../lib/format'
import { usePlaylist } from '../lib/playlist'
import { useSignedUrls } from '../lib/signedUrls'
import type { Game, ListItem, Photo, Profile, Rsvp, SongScore } from '../lib/types'
import { useAuth } from '../auth'
import { Avatar, nameOf } from '../components/Avatar'
import { TeamLogo } from '../components/GameBits'
import { headcount } from '../components/Rsvp'

type Pic = Pick<Photo, 'id' | 'game_id' | 'uploader_id' | 'mime' | 'path' | 'thumb_path' | 'content_hash' | 'created_at'>
type Food = Pick<ListItem, 'id' | 'game_id' | 'label' | 'rating_sum' | 'rating_count'>
type Data = {
  games: Game[]
  pics: Pic[]
  posts: { game_id: string | null; author_id: string }[]
  rsvps: Rsvp[]
  food: Food[]
  songs: SongScore[]
  loves: Record<string, number> // photo id → reactions + comments
}

// A football season runs August into January, so a January bowl game counts for the year before.
const seasonOf = (g: Game) => {
  const d = new Date(g.kickoff)
  return d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear()
}
const avg = (sum: number, n: number) => (n ? sum / n : 0)
const tally = <T,>(rows: T[], key: (r: T) => string | null | undefined) => {
  const out: Record<string, number> = {}
  for (const r of rows) { const k = key(r); if (k) out[k] = (out[k] ?? 0) + 1 }
  return out
}
const leader = (counts: Record<string, number>) =>
  Object.entries(counts).sort((a, b) => b[1] - a[1])[0] as [string, number] | undefined

async function loadAll(): Promise<Data> {
  const [g, p, m, r, f, s, re, c] = await Promise.all([
    supabase.from('games').select('*').order('kickoff'),
    supabase.from('photos').select('id, game_id, uploader_id, mime, path, thumb_path, content_hash, created_at'),
    supabase.from('messages').select('game_id, author_id'),
    supabase.from('rsvps').select('*'),
    supabase.from('list_items').select('id, game_id, label, rating_sum, rating_count').eq('kind', 'food').gt('rating_count', 0),
    supabase.from('song_scores').select('*').gt('rating_count', 0),
    supabase.from('reactions').select('target_id').eq('target_type', 'photo'),
    supabase.from('photo_comments').select('photo_id'),
  ])
  if (g.error) throw g.error
  const loves: Record<string, number> = {}
  for (const x of (re.data ?? []) as { target_id: string }[]) loves[x.target_id] = (loves[x.target_id] ?? 0) + 1
  for (const x of (c.data ?? []) as { photo_id: string }[]) loves[x.photo_id] = (loves[x.photo_id] ?? 0) + 1
  return {
    games: (g.data ?? []) as Game[],
    pics: (p.data ?? []) as Pic[],
    posts: (m.data ?? []) as Data['posts'],
    rsvps: (r.data ?? []) as Rsvp[], // empty until the RSVP migration has run
    food: (f.data ?? []) as Food[],
    songs: (s.data ?? []) as SongScore[],
    loves,
  }
}

/** Everything the recap shows for one season. */
function recap(d: Data, season: number) {
  const games = d.games.filter((g) => seasonOf(g) === season)
  const ids = new Set(games.map((g) => g.id))
  const played = games.filter(isPast)
  const results = played.map(result).filter(Boolean) as NonNullable<ReturnType<typeof result>>[]
  const wins = results.filter((r) => r.w === 'W').length
  const losses = results.filter((r) => r.w === 'L').length
  const ties = results.length - wins - losses

  // The same pic added by more than one person counts once.
  const seen = new Set<string>()
  const pics = d.pics.filter((p) => {
    if (!p.game_id || !ids.has(p.game_id)) return false
    const k = p.content_hash ?? p.id
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const posts = d.posts.filter((m) => m.game_id && ids.has(m.game_id))
  const rsvps = d.rsvps.filter((r) => ids.has(r.game_id))

  const perGame = games.map((g) => ({
    game: g,
    pics: pics.filter((p) => p.game_id === g.id).length,
    posts: posts.filter((m) => m.game_id === g.id).length,
    crowd: rsvps.some((r) => r.game_id === g.id) ? headcount(rsvps.filter((r) => r.game_id === g.id)) : null,
  }))
  const crowds = perGame.filter((x) => x.crowd != null && isPast(x.game))
  const biggest = crowds.sort((a, b) => (b.crowd ?? 0) - (a.crowd ?? 0))[0]

  const playedIds = new Set(played.map((g) => g.id))
  const lovedPic = pics
    .filter((p) => (d.loves[p.id] ?? 0) > 0 && (p.thumb_path || !p.mime.startsWith('video/')))
    .sort((a, b) => (d.loves[b.id] ?? 0) - (d.loves[a.id] ?? 0) || b.created_at.localeCompare(a.created_at))[0]

  return {
    games, played, wins, losses, ties, pics, posts, perGame, biggest, lovedPic,
    loves: lovedPic ? d.loves[lovedPic.id] : 0,
    videos: pics.filter((p) => p.mime.startsWith('video/')).length,
    shooter: leader(tally(pics, (p) => p.uploader_id)),
    talker: leader(tally(posts, (m) => m.author_id)),
    regular: leader(tally(rsvps.filter((r) => r.status === 'yes' && playedIds.has(r.game_id)), (r) => r.user_id)),
    food: d.food.filter((f) => ids.has(f.game_id))
      .sort((a, b) => avg(b.rating_sum ?? 0, b.rating_count ?? 0) - avg(a.rating_sum ?? 0, a.rating_count ?? 0)
        || (b.rating_count ?? 0) - (a.rating_count ?? 0))
      .slice(0, 5),
  }
}

export default function Season() {
  const { profiles } = useAuth()
  const playlist = usePlaylist()
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pick, setPick] = useState<number | null>(null)

  useEffect(() => { loadAll().then(setData, (e) => setErr((e as Error).message)) }, [])

  const seasons = useMemo(() => [...new Set((data?.games ?? []).map(seasonOf))].sort((a, b) => b - a), [data])
  const season = pick ?? seasons[0]
  const r = useMemo(() => (data && season != null ? recap(data, season) : null), [data, season])

  // Songs aren't tied to a game, so they're the crew's all-time favorites from the playlist.
  const topSongs = useMemo(() => {
    if (!data || !playlist) return []
    const byKey = Object.fromEntries(playlist.tracks.map((t) => [t.key, t]))
    return data.songs.filter((s) => byKey[s.id])
      .sort((a, b) => avg(b.rating_sum, b.rating_count) - avg(a.rating_sum, a.rating_count) || b.rating_count - a.rating_count)
      .slice(0, 5)
      .map((s) => ({ ...s, track: byKey[s.id] }))
  }, [data, playlist])

  if (err) return <div className="card">Couldn't load the season: {err}</div>
  if (!data || !r) return <div className="loading">Adding up the season…</div>
  if (!r.games.length) return <div className="card">No games on the board yet. <Link to="/">Back to Gameday</Link></div>

  const record = `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}`
  return (
    <div className="stack-lg season">
      <Link to="/" className="back"><ArrowLeft size={16} aria-hidden="true" />All games</Link>

      <section className="card season-head">
        <div className="panel-head">
          <h1 className="display"><Trophy size={26} aria-hidden="true" />{season} season</h1>
          {seasons.length > 1 && (
            <div className="seg" role="group" aria-label="Season">
              {seasons.map((y) => (
                <button key={y} className={y === season ? 'on' : ''} aria-pressed={y === season} onClick={() => setPick(y)}>{y}</button>
              ))}
            </div>
          )}
        </div>
        <p className="muted small">
          {r.played.length} of {plural(r.games.length, 'home tailgate')} in the books.
        </p>
        <div className="season-stats">
          <Tile n={r.played.length ? record : '–'} label="Home record" />
          <Tile n={String(r.pics.length)} label={r.videos ? `Pics (${r.videos} video${r.videos === 1 ? '' : 's'})` : 'Pics'} />
          <Tile n={String(r.posts.length)} label="Messages" />
          <Tile n={r.biggest ? String(r.biggest.crowd) : '–'} label={r.biggest ? `Biggest crowd (${r.biggest.game.opponent})` : 'Biggest crowd'} />
        </div>
      </section>

      <section>
        <h2 className="section-title">Game by game</h2>
        <div className="game-list">
          {r.perGame.map(({ game, pics, posts, crowd }) => {
            const res = result(game)
            return (
              <Link key={game.id} to={`/game/${game.id}`} className="game-row card">
                <TeamLogo src={game.opponent_logo} alt={game.opponent} size={40} />
                <div className="gr-main">
                  <div className="gr-opp">vs {game.opponent}</div>
                  <div className="muted small">{gameDay(game)}</div>
                </div>
                <div className="gr-meta">
                  {res ? <span className={`result ${res.w}`}>{res.text}</span> : !isPast(game) && <span className="muted small">Coming up</span>}
                  <span className="gr-stats">
                    {crowd != null && <span title="Headcount"><Users size={13} aria-hidden="true" />{crowd}</span>}
                    <span title="Pics"><Camera size={13} aria-hidden="true" />{pics}</span>
                    <span title="Messages"><MessageCircle size={13} aria-hidden="true" />{posts}</span>
                  </span>
                </div>
                <ChevronRight size={18} className="chev" aria-hidden="true" />
              </Link>
            )
          })}
        </div>
      </section>

      {(r.shooter || r.talker || r.regular || r.lovedPic) && (
        <section>
          <h2 className="section-title">Crew awards</h2>
          <div className="awards">
            {r.shooter && <Award Icon={Camera} title="Most pics" who={profiles[r.shooter[0]]} what={plural(r.shooter[1], 'pic')} />}
            {r.talker && <Award Icon={MessageCircle} title="Most chat" who={profiles[r.talker[0]]} what={plural(r.talker[1], 'message')} />}
            {r.regular && <Award Icon={Users} title="Never misses" who={profiles[r.regular[0]]} what={`at ${plural(r.regular[1], 'tailgate')}`} />}
            {r.lovedPic && <LovedPic pic={r.lovedPic} loves={r.loves} who={profiles[r.lovedPic.uploader_id]} game={r.games.find((g) => g.id === r.lovedPic!.game_id)} />}
          </div>
        </section>
      )}

      {(r.food.length > 0 || topSongs.length > 0) && (
        <div className="grid-2 season-best">
          {r.food.length > 0 && (
            <section className="card panel">
              <h3 className="display panel-title"><UtensilsCrossed size={20} aria-hidden="true" />Best of the spread</h3>
              <ol className="best-list">
                {r.food.map((f) => (
                  <li key={f.id}>
                    <span className="best-name">{f.label}<span className="muted small"> · vs {r.games.find((g) => g.id === f.game_id)?.opponent}</span></span>
                    <Score sum={f.rating_sum ?? 0} n={f.rating_count ?? 0} />
                  </li>
                ))}
              </ol>
            </section>
          )}
          {topSongs.length > 0 && (
            <section className="card panel">
              <h3 className="display panel-title"><Headphones size={20} aria-hidden="true" />Crew's top songs</h3>
              <ol className="best-list">
                {topSongs.map((s) => (
                  <li key={s.id}>
                    <span className="best-name">{s.track.title}<span className="muted small"> · {s.track.artists.join(', ')}</span></span>
                    <Score sum={s.rating_sum} n={s.rating_count} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Tile({ n, label }: { n: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
    </div>
  )
}

function Award({ Icon, title, who, what }: { Icon: LucideIcon; title: string; who?: Profile; what: string }) {
  return (
    <div className="card award">
      <span className="award-title"><Icon size={14} aria-hidden="true" />{title}</span>
      <span className="award-who"><Avatar p={who} size={36} /><span><b>{nameOf(who)}</b><span className="muted small">{what}</span></span></span>
    </div>
  )
}

function LovedPic({ pic, loves, who, game }: { pic: Pic; loves: number; who?: Profile; game?: Game }) {
  const src = useSignedUrls([pic.thumb_path ?? pic.path])(pic.thumb_path ?? pic.path)
  return (
    <Link to={`/gallery?photo=${pic.id}`} className="card award loved">
      <span className="award-title"><Heart size={14} aria-hidden="true" />Most-loved pic</span>
      <span className="loved-img">{src && <img src={src} alt="" loading="lazy" decoding="async" />}</span>
      <span className="muted small">
        {nameOf(who)}{game ? ` · vs ${game.opponent}` : ''} · {loves} reacts &amp; comments
      </span>
    </Link>
  )
}

function Score({ sum, n }: { sum: number; n: number }) {
  return <span className="best-score" title={plural(n, 'rating')}><b>{avg(sum, n).toFixed(1)}</b><span className="muted small">/10</span></span>
}
