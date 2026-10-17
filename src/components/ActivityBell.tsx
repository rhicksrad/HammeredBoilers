import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AtSign, Bell, Camera, ClipboardList, Headphones, Image, MessageCircle, UserPlus, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLiveTable } from '../lib/realtime'
import { mentionsMe, plainMentions } from '../lib/mentions'
import { plural, when } from '../lib/format'
import type { ListItem, Message, Photo, Profile, SongRequest } from '../lib/types'
import { useAuth } from '../auth'
import { Avatar, nameOf } from './Avatar'

type Post = Pick<Message, 'id' | 'game_id' | 'author_id' | 'body' | 'created_at'>
type Added = Pick<ListItem, 'id' | 'game_id' | 'kind' | 'label' | 'created_by' | 'created_at'>
type Pic = Pick<Photo, 'id' | 'game_id' | 'uploader_id' | 'created_at'>
type Song = Pick<SongRequest, 'id' | 'game_id' | 'requested_by' | 'song' | 'artist' | 'created_at'>

type Kind = 'join' | 'tag' | 'chat' | 'food' | 'ask' | 'photo' | 'song'
type Activity = { key: string; kind: Kind; at: string; who: string; gameId: string | null; text: string }

const KEEP = 30 // per source, and the most the bell lists
const PHOTO_BURST = 10 * 60_000 // photos one person adds to one place within 10 minutes show as one line

const ICONS: Record<Kind, LucideIcon> = {
  join: UserPlus, tag: AtSign, chat: MessageCircle, food: UtensilsCrossed, ask: ClipboardList, photo: Camera, song: Headphones,
}

// "Seen up to" lives on this device only; it's just for the unread count. The bell used to list only
// tags, so a device that had opened it before picks up from there instead of lighting up with old news.
const seenKey = (id: string) => `hb:activity-seen:${id}`
const readSeen = (id: string) => {
  try { return localStorage.getItem(seenKey(id)) ?? localStorage.getItem(`hb:tags-seen:${id}`) ?? new Date().toISOString() } catch { return '' }
}
const writeSeen = (id: string, iso: string) => { try { localStorage.setItem(seenKey(id), iso) } catch { /* private mode */ } }

const newestFirst = <T extends { created_at: string }>(rows: T[]) =>
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, KEEP)
const addRow = <T extends { id: string; created_at: string }>(row: T) => (cur: T[]) =>
  cur.some((x) => x.id === row.id) ? cur : newestFirst([row, ...cur])
const patchRow = <T extends { id: string }>(row: T) => (cur: T[]) =>
  cur.map((x) => (x.id === row.id ? { ...x, ...row } : x))
const dropRow = (id: string) => <T extends { id: string }>(cur: T[]) => cur.filter((x) => x.id !== id)

/**
 * Top-bar bell: what's new on the site from everyone else, newest first, with an unread count.
 * New crew members, chat posts (tags called out), food and asks people add, photos, and song requests.
 * Edits don't make new lines: a name change just updates the name shown.
 */
export default function ActivityBell() {
  const { me, profiles } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<Post[]>([])
  const [added, setAdded] = useState<Added[]>([])
  const [pics, setPics] = useState<Pic[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [games, setGames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const myId = me?.id

  useEffect(() => {
    if (!myId) return
    setSeen(readSeen(myId))
    const recent = <T,>(q: PromiseLike<{ data: unknown }>, set: (rows: T[]) => void) => q.then(({ data }) => set((data ?? []) as T[]))
    recent(supabase.from('messages').select('id, game_id, author_id, body, created_at')
      .neq('author_id', myId).order('created_at', { ascending: false }).limit(KEEP), setPosts)
    // Rows with no creator are the starter list every new game gets, not something a person added.
    recent(supabase.from('list_items').select('id, game_id, kind, label, created_by, created_at')
      .not('created_by', 'is', null).neq('created_by', myId).order('created_at', { ascending: false }).limit(KEEP), setAdded)
    recent(supabase.from('photos').select('id, game_id, uploader_id, created_at')
      .neq('uploader_id', myId).order('created_at', { ascending: false }).limit(KEEP), setPics)
    recent(supabase.from('song_requests').select('id, game_id, requested_by, song, artist, created_at')
      .neq('requested_by', myId).order('created_at', { ascending: false }).limit(KEEP), setSongs)
    supabase.from('games').select('id, opponent')
      .then(({ data }) => setGames(Object.fromEntries((data ?? []).map((g) => [g.id, g.opponent as string]))))
  }, [myId])

  const live = Boolean(myId)
  useLiveTable<Message>('messages', undefined, {
    onInsert: (m) => { if (m.author_id !== myId) setPosts(addRow<Post>(m)) },
    onDelete: (id) => setPosts(dropRow(id)),
  }, live)
  useLiveTable<ListItem>('list_items', undefined, {
    onInsert: (i) => { if (i.created_by && i.created_by !== myId) setAdded(addRow<Added>(i)) },
    onUpsert: (i) => setAdded(patchRow<Added>(i)), // a renamed item keeps its line
    onDelete: (id) => setAdded(dropRow(id)),
  }, live)
  useLiveTable<Photo>('photos', undefined, {
    onInsert: (p) => { if (p.uploader_id !== myId) setPics(addRow<Pic>(p)) },
    onDelete: (id) => setPics(dropRow(id)),
  }, live)
  useLiveTable<SongRequest>('song_requests', undefined, {
    onInsert: (s) => { if (s.requested_by !== myId) setSongs(addRow<Song>(s)) },
    onUpsert: (s) => setSongs(patchRow<Song>(s)),
    onDelete: (id) => setSongs(dropRow(id)),
  }, live)
  useLiveTable<{ id: string; opponent: string }>('games', undefined, {
    onUpsert: (g) => setGames((cur) => ({ ...cur, [g.id]: g.opponent })),
  }, live)

  const feed = useMemo(() => {
    const out: Activity[] = []
    // Profiles come from the crew list everyone already loads; signing up is what makes the row.
    for (const p of Object.values(profiles) as Profile[]) {
      if (p.id !== myId && p.created_at) out.push({ key: `join:${p.id}`, kind: 'join', at: p.created_at, who: p.id, gameId: null, text: 'joined the crew' })
    }
    for (const m of posts) {
      const tag = mentionsMe(m.body, myId)
      out.push({
        key: `chat:${m.id}`, kind: tag ? 'tag' : 'chat', at: m.created_at, who: m.author_id, gameId: m.game_id,
        text: plainMentions(m.body, profiles),
      })
    }
    for (const i of added) {
      out.push({
        key: `list:${i.id}`, kind: i.kind, at: i.created_at, who: i.created_by!, gameId: i.game_id,
        text: `${i.kind === 'food' ? 'Added to the food list' : 'Asked'}: ${i.label}`,
      })
    }
    // Photos arrive one row per file, so a batch upload folds into one line.
    let burst: { a: Activity; n: number; first: number } | null = null
    for (const p of [...pics].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const t = new Date(p.created_at).getTime()
      if (burst && burst.a.who === p.uploader_id && burst.a.gameId === p.game_id && burst.first - t < PHOTO_BURST) {
        burst.n++
        burst.a.text = `Added ${plural(burst.n, 'photo')}`
        continue
      }
      burst = { a: { key: `photo:${p.id}`, kind: 'photo', at: p.created_at, who: p.uploader_id, gameId: p.game_id, text: 'Added a photo' }, n: 1, first: t }
      out.push(burst.a)
    }
    for (const s of songs) {
      out.push({
        key: `song:${s.id}`, kind: 'song', at: s.created_at, who: s.requested_by, gameId: s.game_id,
        text: `Requested ${s.song}${s.artist ? ` by ${s.artist}` : ''}`,
      })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, KEEP)
  }, [profiles, posts, added, pics, songs, myId])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!myId) return null
  const unread = feed.filter((a) => a.at > seen).length

  const toggle = () => {
    setOpen((o) => !o)
    if (!open && feed[0]) { writeSeen(myId, feed[0].at); setTimeout(() => setSeen(feed[0].at), 1500) }
  }
  const go = (a: Activity) => {
    setOpen(false)
    if (a.kind === 'join') return navigate('/crew')
    if (a.kind === 'photo') return navigate(a.gameId ? `/game/${a.gameId}?tab=pics` : '/gallery')
    const tab = a.kind === 'tag' ? 'chat' : a.kind === 'ask' ? 'asks' : a.kind === 'song' ? 'dj' : a.kind
    navigate(a.gameId ? `/game/${a.gameId}?tab=${tab}` : '/playground')
  }
  const where = (a: Activity) =>
    a.kind === 'join' ? '' : a.gameId ? ` · vs ${games[a.gameId] ?? 'a game'}` : a.kind === 'photo' ? ' · Gallery' : ' · Playground'

  return (
    <div className="bell-wrap" ref={box}>
      <button className="bell" onClick={toggle} title="What's new" aria-label={`What's new, ${unread} new`}>
        <Bell size={18} strokeWidth={1.9} aria-hidden="true" />{unread > 0 && <span className="bell-n">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-pop card">
          <div className="bell-title">What's new</div>
          {feed.length === 0 && (
            <div className="empty"><Bell size={22} aria-hidden="true" />Nothing new yet. Posts, food, photos and new crew show up here.</div>
          )}
          <ul>
            {feed.map((a) => {
              const who = profiles[a.who]
              const Icon = ICONS[a.kind]
              return (
                <li key={a.key}>
                  <button className={a.at > seen ? 'new' : ''} onClick={() => go(a)}>
                    <span className="bell-head">
                      <Avatar p={who} size={18} className="inline" /><b>{nameOf(who)}</b>
                      <span className="muted">{where(a)} · {when(a.at)}</span>
                    </span>
                    <span className="bell-body">
                      <Icon size={13} className="bell-kind" aria-hidden="true" />
                      {a.kind === 'tag' && <b>Tagged you: </b>}
                      {a.text || <><Image size={13} className="bell-kind" aria-hidden="true" />Photo</>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
