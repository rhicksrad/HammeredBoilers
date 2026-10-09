// POST { email } from a signed-in crew member → adds them to the crew list and emails an invite.
// Already has an account? They get a normal sign-in link instead.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SITE = 'https://rhicksrad.github.io/HammeredBoilers/'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

  try {
    const { email } = await req.json().catch(() => ({}))
    const clean = String(email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return json({ error: "That doesn't look like an email." }, 400)

    // Act as the caller so row-level security decides whether they're allowed to invite.
    const caller = createClient(url, anonKey, {
      ...noSession,
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: isMember } = await caller.rpc('is_member')
    if (!isMember) return json({ error: 'Only crew members can invite people.' }, 403)

    const { data: who } = await caller.auth.getUser()
    const { error: listErr } = await caller
      .from('members')
      .upsert({ email: clean, invited_by: who.user?.id ?? null }, { onConflict: 'email', ignoreDuplicates: true })
    if (listErr) return json({ error: listErr.message }, 400)

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, noSession)
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(clean, { redirectTo: SITE })
    if (!inviteErr) return json({ sent: 'invite' })

    if (/already|registered|exists/i.test(inviteErr.message)) {
      const anon = createClient(url, anonKey, noSession)
      const { error: linkErr } = await anon.auth.signInWithOtp({
        email: clean,
        options: { emailRedirectTo: SITE, shouldCreateUser: false },
      })
      return linkErr ? json({ added: true, error: linkErr.message }, 200) : json({ sent: 'signin' })
    }
    // On the list either way; the email is what failed (usually the hourly email limit).
    return json({ added: true, error: inviteErr.message }, 200)
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
