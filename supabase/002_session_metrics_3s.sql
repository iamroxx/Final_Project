-- Adds per-session 3-second cadence/intensity buckets for graphing.

create table if not exists public.session_metrics_3s (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.sessions(session_id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  bucket_index integer not null check (bucket_index >= 0),
  recorded_at timestamptz not null,
  cadence_spm numeric(10, 2) not null default 0 check (cadence_spm >= 0),
  intensity numeric(6, 3) not null default 0 check (intensity >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, bucket_index)
);

create index if not exists session_metrics_3s_session_idx
  on public.session_metrics_3s (session_id, bucket_index);

create index if not exists session_metrics_3s_patient_idx
  on public.session_metrics_3s (patient_id, recorded_at desc);

alter table public.session_metrics_3s enable row level security;

drop policy if exists "session_metrics_select_owner_or_doctor" on public.session_metrics_3s;
create policy "session_metrics_select_owner_or_doctor"
on public.session_metrics_3s
for select
using (patient_id = auth.uid() or public.is_assigned_doctor(patient_id));

drop policy if exists "session_metrics_insert_owner" on public.session_metrics_3s;
create policy "session_metrics_insert_owner"
on public.session_metrics_3s
for insert
with check (patient_id = auth.uid());
