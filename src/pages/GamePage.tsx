import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { supabase } from '../lib/supabase'
import { gameDay, gameTime, isGameday, isPast, result } from '../lib/format'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { Game, Photo } from '../lib/types'
import GameList from '../components/GameLists'
import Chat from '../components/Chat'
import DjBooth from '../components/DjBooth'
import { Countdown, PURDUE_LOGO, TeamLogo, TempStrip, WeatherChip } from '../components/GameBits'
import { Lightbox, PhotoGrid, Uploader } from '../components/Photos'

type Tab = 'food' | 'asks' | 'dj' | 'chat' | 'pics'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'food', icon: '🍔', label: 'Food' },
  { id: 'asks', icon: '🔌', label: 'Asks' },
  { id: 'dj', icon: '🎧', label: 'DJ' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'pics', icon: '📸', label: 'Pics' },
]

export default function GamePage() {
  const { id } = useParams()
  const [game, setGame] = useState<Game | null | undefined>(undefined)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>('food')
  const chatRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    supabase.from('games').select('*').eq('id', id).maybeSingle().then(({ data }) => setGame(data as Game | null))
    supabase.from('photos').select('*').eq('game_id', id).order('created_at', { ascending: false })
      .then(({ data }) => setPhotos((data ?? []) as Photo[]))
  }, [id])

  useLiveTable<Game>('games', id ? `id=eq.${id}` : undefined, { onUpsert: (g) => setGame(g) }, Boolean(id))
  useLiveTable<Photo>('photos', id ? `game_id=eq.${id}` : undefined, {
    onUpsert: (p) => setPhotos((cur) => (cur.some((x) => x.id === p.id) ? upsertById(cur, p) : [p, ...cur])),
    onDelete: (pid) => setPhotos((cur) => cur.filter((x) => x.id !== pid)),
  }, Boolean(id))

  // ?tab=chat (from a tag in the 🔔) opens the thread: the tab on phones, a scroll on wider screens.
  const wantTab = params.get('tab')
  useEffect(() => {
    if (wantTab !== 'chat' || !game) return
    setTab('chat')
    requestAnimationFrame(() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [wantTab, game?.id])

  const gamesById = useMemo(() => (game ? { [game.id]: game } : {}), [game])

  if (game === undefined) return <div className="loading">Loading…</div>
  if (game === null) return <div className="card">That game isn't on the board. <Link to="/">Back to Gameday</Link></div>

  const past = isPast(game)
  const r = result(game)

  return (
    <div className="stack-lg">
      <Link to="/" className="back">← All games</Link>

      <section className="game-head card">
        <div className="gh-top">
          <div className="matchup sm">
            <div className="team"><TeamLogo src={PURDUE_LOGO} alt="Purdue" size={56} /></div>
            <div className="vs">VS</div>
            <div className="team"><TeamLogo src={game.opponent_logo} alt={game.opponent} size={56} /></div>
          </div>
          <div className="gh-title">
            <h1 className="display">Purdue vs {game.opponent}</h1>
            <div className="muted">
              {gameDay(game, true)} · {gameTime(game)}{game.tv ? ` · ${game.tv}` : ''}{game.venue ? ` · ${game.venue}` : ''}
            </div>
            <div className="row wrap">
              {isGameday(game) && <span className="badge live">GAMEDAY</span>}
              {game.status === 'in' && <span className="badge live">LIVE</span>}
              {r && <span className={`result big ${r.w}`}>{r.text}</span>}
              {!past && <WeatherChip game={game} />}
            </div>
          </div>
        </div>
        {!past && <TempStrip game={game} />}
        {!past && <Countdown game={game} />}
        <div className="grid-2">
          <EditableField game={game} field="lot" label="📍 Our spot" placeholder="W Lot (add a row or landmark)" />
          <EditableField game={game} field="notes" label="📝 Notes" placeholder="Meet time, who's driving, anything else" />
        </div>
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-ic">{t.icon}</span>
            <span>{t.label}{t.id === 'pics' && photos.length ? ` ${photos.length}` : ''}</span>
          </button>
        ))}
      </div>

      <div className="game-grid">
        <div className={`gp-section gp-food ${tab === 'food' ? 'active' : ''}`}>
          <GameList gameId={game.id} kind="food" />
        </div>
        <div className={`gp-section gp-asks ${tab === 'asks' ? 'active' : ''}`}>
          <GameList gameId={game.id} kind="ask" />
        </div>
        <div className={`gp-section gp-dj ${tab === 'dj' ? 'active' : ''}`}>
          <DjBooth game={game} />
        </div>
        <section ref={chatRef} className={`gp-section gp-chat card ${tab === 'chat' ? 'active' : ''}`}>
          <h3 className="display panel-title">💬 Game thread</h3>
          <Chat
            gameId={game.id}
            placeholder={past ? 'Post-game takes…' : `Talk ${game.opponent} week…`}
            readOnlyNote={past ? 'This one is in the books. The thread stays open for the stories.' : undefined}
          />
        </section>
        <section className={`gp-section gp-pics card ${tab === 'pics' ? 'active' : ''}`}>
          <div className="panel-head">
            <h3 className="display">📸 Pics from this one</h3>
            <Link to={`/gallery?game=${game.id}`} className="link-btn">Open in gallery →</Link>
          </div>
          <Uploader games={[game]} defaultGameId={game.id}
            onUploaded={(p) => setPhotos((cur) => (cur.some((x) => x.id === p.id) ? cur : [p, ...cur]))} />
          {photos.length ? <PhotoGrid photos={photos} games={gamesById} onOpen={setOpen} />
            : <p className="muted small">No pics yet. Get some.</p>}
        </section>
      </div>

      {open != null && (
        <Lightbox photos={photos} index={open} games={gamesById} onClose={() => setOpen(null)} onIndex={setOpen}
          onDeleted={(pid) => { setPhotos((cur) => cur.filter((x) => x.id !== pid)); setOpen(null) }} />
      )}
    </div>
  )
}

function EditableField({ game, field, label, placeholder }: { game: Game; field: 'lot' | 'notes'; label: string; placeholder: string }) {
  const [val, setVal] = useState(game[field] ?? '')
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setVal(game[field] ?? '') }, [game, field, focused])
  const save = async () => {
    setFocused(false)
    const v = val.trim()
    if (v !== (game[field] ?? '')) await supabase.from('games').update({ [field]: v || null }).eq('id', game.id)
  }
  return (
    <label className="field">
      <span className="label">{label}</span>
      <textarea className="input" rows={field === 'notes' ? 2 : 1} value={val} placeholder={placeholder} maxLength={500}
        onFocus={() => setFocused(true)} onChange={(e) => setVal(e.target.value)} onBlur={save} />
    </label>
  )
}
