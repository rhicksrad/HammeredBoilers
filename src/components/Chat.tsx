import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLiveTable } from '../lib/realtime'
import { clock, TZ } from '../lib/format'
import type { Message } from '../lib/types'
import { useAuth } from '../auth'
import { Avatar, nameOf } from './Avatar'

const PAGE = 100
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'full' }).format(new Date(iso))

/** One chat room: a game's thread (gameId) or the Playground (gameId = null). */
export default function Chat({ gameId, placeholder, readOnlyNote }: { gameId: string | null; placeholder: string; readOnlyNote?: string }) {
  const { me, profiles } = useAuth()
  const [msgs, setMsgs] = useState<Message[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const keepOffset = useRef<number | null>(null)

  const query = useCallback(() => {
    const q = supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(PAGE)
    return gameId ? q.eq('game_id', gameId) : q.is('game_id', null)
  }, [gameId])

  useEffect(() => {
    setMsgs(null)
    query().then(({ data }) => {
      const rows = (data ?? []) as Message[]
      setHasMore(rows.length === PAGE)
      setMsgs(rows.reverse())
      stickToBottom.current = true
    })
  }, [query])

  const loadOlder = async () => {
    if (!msgs?.length) return
    const { data } = await query().lt('created_at', msgs[0].created_at)
    const rows = ((data ?? []) as Message[]).reverse()
    setHasMore(rows.length === PAGE)
    const el = scroller.current
    keepOffset.current = el ? el.scrollHeight - el.scrollTop : null
    setMsgs((cur) => [...rows, ...(cur ?? [])])
  }

  useLiveTable<Message>('messages', gameId ? `game_id=eq.${gameId}` : undefined, {
    onUpsert: (m) => {
      if ((m.game_id ?? null) !== gameId) return
      setMsgs((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur))
    },
    onDelete: (id) => setMsgs((cur) => cur?.filter((m) => m.id !== id) ?? cur),
  })

  // Stay pinned to the newest message unless the reader scrolled up; keep position when loading older ones.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (keepOffset.current != null) {
      el.scrollTop = el.scrollHeight - keepOffset.current
      keepOffset.current = null
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [msgs])

  const onScroll = () => {
    const el = scroller.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    setErr(null)
    stickToBottom.current = true
    const { data, error } = await supabase.from('messages').insert({ game_id: gameId, body }).select().single()
    if (error) { setErr(error.message); setText(body); return }
    setMsgs((cur) => (cur && !cur.some((x) => x.id === data.id) ? [...cur, data as Message] : cur))
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this message?')) return
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (!error) setMsgs((cur) => cur?.filter((m) => m.id !== id) ?? cur)
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
        {msgs === null && <div className="loading">Loading chat…</div>}
        {hasMore && <button className="btn ghost sm older" onClick={loadOlder}>Load older messages</button>}
        {msgs?.length === 0 && <div className="chat-empty">Nothing yet. Say something dumb. 🍺</div>}
        {msgs?.map((m, i) => {
          const prev = msgs[i - 1]
          const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
          const grouped = !newDay && prev?.author_id === m.author_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
          const mine = m.author_id === me?.id
          const p = profiles[m.author_id]
          return (
            <Fragment key={m.id}>
              {newDay && <div className="day-sep"><span>{dayKey(m.created_at)}</span></div>}
              <div className={`msg ${grouped ? 'grouped' : ''} ${mine ? 'mine' : ''}`}>
                <div className="msg-avatar">{!grouped && <Avatar p={p} size={34} />}</div>
                <div className="msg-main">
                  {!grouped && (
                    <div className="msg-head">
                      <span className="msg-name">{nameOf(p)}</span>
                      <span className="msg-time">{clock(m.created_at)}</span>
                    </div>
                  )}
                  <div className="msg-body"><RichText text={m.body} /></div>
                </div>
                {mine && <button className="msg-del" title="Delete" onClick={() => remove(m.id)}>✕</button>}
              </div>
            </Fragment>
          )
        })}
      </div>
      {readOnlyNote && <div className="chat-note muted small">{readOnlyNote}</div>}
      <form className="chat-input" onSubmit={send}>
        <textarea
          className="input"
          rows={1}
          placeholder={placeholder}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
          }}
        />
        <button className="btn gold" disabled={!text.trim()}>Send</button>
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  )
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g
const IMG_RE = /\.(gif|png|jpe?g|webp)(\?.*)?$/i

/** Plain text with clickable links; a bare image/GIF link renders inline (Playground essential). */
function RichText({ text }: { text: string }) {
  const trimmed = text.trim()
  if (/^https?:\/\/\S+$/.test(trimmed) && (IMG_RE.test(trimmed) || /giphy\.com\/media|media\.tenor\.com/.test(trimmed))) {
    return (
      <a href={trimmed} target="_blank" rel="noreferrer">
        <img className="msg-img" src={trimmed} alt="" loading="lazy" />
      </a>
    )
  }
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  )
}
