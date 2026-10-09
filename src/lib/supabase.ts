import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    HB_CONFIG?: { supabaseUrl?: string; supabaseKey?: string }
  }
}

// public/config.js wins (that's what the GitHub Pages build ships); .env is a local-dev fallback.
const url = window.HB_CONFIG?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || ''
const key = window.HB_CONFIG?.supabaseKey || import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const isConfigured = Boolean(url && key)

// Implicit flow: the emailed link carries the session itself, so it works even if it's opened
// in a different browser than the one that asked for it (phone mail apps love doing that).
// supabase-js reads the #access_token=… fragment before the hash router ever sees it.
export const supabase: SupabaseClient = isConfigured
  ? createClient(url, key, { auth: { flowType: 'implicit', persistSession: true, detectSessionInUrl: true } })
  : (null as unknown as SupabaseClient)

export const BUCKET = 'gallery'
