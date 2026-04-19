-- Add sequential patient codes in PAT00001 format.
-- Applies to new patients and backfills existing patient rows.

create sequence if not exists public.patient_code_seq;

alter table public.profiles
  add column if not exists patient_code text;

-- Align sequence with the largest existing patient code value, if any.
with max_code as (
  select max(substring(patient_code from 4)::int) as max_num
  from public.profiles
  where patient_code ~ '^PAT[0-9]{5,}$'
)
select setval(
  'public.patient_code_seq',
  coalesce((select max_num from max_code), 1),
  coalesce((select max_num is not null from max_code), false)
);

create or replace function public.assign_patient_code()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'patient' and (new.patient_code is null or new.patient_code = '') then
    new.patient_code := concat('PAT', lpad(nextval('public.patient_code_seq')::text, 5, '0'));
  end if;

  return new;
end;
$$;

drop trigger if exists set_patient_code_on_profile on public.profiles;

create trigger set_patient_code_on_profile
before insert or update of role, patient_code on public.profiles
for each row
execute function public.assign_patient_code();

-- Backfill patient codes for existing patient rows.
update public.profiles
set patient_code = concat('PAT', lpad(nextval('public.patient_code_seq')::text, 5, '0'))
where role = 'patient'
  and (patient_code is null or patient_code = '');

alter table public.profiles
  drop constraint if exists profiles_patient_code_format_chk;

alter table public.profiles
  add constraint profiles_patient_code_format_chk
  check (patient_code is null or patient_code ~ '^PAT[0-9]{5,}$');

create unique index if not exists profiles_patient_code_unique_idx
  on public.profiles (patient_code)
  where patient_code is not null;
