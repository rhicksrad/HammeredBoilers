import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AtSign, Bell, Image } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLiveTable } from '../lib/realtime'
import { CREW, mentionsMe, plainMentions } from '../lib/mentions'
import { when } from '../lib/format'
import type { Message } from '../lib/types'
import { useAuth } from '../auth'
import { nameOf } from './Avatar'

type Tagged = Pick<Message, 'id' | 'game_id' | 'author_id' | 'body' | 'created_at'>

// "Seen up to" lives on this device only; it's just for the unread dot.
const seenKey = (id: string) => `hb:tags-seen:${id}`
const readSeen = (id: string) => { try { return localStorage.getItem(seenKey(id)) ?? '' } catch { return '' } }
const writeSeen = (id: string, iso: string) => { try { localStorage.setItem(seenKey(id), iso) } catch { /* private mode */ } }

/** Top-bar bell: chat messages that tagged you (or @crew), newest first, with an unread count. */
export default function TagBell() {
  const { me, profiles } = useAuth()
  const navigate = useNavigate()
  const [tags, setTags] = useState<Tagged[]>([])
  const [games, setGames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const myId = me?.id

  useEffect(() => {
    if (!myId) return
    setSeen(readSeen(myId))
    supabase.from('messages').select('id, game_id, author_id, body, created_at')
      .or(`body.like.*<@${myId}>*,body.like.*<@${CREW}>*`)
      .neq('author_id', myId)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setTags((data ?? []) as Tagged[]))
    supabase.from('games').select('id, opponent')
      .then(({ data }) => setGames(Object.fromEntries((data ?? []).map((g) => [g.id, g.opponent as string]))))
  }, [myId])

  useLiveTable<Message>('messages', undefined, {
    onUpsert: (m) => {
      if (m.author_id === myId || !mentionsMe(m.body, myId)) return
      setTags((cur) => (cur.some((x) => x.id === m.id) ? cur : [m, ...cur].slice(0, 30)))
    },
    onDelete: (id) => setTags((cur) => cur.filter((x) => x.id !== id)),
  }, Boolean(myId))

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!myId) return null
  const unread = tags.filter((t) => t.created_at > seen).length

  const toggle = () => {
    setOpen((o) => !o)
    if (!open && tags[0]) { writeSeen(myId, tags[0].created_at); setTimeout(() => setSeen(tags[0].created_at), 1500) }
  }
  const go = (t: Tagged) => {
    setOpen(false)
    navigate(t.game_id ? `/game/${t.game_id}?tab=chat` : '/playground')
  }

  return (
    <div className="bell-wrap" ref={box}>
      <button className="bell" onClick={toggle} title="Where you've been tagged" aria-label={`Tags, ${unread} new`}>
        <Bell size={18} strokeWidth={1.9} aria-hidden="true" />{unread > 0 && <span className="bell-n">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-pop card">
          <div className="bell-title">Mentions</div>
          {tags.length === 0 && (
            <div className="empty"><AtSign size={22} aria-hidden="true" />Nobody's tagged you yet. Type @ in any chat to tag someone.</div>
          )}
          <ul>
            {tags.map((t) => {
              const who = profiles[t.author_id]
              return (
                <li key={t.id}>
                  <button className={t.created_at > seen ? 'new' : ''} onClick={() => go(t)}>
                    <span className="bell-head">
                      <b>{who?.emoji} {nameOf(who)}</b>
                      <span className="muted"> · {t.game_id ? `vs ${games[t.game_id] ?? 'a game'}` : 'Playground'} · {when(t.created_at)}</span>
                    </span>
                    <span className="bell-body">{plainMentions(t.body, profiles) || <span className="icon-text"><Image size={13} aria-hidden="true" />Photo</span>}</span>
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
