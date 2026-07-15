-- =============================================================================
-- Tollywood Guess Who — Supabase schema, RLS policies, realtime & seed data
-- =============================================================================
-- HOW TO RUN
--  1. Open your Supabase project:  https://app.supabase.com  ->  SQL Editor
--  2. Paste this entire file and click "Run".
--  3. (Optional) Replace the placeholder image_url values in the seed section
--     with real hosted photos of the celebrities.
--
-- NOTE: everything here runs with the Postgres role that Supabase gives you in
-- the SQL Editor, so it bypasses RLS. The RLS policies below only govern what
-- the *browser* (anon / authenticated) client is allowed to do.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id    uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- celebrities  (the pool the game draws from)
-- -----------------------------------------------------------------------------
create table if not exists public.celebrities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  image_url  text not null,
  gender     text not null,
  role       text not null
              check (role in (
                'hero','heroine','director','villain','comedian','character artist'
              ))
);

-- -----------------------------------------------------------------------------
-- lobbies
-- -----------------------------------------------------------------------------
create table if not exists public.lobbies (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  creator_id       uuid not null references auth.users (id) on delete cascade,
  guest_id         uuid references auth.users (id) on delete cascade,
  celebrity_count  integer not null default 20,
  mode             text not null default 'online'
                   check (mode in ('online','local')),
  status           text not null default 'waiting'
                   check (status in ('waiting','ready','in_progress','completed')),
  game_state       jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- If the table already exists (e.g. an earlier version of this schema ran),
-- make sure the mode column is present so existing deployments keep working.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lobbies'
      and column_name = 'mode'
  ) then
    alter table public.lobbies
      add column mode text not null default 'online'
      check (mode in ('online','local'));
  end if;
end $$;

create index if not exists lobbies_code_idx on public.lobbies (code);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.celebrities enable row level security;
alter table public.lobbies    enable row level security;

-- profiles: a user can read every profile (needed for display) and only
-- insert/update their own row.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (true);

drop policy if exists "profiles_upsert_self" on public.profiles;
create policy "profiles_upsert_self" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

-- celebrities: everyone authenticated may read; nobody edits from the client.
-- (Seed rows below are inserted by you in the SQL Editor, not the client.)
drop policy if exists "celebrities_select" on public.celebrities;
create policy "celebrities_select" on public.celebrities
  for select using (auth.role() = 'authenticated');

-- lobbies: spec asks for "authenticated read/write to lobbies".
--  * SELECT: any authenticated user (the guest must look a lobby up by code).
--  * INSERT: the creator is creating their own lobby.
--  * UPDATE: the creator or the guest of that lobby.
drop policy if exists "lobbies_select" on public.lobbies;
create policy "lobbies_select" on public.lobbies
  for select using (auth.role() = 'authenticated');

drop policy if exists "lobbies_insert" on public.lobbies;
create policy "lobbies_insert" on public.lobbies
  for insert with check (auth.uid() = creator_id);

drop policy if exists "lobbies_update" on public.lobbies;
create policy "lobbies_update" on public.lobbies
  for update
  using (auth.uid() = creator_id or auth.uid() = guest_id or guest_id is null)
  with check (auth.uid() = creator_id or auth.uid() = guest_id);

-- -----------------------------------------------------------------------------
-- Realtime: the app subscribes to postgres_changes on `lobbies`.
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.lobbies;

-- =============================================================================
-- SEED DATA — 40 Tollywood (Telugu) celebrities across all roles.
-- image_url uses ui-avatars as a zero-config placeholder so the game works
-- out-of-the-box. Swap these for real hosted photos when you have them.
-- =============================================================================
insert into public.celebrities (name, image_url, gender, role) values
  -- Heroes (male)
  ('Chiranjeevi',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Chiranjeevi.jpg', 'male',   'hero'),
  ('Pawan Kalyan',     'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Pawan%20Kalyan.jpg', 'male',   'hero'),
  ('Mahesh Babu',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Mahesh%20Babu.jpg', 'male',   'hero'),
  ('Jr NTR',           'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Jr%20NTR.jpg', 'male',   'hero'),
  ('Ram Charan',       'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Ram%20Charan.jpg', 'male',   'hero'),
  ('Allu Arjun',       'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Allu%20Arjun.jpg', 'male',   'hero'),
  ('Prabhas',          'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Prabhas.jpg', 'male',   'hero'),
  ('Vijay Deverakonda','https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Vijay%20Deverakonda.jpg', 'male', 'hero'),
  ('Nani',             'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Nani.jpg', 'male',   'hero'),
  ('Ravi Teja',        'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Ravi%20Teja.jpg', 'male',  'hero'),
  ('Naga Chaitanya',   'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Naga%20Chaitanya.jpg', 'male', 'hero'),
  ('Venkatesh',        'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Venkatesh.jpg', 'male','hero'),
  ('Nagarjuna',        'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Nagarjuna.jpg', 'male','hero'),
  ('Balakrishna',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Balakrishna.jpg', 'male', 'hero'),
  -- Heroines (female)
  ('Samantha',         'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Samantha.jpg', 'female','heroine'),
  ('Kajal Aggarwal',   'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Kajal%20Aggarwal.jpg', 'female','heroine'),
  ('Anushka Shetty',   'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Anushka%20Shetty.jpg', 'female','heroine'),
  ('Tamannaah',        'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Tamannaah.jpg', 'female','heroine'),
  ('Pooja Hegde',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Pooja%20Hegde.jpg', 'female','heroine'),
  ('Rakul Preet Singh', 'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Rakul%20Preet%20Singh.jpg', 'female','heroine'),
  ('Sai Pallavi',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Sai%20Pallavi.jpg', 'female','heroine'),
  ('Rashmika Mandanna', 'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Rashmika%20Mandanna.jpg', 'female','heroine'),
  ('Keerthy Suresh',   'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Keerthy%20Suresh.jpg', 'female','heroine'),
  ('Nithya Menen',     'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Nithya%20Menen.jpg', 'female','heroine'),
  -- Directors
  ('S S Rajamouli',    'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/S%20S%20Rajamouli.jpg', 'male','director'),
  ('Trivikram Srinivas','https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Trivikram%20Srinivas.jpg', 'male','director'),
  ('Sukumar',          'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Sukumar.jpg', 'male','director'),
  ('Koratala Siva',    'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Koratala%20Siva.jpg', 'male','director'),
  ('Boyapati Srinu',   'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Boyapati%20Srinu.jpg', 'male','director'),
  ('Vamshi Paidipally', 'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Vamshi%20Paidipally.jpg', 'male','director'),
  -- Villains
  ('Jagapathi Babu',   'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Jagapathi%20Babu.jpg', 'male','villain'),
  ('Prakash Raj',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Prakash%20Raj.jpg', 'male','villain'),
  ('Rao Ramesh',       'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Rao%20Ramesh.jpg', 'male','villain'),
  ('Sai Kumar',        'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Sai%20Kumar.jpg', 'male','villain'),
  ('Sarathkumar',      'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Sarathkumar.jpg', 'male','villain'),
  -- Comedians
  ('Brahmanandam',     'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Brahmanandam.jpg', 'male','comedian'),
  ('Ali',              'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Ali.jpg', 'male','comedian'),
  ('Sunil',            'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Sunil.jpg', 'male','comedian'),
  ('Vennela Kishore',  'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Vennela%20Kishore.jpg', 'male','comedian'),
  -- Character artists
  ('Tanikella Bharani', 'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Tanikella%20Bharani.jpg', 'male','character artist'),
  ('Nassar',           'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Nassar.jpg', 'male','character artist'),
  ('Murali Sharma',    'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Murali%20Sharma.jpg', 'male','character artist'),
  ('Posani Krishna Murali', 'https://tpdbgiceucfxdhusgyii.supabase.co/storage/v1/object/public/celebrities/Posani%20Krishna%20Murali.jpg', 'male','character artist')
on conflict do nothing;
