# Hammered Boilers 🚂🔨

Tailgate HQ for the Hammered Boilers. Boiler Up. Bottoms Up.

**Live:** https://rhicksrad.github.io/HammeredBoilers/

- **Gameday:** Purdue's home schedule, pulled from ESPN on its own. The next home game gets a countdown, the
  kickoff forecast, and a quick read on how much food is covered and how many asks are still open.
- **Gameday board** (one per game):
  - **Food & Drink:** who's bringing what. Tap the box to claim an item; add a note like "2 dozen brats".
  - **Asks & Logistics:** "Do we have power?", the parking pass, the tent, the grill, the ride plan… Mark each
    Yes or No, say "I'll handle it", and add the answer.
  - **Game thread:** chat for that game. It stays with the game, so past tailgates keep their conversations.
  - **Pics:** photos and videos from that game.
  - **Our spot** and **Notes:** lot, meet time, whatever.
- **Playground:** general nonsense chat, any day. GIFs work everywhere in chat: tap **GIF** to post one from your
  phone, paste one straight in, or drop a Giphy or Tenor link.
- **Gallery:** everyone's pics and videos, filterable by game. Originals stay full-size, and you can download one
  or zip a whole game.
- **Crew:** your name and emoji. Add buddies by email here.

Everything updates live for everyone. Sign in with your email and a password; only emails on the crew list get in.

## Stack

- React + Vite, hosted free on GitHub Pages (`.github/workflows/deploy-pages.yml` deploys every push to `main`).
- Supabase (free tier) handles email login, Postgres, realtime, and photo storage. Supabase project:
  `hammered-boilers` (ref `noyvywdgqugdvsuvtwty`, East US).
- Schedule: ESPN's public feed (Purdue = team 2509). Weather: Open-Meteo (Ross-Ade Stadium). Neither needs a key.
- [`public/config.js`](public/config.js) holds the Supabase URL and **publishable** key. Those are meant to be public.
  Row-level security in [`supabase/schema.sql`](supabase/schema.sql) is what keeps the data private.

## Signing in

No emails are sent. Enter your email:

- **On the crew list, first time:** pick a password and you're in.
- **Been here before:** enter your password.
- **Not on the list:** you're told to ask the crew.

**Adding people:** **Crew → Add**, then send them the site link.

**Forgot a password:** anyone in the crew hits **Reset** next to that person on the Crew page. The next time they
sign in, they pick a new one. You can also change your own password on the Crew page.

How it's enforced (all in [`supabase/schema.sql`](supabase/schema.sql)):

- A trigger on `auth.users` refuses accounts for emails that aren't on the crew list.
- `email_status()` tells the sign-in page which screen to show.
- `set_first_password()` and `reset_member_password()` handle first and forgotten passwords.

Supabase's email confirmation is turned off (`enable_confirmations = false` in `supabase/config.toml`).

The trade-off: whoever first signs in with a crew email picks that account's password. That's fine for a tailgate
site. If it ever goes wrong, hit Reset.

## Changing things

| Want to… | Do this |
|---|---|
| Change the default list for new games | Edit `list_template` in Supabase (Table Editor), or the insert in `schema.sql` |
| Change the database | Edit `supabase/schema.sql` (it's safe to re-run), then `supabase db query --linked --project-ref noyvywdgqugdvsuvtwty -f supabase/schema.sql` |
| Run it locally | `npm install`, then `npm run dev`, then open http://localhost:5173 |
| Add a non-ESPN game (bowl, road trip) | Gameday page → **Add a game by hand** |

The local database password lives in `.env.local` (gitignored). The CLI is already logged in on this machine.
