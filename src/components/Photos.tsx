import { useCallback, useEffect, useRef, useState } from 'react'
import { downloadZip } from 'client-zip'
import { ChevronLeft, ChevronRight, Download, ImagePlus, Play, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { removeFiles, signFiles, uploadFile } from '../lib/storage'
import { useSignedUrls } from '../lib/signedUrls'
import { extOf, makeThumb, saveAs } from '../lib/images'
import { fileReader, takenAt, urlReader } from '../lib/takenAt'
import { gameDay, when } from '../lib/format'
import type { Game, Photo } from '../lib/types'
import { useAuth } from '../auth'
import { Avatar, nameOf } from './Avatar'

export const isVideo = (p: Photo) => p.mime.startsWith('video/')
const DAY = 86400_000
/**
 * When a pic was taken. A pic tagged to a game whose file says it was made more than a day after kickoff was
 * re-saved later (texted, AirDropped, exported), so its file date is when it was shared: use kickoff instead.
 */
export const shotAt = (p: Photo, game?: Game) => {
  const t = p.taken_at ?? p.created_at
  if (game && new Date(t).getTime() > new Date(game.kickoff).getTime() + DAY) return game.kickoff
  return t
}
/** In the order they were taken: oldest first (a game day as it happened), or newest first. */
export const byShot = (photos: Photo[], games: Record<string, Game>, newestFirst = false) => {
  const at = new Map(photos.map((p) => [p.id, new Date(shotAt(p, p.game_id ? games[p.game_id] : undefined)).getTime()]))
  return [...photos].sort((a, b) => (at.get(a.id)! - at.get(b.id)!) * (newestFirst ? -1 : 1))
}
const fileName = (p: Photo, game?: Game) => {
  const ext = p.path.split('.').pop()
  const stamp = new Date(shotAt(p, game)).toISOString().slice(0, 19).replace(/[T:]/g, '-')
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
  // A swipe is one finger moving sideways at normal zoom. A pinch, or panning around a
  // pinched-in photo, also moves fingers sideways, so those never change the photo.
  const swipe = useRef<{ x: number; y: number; pinched: boolean } | null>(null)
  const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01

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
    const [link] = await signFiles([p.path], 600, fileName(p, game))
    if (link) saveAs(link.url, fileName(p, game))
  }
  const del = async () => {
    if (!confirm('Delete this for everyone?')) return
    await removeFiles([p.path, ...(p.thumb_path ? [p.thumb_path] : [])])
    const { error } = await supabase.from('photos').delete().eq('id', p.id)
    if (!error) onDeleted(p.id)
  }

  return (
    <div className="lightbox" onClick={onClose}
      onTouchStart={(e) => {
        if (e.touches.length > 1) { if (swipe.current) swipe.current.pinched = true; return }
        swipe.current = zoomed() ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY, pinched: false }
      }}
      onTouchEnd={(e) => {
        const s = swipe.current
        if (e.touches.length > 0) return // wait for the last finger to lift
        swipe.current = null
        if (!s || s.pinched || zoomed()) return
        const dx = e.changedTouches[0].clientX - s.x
        const dy = e.changedTouches[0].clientY - s.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
      }}
      onTouchCancel={() => { swipe.current = null }}>
      <div className="lb-stage" onClick={(e) => e.stopPropagation()}>
        {src ? (isVideo(p) ? <video src={src} controls autoPlay playsInline /> : <img src={src} alt={p.caption ?? ''} />)
          : <div className="loading">Loading…</div>}
      </div>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <div>
          {p.caption && <div className="lb-caption">{p.caption}</div>}
          <div className="muted small icon-text">
            <Avatar p={profiles[p.uploader_id]} size={18} />{nameOf(profiles[p.uploader_id])} · {when(shotAt(p, game))}
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
        await uploadFile(path, file, file.type || undefined)
        let thumb_path: string | null = null
        const thumb = await makeThumb(file)
        if (thumb) {
          thumb_path = `${me.id}/thumbs/${id}.jpg`
          try { await uploadFile(thumb_path, thumb, 'image/jpeg') } catch { thumb_path = null }
        }
        const row = {
          game_id: gameId || null, path, thumb_path, mime: file.type || 'image/jpeg', caption: caption.trim() || null,
          taken_at: (await takenAt(fileReader(file), file.type)) ?? fromLastModified(file),
        }
        let { data, error: dbErr } = await supabase.from('photos').insert(row).select().single()
        if (dbErr?.message.includes('taken_at')) { // database not updated yet (supabase/schema.sql): save without it
          const { taken_at: _, ...rest } = row
          ;({ data, error: dbErr } = await supabase.from('photos').insert(rest).select().single())
        }
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

// No date inside the file: a phone's "last modified" is often the capture time, unless it's just now (a fresh copy).
function fromLastModified(file: File) {
  return file.lastModified && file.lastModified < Date.now() - 5 * 60_000 ? new Date(file.lastModified).toISOString() : null
}

/**
 * Pics uploaded before taken_at existed: read the time from each of your own stored files once, so the gallery
 * can sort them by when they were taken. Files that don't say get their upload time, so they aren't re-read.
 */
const tried = new Set<string>()
export function useBackfillTakenAt(photos: Photo[] | null) {
  const { me } = useAuth()
  useEffect(() => {
    const todo = (photos ?? []).filter((p) => p.uploader_id === me?.id && !p.taken_at && !tried.has(p.id))
    if (!todo.length) return
    todo.forEach((p) => tried.add(p.id))
    ;(async () => {
      for (const p of todo) {
        try {
          const [link] = await signFiles([p.path], 600)
          const reader = link && (await urlReader(link.url))
          const t = reader ? await takenAt(reader, p.mime) : null
          await supabase.from('photos').update({ taken_at: t ?? p.created_at }).eq('id', p.id)
        } catch { /* try again next visit */ tried.delete(p.id) }
      }
    })()
  }, [photos, me?.id])
}

/** Zip every file in the current view and save it. */
export async function downloadAll(photos: Photo[], games: Record<string, Game>, zipName: string) {
  const urls = new Map((await signFiles(photos.map((p) => p.path), 600)).map((d) => [d.path, d.url]))
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
