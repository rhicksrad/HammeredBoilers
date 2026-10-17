import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadZip } from 'client-zip'
import { ChevronLeft, ChevronRight, Download, ImagePlus, Play, Trash2, X } from 'lucide-react'
import { BUCKET, supabase } from '../lib/supabase'
import { useSignedUrls } from '../lib/signedUrls'
import { extOf, makeThumb, saveAs } from '../lib/images'
import { gameDay, when } from '../lib/format'
import type { Game, Photo } from '../lib/types'
import { useAuth } from '../auth'
import { Avatar, nameOf } from './Avatar'

export const isVideo = (p: Photo) => p.mime.startsWith('video/')
const fileName = (p: Photo, game?: Game) => {
  const ext = p.path.split('.').pop()
  const stamp = p.created_at.slice(0, 19).replace(/[T:]/g, '-')
  return `${game ? `purdue-vs-${game.opponent.toLowerCase().replace(/\W+/g, '-')}` : 'tailgate'}-${stamp}-${p.id.slice(0, 4)}.${ext}`
}

export function PhotoGrid({ photos, games, onOpen }: { photos: Photo[]; games: Record<string, Game>; onOpen: (i: number) => void }) {
  const url = useSignedUrls(photos.map((p) => p.thumb_path ?? p.path))
  return (
    <div className="photo-grid">
      {photos.map((p, i) => {
        const src = url(p.thumb_path ?? p.path)
        return (
          <button key={p.id} className="photo-tile" onClick={() => onOpen(i)} title={p.caption ?? ''}>
            {src && (isVideo(p) && !p.thumb_path
              ? <video src={`${src}#t=0.1`} muted preload="metadata" playsInline />
              : <img src={src} alt={p.caption ?? ''} loading="lazy" />)}
            {isVideo(p) && <span className="play"><span><Play size={18} fill="currentColor" aria-hidden="true" /></span></span>}
            {p.game_id && games[p.game_id] && <span className="tile-tag">{games[p.game_id].opponent}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Lightbox({ photos, index, games, onClose, onIndex, onDeleted }: {
  photos: Photo[]; index: number; games: Record<string, Game>
  onClose: () => void; onIndex: (i: number) => void; onDeleted: (id: string) => void
}) {
  const { me, profiles } = useAuth()
  const p = photos[index]
  const url = useSignedUrls(p ? [p.path] : [])
  const touchX = useRef<number | null>(null)

  const go = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, photos.length, onIndex])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  if (!p) return null
  const src = url(p.path)
  const game = p.game_id ? games[p.game_id] : undefined

  const download = async () => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(p.path, 600, { download: fileName(p, game) })
    if (data) saveAs(data.signedUrl, fileName(p, game))
  }
  const del = async () => {
    if (!confirm('Delete this for everyone?')) return
    await supabase.storage.from(BUCKET).remove([p.path, ...(p.thumb_path ? [p.thumb_path] : [])])
    const { error } = await supabase.from('photos').delete().eq('id', p.id)
    if (!error) onDeleted(p.id)
  }

  return (
    <div className="lightbox" onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}>
      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        {src ? (isVideo(p) ? <video src={src} controls autoPlay playsInline /> : <img src={src} alt={p.caption ?? ''} />)
          : <div className="loading">Loading…</div>}
      </div>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <div>
          {p.caption && <div className="lb-caption">{p.caption}</div>}
          <div className="muted small icon-text">
            <Avatar p={profiles[p.uploader_id]} size={18} />{nameOf(profiles[p.uploader_id])} · {when(p.created_at)}
            {game && <> · vs {game.opponent} ({gameDay(game)})</>}
          </div>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={download}><Download size={15} aria-hidden="true" />Download</button>
          {p.uploader_id === me?.id && <button className="btn ghost sm danger" onClick={del}><Trash2 size={15} aria-hidden="true" />Delete</button>}
        </div>
      </div>
      {photos.length > 1 && <>
        <button className="lb-nav prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); go(-1) }}><ChevronLeft size={22} aria-hidden="true" /></button>
        <button className="lb-nav next" aria-label="Next" onClick={(e) => { e.stopPropagation(); go(1) }}><ChevronRight size={22} aria-hidden="true" /></button>
      </>}
      <button className="lb-close" aria-label="Close" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </div>
  )
}

/** Pick files, tag a game, upload originals plus a small preview for the grid. */
export function Uploader({ games, defaultGameId, onUploaded }: { games: Game[]; defaultGameId: string | null; onUploaded: (p: Photo) => void }) {
  const { me } = useAuth()
  const [gameId, setGameId] = useState<string>(defaultGameId ?? '')
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { setGameId(defaultGameId ?? '') }, [defaultGameId])

  const upload = async (files: FileList | null) => {
    if (!files?.length || !me) return
    setErr(null)
    const list = [...files]
    setProgress({ done: 0, total: list.length })
    let failed = 0
    for (const file of list) {
      try {
        const id = crypto.randomUUID()
        const path = `${me.id}/${id}.${extOf(file)}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        let thumb_path: string | null = null
        const thumb = await makeThumb(file)
        if (thumb) {
          thumb_path = `${me.id}/thumbs/${id}.jpg`
          const t = await supabase.storage.from(BUCKET).upload(thumb_path, thumb, { contentType: 'image/jpeg' })
          if (t.error) thumb_path = null
        }
        const { data, error: dbErr } = await supabase.from('photos').insert({
          game_id: gameId || null, path, thumb_path, mime: file.type || 'image/jpeg', caption: caption.trim() || null,
        }).select().single()
        if (dbErr) throw dbErr
        onUploaded(data as Photo)
      } catch (e) {
        failed++
        setErr(`${file.name}: ${(e as Error).message}`)
      }
      setProgress((pr) => pr && { ...pr, done: pr.done + 1 })
    }
    setProgress(null)
    if (!failed) setCaption('')
    if (input.current) input.current.value = ''
  }

  return (
    <div className="uploader card">
      <div className="grid-3">
        <select className="input" value={gameId} onChange={(e) => setGameId(e.target.value)}>
          <option value="">No game</option>
          {games.map((g) => <option key={g.id} value={g.id}>vs {g.opponent} · {gameDay(g)}</option>)}
        </select>
        <input className="input" placeholder="Caption (optional)" maxLength={300} value={caption} onChange={(e) => setCaption(e.target.value)} />
        <label className={`btn gold ${progress ? 'disabled' : ''}`}>
          <ImagePlus size={17} aria-hidden="true" />
          {progress ? `Uploading ${progress.done}/${progress.total}…` : 'Add photos or videos'}
          <input ref={input} type="file" accept="image/*,video/*" multiple hidden disabled={Boolean(progress)}
            onChange={(e) => upload(e.target.files)} />
        </label>
      </div>
      {err && <p className="error">{err}</p>}
    </div>
  )
}

/** Zip every file in the current view and save it. */
export async function downloadAll(photos: Photo[], games: Record<string, Game>, zipName: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(photos.map((p) => p.path), 600)
  const urls = new Map(data?.map((d) => [d.path, d.signedUrl]) ?? [])
  async function* files() {
    for (const p of photos) {
      const u = urls.get(p.path)
      if (!u) continue
      const res = await fetch(u)
      if (res.ok) yield { name: fileName(p, p.game_id ? games[p.game_id] : undefined), input: res }
    }
  }
  const blob = await downloadZip(files()).blob()
  const href = URL.createObjectURL(blob)
  saveAs(href, zipName)
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}
