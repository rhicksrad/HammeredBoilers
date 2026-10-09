import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    setBusy(false)
    if (error) setErr(error.message)
    else setSent(true)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <div className="login">
      <div className="login-hero">
        <Logo size={96} />
        <h1 className="display huge">Hammered<br />Boilers</h1>
        <p className="tagline">Boiler Up. Bottoms Up.</p>
      </div>
      <div className="hazard" />
      <div className="card narrow login-card">
        {!sent ? (
          <form className="stack" onSubmit={send}>
            <label className="label" htmlFor="email">Crew sign-in</label>
            <input id="email" className="input" type="email" required autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn gold" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            <p className="muted small">No passwords. We email you a sign-in link.</p>
          </form>
        ) : (
          <form className="stack" onSubmit={verify}>
            <label className="label" htmlFor="code">Check your email</label>
            <p className="muted small">
              Sent to <b>{email}</b>. Tap the link in the email and you're in. If the email shows a code instead,
              type it here.
            </p>
            <input id="code" className="input code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
              maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            <button className="btn gold" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button type="button" className="btn ghost" onClick={() => { setSent(false); setCode('') }}>Different email</button>
          </form>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}
