import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download, Images } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { gameDay, isGameday, isPast, plural } from '../lib/format'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { Game, Photo } from '../lib/types'
import { byShot, downloadAll, Lightbox, PhotoGrid, Uploader, useBackfillTakenAt } from '../components/Photos'

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

  useBackfillTakenAt(photos)
  // In the order they were taken: one game reads start to finish; everything else shows the newest first.
  const shown = useMemo(() => byShot((photos ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'none' ? !p.game_id : p.game_id === filter), filter === 'all' || filter === 'none'), [photos, filter])

  // Default upload target: the game in view, else today's / the most recent home game.
  const defaultGame = filter !== 'all' && filter !== 'none' ? filter
    : (games.find(isGameday) ?? games.find(isPast) ?? games[games.length - 1])?.id ?? null
  const uploadable = games.filter((g) => new Date(g.kickoff).getTime() < Date.now() + 86400000)

  const zipName = filter === 'all' ? 'hammered-boilers-all.zip'
    : filter === 'none' ? 'hammered-boilers-random.zip'
    : `hammered-boilers-vs-${(gamesById[filter]?.opponent ?? 'game').toLowerCase().replace(/\W+/g, '-')}.zip`

  return (
    <div className="stack-lg">
      <header className="page-head">
        <h1 className="display">Gallery</h1>
        <p className="muted">Everyone's photos and videos from every tailgate, kept at full size.</p>
      </header>

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
          <Download size={16} aria-hidden="true" />
          {zipping ? 'Zipping…' : `Download ${plural(shown.length, 'file')}`}
        </button>
      </div>

      {photos === null ? <div className="loading">Loading pics…</div>
        : shown.length ? <PhotoGrid photos={shown} games={gamesById} onOpen={setOpen} />
        : <div className="card empty"><Images size={26} aria-hidden="true" />Nothing here yet. Add the first photo above.</div>}

      {open != null && (
        <Lightbox photos={shown} index={open} games={gamesById} onClose={() => setOpen(null)} onIndex={setOpen}
          onDeleted={(id) => { setPhotos((cur) => cur?.filter((x) => x.id !== id) ?? cur); setOpen(null) }} />
      )}
    </div>
  )
}
