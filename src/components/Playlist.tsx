import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, ListMusic, Search, Star, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLiveTable } from '../lib/realtime'
import { useAuth } from '../auth'
import { PLAYLIST_EMBED, PLAYLIST_URL, matches, trackUrl } from '../lib/playlist'
import type { PlaylistData, PlaylistTrack, SongScore } from '../lib/types'

const SHOWN = 20     // songs listed before "Show all"
const GENRE_ROWS = 7 // genres charted by name; the rest fold into Other
const OTHER = 'Other'

/** The crew playlist: plays it, charts its genres, and lets everyone rate its songs 1–10, best first. */
export default function Playlist({ data }: { data: PlaylistData }) {
  const { me } = useAuth()
  const [scores, setScores] = useState<Record<string, SongScore> | null>(null) // null: ratings not set up yet
  const [myScores, setMyScores] = useState<Record<string, number>>({})         // song key → my rating (only mine is readable)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    supabase.from('song_scores').select('*').then(({ data: rows, error }) => {
      // Before the ratings schema is applied the table doesn't exist: just hide the ratings.
      setScores(error ? null : Object.fromEntries(((rows ?? []) as SongScore[]).map((r) => [r.id, r])))
    })
    supabase.from('song_ratings').select('song_id, score')
      .then(({ data: rows }) => setMyScores(Object.fromEntries((rows ?? []).map((r) => [r.song_id, r.score]))))
  }, [])
  useEffect(load, [load])

  useLiveTable<SongScore>('song_scores', undefined, {
    onUpsert: (row) => setScores((cur) => (cur ? { ...cur, [row.id]: row } : cur)),
    onResync: load,
  }, scores !== null)

  // Anonymous 1–10 rating; null clears mine. The database keeps the totals and sends them to everyone live;
  // adjust them here too so the change shows straight away.
  const rate = async (key: string, score: number | null) => {
    const prev = myScores[key] as number | undefined
    if (score === (prev ?? null) || !me) return
    setMyScores((cur) => {
      const next = { ...cur }
      if (score === null) delete next[key]
      else next[key] = score
      return next
    })
    setScores((cur) => {
      if (!cur) return cur
      const s = cur[key] ?? { id: key, rating_sum: 0, rating_count: 0 }
      return { ...cur, [key]: {
        id: key,
        rating_sum: s.rating_sum - (prev ?? 0) + (score ?? 0),
        rating_count: s.rating_count - (prev === undefined ? 0 : 1) + (score === null ? 0 : 1),
      } }
    })
    const { error } = score === null
      ? await supabase.from('song_ratings').delete().eq('song_id', key).eq('user_id', me.id)
      : await supabase.from('song_ratings').upsert({ song_id: key, user_id: me.id, score }, { onConflict: 'song_id,user_id' })
    setErr(error?.message ?? null)
    if (error) load()
  }

  const genres = useMemo(() => genreBreakdown(data.tracks), [data.tracks])
  const named = useMemo(() => new Set(genres.filter((g) => g.name !== OTHER).map((g) => g.name)), [genres])
  const genreOf = (t: PlaylistTrack) => (t.genre && named.has(t.genre) ? t.genre : OTHER)

  // Best average first, then most ratings; unrated songs keep the playlist's own order at the bottom.
  const ranked = useMemo(() => {
    const rows = data.tracks.map((t, i) => {
      const s = scores?.[t.key]
      return { t, i, count: s?.rating_count ?? 0, avg: s && s.rating_count > 0 ? s.rating_sum / s.rating_count : null }
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.count - a.count || a.i - b.i)
    return rows.map((r, n) => ({ ...r, rank: r.avg !== null ? n + 1 : null }))
  }, [data.tracks, scores])

  const filtered = ranked.filter(({ t }) => (!genre || genreOf(t) === genre) && (!query.trim() || matches(t, query)))
  const narrowed = Boolean(genre || query.trim())
  const shown = showAll || narrowed ? filtered : filtered.slice(0, SHOWN)
  const rated = ranked.filter((r) => r.avg !== null).length

  return (
    <section className="playlist card">
      <header className="dj-head">
        <div className="stack-sm">
          <h3 className="display"><ListMusic size={20} aria-hidden="true" />{data.name}</h3>
          <div className="muted small">
            {data.tracks.length} songs from {data.owner}.{' '}
            {scores ? 'Rate any song 1–10. Ratings are anonymous; everyone sees the average.' : 'Search it, or see what kind of music is on it.'}
          </div>
        </div>
        <a className="btn sm" href={PLAYLIST_URL} target="_blank" rel="noopener noreferrer">
          Open in Spotify<ExternalLink size={14} aria-hidden="true" />
        </a>
      </header>

      <div className="pl-grid">
        <div className="stack">
          <iframe
            className="pl-embed"
            title={`${data.name} on Spotify`}
            src={PLAYLIST_EMBED}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          />
          <GenreChart genres={genres} total={data.tracks.length} active={genre}
            onPick={(g) => { setGenre((cur) => (cur === g ? null : g)); setShowAll(false) }} />
        </div>

        <div className="stack">
          <div className="pl-search">
            <Search size={16} aria-hidden="true" />
            <input className="input" type="search" placeholder="Search songs, artists, albums, genres" value={query}
              aria-label="Search the playlist" onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="row wrap pl-status">
            <h4 className="dj-sub">
              {narrowed ? `${filtered.length} of ${data.tracks.length} songs` : scores ? (rated ? 'Top rated' : 'No ratings yet') : 'Songs'}
            </h4>
            {genre && (
              <button className="chip pl-filter" onClick={() => setGenre(null)} aria-label={`Clear the ${genre} filter`}>
                {genre}<X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
          {err && <p className="error">{err}</p>}
          {shown.length
            ? <ol className="items pl-list">
                {shown.map(({ t, avg, count, rank }) => (
                  <SongRow key={t.key} t={t} rank={rank} avg={avg} count={count} ratingsOn={scores !== null}
                    myScore={myScores[t.key]} rate={rate} />
                ))}
              </ol>
            : <div className="empty">No songs match.</div>}
          {!narrowed && !showAll && filtered.length > SHOWN && (
            <button className="btn sm pl-more" onClick={() => setShowAll(true)}>Show all {filtered.length} songs</button>
          )}
          <p className="muted small">Song list as of {new Date(`${data.pulled}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Genres from Deezer.</p>
        </div>
      </div>
    </section>
  )
}

type Genre = { name: string; count: number }

/** Songs per genre, biggest first. Small genres and songs with no genre fold into Other, which goes last. */
function genreBreakdown(tracks: PlaylistTrack[]): Genre[] {
  const counts = new Map<string, number>()
  for (const t of tracks) if (t.genre) counts.set(t.genre, (counts.get(t.genre) ?? 0) + 1)
  const sorted = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const top = sorted.slice(0, GENRE_ROWS)
  const other = tracks.length - top.reduce((n, g) => n + g.count, 0)
  return other ? [...top, { name: OTHER, count: other }] : top
}

/** Ranked bars, one per genre. Tap one to show just those songs. */
function GenreChart({ genres, total, active, onPick }: {
  genres: Genre[]; total: number; active: string | null; onPick: (g: string) => void
}) {
  const max = Math.max(...genres.map((g) => g.count))
  return (
    <div className="genres">
      <h4 className="dj-sub">What's on it</h4>
      <ul className="genre-list">
        {genres.map((g) => {
          const pct = Math.round((g.count / total) * 100)
          return (
            <li key={g.name}>
              <button className={`genre-row ${active === g.name ? 'on' : active ? 'off' : ''}`} aria-pressed={active === g.name}
                title={`${g.name}: ${g.count} song${g.count === 1 ? '' : 's'} (${pct}%)${g.name === OTHER ? ', smaller genres and songs with no genre' : ''}`}
                onClick={() => onPick(g.name)}>
                <span className="genre-name">{g.name}</span>
                <span className="genre-track"><span className={`genre-bar ${g.name === OTHER ? 'other' : ''}`} style={{ width: `${(g.count / max) * 100}%` }} /></span>
                <span className="genre-val">{g.count}<span className="genre-pct">{pct}%</span></span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SongRow({ t, rank, avg, count, ratingsOn, myScore, rate }: {
  t: PlaylistTrack; rank: number | null; avg: number | null; count: number; ratingsOn: boolean
  myScore?: number; rate: (key: string, score: number | null) => void
}) {
  const url = trackUrl(t)
  return (
    <li className="item pl-song">
      <span className="pl-rank" aria-label={rank ? `Number ${rank}` : undefined}>{rank ?? ''}</span>
      <div className="item-main">
        <div className="item-label">
          {url ? <a className="pl-title" href={url} target="_blank" rel="noopener noreferrer">{t.title}</a> : t.title}
        </div>
        <div className="item-sub">
          <span className="muted">{t.artists.length ? t.artists.join(', ') : 'Local file'}</span>
          {t.genre && <span className="pl-genre">{t.genre}</span>}
          {ratingsOn && (
            <span className="rating">
              {avg !== null && (
                <span className="rating-avg" title={`Average of ${count} anonymous rating${count === 1 ? '' : 's'}`}>
                  <Star size={13} aria-hidden="true" />{avg.toFixed(1)}<span className="rating-count">({count})</span>
                </span>
              )}
              <select
                className={`who-pick rate-pick ${myScore ? 'set' : ''}`}
                value={myScore ?? ''}
                title="Your rating is anonymous: the crew only sees the average"
                aria-label={`Rate ${t.title}, 1 to 10`}
                onChange={(e) => rate(t.key, e.target.value === 'clear' || e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Rate it</option>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{myScore === n ? `You: ${n}/10` : `${n}/10`}</option>)}
                {myScore && <option value="clear">Clear my rating</option>}
              </select>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
