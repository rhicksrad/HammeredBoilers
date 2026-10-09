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

  useEffect(() => { if (me) { setName(me.display_name); setEmoji(me.emoji) } }, [me])

  const loadMembers = () =>
    supabase.from('members').select('email, created_at').order('created_at').then(({ data }) => setMembers((data ?? []) as Member[]))
  useEffect(() => { loadMembers() }, [])

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
          Anyone on this list can sign in with their email. Add a buddy, then tell them to go to the site and enter that address.
        </p>
        <form className="row" onSubmit={async (e) => {
          e.preventDefault()
          setErr(null)
          const email = invite.trim().toLowerCase()
          const { error } = await supabase.from('members').insert({ email, invited_by: me?.id })
          if (error) setErr(error.code === '23505' ? 'Already on the list.' : error.message)
          else { setInvite(''); loadMembers() }
        }}>
          <input className="input" type="email" required placeholder="buddy@example.com" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button className="btn gold">Add to crew</button>
        </form>
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
