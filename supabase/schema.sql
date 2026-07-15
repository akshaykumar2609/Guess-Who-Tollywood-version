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
  for update using (auth.uid() in (creator_id, guest_id));

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
  ('Chiranjeevi',      'https://ui-avatars.com/api/?name=Chiranjeevi&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Pawan Kalyan',     'https://ui-avatars.com/api/?name=Pawan+Kalyan&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Mahesh Babu',      'https://ui-avatars.com/api/?name=Mahesh+Babu&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Jr NTR',           'https://ui-avatars.com/api/?name=Jr+NTR&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Ram Charan',       'https://ui-avatars.com/api/?name=Ram+Charan&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Allu Arjun',       'https://ui-avatars.com/api/?name=Allu+Arjun&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Prabhas',          'https://ui-avatars.com/api/?name=Prabhas&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Vijay Deverakonda','https://ui-avatars.com/api/?name=Vijay+Deverakonda&background=1d2440&color=f5c518&size=300&bold=true', 'male', 'hero'),
  ('Nani',             'https://ui-avatars.com/api/?name=Nani&background=1d2440&color=f5c518&size=300&bold=true', 'male',   'hero'),
  ('Ravi Teja',        'https://ui-avatars.com/api/?name=Ravi+Teja&background=1d2440&color=f5c518&size=300&bold=true', 'male',  'hero'),
  ('Naga Chaitanya',   'https://ui-avatars.com/api/?name=Naga+Chaitanya&background=1d2440&color=f5c518&size=300&bold=true', 'male', 'hero'),
  ('Venkatesh',        'https://ui-avatars.com/api/?name=Venkatesh&background=1d2440&color=f5c518&size=300&bold=true', 'male','hero'),
  ('Nagarjuna',        'https://ui-avatars.com/api/?name=Nagarjuna&background=1d2440&color=f5c518&size=300&bold=true', 'male','hero'),
  ('Balakrishna',      'https://ui-avatars.com/api/?name=Balakrishna&background=1d2440&color=f5c518&size=300&bold=true', 'male', 'hero'),
  -- Heroines (female)
  ('Samantha',         'https://ui-avatars.com/api/?name=Samantha&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Kajal Aggarwal',   'https://ui-avatars.com/api/?name=Kajal+Aggarwal&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Anushka Shetty',   'https://ui-avatars.com/api/?name=Anushka+Shetty&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Tamannaah',        'https://ui-avatars.com/api/?name=Tamannaah&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Pooja Hegde',      'https://ui-avatars.com/api/?name=Pooja+Hegde&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Rakul Preet Singh', 'https://ui-avatars.com/api/?name=Rakul+Preet+Singh&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Sai Pallavi',      'https://ui-avatars.com/api/?name=Sai+Pallavi&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Rashmika Mandanna', 'https://ui-avatars.com/api/?name=Rashmika+Mandanna&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Keerthy Suresh',   'https://ui-avatars.com/api/?name=Keerthy+Suresh&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  ('Nithya Menen',     'https://ui-avatars.com/api/?name=Nithya+Menen&background=1d2440&color=f5c518&size=300&bold=true', 'female','heroine'),
  -- Directors
  ('S S Rajamouli',    'https://ui-avatars.com/api/?name=SS+Rajamouli&background=1d2440&color=f5c518&size=300&bold=true', 'male','director'),
  ('Trivikram Srinivas','https://ui-avatars.com/api/?name=Trivikram+Srinivas&background=1d2440&color=f5c518&size=300&bold=true', 'male','director'),
  ('Sukumar',          'https://ui-avatars.com/api/?name=Sukumar&background=1d2440&color=f5c518&size=300&bold=true', 'male','director'),
  ('Koratala Siva',    'https://ui-avatars.com/api/?name=Koratala+Siva&background=1d2440&color=f5c518&size=300&bold=true', 'male','director'),
  ('Boyapati Srinu',   'https://ui-avatars.com/api/?name=Boyapati+Srinu&background=1d2440&color=f5c518&size=300&bold=true', 'male','director'),
  ('Vamshi Paidipally', 'https://ui-avatars.com/api/?name=Vamshi+Paidipally&background=1d2440&color=f5c518&size=300&bold=true', 'male','director'),
  -- Villains
  ('Jagapathi Babu',   'https://ui-avatars.com/api/?name=Jagapathi+Babu&background=1d2440&color=f5c518&size=300&bold=true', 'male','villain'),
  ('Prakash Raj',      'https://ui-avatars.com/api/?name=Prakash+Raj&background=1d2440&color=f5c518&size=300&bold=true', 'male','villain'),
  ('Rao Ramesh',       'https://ui-avatars.com/api/?name=Rao+Ramesh&background=1d2440&color=f5c518&size=300&bold=true', 'male','villain'),
  ('Sai Kumar',        'https://ui-avatars.com/api/?name=Sai+Kumar&background=1d2440&color=f5c518&size=300&bold=true', 'male','villain'),
  ('Sarathkumar',      'https://ui-avatars.com/api/?name=Sarathkumar&background=1d2440&color=f5c518&size=300&bold=true', 'male','villain'),
  -- Comedians
  ('Brahmanandam',     'https://ui-avatars.com/api/?name=Brahmanandam&background=1d2440&color=f5c518&size=300&bold=true', 'male','comedian'),
  ('Ali',              'https://ui-avatars.com/api/?name=Ali&background=1d2440&color=f5c518&size=300&bold=true', 'male','comedian'),
  ('Sunil',            'https://ui-avatars.com/api/?name=Sunil&background=1d2440&color=f5c518&size=300&bold=true', 'male','comedian'),
  ('Vennela Kishore',  'https://ui-avatars.com/api/?name=Vennela+Kishore&background=1d2440&color=f5c518&size=300&bold=true', 'male','comedian'),
  -- Character artists
  ('Tanikella Bharani', 'https://ui-avatars.com/api/?name=Tanikella+Bharani&background=1d2440&color=f5c518&size=300&bold=true', 'male','character artist'),
  ('Nassar',           'https://ui-avatars.com/api/?name=Nassar&background=1d2440&color=f5c518&size=300&bold=true', 'male','character artist'),
  ('Murali Sharma',    'https://ui-avatars.com/api/?name=Murali+Sharma&background=1d2440&color=f5c518&size=300&bold=true', 'male','character artist'),
  ('Posani Krishna Murali', 'https://ui-avatars.com/api/?name=Posani+Krishna+Murali&background=1d2440&color=f5c518&size=300&bold=true', 'male','character artist')
on conflict do nothing;
