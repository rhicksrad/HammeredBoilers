import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth'
import { isConfigured, supabase } from './lib/supabase'
import Layout from './components/Layout'
import Logo from './components/Logo'
import Login from './pages/Login'
import Home from './pages/Home'
import GamePage from './pages/GamePage'
import Playground from './pages/Playground'
import Gallery from './pages/Gallery'
import Crew from './pages/Crew'

export default function App() {
  if (!isConfigured) return <SetupNeeded />
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  )
}

function Gate() {
  const { session, loading, member } = useAuth()
  if (loading || (session && member === null)) return <Splash />
  if (!session) return <Login />
  if (!member) return <NotOnList email={session.user.email ?? ''} />
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<GamePage />} />
        <Route path="/playground" element={<Playground />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/crew" element={<Crew />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function Splash() {
  return (
    <div className="center-screen">
      <Logo size={72} className="pulse" />
    </div>
  )
}

function NotOnList({ email }: { email: string }) {
  const { refreshMember } = useAuth()
  return (
    <div className="center-screen">
      <div className="card narrow stack">
        <Logo size={56} />
        <h1 className="display">Not on the list</h1>
        <p>
          <b>{email}</b> isn't in the crew yet. Ask anyone in the Hammered Boilers to add you from the <b>Crew</b> page,
          then hit the button below.
        </p>
        <div className="row">
          <button className="btn gold" onClick={refreshMember}>I've been added</button>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Use a different email</button>
        </div>
      </div>
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="center-screen">
      <div className="card narrow stack">
        <Logo size={56} />
        <h1 className="display">Almost there</h1>
        <p>
          The site isn't connected to Supabase yet. Put the project URL and publishable key in <code>public/config.js</code>{' '}
          and redeploy. The README walks through it.
        </p>
      </div>
    </div>
  )
}
