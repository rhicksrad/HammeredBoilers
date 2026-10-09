import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { ListItem, ListKind } from '../lib/types'
import { useAuth } from '../auth'
import { nameOf } from './Avatar'

const bySort = (a: ListItem, b: ListItem) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)

/** The two-part board for one game: who's bringing what, and the logistics questions. */
export default function GameLists({ gameId }: { gameId: string }) {
  const [items, setItems] = useState<ListItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    supabase.from('list_items').select('*').eq('game_id', gameId).then(({ data, error }) => {
      if (error) setErr(error.message)
      setItems((data ?? []) as ListItem[])
    })
  }, [gameId])

  useLiveTable<ListItem>('list_items', `game_id=eq.${gameId}`, {
    onUpsert: (row) => setItems((cur) => (cur ? upsertById(cur, row) : cur)),
    onDelete: (id) => setItems((cur) => cur?.filter((x) => x.id !== id) ?? cur),
  })

  // Optimistic: update the screen now, then the database; realtime keeps everyone else in sync.
  const patch = async (id: string, changes: Partial<ListItem>) => {
    setItems((cur) => cur?.map((x) => (x.id === id ? { ...x, ...changes } : x)) ?? cur)
    const { error } = await supabase.from('list_items').update(changes).eq('id', id)
    setErr(error?.message ?? null)
  }
  const add = async (kind: ListKind, label: string) => {
    const { data, error } = await supabase
      .from('list_items').insert({ game_id: gameId, kind, label, sort: 1000 }).select().single()
    if (error) return setErr(error.message)
    setItems((cur) => (cur ? upsertById(cur, data as ListItem) : cur))
  }
  const remove = async (id: string) => {
    setItems((cur) => cur?.filter((x) => x.id !== id) ?? cur)
    const { error } = await supabase.from('list_items').delete().eq('id', id)
    setErr(error?.message ?? null)
  }

  if (!items) return <div className="loading">Loading the list…</div>
  const food = items.filter((x) => x.kind === 'food').sort(bySort)
  const asks = items.filter((x) => x.kind === 'ask').sort(bySort)
  const ops = { patch, remove }

  return (
    <div className="lists">
      {err && <p className="error">{err}</p>}
      <Panel
        title="Food & Drink"
        icon="🍔"
        summary={`${food.filter((x) => x.owner_id).length}/${food.length} covered`}
        addPlaceholder="Add something to bring…"
        onAdd={(l) => add('food', l)}
      >
        {food.map((item) => <FoodRow key={item.id} item={item} {...ops} />)}
      </Panel>
      <Panel
        title="Asks & Logistics"
        icon="🔌"
        summary={`${asks.filter((x) => x.status === 'open').length} open`}
        addPlaceholder="Ask the crew something…"
        onAdd={(l) => add('ask', l)}
      >
        {asks.map((item) => <AskRow key={item.id} item={item} {...ops} />)}
      </Panel>
    </div>
  )
}

function Panel({ title, icon, summary, addPlaceholder, onAdd, children }: {
  title: string; icon: string; summary: string; addPlaceholder: string; onAdd: (label: string) => void; children: React.ReactNode
}) {
  const [label, setLabel] = useState('')
  return (
    <section className="panel card">
      <header className="panel-head">
        <h3 className="display">{icon} {title}</h3>
        <span className="chip">{summary}</span>
      </header>
      <ul className="items">{children}</ul>
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (label.trim()) { onAdd(label.trim().slice(0, 200)); setLabel('') }
        }}
      >
        <input className="input" placeholder={addPlaceholder} value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn ghost" disabled={!label.trim()}>Add</button>
      </form>
    </section>
  )
}

type RowProps = { item: ListItem; patch: (id: string, c: Partial<ListItem>) => void; remove: (id: string) => void }

function FoodRow({ item, patch, remove }: RowProps) {
  const { me, profiles } = useAuth()
  const owner = item.owner_id ? profiles[item.owner_id] : null
  const mine = item.owner_id === me?.id
  return (
    <li className={`item ${item.owner_id ? 'done' : ''}`}>
      <button
        className={`claim ${item.owner_id ? 'on' : ''}`}
        title={mine ? 'Unclaim' : item.owner_id ? `${nameOf(owner)} has it` : "I'll bring it"}
        onClick={() => patch(item.id, { owner_id: mine ? null : item.owner_id ?? me!.id })}
        disabled={Boolean(item.owner_id) && !mine}
      >
        {item.owner_id ? owner?.emoji ?? '✓' : ''}
      </button>
      <div className="item-main">
        <div className="item-label">{item.label}</div>
        <div className="item-sub">
          {owner ? <span className="who">{mine ? "You've got it" : `${nameOf(owner)}'s got it`}</span>
            : <button className="link-btn" onClick={() => patch(item.id, { owner_id: me!.id })}>I'll bring it</button>}
          <Note item={item} patch={patch} placeholder="details (how much, what kind)" />
        </div>
      </div>
      <RowMenu onDelete={() => remove(item.id)} />
    </li>
  )
}

function AskRow({ item, patch, remove }: RowProps) {
  const { me, profiles } = useAuth()
  const owner = item.owner_id ? profiles[item.owner_id] : null
  const mine = item.owner_id === me?.id
  const set = (status: ListItem['status']) => patch(item.id, { status: item.status === status ? 'open' : status })
  return (
    <li className={`item ask ${item.status}`}>
      <div className="item-main">
        <div className="item-label">{item.label}</div>
        <div className="item-sub">
          <div className="seg">
            <button className={item.status === 'yes' ? 'on yes' : ''} onClick={() => set('yes')}>Yes</button>
            <button className={item.status === 'no' ? 'on no' : ''} onClick={() => set('no')}>No</button>
          </div>
          {owner
            ? <button className="link-btn who" onClick={() => mine && patch(item.id, { owner_id: null })} title={mine ? 'Tap to drop it' : ''}>
                {owner.emoji} {mine ? "You're on it" : `${nameOf(owner)}'s on it`}
              </button>
            : <button className="link-btn" onClick={() => patch(item.id, { owner_id: me!.id })}>I'll handle it</button>}
        </div>
        <Note item={item} patch={patch} placeholder="answer / details" />
      </div>
      <RowMenu onDelete={() => remove(item.id)} />
    </li>
  )
}

/** Tap-to-edit note; saves on blur or Enter. */
function Note({ item, patch, placeholder }: { item: ListItem; patch: RowProps['patch']; placeholder: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(item.note ?? '')
  useEffect(() => { if (!editing) setVal(item.note ?? '') }, [item.note, editing])
  const save = () => {
    setEditing(false)
    const v = val.trim()
    if (v !== (item.note ?? '')) patch(item.id, { note: v || null })
  }
  if (editing) {
    return (
      <input className="input note-input" autoFocus value={val} maxLength={500} placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} />
    )
  }
  return item.note
    ? <button className="note" onClick={() => setEditing(true)}>“{item.note}”</button>
    : <button className="link-btn faint" onClick={() => setEditing(true)}>+ note</button>
}

function RowMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <button className="row-del" title="Remove from the list" onClick={() => confirm('Remove this from the list?') && onDelete()}>
      ✕
    </button>
  )
}
