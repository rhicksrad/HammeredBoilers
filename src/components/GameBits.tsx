import { useEffect, useState } from 'react'
import { kickoffForecast, type Forecast } from '../lib/weather'
import type { Game } from '../lib/types'

export function TeamLogo({ src, alt, size = 48 }: { src?: string | null; alt: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return <span className="team-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>{alt.slice(0, 2).toUpperCase()}</span>
  }
  return <img className="team-logo" src={src} alt={alt} width={size} height={size} loading="lazy" onError={() => setBroken(true)} />
}

export const PURDUE_LOGO = 'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/2509.png'

export function Countdown({ game }: { game: Game }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(game.kickoff).getTime() - now
  if (game.status === 'in') return <div className="countdown live">● GAME ON</div>
  if (ms <= 0) return <div className="countdown live">{game.time_tbd ? "IT'S GAMEDAY" : 'KICKOFF'}</div>
  const s = Math.floor(ms / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86400), 'days'],
    [Math.floor((s % 86400) / 3600), 'hrs'],
    [Math.floor((s % 3600) / 60), 'min'],
    [s % 60, 'sec'],
  ]
  return (
    <div className="countdown">
      {parts.map(([n, l]) => (
        <div key={l} className="cd-cell">
          <span className="cd-num">{String(n).padStart(2, '0')}</span>
          <span className="cd-lbl">{l}</span>
        </div>
      ))}
    </div>
  )
}

export function WeatherChip({ game }: { game: Game }) {
  const [f, setF] = useState<Forecast | null>(null)
  useEffect(() => {
    let live = true
    kickoffForecast(game).then((x) => live && setF(x)).catch(() => {})
    return () => { live = false }
  }, [game.id, game.kickoff, game.time_tbd])
  if (!f) return null
  return (
    <span className="chip weather" title={f.daily ? 'Daily forecast (kickoff time TBA)' : 'Forecast at kickoff'}>
      {f.icon} {f.temp}°F{f.daily ? ' high' : ''} · {f.rain}% rain · {f.wind} mph
    </span>
  )
}
