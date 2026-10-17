# Hammered Boilers 🚂🔨

Tailgate HQ for the Hammered Boilers. Boiler Up. Bottoms Up.

**Live:** https://rhicksrad.github.io/HammeredBoilers/

- **Gameday:** Purdue's home schedule, pulled from ESPN on its own. The next home game gets a countdown, an
  hour-by-hour forecast from when the tailgate starts through the game (5 hours before kickoff to 2 hours after,
  so an 8 PM kickoff shows 3 to 10 PM), and a quick read on how much food is covered and how many asks are still open.
- **Gameday board** (one per game):
  - **Food & Drink:** who's bringing what. Tap the box to claim an item yourself, or use the **Who's bringing it?**
    dropdown to put anyone on it, so whoever runs the list can fill it in for everybody. **Someone else…** covers
    people who aren't on the site. Add a note like "2 dozen brats".
  - **Asks & Logistics:** "Do we have power?", the parking pass, the tent, the grill, the ride plan… Mark each
    Yes or No, pick who's on it, and add the answer.
  - **DJ Booth:** song requests for that game. Anyone requests a song (with an optional note); the DJ approves or
    denies each one with a note back, then hits **Print the list** for a black-and-white sheet to post in the booth.
    DJ KevDad is the only DJ. That's set in the database (`members.dj`), not on the site, so nobody can hand it off.
  - **Game thread:** chat for that game. It stays with the game, so past tailgates keep their conversations.
  - **Pics:** photos and videos from that game.
  - **Our spot** and **Notes:** lot, meet time, whatever.
- **What's new:** the bell in the top bar lists what everyone else has been up to, with a count of new ones: new crew
  members, chat posts, food and asks added to a game's lists, photos, and song requests. Tap one to jump there.
  Edits like name changes don't show up as new.
- **Tagging:** type **@** in any chat to tag someone (or **@crew** for everybody). Messages that tag you are
  highlighted, and they're called out as "Tagged you" in the bell.
- **Playground:** general nonsense chat, any day. GIFs work everywhere in chat: tap **GIF** to post one from your
  phone, paste one straight in, or drop a Giphy or Tenor link.
- **Gallery:** everyone's pics and videos, filterable by game, in the order they were taken (the photo's own date,
  not when it was uploaded). The same pic added by more than one person shows once, stacked, with everyone who
  added it. That covers re-shared copies too (texted or AirDropped, so the file changed): two people's pics taken
  within two seconds that look alike count as one. Originals stay full-size, and you can download one or zip a whole game.
- **Reactions & comments:** react to any photo, video, chat message or photo comment with an emoji: tap the smiley
  for quick picks, a bigger set, or any emoji off your keyboard. Tap a reaction to add or take back yours; the smiley
  also shows who reacted with what. Every photo and video has its own comment thread (**Comment** in the photo
  viewer). Reactions to your things and comments on pics show up in the bell.
- **Crew:** your name and avatar: upload a photo, or pick a badge (hammer, train, beer…). Add buddies by email here.

Everything updates live for everyone. Sign in with your email and a password; only emails on the crew list get in.

## Put it on your phone

It installs like an app: its own icon, full screen, no browser bar.

The site offers it itself: an **Add to Home Screen** banner on Gameday and a button on the Crew page. On Android
it's one tap; on iPhone it shows the steps below (Apple doesn't let websites install themselves).

- **iPhone:** open the site in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open it in Chrome, tap **⋮**, then **Add to Home screen** (or **Install app** if Chrome offers it).

Pull down from the top of any page in the home-screen app to refresh. The home-screen app always loads the latest version when you have signal. With no signal it still opens, but
nothing live works until you're back online.

## Stack

- React + Vite, hosted free on GitHub Pages (`.github/workflows/deploy-pages.yml` deploys every push to `main`).
- Installable as an app: [`public/manifest.webmanifest`](public/manifest.webmanifest), icons in `public/icons/`, and a
  service worker ([`public/sw.js`](public/sw.js)) that caches only the app itself. The page is fetched fresh each open,
  so deploys show up right away; Supabase and the other APIs are never cached.
- Supabase (free tier) handles email login, Postgres and realtime. Photos and videos go to Cloudflare R2 through a small
  Worker ([`worker/`](worker/README.md)) once `filesUrl` is set in `public/config.js`; until then they use Supabase storage.
  [`keep-awake.yml`](.github/workflows/keep-awake.yml) (and the Worker, on its own schedule) pings Supabase every few
  days so the free project never pauses. Supabase project:
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
