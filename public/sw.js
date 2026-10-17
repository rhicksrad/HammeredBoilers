// Service worker: makes the site installable and opens it fast from the home screen.
// It only caches the app itself (HTML, JS, CSS, icons). Supabase, ESPN, weather, fonts and
// photos are other origins, so they always go straight to the network.
//
// - The page (index.html): network first, so every deploy shows up on the next open.
//   The cached copy is only used when there's no signal.
// - /assets/*: Vite puts a hash in those names, so a cached copy never goes stale.
// - Everything else (config.js, icons, manifest): serve the cached copy, refresh it behind the scenes.

const CACHE = 'hb-v2'
const SHELL = './'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') event.respondWith(page(req))
  else if (url.pathname.includes('/assets/')) event.respondWith(hashed(req))
  else event.respondWith(staleWhileRevalidate(req, event))
})

async function page(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok) {
      await cache.put(SHELL, res.clone())
      await pruneAssets(cache, await res.clone().text())
    }
    return res
  } catch {
    return (await cache.match(SHELL)) || Response.error()
  }
}

async function hashed(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(req, res.clone())
  return res
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const fresh = fetch(req).then(async (res) => {
    if (res.ok) await cache.put(req, res.clone())
    return res
  })
  if (hit) {
    event.waitUntil(fresh.catch(() => {}))
    return hit
  }
  return fresh
}

// Drop JS/CSS from old deploys: anything under /assets/ the new page no longer mentions.
async function pruneAssets(cache, html) {
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname
    if (!path.includes('/assets/')) continue
    if (!html.includes(path.slice(path.lastIndexOf('/assets/') + 1))) await cache.delete(req)
  }
}
