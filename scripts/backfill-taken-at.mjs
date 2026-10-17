// One-time fill of photos.taken_at for pics uploaded before it existed, so the gallery sorts them by when they
// were taken. Reads the date from each stored file (EXIF for photos, the MP4/MOV header for videos) using the same
// code as the site. Files that don't say get their upload time. Safe to re-run: only rows still missing it change.
//
//   SUPABASE_SECRET_KEY=sb_secret_... node scripts/backfill-taken-at.mjs
//
// The secret key is in Supabase → Project Settings → API Keys. Don't commit it. Needs Node 23.6+ (reads the .ts).

import { takenAt } from '../src/lib/takenAt.ts'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://noyvywdgqugdvsuvtwty.supabase.co'
const key = process.env.SUPABASE_SECRET_KEY
if (!key) {
  console.error('Set SUPABASE_SECRET_KEY.')
  process.exit(1)
}
const auth = key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` }
const enc = (p) => p.split('/').map(encodeURIComponent).join('/')

// Range reads straight from the Supabase bucket (the files are still there after the R2 copy).
const reader = async (path) => {
  const url = `${SUPABASE_URL}/storage/v1/object/authenticated/gallery/${enc(path)}`
  const head = await fetch(url, { headers: { ...auth, range: 'bytes=0-0' } })
  const total = Number(head.headers.get('content-range')?.split('/')[1] ?? head.headers.get('content-length'))
  await head.body?.cancel()
  if (!head.ok || !total) throw new Error(`read ${head.status}`)
  return {
    size: total,
    read: async (offset, length) => {
      const end = Math.min(total, offset + length) - 1
      const res = await fetch(url, { headers: { ...auth, range: `bytes=${offset}-${end}` } })
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?select=id,path,mime,created_at&taken_at=is.null`, { headers: auth })
if (!res.ok) throw new Error(`list: ${res.status} ${await res.text()}`)
const rows = await res.json()
console.log(`${rows.length} photos missing a taken date.`)

let fromFile = 0, fromUpload = 0, failed = 0
for (const p of rows) {
  try {
    const t = await takenAt(await reader(p.path), p.mime)
    const up = await fetch(`${SUPABASE_URL}/rest/v1/photos?id=eq.${p.id}`, {
      method: 'PATCH', headers: { ...auth, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ taken_at: t ?? p.created_at }),
    })
    if (!up.ok) throw new Error(`update ${up.status} ${await up.text()}`)
    t ? fromFile++ : fromUpload++
  } catch (e) {
    failed++
    console.error(`${p.path}: ${e.message}`)
  }
}
console.log(`Done. Dated from the file ${fromFile}, used upload time ${fromUpload}, failed ${failed}.`)
process.exit(failed ? 1 : 0)
