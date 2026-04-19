-- Add per-patient cadence target (spm) that doctors can configure.

alter table public.patient_goals
  add column if not exists target_cadence_spm integer;

update public.patient_goals
set target_cadence_spm = 70
where target_cadence_spm is null;

alter table public.patient_goals
  alter column target_cadence_spm set default 70;

alter table public.patient_goals
  alter column target_cadence_spm set not null;

alter table public.patient_goals
  drop constraint if exists patient_goals_target_cadence_spm_chk;

alter table public.patient_goals
  add constraint patient_goals_target_cadence_spm_chk
  check (target_cadence_spm > 0);
