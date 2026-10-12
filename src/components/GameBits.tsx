import { useEffect, useState } from 'react'
import { kickoffForecast, type Forecast } from '../lib/weather'
import { clock } from '../lib/format'
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

// One fetch per game per page load, shared by the chip and the hourly strip.
const forecasts = new Map<string, Promise<Forecast | null>>()
function useForecast(game: Game) {
  const [f, setF] = useState<Forecast | null>(null)
  useEffect(() => {
    let live = true
    const key = `${game.id}:${game.kickoff}:${game.time_tbd}`
    if (!forecasts.has(key)) forecasts.set(key, kickoffForecast(game).catch(() => null))
    forecasts.get(key)!.then((x) => live && setF(x))
    return () => { live = false }
  }, [game.id, game.kickoff, game.time_tbd])
  return f
}

// "3 PM" / "10 PM"
const hourLabel = (t: number) => clock(new Date(t * 1000).toISOString()).replace(':00', '')

export function WeatherChip({ game }: { game: Game }) {
  const f = useForecast(game)
  if (!f) return null
  let span = ''
  if (f.hours.length) {
    const a = hourLabel(f.hours[0].t), b = hourLabel(f.hours[f.hours.length - 1].t)
    span = `${a.slice(-2) === b.slice(-2) ? a.slice(0, -3) : a}–${b}` // "3–10 PM", "11 AM–2 PM"
  }
  return (
    <span className="chip weather" title={f.daily ? 'Daily forecast (kickoff time TBA)' : `Tailgate through the game, ${span}`}>
      {f.icon} {f.daily ? `${f.temp}°F high` : `${f.temp}°→${f.endTemp}°F`}{span && ` · ${span}`} · {f.rain}% rain · {f.wind} mph
    </span>
  )
}

/** Hour-by-hour temps from when the tailgate starts through the game. */
export function TempStrip({ game }: { game: Game }) {
  const f = useForecast(game)
  if (!f?.hours.length) return null
  const kick = new Date(game.kickoff).getTime() / 1000
  return (
    <div className="temp-strip" aria-label="Hourly forecast, tailgate through the game">
      {f.hours.map((h) => {
        const isKick = Math.abs(h.t - kick) < 1800
        return (
          <div key={h.t} className={`ts-hour ${isKick ? 'kick' : ''}`} title={`${h.rain}% rain`}>
            <span className="ts-time">{isKick ? 'Kick' : hourLabel(h.t)}</span>
            <span className="ts-icon">{h.icon}</span>
            <span className="ts-temp">{h.temp}°</span>
            {h.rain >= 20 && <span className="ts-rain">{h.rain}%</span>}
          </div>
        )
      })}
    </div>
  )
}
