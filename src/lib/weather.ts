import { TZ } from './format'
import type { Game } from './types'

// Ross-Ade Stadium. Open-Meteo is free, keyless, and forecasts 16 days out.
const LAT = 40.4343
const LON = -86.9184

export type Forecast = { temp: number; rain: number; wind: number; icon: string; label: string; daily: boolean }

const CODES: [number[], string, string][] = [
  [[0], '☀️', 'Clear'],
  [[1, 2], '🌤️', 'Partly cloudy'],
  [[3], '☁️', 'Overcast'],
  [[45, 48], '🌫️', 'Fog'],
  [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Rain'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'Snow'],
  [[95, 96, 99], '⛈️', 'Storms'],
]
const describe = (code: number) => {
  const hit = CODES.find(([codes]) => codes.includes(code))
  return hit ? { icon: hit[1], label: hit[2] } : { icon: '🌡️', label: '' }
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
    const target = kickoff.getTime() / 1000
    const times: number[] = d.hourly.time
    let best = 0
    times.forEach((t, i) => { if (Math.abs(t - target) < Math.abs(times[best] - target)) best = i })
    if (Math.abs(times[best] - target) < 3 * 3600) {
      return {
        temp: Math.round(d.hourly.temperature_2m[best]),
        rain: d.hourly.precipitation_probability[best] ?? 0,
        wind: Math.round(d.hourly.wind_speed_10m[best]),
        ...describe(d.hourly.weather_code[best]),
        daily: false,
      }
    }
  }
  // Time TBA: use the day's high.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(kickoff)
  const dayIdx = (d.daily.time as number[]).findIndex(
    (t) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t * 1000)) === day,
  )
  if (dayIdx < 0) return null
  return {
    temp: Math.round(d.daily.temperature_2m_max[dayIdx]),
    rain: d.daily.precipitation_probability_max[dayIdx] ?? 0,
    wind: Math.round(d.daily.wind_speed_10m_max[dayIdx]),
    ...describe(d.daily.weather_code[dayIdx]),
    daily: true,
  }
}
