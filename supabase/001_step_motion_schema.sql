-- Step Motion schema for Supabase Postgres
-- Supports doctor/patient roles, doctor-to-patient assignments,
-- patient goals, live sessions, and recorded progress entries.

create extension if not exists pgcrypto;

create type public.app_role as enum ('doctor', 'patient');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create table public.doctor_patient_assignments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, patient_id),
  check (doctor_id <> patient_id)
);

create index doctor_patient_assignments_doctor_idx
  on public.doctor_patient_assignments (doctor_id);

create index doctor_patient_assignments_patient_idx
  on public.doctor_patient_assignments (patient_id);

create trigger set_doctor_patient_assignments_updated_at
before update on public.doctor_patient_assignments
for each row
execute function public.set_updated_at();

create table public.patient_goals (
  patient_id uuid primary key references public.profiles(id) on delete cascade,
  daily_step_goal integer not null default 100 check (daily_step_goal > 0),
  weekly_step_goal integer not null default 700 check (weekly_step_goal > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_patient_goals_updated_at
before update on public.patient_goals
for each row
execute function public.set_updated_at();

create or replace function public.is_doctor(check_user uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = check_user
      and role = 'doctor'
  );
$$;

create or replace function public.is_assigned_doctor(target_patient uuid, check_doctor uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.doctor_patient_assignments
    where patient_id = target_patient
      and doctor_id = check_doctor
      and status = 'active'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(
    new.raw_user_meta_data ->> 'role',
    new.raw_app_meta_data ->> 'role',
    'patient'
  );

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    case when requested_role = 'doctor' then 'doctor'::public.app_role else 'patient'::public.app_role end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        updated_at = now();

  insert into public.patient_goals (patient_id, daily_step_goal)
  select new.id, 100
  where requested_role <> 'doctor'
  on conflict (patient_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Kept compatible with the current backend writer.
create table public.sessions (
  session_id text primary key,
  user_id text not null,
  patient_id uuid references public.profiles(id) on delete set null,
  started_at bigint not null,
  stopped_at bigint,
  status text not null default 'running' check (status in ('running', 'stopped')),
  updated_at bigint not null,
  latest_metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx
  on public.sessions (user_id);

create index sessions_patient_id_idx
  on public.sessions (patient_id);

create index sessions_status_idx
  on public.sessions (status);

create table public.session_frames (
  session_id text not null references public.sessions(session_id) on delete cascade,
  ts bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (session_id, ts)
);

create index session_frames_session_id_idx
  on public.session_frames (session_id);

create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  session_id text references public.sessions(session_id) on delete set null,
  recorded_at timestamptz not null default now(),
  step_count integer not null default 0 check (step_count >= 0),
  distance_m numeric(10, 2) not null default 0 check (distance_m >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  cadence_spm numeric(10, 2) not null default 0 check (cadence_spm >= 0),
  avg_step_interval_ms numeric(10, 2) not null default 0 check (avg_step_interval_ms >= 0),
  intensity numeric(6, 3) not null default 0 check (intensity >= 0),
  activity_state text not null default 'idle' check (activity_state in ('idle', 'walking', 'running')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index progress_entries_patient_id_idx
  on public.progress_entries (patient_id, recorded_at desc);

create index progress_entries_session_id_idx
  on public.progress_entries (session_id);

create trigger set_progress_entries_updated_at
before update on public.progress_entries
for each row
execute function public.set_updated_at();

create or replace view public.patient_progress_summary as
select
  p.patient_id,
  pr.full_name as patient_name,
  coalesce(g.daily_step_goal, 100) as daily_step_goal,
  coalesce(sum(pe.step_count) filter (where pe.recorded_at::date = current_date), 0) as today_steps,
  max(pe.recorded_at) as last_recorded_at,
  count(pe.id) as total_entries
from public.patient_goals p
join public.profiles pr on pr.id = p.patient_id
left join public.patient_goals g on g.patient_id = p.patient_id
left join public.progress_entries pe on pe.patient_id = p.patient_id
group by p.patient_id, pr.full_name, g.daily_step_goal;

alter table public.profiles enable row level security;
alter table public.doctor_patient_assignments enable row level security;
alter table public.patient_goals enable row level security;
alter table public.sessions enable row level security;
alter table public.session_frames enable row level security;
alter table public.progress_entries enable row level security;

create policy "profiles_select_self_or_assigned"
on public.profiles
for select
using (
  id = auth.uid()
  or public.is_assigned_doctor(id)
  or (
    public.is_doctor()
    and exists (
      select 1
      from public.doctor_patient_assignments dpa
      where dpa.doctor_id = profiles.id
        and dpa.patient_id = auth.uid()
        and dpa.status = 'active'
    )
  )
);

create policy "profiles_update_self"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "assignments_select_related_users"
on public.doctor_patient_assignments
for select
using (doctor_id = auth.uid() or patient_id = auth.uid());

create policy "assignments_insert_doctor_only"
on public.doctor_patient_assignments
for insert
with check (doctor_id = auth.uid() and public.is_doctor());

create policy "assignments_update_doctor_only"
on public.doctor_patient_assignments
for update
using (doctor_id = auth.uid() and public.is_doctor())
with check (doctor_id = auth.uid() and public.is_doctor());

create policy "goals_select_owner_or_doctor"
on public.patient_goals
for select
using (patient_id = auth.uid() or public.is_assigned_doctor(patient_id));

create policy "goals_update_owner"
on public.patient_goals
for update
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

create policy "sessions_select_owner_or_doctor"
on public.sessions
for select
using (
  user_id = auth.uid()::text
  or patient_id = auth.uid()
  or (patient_id is not null and public.is_assigned_doctor(patient_id))
);

create policy "sessions_insert_owner"
on public.sessions
for insert
with check (
  user_id = auth.uid()::text
  or patient_id = auth.uid()
);

create policy "sessions_update_owner"
on public.sessions
for update
using (
  user_id = auth.uid()::text
  or patient_id = auth.uid()
)
with check (
  user_id = auth.uid()::text
  or patient_id = auth.uid()
);

create policy "session_frames_select_owner_or_doctor"
on public.session_frames
for select
using (
  exists (
    select 1
    from public.sessions s
    where s.session_id = session_frames.session_id
      and (
        s.user_id = auth.uid()::text
        or s.patient_id = auth.uid()
        or (s.patient_id is not null and public.is_assigned_doctor(s.patient_id))
      )
  )
);

create policy "session_frames_insert_owner"
on public.session_frames
for insert
with check (
  exists (
    select 1
    from public.sessions s
    where s.session_id = session_frames.session_id
      and (s.user_id = auth.uid()::text or s.patient_id = auth.uid())
  )
);

create policy "progress_select_owner_or_doctor"
on public.progress_entries
for select
using (patient_id = auth.uid() or public.is_assigned_doctor(patient_id));

create policy "progress_insert_owner"
on public.progress_entries
for insert
with check (patient_id = auth.uid());

create policy "progress_update_owner"
on public.progress_entries
for update
using (patient_id = auth.uid())
with check (patient_id = auth.uid());
