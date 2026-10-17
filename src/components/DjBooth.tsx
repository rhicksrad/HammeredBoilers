import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Headphones, Plus, Printer, Undo2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLiveTable, upsertById } from '../lib/realtime'
import { gameDay, gameTime, when } from '../lib/format'
import type { Game, Profile, SongRequest, SongStatus } from '../lib/types'
import { useAuth } from '../auth'
import { nameOf } from './Avatar'

const byTime = (a: SongRequest, b: SongRequest) => a.created_at.localeCompare(b.created_at)
// The approved list reads in the order the DJ said yes.
const byDecided = (a: SongRequest, b: SongRequest) => (a.decided_at ?? a.created_at).localeCompare(b.decided_at ?? b.created_at)
const djName = (p?: Profile | null) => {
  const n = nameOf(p)
  return /^dj/i.test(n) ? n : `DJ ${n}`
}

/** Song requests for one game: the crew asks, the DJ approves or denies with a note, then prints the list. */
export default function DjBooth({ game }: { game: Game }) {
  const { me, profiles, session } = useAuth()
  const [reqs, setReqs] = useState<SongRequest[] | null>(null)
  const [djEmails, setDjEmails] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    setReqs(null)
    supabase.from('song_requests').select('*').eq('game_id', game.id).then(({ data, error }) => {
      if (error) setErr(error.message)
      setReqs((data ?? []) as SongRequest[])
    })
    supabase.from('members').select('email').eq('dj', true)
      .then(({ data }) => setDjEmails((data ?? []).map((m) => m.email as string)))
  }, [game.id])

  useLiveTable<SongRequest>('song_requests', `game_id=eq.${game.id}`, {
    onUpsert: (row) => setReqs((cur) => (cur ? upsertById(cur, row) : cur)),
    onDelete: (id) => setReqs((cur) => cur?.filter((x) => x.id !== id) ?? cur),
  })

  // Print only the sheet: mount it, flag the body so print CSS hides the app, then clean up after the dialog.
  useEffect(() => {
    if (!printing) return
    document.body.classList.add('printing')
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 60)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
      document.body.classList.remove('printing')
    }
  }, [printing])

  const myEmail = session?.user.email?.toLowerCase() ?? ''
  const amDj = djEmails.includes(myEmail)
  const djs = djEmails.map((e) => Object.values(profiles).find((p) => p.email === e)).filter(Boolean) as Profile[]
  const djLabel = djs.length ? djs.map(djName).join(' & ') : djEmails.length ? 'the DJ' : null

  const patch = async (id: string, changes: Partial<SongRequest>) => {
    setReqs((cur) => cur?.map((x) => (x.id === id ? { ...x, ...changes } : x)) ?? cur)
    const { error } = await supabase.from('song_requests').update(changes).eq('id', id)
    setErr(error?.message ?? null)
  }
  const remove = async (id: string) => {
    setReqs((cur) => cur?.filter((x) => x.id !== id) ?? cur)
    const { error } = await supabase.from('song_requests').delete().eq('id', id)
    setErr(error?.message ?? null)
  }
  const add = async (song: string, artist: string, note: string) => {
    const dup = reqs?.find((r) => r.song.trim().toLowerCase() === song.toLowerCase())
    if (dup) { setErr(`"${dup.song}" is already on the board (${nameOf(profiles[dup.requested_by])} asked).`); return false }
    const { data, error } = await supabase.from('song_requests').insert({
      game_id: game.id, song, artist: artist || null, note: note || null,
      ...(amDj ? { status: 'approved' } : {}), // the DJ's own adds go straight on the list
    }).select().single()
    if (error) { setErr(error.message); return false }
    setErr(null)
    setReqs((cur) => (cur ? upsertById(cur, data as SongRequest) : cur))
    return true
  }

  if (!reqs) return <section className="card"><div className="loading">Loading requests…</div></section>

  const pending = reqs.filter((r) => r.status === 'pending').sort(byTime)
  const approved = reqs.filter((r) => r.status === 'approved').sort(byDecided)
  const denied = reqs.filter((r) => r.status === 'denied').sort(byDecided)
  const rowProps = { amDj, meId: me?.id, profiles, patch, remove }

  return (
    <section className="dj card">
      <header className="dj-head">
        <div className="stack-sm">
          <h3 className="display"><Headphones size={20} aria-hidden="true" />DJ Booth</h3>
          <div className="muted small">
            {!djLabel ? 'No DJ set up yet.'
              : amDj ? "You're on the decks. Approve or deny with a note, then print the list for the booth."
              : <>Requests go to <b>{djLabel}</b>.</>}
          </div>
        </div>
        <div className="row wrap">
          <span className="chip">{pending.length} waiting · {approved.length} approved</span>
          <button className="btn gold sm" disabled={!approved.length} onClick={() => setPrinting(true)}>
            <Printer size={15} aria-hidden="true" />Print the list
          </button>
        </div>
      </header>
      {err && <p className="error">{err}</p>}

      <div className="dj-grid">
        <div className="stack">
          <RequestForm amDj={amDj} onAdd={add} />
          <h4 className="dj-sub">Waiting on the DJ</h4>
          {pending.length
            ? <ul className="items">{pending.map((r) => <SongRow key={r.id} r={r} {...rowProps} />)}</ul>
            : <div className="empty">Nothing waiting.</div>}
        </div>
        <div className="stack">
          <h4 className="dj-sub">On the list ({approved.length})</h4>
          {approved.length
            ? <ul className="items">{approved.map((r) => <SongRow key={r.id} r={r} {...rowProps} />)}</ul>
            : <div className="empty">Nothing approved yet.</div>}
          {denied.length > 0 && (
            <details className="dj-denied">
              <summary>Not tonight ({denied.length})</summary>
              <ul className="items">{denied.map((r) => <SongRow key={r.id} r={r} {...rowProps} />)}</ul>
            </details>
          )}
        </div>
      </div>

      {printing && <PrintSheet game={game} songs={approved} profiles={profiles} djLabel={djLabel} />}
    </section>
  )
}

function RequestForm({ amDj, onAdd }: { amDj: boolean; onAdd: (song: string, artist: string, note: string) => Promise<boolean> }) {
  const [song, setSong] = useState('')
  const [artist, setArtist] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form className="dj-form" onSubmit={async (e) => {
      e.preventDefault()
      if (!song.trim() || busy) return
      setBusy(true)
      if (await onAdd(song.trim().slice(0, 200), artist.trim().slice(0, 200), note.trim().slice(0, 300))) {
        setSong(''); setArtist(''); setNote('')
      }
      setBusy(false)
    }}>
      <div className="dj-form-row">
        <input className="input" placeholder="Song" value={song} maxLength={200} onChange={(e) => setSong(e.target.value)} />
        <input className="input" placeholder="Artist" value={artist} maxLength={200} onChange={(e) => setArtist(e.target.value)} />
      </div>
      <div className="add-row">
        <input className="input" placeholder="Note (optional)" value={note} maxLength={300}
          onChange={(e) => setNote(e.target.value)} />
        <button className="btn gold" disabled={!song.trim() || busy}><Plus size={16} aria-hidden="true" />{amDj ? 'Add' : 'Request'}</button>
      </div>
    </form>
  )
}

type RowProps = {
  r: SongRequest
  amDj: boolean
  meId?: string
  profiles: Record<string, Profile>
  patch: (id: string, c: Partial<SongRequest>) => void
  remove: (id: string) => void
}

function SongRow({ r, amDj, meId, profiles, patch, remove }: RowProps) {
  const who = profiles[r.requested_by]
  const mine = r.requested_by === meId
  const [djNote, setDjNote] = useState(r.dj_note ?? '')
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDjNote(r.dj_note ?? '') }, [r.dj_note, editing])

  const decide = (status: SongStatus) => {
    setEditing(false)
    patch(r.id, { status, dj_note: djNote.trim() || null })
  }
  const saveNote = () => {
    setEditing(false)
    const v = djNote.trim()
    if (v !== (r.dj_note ?? '')) patch(r.id, { dj_note: v || null })
  }

  return (
    <li className={`item song ${r.status}`}>
      <div className="item-main">
        <div className="item-label">
          {r.song}{r.artist && <span className="song-artist"> · {r.artist}</span>}
        </div>
        <div className="item-sub">
          <span className="muted">{who?.emoji} {mine ? 'You' : nameOf(who)} · {when(r.created_at)}</span>
          {r.note && <span className="note static">“{r.note}”</span>}
        </div>

        {amDj && r.status === 'pending' && (
          <div className="dj-decide">
            <input className="input note-input" placeholder="Note back (optional)" value={djNote} maxLength={300}
              onFocus={() => setEditing(true)} onChange={(e) => setDjNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') decide('approved') }} />
            <button className="btn sm approve" onClick={() => decide('approved')}><Check size={15} strokeWidth={2.5} aria-hidden="true" />Approve</button>
            <button className="btn sm deny" onClick={() => decide('denied')}><X size={15} strokeWidth={2.5} aria-hidden="true" />Deny</button>
          </div>
        )}
        {amDj && r.status !== 'pending' && (
          <div className="item-sub">
            {editing
              ? <input className="input note-input" autoFocus value={djNote} maxLength={300} placeholder="Note back"
                  onChange={(e) => setDjNote(e.target.value)} onBlur={saveNote}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditing(false) }} />
              : r.dj_note
                ? <button className="note dj-note" onClick={() => setEditing(true)}><Headphones size={13} aria-hidden="true" />“{r.dj_note}”</button>
                : <button className="link-btn faint" onClick={() => setEditing(true)}><Plus size={13} aria-hidden="true" />Note back</button>}
            <button className="link-btn faint" onClick={() => patch(r.id, { status: 'pending' })}><Undo2 size={13} aria-hidden="true" />Undo</button>
          </div>
        )}
        {!amDj && (
          <div className="item-sub">
            {r.status === 'pending' && <span className="muted">Waiting on the DJ</span>}
            {r.dj_note && <span className="note static dj-note"><Headphones size={13} aria-hidden="true" />“{r.dj_note}”</span>}
          </div>
        )}
      </div>
      {(mine || amDj) && (
        <button className="row-del" title="Remove request" aria-label="Remove request"
          onClick={() => confirm(`Remove "${r.song}"?`) && remove(r.id)}><X size={16} aria-hidden="true" /></button>
      )}
    </li>
  )
}

/** Black-on-white sheet for the booth. Only exists while printing; print CSS hides everything else. */
function PrintSheet({ game, songs, profiles, djLabel }: {
  game: Game; songs: SongRequest[]; profiles: Record<string, Profile>; djLabel: string | null
}) {
  return createPortal(
    <div className="print-sheet">
      <header className="ps-head">
        <div className="ps-kicker">Hammered Boilers · DJ Booth{djLabel ? ` · ${djLabel}` : ''}</div>
        <h1>Purdue vs {game.opponent}</h1>
        <div className="ps-when">{gameDay(game, true)} · {gameTime(game)} · {songs.length} songs</div>
      </header>
      <table className="ps-table">
        <thead>
          <tr><th aria-label="Played" /><th>#</th><th>Song</th><th>For</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {songs.map((r, i) => (
            <tr key={r.id}>
              <td><span className="ps-box" /></td>
              <td className="ps-n">{i + 1}</td>
              <td><div className="ps-song">{r.song}</div>{r.artist && <div className="ps-artist">{r.artist}</div>}</td>
              <td className="ps-for">{nameOf(profiles[r.requested_by])}</td>
              <td className="ps-notes">
                {r.note && <div>“{r.note}”</div>}
                {r.dj_note && <div>DJ: {r.dj_note}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="ps-foot">Boiler Up. Bottoms Up. · Printed {when(new Date().toISOString())}</footer>
    </div>,
    document.body,
  )
}
