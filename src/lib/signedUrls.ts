import { useEffect, useState } from 'react'
import { signFiles } from './storage'

const URL_TTL = 6 * 3600

// Signed URLs for private storage, cached for the session. Paths asked for in the same tick go out in one
// request, and a path already on its way isn't asked for twice (a chat full of avatars is one call, not fifty).
const urlCache = new Map<string, string>()
const inFlight = new Map<string, Promise<void>>()
let queued = new Set<string>()
let flush: Promise<void> | null = null

function fetchUrls(paths: string[]): Promise<void> {
  const waits = paths.filter((p) => inFlight.has(p)).map((p) => inFlight.get(p)!)
  const fresh = paths.filter((p) => !urlCache.has(p) && !inFlight.has(p))
  if (fresh.length) {
    fresh.forEach((p) => queued.add(p))
    flush ??= Promise.resolve().then(async () => {
      const batch = [...queued]
      queued = new Set()
      flush = null
      try {
        const urls = await signFiles(batch, URL_TTL)
        urls.forEach((d) => urlCache.set(d.path, d.url))
      } finally {
        batch.forEach((p) => inFlight.delete(p)) // a failed batch can be asked for again
      }
    })
    fresh.forEach((p) => inFlight.set(p, flush!))
    waits.push(flush)
  }
  return Promise.all(waits).then(() => undefined)
}

/** Signed URLs for a set of storage paths. Returns a lookup; re-renders once they arrive. */
export function useSignedUrls(paths: string[]) {
  const [, bump] = useState(0)
  const key = paths.join('|')
  useEffect(() => {
    const missing = paths.filter((p) => !urlCache.has(p))
    if (!missing.length) return
    let live = true
    fetchUrls(missing).then(() => live && bump((n) => n + 1))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (path: string | null | undefined) => (path ? urlCache.get(path) : undefined)
}
