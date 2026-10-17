-- ============================================================================
--  Hammered Boilers — Supabase schema
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Crew allowlist. Only emails in here can see or touch anything.
-- Any member can invite another from the site (Crew page).
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  email      text primary key check (email = lower(email)),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per login). Created automatically on first sign-in.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text not null default 'Boiler',
  emoji        text not null default 'train', -- avatar badge key (older rows may still hold an emoji)
  avatar_path  text,                          -- profile photo in the gallery bucket: <user id>/avatar/<uuid>.jpg
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now()
);
-- Added after launch; safe to re-run.
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles alter column emoji set default 'train';

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, lower(new.email), coalesce(nullif(split_part(new.email, '@', 1), ''), 'Boiler'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for anyone who signed up before this file was run.
insert into public.profiles (id, email, display_name)
select u.id, lower(u.email), coalesce(nullif(split_part(u.email, '@', 1), ''), 'Boiler')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Games. Home games are synced from ESPN by the site; extras can be added by hand.
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  espn_id       text unique,                 -- null = added by hand
  opponent      text not null,
  opponent_logo text,
  kickoff       timestamptz not null,
  time_tbd      boolean not null default false,
  venue         text,
  tv            text,
  status        text not null default 'scheduled' check (status in ('scheduled', 'in', 'final')),
  purdue_score  int,
  opp_score     int,
  lot           text default 'W Lot',        -- where the tailgate is set up (we're always in W Lot)
  notes         text,                        -- meet time, anything else
  created_at    timestamptz not null default now()
);
create index if not exists games_kickoff_idx on public.games (kickoff);
alter table public.games alter column lot set default 'W Lot';

-- ---------------------------------------------------------------------------
-- The two-part list for each game: food & drink, and asks / logistics.
-- New games get seeded from list_template (edit it to change the defaults).
-- ---------------------------------------------------------------------------
create table if not exists public.list_template (
  id    serial primary key,
  kind  text not null check (kind in ('food', 'ask')),
  label text not null unique,
  sort  int  not null default 0
);

insert into public.list_template (kind, label, sort) values
  ('food', 'Brats / burgers for the grill',     10),
  ('food', 'Buns & condiments',                 20),
  ('food', 'Chips & dip',                       30),
  ('food', 'A side (wings, mac, pasta salad…)', 40),
  ('food', 'Dessert',                           50),
  ('food', 'Beer',                              60),
  ('food', 'Seltzers / mixers',                 70),
  ('food', 'Water & pop',                       80),
  ('food', 'Ice (lots)',                        90),
  ('food', 'Plates, cups, napkins',            100),
  ('ask',  'Do we have power? (generator / inverter)', 10),
  ('ask',  'Who has the parking pass?',         20),
  ('ask',  'Tent / canopy?',                    30),
  ('ask',  'Grill + propane / charcoal?',       40),
  ('ask',  'Tables & chairs?',                  50),
  ('ask',  'Coolers?',                          60),
  ('ask',  'TV + feed for the early games?',    70),
  ('ask',  'Speaker + playlist?',               80),
  ('ask',  'Cornhole / games?',                 90),
  ('ask',  'Trash bags & cleanup?',            100),
  ('ask',  'Ride plan / DD sorted?',           110),
  ('ask',  'Everyone got tickets?',            120)
on conflict (label) do nothing;

create table if not exists public.list_items (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games(id) on delete cascade,
  kind       text not null check (kind in ('food', 'ask')),
  label      text not null check (char_length(label) between 1 and 200),
  note       text check (char_length(note) <= 500),
  owner_id   uuid references public.profiles(id) on delete set null, -- food: who's bringing it · ask: who's on it
  status     text not null default 'open' check (status in ('open', 'yes', 'no')),
  sort       int  not null default 1000,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists list_items_game_idx on public.list_items (game_id);
-- Whoever runs the list can say who's bringing what, even for people who aren't on the site.
-- owner_id = a crew member · owner_name = anyone else ("Uncle Bob"). The site sets one and clears the other.
alter table public.list_items add column if not exists owner_name text check (char_length(owner_name) <= 40);

create or replace function public.seed_game_list()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.list_items (game_id, kind, label, sort, created_by)
  select new.id, t.kind, t.label, t.sort, null
  from public.list_template t;
  return new;
end;
$$;

drop trigger if exists games_seed_list on public.games;
create trigger games_seed_list
  after insert on public.games
  for each row execute function public.seed_game_list();

-- ---------------------------------------------------------------------------
-- Chat. game_id set = that game's thread · game_id null = the Playground.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid references public.games(id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_game_idx on public.messages (game_id, created_at desc);

-- GIFs / pics posted in chat (stored in the gallery bucket under <user id>/chat/, not shown in the Gallery).
alter table public.messages add column if not exists image_path text;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 2000 and (char_length(body) >= 1 or image_path is not null));

-- ---------------------------------------------------------------------------
-- Gallery. Files live in the private "gallery" storage bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references public.games(id) on delete set null,
  uploader_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  path        text not null unique,          -- original file
  thumb_path  text,                          -- small webp preview (images only)
  mime        text not null default 'image/jpeg',
  caption     text check (char_length(caption) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists photos_game_idx on public.photos (game_id, created_at desc);

-- ---------------------------------------------------------------------------
-- DJ booth. Anyone in the crew can request a song for a game; the DJ approves
-- or denies it with a note, then prints the approved list for the booth.
-- DJ KevDad is the DJ. The flag can't be changed from the site; set it here:
--   update public.members set dj = (email = 'his@email') ;
-- ---------------------------------------------------------------------------
alter table public.members add column if not exists dj boolean not null default false;

create or replace function public.is_dj()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and dj
  );
$$;

create table if not exists public.song_requests (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games(id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  song         text not null check (char_length(song) between 1 and 200),
  artist       text check (char_length(artist) <= 200),
  note         text check (char_length(note) <= 300),       -- from the requester ("after the first TD")
  status       text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  dj_note      text check (char_length(dj_note) <= 300),    -- from the DJ, approve or deny
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists song_requests_game_idx on public.song_requests (game_id, created_at);

-- Only a DJ can rule on a request. Non-DJ inserts always start out pending
-- (a DJ's own adds can go straight on the list), and nobody can move a
-- request to another game or another requester.
create or replace function public.song_request_guard()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_dj() then
      new.status := 'pending';
      new.dj_note := null;
    end if;
    new.decided_at := case when new.status = 'pending' then null else now() end;
  else
    new.game_id := old.game_id;
    new.requested_by := old.requested_by;
    new.created_at := old.created_at;
    if new.status is distinct from old.status then
      new.decided_at := case when new.status = 'pending' then null else now() end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists song_request_guard on public.song_requests;
create trigger song_request_guard
  before insert or update on public.song_requests
  for each row execute function public.song_request_guard();

-- ---------------------------------------------------------------------------
-- Password sign-in (no emails). Email confirmation is off in the auth settings,
-- so these are what keep accounts to the crew:
--   * only emails on the crew list can create an account
--   * the sign-in page asks email_status() whether to show "password" or "pick a password"
--   * accounts with no password yet (or reset by a crew mate) pick one on next sign-in
-- ---------------------------------------------------------------------------
create or replace function public.only_crew_signups()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.members where email = lower(new.email)) then
    raise exception 'That email is not on the crew list';
  end if;
  return new;
end;
$$;

drop trigger if exists only_crew_signups on auth.users;
create trigger only_crew_signups
  before insert on auth.users
  for each row execute function public.only_crew_signups();

-- 'not_member' | 'new' (no account yet) | 'set_password' (account, no password) | 'password'
create or replace function public.email_status(p_email text)
returns text
language sql stable security definer set search_path = public, auth
as $$
  select case
    when not exists (select 1 from public.members where email = lower(trim(p_email))) then 'not_member'
    when not exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) then 'new'
    when exists (select 1 from auth.users where lower(email) = lower(trim(p_email))
                 and coalesce(encrypted_password, '') <> '') then 'password'
    else 'set_password'
  end;
$$;

-- First password for an account that doesn't have one (made by an old email link, or reset).
create or replace function public.set_first_password(p_email text, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions
as $$
begin
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'Password needs at least 6 characters';
  end if;
  if not exists (select 1 from public.members where email = lower(trim(p_email))) then
    raise exception 'That email is not on the crew list';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where lower(email) = lower(trim(p_email))
     and coalesce(encrypted_password, '') = '';
  if not found then
    raise exception 'That account already has a password';
  end if;
end;
$$;

-- Forgot it? Any crew member can clear someone's password; they pick a new one next sign-in.
create or replace function public.reset_member_password(p_email text)
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_member() then
    raise exception 'Only crew members can reset passwords';
  end if;
  update auth.users set encrypted_password = '', updated_at = now()
   where lower(email) = lower(trim(p_email));
end;
$$;

revoke all on function public.email_status(text) from public;
revoke all on function public.set_first_password(text, text) from public;
revoke all on function public.reset_member_password(text) from public;
grant execute on function public.email_status(text) to anon, authenticated;
grant execute on function public.set_first_password(text, text) to anon, authenticated;
grant execute on function public.reset_member_password(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-game rollup for the schedule cards.
-- ---------------------------------------------------------------------------
create or replace view public.game_stats
with (security_invoker = true) as
select
  g.id as game_id,
  (select count(*) from public.messages m where m.game_id = g.id)                                     as message_count,
  (select count(*) from public.photos p where p.game_id = g.id)                                       as photo_count,
  (select count(*) from public.list_items i where i.game_id = g.id and i.kind = 'food')               as food_total,
  (select count(*) from public.list_items i where i.game_id = g.id and i.kind = 'food'
     and (i.owner_id is not null or i.owner_name is not null))                                       as food_claimed,
  (select count(*) from public.list_items i where i.game_id = g.id and i.kind = 'ask' and i.status = 'open')       as asks_open
from public.games g;

-- ---------------------------------------------------------------------------
-- Row-level security: crew members only.
-- ---------------------------------------------------------------------------
alter table public.members       enable row level security;
alter table public.profiles      enable row level security;
alter table public.games         enable row level security;
alter table public.list_template enable row level security;
alter table public.list_items    enable row level security;
alter table public.messages      enable row level security;
alter table public.photos        enable row level security;
alter table public.song_requests enable row level security;

-- members: crew can see the list and invite people; remove anyone but yourself. Nothing is editable
-- from the site (the DJ flag is set in SQL only).
drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
create policy members_select on public.members for select to authenticated using (public.is_member());
create policy members_insert on public.members for insert to authenticated with check (public.is_member());
revoke update on public.members from anon, authenticated;
create policy members_delete on public.members for delete to authenticated
  using (public.is_member() and email <> lower(coalesce(auth.jwt() ->> 'email', '')));

-- profiles: crew can see everyone; you edit only yourself
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.is_member());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_member()) with check (id = auth.uid());

-- games: crew can read, sync, add, and edit lot/notes; only hand-added games can be deleted
drop policy if exists games_select on public.games;
drop policy if exists games_insert on public.games;
drop policy if exists games_update on public.games;
drop policy if exists games_delete on public.games;
create policy games_select on public.games for select to authenticated using (public.is_member());
create policy games_insert on public.games for insert to authenticated with check (public.is_member());
create policy games_update on public.games for update to authenticated using (public.is_member()) with check (public.is_member());
create policy games_delete on public.games for delete to authenticated using (public.is_member() and espn_id is null);

-- list template: readable (edit it in the SQL editor)
drop policy if exists list_template_select on public.list_template;
create policy list_template_select on public.list_template for select to authenticated using (public.is_member());

-- list items: anyone in the crew can add, claim, answer, edit, or remove
drop policy if exists list_items_select on public.list_items;
drop policy if exists list_items_insert on public.list_items;
drop policy if exists list_items_update on public.list_items;
drop policy if exists list_items_delete on public.list_items;
create policy list_items_select on public.list_items for select to authenticated using (public.is_member());
create policy list_items_insert on public.list_items for insert to authenticated with check (public.is_member());
create policy list_items_update on public.list_items for update to authenticated using (public.is_member()) with check (public.is_member());
create policy list_items_delete on public.list_items for delete to authenticated using (public.is_member());

-- messages: post as yourself; delete only your own
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_delete on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.is_member());
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (public.is_member() and author_id = auth.uid());

-- photos: upload as yourself; edit caption / delete only your own
drop policy if exists photos_select on public.photos;
drop policy if exists photos_insert on public.photos;
drop policy if exists photos_update on public.photos;
drop policy if exists photos_delete on public.photos;
create policy photos_select on public.photos for select to authenticated using (public.is_member());
create policy photos_insert on public.photos for insert to authenticated
  with check (public.is_member() and uploader_id = auth.uid());
create policy photos_update on public.photos for update to authenticated
  using (public.is_member() and uploader_id = auth.uid()) with check (uploader_id = auth.uid());
create policy photos_delete on public.photos for delete to authenticated
  using (public.is_member() and uploader_id = auth.uid());

-- song requests: request as yourself; only the DJ approves/denies; delete your own (the DJ can delete any)
drop policy if exists song_requests_select on public.song_requests;
drop policy if exists song_requests_insert on public.song_requests;
drop policy if exists song_requests_update on public.song_requests;
drop policy if exists song_requests_delete on public.song_requests;
create policy song_requests_select on public.song_requests for select to authenticated using (public.is_member());
create policy song_requests_insert on public.song_requests for insert to authenticated
  with check (public.is_member() and requested_by = auth.uid());
create policy song_requests_update on public.song_requests for update to authenticated
  using (public.is_dj()) with check (public.is_dj());
create policy song_requests_delete on public.song_requests for delete to authenticated
  using (public.is_member() and (requested_by = auth.uid() or public.is_dj()));

-- ---------------------------------------------------------------------------
-- Storage bucket for the gallery (private; the site uses signed URLs).
-- Files go under "<your user id>/…", so you can only write/delete your own.
-- 50 MB per file is the free-tier cap; covers phone photos and short videos.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gallery_select on storage.objects;
drop policy if exists gallery_insert on storage.objects;
drop policy if exists gallery_delete on storage.objects;
create policy gallery_select on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and public.is_member());
create policy gallery_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.is_member()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy gallery_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and public.is_member()
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime: push changes to everyone's screen live.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages', 'list_items', 'photos', 'games', 'profiles', 'song_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- FIRST RUN: add yourself so you can get in, then invite the rest from the site.
--   insert into public.members (email) values ('you@example.com');
-- ---------------------------------------------------------------------------
