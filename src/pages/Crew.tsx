import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { Avatar, EMOJIS } from '../components/Avatar'

type Member = { email: string; created_at: string }

export default function Crew() {
  const { me, profiles, saveProfile, session } = useAuth()
  const [name, setName] = useState(me?.display_name ?? '')
  const [emoji, setEmoji] = useState(me?.emoji ?? '🚂')
  const [saved, setSaved] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invite, setInvite] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)

  useEffect(() => { if (me) { setName(me.display_name); setEmoji(me.emoji) } }, [me])

  const loadMembers = () =>
    supabase.from('members').select('email, created_at').order('created_at').then(({ data }) => setMembers((data ?? []) as Member[]))
  useEffect(() => { loadMembers() }, [])

  /** Adds them to the list and emails an invite (or a sign-in link if they already have an account). */
  const sendInvite = async (raw: string) => {
    const email = raw.trim().toLowerCase()
    setErr(null); setNote(null); setSending(email)
    const { data, error } = await supabase.functions.invoke('invite', { body: { email } })
    setSending(null)
    loadMembers()
    if (error) {
      // Non-2xx: the function's own message is in the response body.
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
      setErr(body?.error ?? error.message)
      return false
    }
    if (data?.error) {
      setNote(`${email} is on the list, but the email didn't send (${data.error}). Tell them to go to the site and sign in with that address.`)
    } else {
      setNote(`✉️ ${data?.sent === 'signin' ? 'Sign-in link' : 'Invite'} sent to ${email}.`)
    }
    return true
  }

  const byEmail = Object.fromEntries(Object.values(profiles).map((p) => [p.email, p]))
  const myEmail = session?.user.email?.toLowerCase()

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h1 className="display">Your tailgate name</h1>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault()
          const r = await saveProfile({ display_name: name.trim().slice(0, 30) || 'Boiler', emoji })
          setSaved(r ?? 'Saved.')
        }}>
          <div className="row">
            <span className="avatar big">{emoji}</span>
            <input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="emoji-grid">
            {EMOJIS.map((x) => (
              <button type="button" key={x} className={x === emoji ? 'on' : ''} onClick={() => setEmoji(x)}>{x}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn gold">Save</button>
            {saved && <span className="muted small">{saved}</span>}
          </div>
        </form>
      </section>

      <section className="card stack">
        <h2 className="display">The crew</h2>
        <p className="muted small">
          Add a buddy and they get an email invite. Tapping it signs them right in. Anyone on this list can also just go
          to the site and enter their email.
        </p>
        <form className="row" onSubmit={async (e) => {
          e.preventDefault()
          if (await sendInvite(invite)) setInvite('')
        }}>
          <input className="input" type="email" required placeholder="buddy@example.com" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button className="btn gold" disabled={Boolean(sending)}>{sending && sending === invite.trim().toLowerCase() ? 'Sending…' : 'Invite'}</button>
        </form>
        {note && <p className="muted small">{note}</p>}
        {err && <p className="error">{err}</p>}
        <ul className="crew-list">
          {members.map((m) => {
            const p = byEmail[m.email]
            return (
              <li key={m.email}>
                <Avatar p={p} size={36} />
                <div className="grow">
                  <div>{p?.display_name ?? <span className="muted">Hasn't signed in yet</span>}</div>
                  <div className="muted small">{m.email}</div>
                </div>
                {!p && (
                  <button className="btn ghost sm" disabled={Boolean(sending)} onClick={() => sendInvite(m.email)}>
                    {sending === m.email ? 'Sending…' : 'Resend'}
                  </button>
                )}
                {m.email !== myEmail && (
                  <button className="btn ghost sm" onClick={async () => {
                    if (!confirm(`Remove ${m.email} from the crew? They'll lose access.`)) return
                    await supabase.from('members').delete().eq('email', m.email)
                    loadMembers()
                  }}>Remove</button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}
