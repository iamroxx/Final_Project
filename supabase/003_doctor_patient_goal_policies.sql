-- Allow doctors to assign and update daily goals for their assigned patients.

create policy "goals_insert_assigned_doctor"
on public.patient_goals
for insert
with check (public.is_assigned_doctor(patient_id));

drop policy if exists "goals_update_owner" on public.patient_goals;

create policy "goals_update_owner_or_assigned_doctor"
on public.patient_goals
for update
using (patient_id = auth.uid() or public.is_assigned_doctor(patient_id))
with check (patient_id = auth.uid() or public.is_assigned_doctor(patient_id));
