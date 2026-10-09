import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../auth'
import Logo from './Logo'
import { EMOJIS } from './Avatar'

const NAV = [
  { to: '/', label: 'Gameday', icon: '🏈', end: true },
  { to: '/playground', label: 'Playground', icon: '🍻' },
  { to: '/gallery', label: 'Gallery', icon: '📸' },
  { to: '/crew', label: 'Crew', icon: '🚂' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <Logo size={38} />
          <span>
            <span className="brand-name">Hammered Boilers</span>
            <span className="brand-tag">Boiler Up. Bottoms Up.</span>
          </span>
        </NavLink>
        <nav className="topnav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
        </nav>
        {me && (
          <NavLink to="/crew" className="me-chip" title="Your profile">
            <span className="emoji">{me.emoji}</span>
            <span className="me-name">{me.display_name}</span>
          </NavLink>
        )}
      </header>
      <div className="hazard" />
      <main className="page">{children}</main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <span className="tab-icon">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      {me && !me.onboarded && <Onboard />}
    </div>
  )
}

function Onboard() {
  const { me, saveProfile } = useAuth()
  const [name, setName] = useState(me?.display_name ?? '')
  const [emoji, setEmoji] = useState(me?.emoji ?? '🚂')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="modal-backdrop">
      <form
        className="card modal stack"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setErr(await saveProfile({ display_name: name.trim().slice(0, 30), emoji }))
        }}
      >
        <h2 className="display">Welcome to the lot</h2>
        <p className="muted">What should the crew call you?</p>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus />
        <div className="emoji-grid">
          {EMOJIS.map((x) => (
            <button type="button" key={x} className={x === emoji ? 'on' : ''} onClick={() => setEmoji(x)}>{x}</button>
          ))}
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn gold">Let's go</button>
      </form>
    </div>
  )
}
