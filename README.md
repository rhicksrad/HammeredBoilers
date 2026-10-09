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

Everything updates live for everyone. Login is by email: no passwords, and only emails on the crew list get in.

## Stack

- React + Vite, hosted free on GitHub Pages (`.github/workflows/deploy-pages.yml` deploys every push to `main`).
- Supabase (free tier) handles email login, Postgres, realtime, and photo storage. Supabase project:
  `hammered-boilers` (ref `noyvywdgqugdvsuvtwty`, East US).
- Schedule: ESPN's public feed (Purdue = team 2509). Weather: Open-Meteo (Ross-Ade Stadium). Neither needs a key.
- [`public/config.js`](public/config.js) holds the Supabase URL and **publishable** key. Those are meant to be public.
  Row-level security in [`supabase/schema.sql`](supabase/schema.sql) is what keeps the data private.

## Adding people

Anyone already in the crew: **Crew → Add to crew → their email**. Then they go to the site, enter that email, and
tap the link Supabase sends them.

## Email: read this before inviting the crew ⚠️

Supabase's built-in email sender is for testing only. It sends **only to members of your Supabase org** and only
a few emails per hour. Your own login works now. Your buddies won't get their sign-in emails until you hook up a real
sender (free options):

- **Resend** (resend.com): 3,000 emails a month free. You'll need a domain you can add DNS records to.
- **Gmail**: turn on 2-step verification, then make an *App password*. Host `smtp.gmail.com`, port `465`,
  user = your Gmail address, pass = the app password.
- **Brevo** (brevo.com): 300 a day free, and no domain needed (it verifies your sender address).

Put the details in **Supabase → Authentication → Emails → SMTP Settings**. Also raise
**Authentication → Rate Limits → emails per hour** to something like 30.

Once SMTP is on, you can switch on the branded email, which also carries a 6-digit code (handy when the link opens
in the wrong browser):
uncomment the two `[auth.email.template.*]` blocks in [`supabase/config.toml`](supabase/config.toml), then run

```bash
supabase config push --project-ref noyvywdgqugdvsuvtwty
```

## Changing things

| Want to… | Do this |
|---|---|
| Change the default list for new games | Edit `list_template` in Supabase (Table Editor), or the insert in `schema.sql` |
| Change the database | Edit `supabase/schema.sql` (it's safe to re-run), then `supabase db query --linked --project-ref noyvywdgqugdvsuvtwty -f supabase/schema.sql` |
| Run it locally | `npm install`, then `npm run dev`, then open http://localhost:5173 |
| Add a non-ESPN game (bowl, road trip) | Gameday page → **Add a game by hand** |

The local database password lives in `.env.local` (gitignored). The CLI is already logged in on this machine.
