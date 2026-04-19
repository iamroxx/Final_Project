-- Allow any authenticated doctor to look up patient profiles by patient_code.
-- Without this, the existing "profiles_select_self_or_assigned" policy prevents
-- doctors from finding patients they haven't assigned yet, causing "Patient not found".

create policy "profiles_select_patient_by_doctor_lookup"
on public.profiles
for select
using (
  role = 'patient'
  and public.is_doctor()
);
