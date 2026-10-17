// One-time copy of every file in the Supabase "gallery" bucket into R2, through the file service (worker/).
// Safe to re-run: files already in R2 are skipped. Paths stay the same, so nothing in the database changes.
//
//   SUPABASE_SECRET_KEY=sb_secret_... FILES_URL=https://hammered-boilers-files.<you>.workers.dev \
//   MIGRATE_TOKEN=<same value as the worker secret> node scripts/migrate-to-r2.mjs
//
// The secret key is in Supabase → Project Settings → API Keys. Don't commit it.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://noyvywdgqugdvsuvtwty.supabase.co'
const { SUPABASE_SECRET_KEY: key, FILES_URL, MIGRATE_TOKEN } = process.env
if (!key || !FILES_URL || !MIGRATE_TOKEN) {
  console.error('Set SUPABASE_SECRET_KEY, FILES_URL and MIGRATE_TOKEN.')
  process.exit(1)
}
// New-style secret keys go in the apikey header only; legacy service_role JWTs go in both.
const auth = key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` }
const enc = (p) => p.split('/').map(encodeURIComponent).join('/')

async function list(prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/gallery`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    })
    if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) out.push({ path, type: item.metadata?.mimetype })
      else out.push(...(await list(path))) // a folder
    }
    if (page.length < 1000) return out
  }
}

const files = await list('')
console.log(`${files.length} files in Supabase.`)
let copied = 0, skipped = 0, failed = 0
for (const [i, f] of files.entries()) {
  try {
    const src = await fetch(`${SUPABASE_URL}/storage/v1/object/gallery/${enc(f.path)}`, { headers: auth })
    if (!src.ok) throw new Error(`download ${src.status}`)
    const body = await src.arrayBuffer()
    const res = await fetch(`${FILES_URL.replace(/\/$/, '')}/migrate/${enc(f.path)}`, {
      method: 'PUT', body,
      headers: { 'x-migrate-token': MIGRATE_TOKEN, 'content-type': f.type || src.headers.get('content-type') || 'image/jpeg' },
    })
    if (!res.ok) throw new Error(`upload ${res.status} ${await res.text()}`)
    if ((await res.json()).skipped) skipped++
    else copied++
  } catch (e) {
    failed++
    console.error(`${f.path}: ${e.message}`)
  }
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${files.length}…`)
}
console.log(`Done. Copied ${copied}, already there ${skipped}, failed ${failed}.`)
process.exit(failed ? 1 : 0)
