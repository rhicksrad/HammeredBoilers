import { useEffect, useState } from 'react'
import { Headphones, KeyRound, LogOut, UserMinus, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { Avatar, EMOJIS } from '../components/Avatar'

type Member = { email: string; created_at: string; dj: boolean }

export default function Crew() {
  const { me, profiles, saveProfile, session } = useAuth()
  const [name, setName] = useState(me?.display_name ?? '')
  const [emoji, setEmoji] = useState(me?.emoji ?? '🚂')
  const [saved, setSaved] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invite, setInvite] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwNote, setPwNote] = useState<string | null>(null)

  useEffect(() => { if (me) { setName(me.display_name); setEmoji(me.emoji) } }, [me])

  const loadMembers = () =>
    supabase.from('members').select('email, created_at, dj').order('created_at').then(({ data }) => setMembers((data ?? []) as Member[]))
  useEffect(() => { loadMembers() }, [])

  const SITE = 'https://rhicksrad.github.io/HammeredBoilers/'

  const addMember = async (raw: string) => {
    const email = raw.trim().toLowerCase()
    setErr(null); setNote(null)
    const { error } = await supabase.from('members').insert({ email, invited_by: me?.id })
    if (error) { setErr(error.code === '23505' ? 'Already on the list.' : error.message); return false }
    setNote(`${email} is in. Send them ${SITE} and they'll pick a password the first time they sign in.`)
    loadMembers()
    return true
  }

  const resetPassword = async (email: string) => {
    if (!confirm(`Reset the password for ${email}? They'll pick a new one next time they sign in.`)) return
    setErr(null); setNote(null)
    const { error } = await supabase.rpc('reset_member_password', { p_email: email })
    if (error) setErr(error.message)
    else setNote(`Done. ${email} can sign in and pick a new password.`)
  }

  const byEmail = Object.fromEntries(Object.values(profiles).map((p) => [p.email, p]))
  const myEmail = session?.user.email?.toLowerCase()

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h1 className="display">Your profile</h1>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault()
          const r = await saveProfile({ display_name: name.trim().slice(0, 30) || 'Boiler', emoji })
          setSaved(r ?? 'Saved.')
        }}>
          <div className="row">
            <span className="avatar big">{emoji}</span>
            <input className="input" value={name} maxLength={30} aria-label="Your name" onChange={(e) => setName(e.target.value)} />
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
          Add someone's email, then send them the site link. They sign in with that email and pick a password the first time.
          If someone forgets their password, reset it here and they'll choose a new one. The DJ approves song requests on
          each gameday board.
        </p>
        <form className="row" onSubmit={async (e) => {
          e.preventDefault()
          if (await addMember(invite)) setInvite('')
        }}>
          <input className="input" type="email" required placeholder="buddy@example.com" value={invite} onChange={(e) => setInvite(e.target.value)} />
          <button className="btn gold"><UserPlus size={16} aria-hidden="true" />Add</button>
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
                  <div className="crew-name">{p?.display_name ?? <span className="muted">Hasn't signed in yet</span>}</div>
                  <div className="muted small">{m.email}</div>
                </div>
                {m.dj && <span className="badge"><Headphones size={12} aria-hidden="true" />DJ</span>}
                <div className="crew-actions">
                  {p && m.email !== myEmail && (
                    <button className="btn ghost sm" title="Reset password" aria-label={`Reset password for ${m.email}`}
                      onClick={() => resetPassword(m.email)}>
                      <KeyRound size={14} aria-hidden="true" /><span className="btn-label">Reset</span>
                    </button>
                  )}
                  {m.email !== myEmail && (
                    <button className="btn ghost sm danger" title="Remove from the crew" aria-label={`Remove ${m.email}`} onClick={async () => {
                      if (!confirm(`Remove ${m.email} from the crew? They'll lose access.`)) return
                      await supabase.from('members').delete().eq('email', m.email)
                      loadMembers()
                    }}>
                      <UserMinus size={14} aria-hidden="true" /><span className="btn-label">Remove</span>
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card stack">
        <h2 className="display">Your password</h2>
        <form className="row" onSubmit={async (e) => {
          e.preventDefault()
          if (newPw.length < 6) return setPwNote('At least 6 characters.')
          const { error } = await supabase.auth.updateUser({ password: newPw })
          setPwNote(error ? error.message : 'Password changed.')
          if (!error) setNewPw('')
        }}>
          <input type="email" autoComplete="username" value={myEmail ?? ''} readOnly hidden />
          <input className="input" type="password" autoComplete="new-password" minLength={6} placeholder="New password"
            value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <button className="btn ghost" disabled={!newPw}>Change</button>
        </form>
        {pwNote && <p className="muted small">{pwNote}</p>}
      </section>

      <button className="btn ghost" onClick={() => supabase.auth.signOut()}><LogOut size={16} aria-hidden="true" />Sign out</button>
    </div>
  )
}
