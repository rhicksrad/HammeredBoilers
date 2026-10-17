import { useEffect, useState } from 'react'
import { Check, ClipboardList, Plus, UtensilsCrossed, X, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLiveTable, upsertById } from '../lib/realtime'
import type { ListItem, ListKind } from '../lib/types'
import { useAuth } from '../auth'
import { Avatar, nameOf } from './Avatar'

const bySort = (a: ListItem, b: ListItem) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)

/** One of a game's lists: who's bringing what (food), or the logistics questions (ask). */
export default function GameList({ gameId, kind }: { gameId: string; kind: ListKind }) {
  const [items, setItems] = useState<ListItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    supabase.from('list_items').select('*').eq('game_id', gameId).eq('kind', kind).then(({ data, error }) => {
      if (error) setErr(error.message)
      setItems((data ?? []) as ListItem[])
    })
  }, [gameId, kind])

  // Realtime takes one filter, so the other list's rows come through too; skip them here.
  useLiveTable<ListItem>('list_items', `game_id=eq.${gameId}`, {
    onUpsert: (row) => row.kind === kind && setItems((cur) => (cur ? upsertById(cur, row) : cur)),
    onDelete: (id) => setItems((cur) => cur?.filter((x) => x.id !== id) ?? cur),
  })

  // Optimistic: update the screen now, then the database; realtime keeps everyone else in sync.
  const patch = async (id: string, changes: Partial<ListItem>) => {
    setItems((cur) => cur?.map((x) => (x.id === id ? { ...x, ...changes } : x)) ?? cur)
    const { error } = await supabase.from('list_items').update(changes).eq('id', id)
    setErr(error?.message ?? null)
  }
  const add = async (label: string) => {
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

  if (!items) return <section className="panel card"><div className="loading">Loading the list…</div></section>
  const sorted = items.slice().sort(bySort)
  const ops = { patch, remove }

  return kind === 'food' ? (
    <Panel
      title="Food & Drink"
      Icon={UtensilsCrossed}
      empty="Nothing on the list yet. Add the first thing to bring."
      summary={`${sorted.filter((x) => x.owner_id || x.owner_name).length}/${sorted.length} covered`}
      addPlaceholder="Add something to bring…"
      onAdd={add}
      err={err}
    >
      {sorted.map((item) => <FoodRow key={item.id} item={item} {...ops} />)}
    </Panel>
  ) : (
    <Panel
      title="Asks & Logistics"
      Icon={ClipboardList}
      empty="No questions yet. Power? Parking pass? Ask away."
      summary={`${sorted.filter((x) => x.status === 'open').length} open`}
      addPlaceholder="Ask the crew something…"
      onAdd={add}
      err={err}
    >
      {sorted.map((item) => <AskRow key={item.id} item={item} {...ops} />)}
    </Panel>
  )
}

function Panel({ title, Icon, empty, summary, addPlaceholder, onAdd, err, children }: {
  title: string; Icon: LucideIcon; empty: string; summary: string; addPlaceholder: string; onAdd: (label: string) => void
  err: string | null; children: React.ReactNode
}) {
  const [label, setLabel] = useState('')
  return (
    <section className="panel card">
      <header className="panel-head">
        <h3 className="display"><Icon size={20} aria-hidden="true" />{title}</h3>
        <span className="chip">{summary}</span>
      </header>
      {err && <p className="error">{err}</p>}
      {Array.isArray(children) && children.length === 0
        ? <div className="empty"><Icon size={22} aria-hidden="true" />{empty}</div>
        : <ul className="items">{children}</ul>}
      <form
        className="add-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (label.trim()) { onAdd(label.trim().slice(0, 200)); setLabel('') }
        }}
      >
        <input className="input" placeholder={addPlaceholder} value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn ghost" disabled={!label.trim()}><Plus size={16} aria-hidden="true" />Add</button>
      </form>
    </section>
  )
}

type RowProps = { item: ListItem; patch: (id: string, c: Partial<ListItem>) => void; remove: (id: string) => void }

function FoodRow({ item, patch, remove }: RowProps) {
  const { me, profiles } = useAuth()
  const owner = item.owner_id ? profiles[item.owner_id] : null
  const mine = item.owner_id === me?.id
  const taken = Boolean(item.owner_id || item.owner_name)
  return (
    <li className={`item ${taken ? 'done' : ''}`}>
      <button
        className={`claim ${taken ? 'on' : ''} ${owner ? 'has-av' : ''}`}
        title={mine ? 'Unclaim' : taken ? `${owner ? nameOf(owner) : item.owner_name} has it` : "I'll bring it"}
        onClick={() => patch(item.id, { owner_id: mine ? null : me!.id, owner_name: null })}
        disabled={taken && !mine}
      >
        {owner ? <Avatar p={owner} size={36} /> : taken ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : ''}
      </button>
      <div className="item-main">
        <div className="item-label">{item.label}</div>
        <div className="item-sub">
          <WhoPicker item={item} patch={patch} unset="Who's bringing it?" />
          <Note item={item} patch={patch} placeholder="details (how much, what kind)" />
        </div>
      </div>
      <RowMenu onDelete={() => remove(item.id)} />
    </li>
  )
}

function AskRow({ item, patch, remove }: RowProps) {
  const set = (status: ListItem['status']) => patch(item.id, { status: item.status === status ? 'open' : status })
  return (
    <li className={`item ask ${item.status}`}>
      <div className="item-main">
        <div className="item-label">{item.label}</div>
        <div className="item-sub">
          <div className="seg">
            <button className={item.status === 'yes' ? 'on yes' : ''} aria-pressed={item.status === 'yes'} onClick={() => set('yes')}>Yes</button>
            <button className={item.status === 'no' ? 'on no' : ''} aria-pressed={item.status === 'no'} onClick={() => set('no')}>No</button>
          </div>
          <WhoPicker item={item} patch={patch} unset="Who's on it?" />
        </div>
        <Note item={item} patch={patch} placeholder="answer / details" />
      </div>
      <RowMenu onDelete={() => remove(item.id)} />
    </li>
  )
}

/**
 * Anyone can say who's got an item, not just claim it themselves, so whoever runs the list
 * can fill it in for everybody. "Someone else…" covers people who aren't on the site.
 */
function WhoPicker({ item, patch, unset }: { item: ListItem; patch: RowProps['patch']; unset: string }) {
  const { me, profiles } = useAuth()
  const crew = Object.values(profiles)
    .filter((p) => p.id !== me?.id)
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
  const value = item.owner_id ?? (item.owner_name ? 'name' : '')
  return (
    <select
      className={`who-pick ${value ? 'set' : ''}`}
      value={value}
      title={unset}
      onChange={(e) => {
        const v = e.target.value
        if (v === 'name') return
        if (v === 'other') {
          const n = prompt("Who's got it? (someone who isn't on the site)", item.owner_name ?? '')?.trim()
          if (n) patch(item.id, { owner_id: null, owner_name: n.slice(0, 40) })
          return
        }
        patch(item.id, { owner_id: v || null, owner_name: null })
      }}
    >
      <option value="">{unset}</option>
      {me && <option value={me.id}>Me ({me.display_name})</option>}
      {crew.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
      {item.owner_name && <option value="name">{item.owner_name}</option>}
      <option value="other">+ Someone else…</option>
    </select>
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
    : <button className="link-btn faint" onClick={() => setEditing(true)}><Plus size={13} aria-hidden="true" />Note</button>
}

function RowMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <button className="row-del" title="Remove from the list" aria-label="Remove from the list"
      onClick={() => confirm('Remove this from the list?') && onDelete()}>
      <X size={16} aria-hidden="true" />
    </button>
  )
}
