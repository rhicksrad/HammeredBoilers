import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { gameDay, isGameday, isPast, plural } from '../lib/format'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { Game, Photo } from '../lib/types'
import { downloadAll, Lightbox, PhotoGrid, Uploader } from '../components/Photos'

export default function Gallery() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('game') ?? 'all' // 'all' | 'none' | <game id>
  const [games, setGames] = useState<Game[]>([])
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [zipping, setZipping] = useState(false)

  useEffect(() => {
    supabase.from('games').select('*').order('kickoff', { ascending: false }).then(({ data }) => setGames((data ?? []) as Game[]))
    supabase.from('photos').select('*').order('created_at', { ascending: false }).then(({ data }) => setPhotos((data ?? []) as Photo[]))
  }, [])

  useLiveTable<Photo>('photos', undefined, {
    onUpsert: (p) => setPhotos((cur) => cur && (cur.some((x) => x.id === p.id) ? upsertById(cur, p) : [p, ...cur])),
    onDelete: (id) => setPhotos((cur) => cur?.filter((x) => x.id !== id) ?? cur),
  })

  const gamesById = useMemo(() => Object.fromEntries(games.map((g) => [g.id, g])), [games])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    photos?.forEach((p) => { const k = p.game_id ?? 'none'; c[k] = (c[k] ?? 0) + 1 })
    return c
  }, [photos])

  const shown = useMemo(() => (photos ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'none' ? !p.game_id : p.game_id === filter), [photos, filter])

  // Default upload target: the game in view, else today's / the most recent home game.
  const defaultGame = filter !== 'all' && filter !== 'none' ? filter
    : (games.find(isGameday) ?? games.find(isPast) ?? games[games.length - 1])?.id ?? null
  const uploadable = games.filter((g) => new Date(g.kickoff).getTime() < Date.now() + 86400000)

  const zipName = filter === 'all' ? 'hammered-boilers-all.zip'
    : filter === 'none' ? 'hammered-boilers-random.zip'
    : `hammered-boilers-vs-${(gamesById[filter]?.opponent ?? 'game').toLowerCase().replace(/\W+/g, '-')}.zip`

  return (
    <div className="stack-lg">
      <section className="card">
        <h1 className="display">📸 Gallery</h1>
        <p className="muted">Everybody's pics from every tailgate. Originals are kept full-size, so download what you want.</p>
      </section>

      <Uploader games={uploadable.length ? uploadable : games} defaultGameId={defaultGame}
        onUploaded={(p) => setPhotos((cur) => cur && (cur.some((x) => x.id === p.id) ? cur : [p, ...cur]))} />

      <div className="filter-bar">
        <select className="input" value={filter} onChange={(e) => {
          const v = e.target.value
          setParams(v === 'all' ? {} : { game: v })
        }}>
          <option value="all">All games ({photos?.length ?? 0})</option>
          {games.filter((g) => counts[g.id]).map((g) => (
            <option key={g.id} value={g.id}>vs {g.opponent} · {gameDay(g)} ({counts[g.id]})</option>
          ))}
          {counts.none ? <option value="none">No game ({counts.none})</option> : null}
          {filter !== 'all' && filter !== 'none' && !counts[filter] && gamesById[filter] &&
            <option value={filter}>vs {gamesById[filter].opponent} (0)</option>}
        </select>
        <button className="btn ghost" disabled={!shown.length || zipping}
          onClick={async () => { setZipping(true); try { await downloadAll(shown, gamesById, zipName) } finally { setZipping(false) } }}>
          {zipping ? 'Zipping…' : `⬇ Download ${plural(shown.length, 'file')}`}
        </button>
      </div>

      {photos === null ? <div className="loading">Loading pics…</div>
        : shown.length ? <PhotoGrid photos={shown} games={gamesById} onOpen={setOpen} />
        : <div className="card muted">Nothing here yet. Be the first.</div>}

      {open != null && (
        <Lightbox photos={shown} index={open} games={gamesById} onClose={() => setOpen(null)} onIndex={setOpen}
          onDeleted={(id) => { setPhotos((cur) => cur?.filter((x) => x.id !== id) ?? cur); setOpen(null) }} />
      )}
    </div>
  )
}
