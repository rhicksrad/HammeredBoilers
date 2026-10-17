import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Download, HardDrive, Images } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { gameDay, isGameday, isPast, plural } from '../lib/format'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { Game, Photo } from '../lib/types'
import { storageUsage, type Usage } from '../lib/storage'
import { byShot, downloadAll, Lightbox, PhotoGrid, stackDupes, Uploader, useBackfillTakenAt, useStackKeys } from '../components/Photos'

export default function Gallery() {
  const [params, setParams] = useSearchParams()
  const filter = params.get('game') ?? 'all' // 'all' | 'none' | <game id>
  const [games, setGames] = useState<Game[]>([])
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  // By id, not position: a new upload landing at the front of the grid shouldn't swap what's on screen.
  const [openId, setOpenId] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)
  const [usage, setUsage] = useState<Usage | null>(null)

  const loadPhotos = useCallback(() => {
    supabase.from('photos').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => setPhotos((cur) => (error && cur ? cur : (data ?? []) as Photo[])))
  }, [])
  useEffect(() => {
    supabase.from('games').select('*').order('kickoff', { ascending: false }).then(({ data }) => setGames((data ?? []) as Game[]))
    loadPhotos()
  }, [loadPhotos])

  useLiveTable<Photo>('photos', undefined, {
    onUpsert: (p) => setPhotos((cur) => cur && (cur.some((x) => x.id === p.id) ? upsertById(cur, p) : [p, ...cur])),
    onDelete: (id) => setPhotos((cur) => cur?.filter((x) => x.id !== id) ?? cur),
    onResync: loadPhotos,
  })

  const gamesById = useMemo(() => Object.fromEntries(games.map((g) => [g.id, g])), [games])
  const stackKey = useStackKeys(photos)
  // Counted the way they show: the same pic added by two people is one.
  const counts = useMemo(() => {
    const seen: Record<string, Set<string>> = {}
    photos?.forEach((p) => { const k = p.game_id ?? 'none'; (seen[k] ??= new Set()).add(stackKey(p) ?? p.id) })
    return Object.fromEntries(Object.entries(seen).map(([k, s]) => [k, s.size]))
  }, [photos, stackKey])
  const total = useMemo(() => new Set(photos?.map((p) => stackKey(p) ?? p.id)).size, [photos, stackKey])

  // Re-check storage whenever the number of files changes (an upload or delete, here or from someone else).
  const fileCount = photos?.length
  useEffect(() => {
    if (fileCount === undefined) return
    const t = setTimeout(() => { storageUsage().then(setUsage, () => {}) }, 1500)
    return () => clearTimeout(t)
  }, [fileCount])

  useBackfillTakenAt(photos)
  // In the order they were taken: one game reads start to finish; everything else shows the newest first.
  // Duplicates (the same pic from more than one person) stack into one tile.
  const shown = useMemo(() => stackDupes(byShot((photos ?? []).filter((p) =>
    filter === 'all' ? true : filter === 'none' ? !p.game_id : p.game_id === filter), gamesById, filter === 'all' || filter === 'none'), stackKey),
  [photos, gamesById, filter, stackKey])
  const open = openId ? shown.findIndex((p) => p.id === openId) : -1

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

      {usage && <StorageMeter usage={usage} />}

      <Uploader games={uploadable.length ? uploadable : games} defaultGameId={defaultGame}
        onUploaded={(p) => setPhotos((cur) => cur && (cur.some((x) => x.id === p.id) ? cur : [p, ...cur]))} />

      <div className="filter-bar">
        <select className="input" value={filter} onChange={(e) => {
          const v = e.target.value
          setParams(v === 'all' ? {} : { game: v })
        }}>
          <option value="all">All games ({total})</option>
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
        : shown.length ? <PhotoGrid photos={shown} games={gamesById} onOpen={(i) => setOpenId(shown[i].id)} />
        : <div className="card empty"><Images size={26} aria-hidden="true" />Nothing here yet. Add the first photo above.</div>}

      {open >= 0 && (
        <Lightbox photos={shown} index={open} games={gamesById} onClose={() => setOpenId(null)} onIndex={(i) => setOpenId(shown[i].id)}
          onDeleted={(id) => { setPhotos((cur) => cur?.filter((x) => x.id !== id) ?? cur); setOpenId(null) }} />
      )}
    </div>
  )
}

function gb(bytes: number) {
  const g = bytes / 1024 ** 3
  return g >= 10 ? `${Math.round(g)} GB` : g >= 1 ? `${g.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

function StorageMeter({ usage }: { usage: Usage }) {
  return (
    <div className="storage-meter">
      <span><HardDrive size={14} aria-hidden="true" /> Storage</span>
      <span className="muted">{gb(usage.bytes)} used</span>
    </div>
  )
}
