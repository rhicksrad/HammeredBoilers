import type { Profile } from './types'

// Tags are stored in the message body as <@user-id> (or <@crew> for everybody), so they keep
// pointing at the right person when someone changes their name. The composer shows plain @Name.
export const CREW = 'crew'
export const TOKEN_RE = /<@([0-9a-f-]{36}|crew)>/g

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "@Kev Dad what's up @crew" → "<@id> what's up <@crew>". Longest names first so "@Kev Dad" beats "@Kev". */
export function encodeMentions(text: string, profiles: Profile[]) {
  const named = [...profiles, { id: CREW, display_name: CREW } as Profile]
    .filter((p) => p.display_name.trim())
    .sort((a, b) => b.display_name.length - a.display_name.length)
  let out = text
  for (const p of named) {
    out = out.replace(new RegExp(`@${escape(p.display_name.trim())}(?![\\p{L}\\p{N}_])`, 'giu'), `<@${p.id}>`)
  }
  return out
}

export const mentionsMe = (body: string, myId?: string) =>
  Boolean(myId) && (body.includes(`<@${myId}>`) || body.includes(`<@${CREW}>`))

/** Body as plain text with tags turned back into @Names (for previews). */
export const plainMentions = (body: string, profiles: Record<string, Profile>) =>
  body.replace(TOKEN_RE, (_, id: string) => `@${id === CREW ? CREW : profiles[id]?.display_name ?? 'someone'}`)
