import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

// What email_status() says about an address.
type Status = 'not_member' | 'new' | 'set_password' | 'password'
type Step = 'email' | 'password' | 'create'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const clean = email.trim().toLowerCase()

  const checkEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('email_status', { p_email: clean })
    setBusy(false)
    if (error) return setErr(error.message)
    const s = data as Status
    setStatus(s)
    if (s === 'not_member') return setErr(`"${clean}" isn't on the crew list. Check for a typo, or ask anyone in the crew to add you on the Crew page.`)
    setPassword(''); setConfirm('')
    setStep(s === 'password' ? 'password' : 'create')
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password })
    setBusy(false)
    if (error) {
      setErr(/invalid/i.test(error.message)
        ? "Wrong password. Forgot it? Anyone in the crew can hit Reset next to your name on the Crew page."
        : error.message)
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return setErr('Password needs at least 6 characters.')
    if (password !== confirm) return setErr("Passwords don't match.")
    setBusy(true); setErr(null)
    if (status === 'new') {
      const { data, error } = await supabase.auth.signUp({ email: clean, password })
      if (error) { setBusy(false); return setErr(/database error/i.test(error.message) ? "That email isn't on the crew list." : error.message) }
      if (!data.session) await supabase.auth.signInWithPassword({ email: clean, password })
    } else {
      const { error } = await supabase.rpc('set_first_password', { p_email: clean, p_password: password })
      if (error) { setBusy(false); return setErr(error.message) }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: clean, password })
      if (signInErr) { setBusy(false); return setErr(signInErr.message) }
    }
    setBusy(false)
  }

  const back = () => { setStep('email'); setErr(null); setPassword(''); setConfirm('') }

  return (
    <div className="login">
      <div className="login-hero">
        <Logo size={96} />
        <h1 className="display huge">Hammered<br />Boilers</h1>
        <p className="tagline">Boiler Up. Bottoms Up.</p>
      </div>
      <div className="hazard" />
      <div className="card narrow login-card">
        {step === 'email' && (
          <form className="stack" onSubmit={checkEmail}>
            <label className="label" htmlFor="email">Crew sign-in</label>
            <input id="email" className="input" type="email" required autoComplete="username" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <button className="btn gold" disabled={busy || !clean}>{busy ? 'Checking…' : 'Continue'}</button>
          </form>
        )}

        {step === 'password' && (
          <form className="stack" onSubmit={signIn}>
            <label className="label" htmlFor="password">Welcome back</label>
            <p className="muted small">{clean}</p>
            {/* Hidden username keeps password managers happy. */}
            <input type="email" autoComplete="username" value={clean} readOnly hidden />
            <input id="password" className="input" type="password" required autoComplete="current-password" placeholder="Password"
              value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            <button className="btn gold" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="btn ghost" onClick={back}>Different email</button>
          </form>
        )}

        {step === 'create' && (
          <form className="stack" onSubmit={create}>
            <label className="label" htmlFor="new-password">{status === 'new' ? "You're on the list. Pick a password" : 'Pick a password'}</label>
            <p className="muted small">
              {clean} · {status === 'new' ? 'first time here' : 'no password set yet'}. At least 6 characters.
            </p>
            <input type="email" autoComplete="username" value={clean} readOnly hidden />
            <input id="new-password" className="input" type="password" required minLength={6} autoComplete="new-password"
              placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            <input className="input" type="password" required minLength={6} autoComplete="new-password"
              placeholder="Same password again" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="btn gold" disabled={busy || !password || !confirm}>{busy ? 'Setting up…' : "Let's go"}</button>
            <button type="button" className="btn ghost" onClick={back}>Different email</button>
          </form>
        )}

        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}
