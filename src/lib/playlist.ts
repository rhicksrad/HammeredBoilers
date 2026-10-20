import { useEffect, useState } from 'react'
import type { PlaylistData, PlaylistTrack } from './types'

// The crew's tailgate playlist on Spotify. The song list is a snapshot (scripts/pull-playlist.py); ratings are live.
export const PLAYLIST_ID = '3t5Iw9vyFz2vmcE7XL0d8c'
export const PLAYLIST_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`
export const PLAYLIST_EMBED = `https://open.spotify.com/embed/playlist/${PLAYLIST_ID}?utm_source=generator&theme=0`

export const trackUrl = (t: PlaylistTrack) => (t.id ? `https://open.spotify.com/track/${t.id}` : null)
export const spotifySearchUrl = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q.trim())}`

let cached: Promise<PlaylistData> | null = null
/** The playlist snapshot, loaded on first use so it stays out of the main bundle. */
export function usePlaylist() {
  const [data, setData] = useState<PlaylistData | null>(null)
  useEffect(() => {
    cached ??= import('../data/playlist.json').then((m) => m.default as PlaylistData)
    let live = true
    cached.then((d) => { if (live) setData(d) })
    return () => { live = false }
  }, [])
  return data
}

// "Panama - 2015 Remaster" and "Thrift Shop (feat. Wanz)" both match a request for the plain title.
const norm = (s: string) => s.toLowerCase()
  .replace(/\s+-\s+.*$/, '')
  .replace(/\((feat|ft|with|from)\b[^)]*\)/g, '')
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]/g, '')

/** The playlist song a request is for, if it's already on there. */
export function findOnPlaylist(tracks: PlaylistTrack[], song: string, artist?: string | null) {
  const s = norm(song)
  const a = artist ? norm(artist) : ''
  if (!s) return null
  return tracks.find((t) => norm(t.title) === s
    && (!a || t.artists.some((x) => { const n = norm(x); return n.includes(a) || a.includes(n) }))) ?? null
}

/** Matches a search box: every word has to appear in the title, artists, album or genre. */
export function matches(t: PlaylistTrack, query: string) {
  const hay = [t.title, ...t.artists, t.album ?? '', t.genre ?? ''].join(' ').toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}
