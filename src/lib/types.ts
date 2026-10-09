export type Profile = {
  id: string
  email: string | null
  display_name: string
  emoji: string
  onboarded: boolean
}

export type Game = {
  id: string
  espn_id: string | null
  opponent: string
  opponent_logo: string | null
  kickoff: string
  time_tbd: boolean
  venue: string | null
  tv: string | null
  status: 'scheduled' | 'in' | 'final'
  purdue_score: number | null
  opp_score: number | null
  lot: string | null
  notes: string | null
}

export type GameStats = {
  game_id: string
  message_count: number
  photo_count: number
  food_total: number
  food_claimed: number
  asks_open: number
}

export type ListKind = 'food' | 'ask'

export type ListItem = {
  id: string
  game_id: string
  kind: ListKind
  label: string
  note: string | null
  owner_id: string | null
  status: 'open' | 'yes' | 'no'
  sort: number
  created_by: string | null
  created_at: string
}

export type Message = {
  id: string
  game_id: string | null
  author_id: string
  body: string
  image_path: string | null
  created_at: string
}

export type Photo = {
  id: string
  game_id: string | null
  uploader_id: string
  path: string
  thumb_path: string | null
  mime: string
  caption: string | null
  created_at: string
}
