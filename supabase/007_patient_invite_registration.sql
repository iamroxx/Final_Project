-- Invite-based patient registration.
-- Doctors generate PATxxxxx IDs that expire in 3 hours.
-- Patients must sign up with a valid invite code, and invite ownership is locked to one doctor.

create table if not exists public.patient_invites (
  id uuid primary key default gen_random_uuid(),
  patient_code text not null unique,
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'claimed')),
  expires_at timestamptz not null default (now() + interval '3 hours'),
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  check (patient_code ~ '^PAT[0-9]{5,}$')
);

create index if not exists patient_invites_doctor_status_idx
  on public.patient_invites (doctor_id, status, expires_at desc);

-- Legacy cleanup: ensure only one active doctor assignment per patient.
-- Keep the most recently assigned active row and deactivate older duplicates.
with ranked_active as (
  select
    id,
    row_number() over (
      partition by patient_id
      order by assigned_at desc, created_at desc, updated_at desc, id desc
    ) as rn
  from public.doctor_patient_assignments
  where status = 'active'
)
update public.doctor_patient_assignments dpa
set
  status = 'inactive',
  updated_at = now()
from ranked_active ra
where dpa.id = ra.id
  and ra.rn > 1;

create unique index if not exists doctor_patient_single_active_idx
  on public.doctor_patient_assignments (patient_id)
  where status = 'active';

alter table public.patient_invites enable row level security;

drop policy if exists "patient_invites_select_doctor_own" on public.patient_invites;
create policy "patient_invites_select_doctor_own"
on public.patient_invites
for select
using (doctor_id = auth.uid() and public.is_doctor());

create or replace function public.cleanup_expired_patient_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.patient_invites
  where status = 'pending'
    and expires_at < now();
end;
$$;

create or replace function public.generate_patient_invite()
returns table (patient_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_code text;
  v_current_user uuid;
begin
  v_current_user := auth.uid();

  if v_current_user is null or not public.is_doctor(v_current_user) then
    raise exception 'Only doctors can generate patient IDs.';
  end if;

  perform public.cleanup_expired_patient_invites();

  loop
    next_code := concat('PAT', lpad(nextval('public.patient_code_seq')::text, 5, '0'));
    exit when not exists (select 1 from public.profiles p where p.patient_code = next_code)
      and not exists (select 1 from public.patient_invites i where i.patient_code = next_code);
  end loop;

  insert into public.patient_invites (patient_code, doctor_id, expires_at)
  values (next_code, v_current_user, now() + interval '3 hours');

  return query
  select next_code, now() + interval '3 hours';
end;
$$;

create or replace function public.validate_patient_invite(input_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
begin
  normalized_code := upper(trim(coalesce(input_code, '')));
  if normalized_code = '' then
    return false;
  end if;

  perform public.cleanup_expired_patient_invites();

  return exists (
    select 1
    from public.patient_invites
    where patient_code = normalized_code
      and status = 'pending'
      and expires_at >= now()
  );
end;
$$;

grant execute on function public.cleanup_expired_patient_invites() to authenticated;
grant execute on function public.generate_patient_invite() to authenticated;
grant execute on function public.validate_patient_invite(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_patient_code text;
begin
  requested_role := coalesce(
    new.raw_user_meta_data ->> 'role',
    new.raw_app_meta_data ->> 'role',
    'patient'
  );

  if requested_role = 'doctor' then
    insert into public.profiles (id, email, full_name, role)
    values (
      new.id,
      coalesce(new.email, ''),
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
      'doctor'::public.app_role
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = excluded.full_name,
          role = excluded.role,
          updated_at = now();

    return new;
  end if;

  requested_patient_code := upper(coalesce(new.raw_user_meta_data ->> 'patient_code', ''));
  if requested_patient_code = '' then
    raise exception 'Patient ID is required. Ask your doctor to generate one.';
  end if;

  perform public.cleanup_expired_patient_invites();

  perform 1
  from public.patient_invites
  where patient_code = requested_patient_code
    and status = 'pending'
    and expires_at >= now()
  for update;

  if not found then
    raise exception 'Invalid or expired Patient ID. Ask your doctor to generate a new one.';
  end if;

  insert into public.profiles (id, email, full_name, role, patient_code)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    'patient'::public.app_role,
    requested_patient_code
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        patient_code = excluded.patient_code,
        updated_at = now();

  insert into public.patient_goals (patient_id, daily_step_goal)
  values (new.id, 100)
  on conflict (patient_id) do nothing;

  insert into public.doctor_patient_assignments (doctor_id, patient_id, status)
  select doctor_id, new.id, 'active'
  from public.patient_invites
  where patient_code = requested_patient_code
    and status = 'pending'
    and expires_at >= now()
  on conflict (doctor_id, patient_id)
  do update set status = 'active', updated_at = now();

  update public.patient_invites
  set status = 'claimed',
      claimed_by = new.id,
      claimed_at = now()
  where patient_code = requested_patient_code
    and status = 'pending'
    and expires_at >= now();

  return new;
end;
$$;
