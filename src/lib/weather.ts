import { TZ } from './format'
import type { Game } from './types'

// Ross-Ade Stadium. Open-Meteo is free, keyless, and forecasts 16 days out.
const LAT = 40.4343
const LON = -86.9184

// The window we care about: from when the tailgate starts until we're inside watching.
// 8:00 PM kickoff → 3 PM to 10 PM.
export const TAILGATE_LEAD_H = 5
export const AFTER_KICKOFF_H = 2

export type Sky = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm' | 'unknown'
export type Hour = { t: number; temp: number; rain: number; icon: Sky }
export type Forecast = {
  temp: number      // first hour of the window (or the day's high when kickoff is TBA)
  endTemp: number   // last hour of the window
  rain: number      // worst chance in the window
  wind: number      // strongest wind in the window
  icon: Sky
  label: string
  daily: boolean
  hours: Hour[]     // hour by hour, tailgate through the game (empty when kickoff is TBA)
}

const CODES: [number[], Sky, string][] = [
  [[0], 'clear', 'Clear'],
  [[1, 2], 'partly', 'Partly cloudy'],
  [[3], 'overcast', 'Overcast'],
  [[45, 48], 'fog', 'Fog'],
  [[51, 53, 55, 56, 57], 'drizzle', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rain', 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'snow', 'Snow'],
  [[95, 96, 99], 'storm', 'Storms'],
]
// Codes run roughly mild → nasty, so the biggest one is the worst weather in the window.
const describe = (code: number) => {
  const hit = CODES.find(([codes]) => codes.includes(code))
  return hit ? { icon: hit[1], label: hit[2] } : { icon: 'unknown' as Sky, label: '' }
}

export async function kickoffForecast(g: Game): Promise<Forecast | null> {
  const kickoff = new Date(g.kickoff)
  const daysOut = (kickoff.getTime() - Date.now()) / 86400000
  if (daysOut > 15.5 || daysOut < -0.5) return null

  const q = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,precipitation_probability_max,weather_code,wind_speed_10m_max',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: TZ,
    forecast_days: '16',
    timeformat: 'unixtime',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`)
  if (!res.ok) return null
  const d = await res.json()

  if (!g.time_tbd) {
    const k = kickoff.getTime() / 1000
    const from = k - TAILGATE_LEAD_H * 3600 - 1800 // include the hour the tailgate starts in
    const to = k + AFTER_KICKOFF_H * 3600
    const idx = (d.hourly.time as number[]).flatMap((t, i) => (t >= from && t <= to ? [i] : []))
    if (idx.length) {
      const hours: Hour[] = idx.map((i) => ({
        t: d.hourly.time[i],
        temp: Math.round(d.hourly.temperature_2m[i]),
        rain: d.hourly.precipitation_probability[i] ?? 0,
        icon: describe(d.hourly.weather_code[i]).icon,
      }))
      return {
        temp: hours[0].temp,
        endTemp: hours[hours.length - 1].temp,
        rain: Math.max(...hours.map((h) => h.rain)),
        wind: Math.round(Math.max(...idx.map((i) => d.hourly.wind_speed_10m[i]))),
        ...describe(Math.max(...idx.map((i) => d.hourly.weather_code[i]))),
        daily: false,
        hours,
      }
    }
  }
  // Time TBA: use the day's high.
  const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
  const day = isoDay.format(kickoff)
  const dayIdx = (d.daily.time as number[]).findIndex((t) => isoDay.format(new Date(t * 1000)) === day)
  if (dayIdx < 0) return null
  const high = Math.round(d.daily.temperature_2m_max[dayIdx])
  return {
    temp: high,
    endTemp: high,
    rain: d.daily.precipitation_probability_max[dayIdx] ?? 0,
    wind: Math.round(d.daily.wind_speed_10m_max[dayIdx]),
    ...describe(d.daily.weather_code[dayIdx]),
    daily: true,
    hours: [],
  }
}
