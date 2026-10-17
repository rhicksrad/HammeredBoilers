import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

type Row = { id: string } & Record<string, unknown>
type Handlers<T extends Row> = {
  onInsert?: (row: T) => void // new rows only; falls back to onUpsert when not given
  onUpsert?: (row: T) => void
  onDelete?: (id: string) => void
}

/**
 * Live inserts/updates (optionally filtered, e.g. "game_id=eq.123") and deletes for one table.
 * Deletes can't be filtered server-side, so callers just ignore ids they don't have.
 */
export function useLiveTable<T extends Row>(table: string, filter: string | undefined, h: Handlers<T>, enabled = true) {
  const handlers = useRef(h)
  handlers.current = h
  useEffect(() => {
    if (!enabled) return
    const ch = supabase.channel(`${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2)}`)
    const base = { schema: 'public', table, ...(filter ? { filter } : {}) }
    ch.on('postgres_changes', { event: 'INSERT', ...base }, (p) => (handlers.current.onInsert ?? handlers.current.onUpsert)?.(p.new as T))
      .on('postgres_changes', { event: 'UPDATE', ...base }, (p) => handlers.current.onUpsert?.(p.new as T))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => {
        const id = (p.old as Row)?.id
        if (id) handlers.current.onDelete?.(id)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [table, filter, enabled])
}

/** Insert-or-replace by id, keeping order stable. */
export function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id)
  if (i === -1) return [...list, row]
  const next = list.slice()
  next[i] = { ...next[i], ...row }
  return next
}
