import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppRoute, AppUser, PatientSchedule, ProgressEntry, SessionMetricPoint, UserRole } from "../types";
import { supabase } from "../services/supabase/client";

const INITIAL_PROGRESS_ENTRIES: ProgressEntry[] = [];
const INITIAL_GOALS: Record<string, number> = {};
const INITIAL_CADENCE_TARGETS: Record<string, number> = {};
const INITIAL_SCHEDULES: Record<string, PatientSchedule> = {};

type LoginResult = {
  ok: boolean;
  error?: string;
};

type SignupPayload = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  patientCode?: string;
};

type ProgressPayload = Omit<ProgressEntry, "id" | "recordedAt"> & {
  recordedAt?: string;
  trendPoints?: SessionMetricPoint[];
  startedAtMs?: number;
  stoppedAtMs?: number;
};

type AppState = {
  currentUser: AppUser | null;
  isAuthReady: boolean;
  currentRoute: AppRoute;
  selectedDoctorPatientId: string | null;
  progressEntries: ProgressEntry[];
  sessionMetricSeries: Record<string, SessionMetricPoint[]>;
  goalSteps: Record<string, number>;
  cadenceTargets: Record<string, number>;
  patientSchedules: Record<string, PatientSchedule>;
  patientDirectory: Record<string, { id: string; fullName: string; email: string; patientCode?: string }>;
  initializeAuth: () => Promise<void>;
  refreshDashboardData: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (payload: SignupPayload) => Promise<LoginResult>;
  logout: () => Promise<void>;
  generatePatientInvite: () => Promise<LoginResult & { patientCode?: string; expiresAt?: string }>;
  addPatientByShareLink: (value: string) => Promise<LoginResult>;
  setPatientDailyGoal: (patientId: string, dailyGoal: number) => Promise<LoginResult>;
  setPatientCadenceTarget: (patientId: string, cadenceTargetSpm: number) => Promise<LoginResult>;
  setPatientTargets: (patientId: string, dailyGoal: number, cadenceTargetSpm: number) => Promise<LoginResult>;
  setPatientSchedule: (patientId: string, schedule: PatientSchedule) => Promise<LoginResult>;
  updateProfile: (payload: { fullName?: string; email?: string; newPassword?: string }) => Promise<LoginResult>;
  navigate: (route: AppRoute) => void;
  setSelectedDoctorPatientId: (patientId: string | null) => void;
  recordProgress: (payload: ProgressPayload) => Promise<void>;
};

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  patient_code: string | null;
  role: UserRole;
};

type PatientLookupRow = {
  id: string;
  role: UserRole;
  patient_code: string | null;
};

type ProgressRow = {
  id: string;
  patient_id: string;
  session_id: string | null;
  recorded_at: string;
  step_count: number;
  distance_m: number;
  duration_seconds: number;
  cadence_spm: number;
  avg_step_interval_ms: number;
  intensity: number;
  activity_state: "idle" | "walking" | "running";
  notes: string | null;
};

type AssignmentRow = {
  patient_id: string;
};

type GoalRow = {
  patient_id: string;
  daily_step_goal: number;
  target_cadence_spm: number | null;
  session_duration_minutes: number | null;
  sessions_per_day: number | null;
  cooloff_minutes: number | null;
  active_days: number[] | null;
  schedule_start_date: string | null;
  schedule_end_date: string | null;
};

type SessionMetricRow = {
  session_id: string;
  bucket_index: number;
  recorded_at: string;
  cadence_spm: number;
  intensity: number;
};

function mapProgressRow(row: ProgressRow): ProgressEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    sessionId: row.session_id,
    recordedAt: row.recorded_at,
    stepCount: row.step_count,
    distanceM: Number(row.distance_m),
    durationSeconds: row.duration_seconds,
    cadenceSpm: Number(row.cadence_spm),
    avgStepIntervalMs: Number(row.avg_step_interval_ms),
    intensity: Number(row.intensity),
    activityState: row.activity_state,
    notes: row.notes ?? undefined,
  };
}

function extractPatientIdentifier(value: string): { patientId?: string; patientCode?: string } | null {
  const input = value.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const patientCodeRegex = /^PAT\d{5,}$/i;

  if (uuidRegex.test(input)) {
    return { patientId: input.toLowerCase() };
  }

  if (patientCodeRegex.test(input)) {
    return { patientCode: input.toUpperCase() };
  }

  const queryMatch = input.match(/patientId=([0-9a-f-]{36})/i);
  if (queryMatch && uuidRegex.test(queryMatch[1])) {
    return { patientId: queryMatch[1].toLowerCase() };
  }

  const codeMatch = input.match(/patientCode=(PAT\d{5,})/i);
  if (codeMatch && patientCodeRegex.test(codeMatch[1])) {
    return { patientCode: codeMatch[1].toUpperCase() };
  }

  return null;
}

async function loadUserFromSupabase(userId: string): Promise<AppUser | null> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, patient_code, role")
    .eq("id", userId)
    .single<ProfileRow>();

  if (profileError || !profile) {
    return null;
  }

  let assignedPatientIds: string[] | undefined;
  if (profile.role === "doctor") {
    const { data: assignments } = await supabase
      .from("doctor_patient_assignments")
      .select("patient_id")
      .eq("doctor_id", userId)
      .eq("status", "active");

    assignedPatientIds = (assignments ?? []).map((row) => String(row.patient_id));
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    patientCode: profile.patient_code ?? undefined,
    role: profile.role,
    assignedPatientIds,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthReady: false,
      currentRoute: "home",
      selectedDoctorPatientId: null,
      progressEntries: INITIAL_PROGRESS_ENTRIES,
      sessionMetricSeries: {},
      goalSteps: INITIAL_GOALS,
      cadenceTargets: INITIAL_CADENCE_TARGETS,
      patientSchedules: INITIAL_SCHEDULES,
      patientDirectory: {},
      initializeAuth: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session?.user) {
          set({
            currentUser: null,
            isAuthReady: true,
            selectedDoctorPatientId: null,
            progressEntries: [],
            sessionMetricSeries: {},
            goalSteps: {},
            cadenceTargets: {},
            patientSchedules: {},
            patientDirectory: {},
          });
          return;
        }

        const appUser = await loadUserFromSupabase(data.session.user.id);
        set({
          currentUser: appUser,
          isAuthReady: true,
          currentRoute: "home",
          selectedDoctorPatientId: null,
        });
        await get().refreshDashboardData();
      },
      refreshDashboardData: async () => {
        const user = get().currentUser;
        if (!user) {
          return;
        }

        const patientIds = user.role === "doctor"
          ? (user.assignedPatientIds ?? [])
          : [user.id];

        if (user.role === "doctor") {
          const { data: assignments } = await supabase
            .from("doctor_patient_assignments")
            .select("patient_id")
            .eq("doctor_id", user.id)
            .eq("status", "active")
            .returns<AssignmentRow[]>();

          const refreshedIds = (assignments ?? []).map((row) => row.patient_id);
          set((state) => ({
            currentUser: state.currentUser
              ? { ...state.currentUser, assignedPatientIds: refreshedIds }
              : state.currentUser,
          }));
        }

        const visibleIds = user.role === "doctor"
          ? (get().currentUser?.assignedPatientIds ?? [])
          : [user.id];

        if (visibleIds.length === 0) {
          set({ progressEntries: [], sessionMetricSeries: {}, goalSteps: {}, cadenceTargets: {}, patientSchedules: {}, patientDirectory: {} });
          return;
        }

        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name, email, patient_code")
          .in("id", visibleIds);

        const nextDirectory: Record<string, { id: string; fullName: string; email: string; patientCode?: string }> = {};
        (profileRows ?? []).forEach((row) => {
          nextDirectory[String(row.id)] = {
            id: String(row.id),
            fullName: String(row.full_name ?? row.id),
            email: String(row.email ?? ""),
            patientCode: row.patient_code ? String(row.patient_code) : undefined,
          };
        });

        const { data: goalRows } = await supabase
          .from("patient_goals")
          .select("patient_id, daily_step_goal, target_cadence_spm, session_duration_minutes, sessions_per_day, cooloff_minutes, active_days, schedule_start_date, schedule_end_date")
          .in("patient_id", visibleIds)
          .returns<GoalRow[]>();

        const nextGoals: Record<string, number> = {};
        const nextCadenceTargets: Record<string, number> = {};
        const nextSchedules: Record<string, PatientSchedule> = {};
        (goalRows ?? []).forEach((row) => {
          nextGoals[row.patient_id] = row.daily_step_goal;
          if (row.target_cadence_spm) {
            nextCadenceTargets[row.patient_id] = row.target_cadence_spm;
          }
          nextSchedules[row.patient_id] = {
            sessionDurationMinutes: row.session_duration_minutes ?? 30,
            sessionsPerDay: row.sessions_per_day ?? 1,
            cooloffMinutes: row.cooloff_minutes ?? 60,
            activeDays: row.active_days ?? [1, 2, 3, 4, 5],
            startDate: row.schedule_start_date ?? null,
            endDate: row.schedule_end_date ?? null,
          };
        });

        const { data: progressRows } = await supabase
          .from("progress_entries")
          .select("id, patient_id, session_id, recorded_at, step_count, distance_m, duration_seconds, cadence_spm, avg_step_interval_ms, intensity, activity_state, notes")
          .in("patient_id", visibleIds)
          .order("recorded_at", { ascending: false })
          .returns<ProgressRow[]>();

        const { data: seriesRows } = await supabase
          .from("session_metrics_3s")
          .select("session_id, bucket_index, recorded_at, cadence_spm, intensity")
          .in("patient_id", visibleIds)
          .order("session_id", { ascending: true })
          .order("bucket_index", { ascending: true })
          .returns<SessionMetricRow[]>();

        const nextSeries: Record<string, SessionMetricPoint[]> = {};
        (seriesRows ?? []).forEach((row) => {
          if (!nextSeries[row.session_id]) {
            nextSeries[row.session_id] = [];
          }

          nextSeries[row.session_id].push({
            bucketIndex: row.bucket_index,
            recordedAt: row.recorded_at,
            cadenceSpm: Number(row.cadence_spm),
            intensity: Number(row.intensity),
          });
        });

        set({
          patientDirectory: nextDirectory,
          goalSteps: nextGoals,
          cadenceTargets: nextCadenceTargets,
          patientSchedules: nextSchedules,
          progressEntries: (progressRows ?? []).map(mapProgressRow),
          sessionMetricSeries: nextSeries,
        });
      },
      login: async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error || !data.user) {
          return {
            ok: false,
            error: error?.message ?? "Invalid email or password.",
          };
        }

        const appUser = await loadUserFromSupabase(data.user.id);
        if (!appUser) {
          return {
            ok: false,
            error: "Authenticated, but profile row was not found.",
          };
        }

        set({ currentUser: appUser, currentRoute: "home", isAuthReady: true });
        await get().refreshDashboardData();
        return { ok: true };
      },
      signup: async ({ fullName, email, password, role, patientCode }) => {
        const normalizedEmail = email.trim().toLowerCase();
        const cleanName = fullName.trim();
        const normalizedPatientCode = patientCode?.trim().toUpperCase();

        if (!cleanName) {
          return { ok: false, error: "Full name is required." };
        }
        if (!normalizedEmail.includes("@")) {
          return { ok: false, error: "Enter a valid email address." };
        }
        if (password.trim().length < 6) {
          return { ok: false, error: "Password must be at least 6 characters." };
        }
        if (role === "patient") {
          if (!normalizedPatientCode) {
            return { ok: false, error: "Patient ID is required. Ask your doctor to generate one." };
          }
          if (!/^PAT\d{5,}$/.test(normalizedPatientCode)) {
            return { ok: false, error: "Enter a valid Patient ID (example: PAT00003)." };
          }

          const { data: isValidInvite, error: inviteCheckError } = await supabase
            .rpc("validate_patient_invite", { input_code: normalizedPatientCode });

          if (inviteCheckError) {
            return {
              ok: false,
              error: "Unable to validate Patient ID right now. Please try again.",
            };
          }

          if (!isValidInvite) {
            return {
              ok: false,
              error: "Invalid or expired Patient ID. Please ask your doctor for a new Patient ID.",
            };
          }
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              role,
              patient_code: role === "patient" ? normalizedPatientCode : undefined,
            },
          },
        });

        if (error) {
          return { ok: false, error: error.message };
        }

        if (!data.user) {
          return { ok: false, error: "Sign up failed. Please try again." };
        }

        if (!data.session) {
          return { ok: false, error: "Sign up successful. Please confirm your email, then log in." };
        }

        const appUser = await loadUserFromSupabase(data.user.id);
        if (!appUser) {
          return {
            ok: false,
            error: "Account created, but profile row is not available yet. Please log in again.",
          };
        }

        set((state) => ({
          currentUser: appUser,
          currentRoute: "home",
          isAuthReady: true,
          selectedDoctorPatientId: null,
          goalSteps: role === "patient"
            ? { ...state.goalSteps, [appUser.id]: state.goalSteps[appUser.id] ?? 100 }
            : state.goalSteps,
        }));

        await get().refreshDashboardData();

        return { ok: true };
      },
      generatePatientInvite: async () => {
        const user = get().currentUser;
        if (!user || user.role !== "doctor") {
          return { ok: false, error: "Only doctors can generate patient IDs." };
        }

        const { data, error } = await supabase
          .rpc("generate_patient_invite")
          .single<{ patient_code: string; expires_at: string }>();

        if (error || !data) {
          return { ok: false, error: error?.message ?? "Failed to generate patient ID." };
        }

        return {
          ok: true,
          patientCode: data.patient_code,
          expiresAt: data.expires_at,
        };
      },
      updateProfile: async ({ fullName, email, newPassword }) => {
        const user = get().currentUser;
        if (!user) return { ok: false, error: "Not logged in." };

        // Update auth email / password via Supabase auth
        const authUpdates: { email?: string; password?: string } = {};
        if (email && email !== user.email) authUpdates.email = email;
        if (newPassword) authUpdates.password = newPassword;

        if (Object.keys(authUpdates).length > 0) {
          const { error: authError } = await supabase.auth.updateUser(authUpdates);
          if (authError) return { ok: false, error: authError.message };
        }

        // Update display name in profiles table
        if (fullName && fullName !== user.fullName) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ full_name: fullName })
            .eq("id", user.id);
          if (profileError) return { ok: false, error: profileError.message };
        }

        // Update local state
        set((state) => ({
          currentUser: state.currentUser
            ? {
                ...state.currentUser,
                fullName: fullName ?? state.currentUser.fullName,
                email: email ?? state.currentUser.email,
              }
            : null,
        }));

        return { ok: true };
      },
      logout: async () => {
        await supabase.auth.signOut();
        set({
          currentUser: null,
          currentRoute: "home",
          isAuthReady: true,
          selectedDoctorPatientId: null,
          progressEntries: [],
          sessionMetricSeries: {},
          goalSteps: {},
          cadenceTargets: {},
          patientSchedules: {},
          patientDirectory: {},
        });
      },
      addPatientByShareLink: async (value) => {
        void value;
        return {
          ok: false,
          error: "Direct patient linking is disabled. Generate a Patient ID and ask the patient to register with it.",
        };
      },
      setPatientDailyGoal: async (patientId, dailyGoal) => {
        const user = get().currentUser;
        if (!user || user.role !== "doctor") {
          return { ok: false, error: "Only doctors can assign patient goals." };
        }

        const normalizedGoal = Math.round(dailyGoal);
        if (!Number.isFinite(normalizedGoal) || normalizedGoal <= 0) {
          return { ok: false, error: "Daily goal must be a positive number." };
        }

        const { error } = await supabase
          .from("patient_goals")
          .upsert(
            {
              patient_id: patientId,
              daily_step_goal: normalizedGoal,
            },
            { onConflict: "patient_id" }
          );

        if (error) {
          return { ok: false, error: error.message };
        }

        set((state) => ({
          goalSteps: {
            ...state.goalSteps,
            [patientId]: normalizedGoal,
          },
        }));

        await get().refreshDashboardData();
        return { ok: true };
      },
      setPatientCadenceTarget: async (patientId, cadenceTargetSpm) => {
        const user = get().currentUser;
        if (!user || user.role !== "doctor") {
          return { ok: false, error: "Only doctors can assign cadence targets." };
        }

        const normalizedTarget = Math.round(cadenceTargetSpm);
        if (!Number.isFinite(normalizedTarget) || normalizedTarget <= 0) {
          return { ok: false, error: "Cadence target must be a positive number." };
        }

        const { error } = await supabase
          .from("patient_goals")
          .upsert(
            {
              patient_id: patientId,
              target_cadence_spm: normalizedTarget,
            },
            { onConflict: "patient_id" }
          );

        if (error) {
          return { ok: false, error: error.message };
        }

        set((state) => ({
          cadenceTargets: {
            ...state.cadenceTargets,
            [patientId]: normalizedTarget,
          },
        }));

        await get().refreshDashboardData();
        return { ok: true };
      },
      setPatientTargets: async (patientId, dailyGoal, cadenceTargetSpm) => {
        const user = get().currentUser;
        if (!user || user.role !== "doctor") {
          return { ok: false, error: "Only doctors can assign patient targets." };
        }

        const normalizedGoal = Math.round(dailyGoal);
        const normalizedTarget = Math.round(cadenceTargetSpm);

        if (!Number.isFinite(normalizedGoal) || normalizedGoal <= 0) {
          return { ok: false, error: "Daily goal must be a positive number." };
        }

        if (!Number.isFinite(normalizedTarget) || normalizedTarget <= 0) {
          return { ok: false, error: "Cadence target must be a positive number." };
        }

        const { error } = await supabase
          .from("patient_goals")
          .upsert(
            {
              patient_id: patientId,
              daily_step_goal: normalizedGoal,
              target_cadence_spm: normalizedTarget,
            },
            { onConflict: "patient_id" }
          );

        if (error) {
          return { ok: false, error: error.message };
        }

        set((state) => ({
          goalSteps: {
            ...state.goalSteps,
            [patientId]: normalizedGoal,
          },
          cadenceTargets: {
            ...state.cadenceTargets,
            [patientId]: normalizedTarget,
          },
        }));

        await get().refreshDashboardData();
        return { ok: true };
      },
      setPatientSchedule: async (patientId, schedule) => {
        const user = get().currentUser;
        if (!user || user.role !== "doctor") {
          return { ok: false, error: "Only doctors can set patient schedules." };
        }

        const { error } = await supabase
          .from("patient_goals")
          .upsert(
            {
              patient_id: patientId,
              session_duration_minutes: schedule.sessionDurationMinutes,
              sessions_per_day: schedule.sessionsPerDay,
              cooloff_minutes: schedule.cooloffMinutes,
              active_days: schedule.activeDays,
              schedule_start_date: schedule.startDate ?? null,
              schedule_end_date: schedule.endDate ?? null,
            },
            { onConflict: "patient_id" }
          );

        if (error) {
          return { ok: false, error: error.message };
        }

        set((state) => ({
          patientSchedules: { ...state.patientSchedules, [patientId]: schedule },
        }));

        return { ok: true };
      },
      navigate: (route) => {
        set({ currentRoute: route });
      },
      setSelectedDoctorPatientId: (patientId) => {
        set({ selectedDoctorPatientId: patientId });
      },
      recordProgress: async (payload) => {
        const user = get().currentUser;
        if (!user || user.role !== "patient") {
          return;
        }

        const stoppedAtMs = payload.stoppedAtMs ?? Date.now();
        const startedAtMs = payload.startedAtMs ?? Math.max(stoppedAtMs - payload.durationSeconds * 1000, 0);

        if (payload.sessionId) {
          const { error: sessionError } = await supabase
            .from("sessions")
            .upsert(
              {
                session_id: payload.sessionId,
                user_id: user.id,
                patient_id: payload.patientId,
                started_at: startedAtMs,
                stopped_at: stoppedAtMs,
                status: "stopped",
                updated_at: stoppedAtMs,
                latest_metrics: {
                  stepCountTotal: payload.stepCount,
                  cadenceSpm: payload.cadenceSpm,
                  avgStepIntervalMs: payload.avgStepIntervalMs,
                  intensity: payload.intensity,
                  activityState: payload.activityState,
                },
              },
              { onConflict: "session_id" }
            );

          if (sessionError) {
            console.error("[sessions][upsert][failure]", sessionError.message);
            return;
          }
        }

        const { error } = await supabase.from("progress_entries").insert({
          patient_id: payload.patientId,
          session_id: payload.sessionId,
          recorded_at: payload.recordedAt ?? new Date(stoppedAtMs).toISOString(),
          step_count: payload.stepCount,
          distance_m: payload.distanceM,
          duration_seconds: payload.durationSeconds,
          cadence_spm: payload.cadenceSpm,
          avg_step_interval_ms: payload.avgStepIntervalMs,
          intensity: payload.intensity,
          activity_state: payload.activityState,
          notes: payload.notes ?? null,
        });

        if (error) {
          console.error("[progress][insert][failure]", error.message);
          return;
        }

        if (payload.sessionId && (payload.trendPoints?.length ?? 0) > 0) {
          const pointsPayload = (payload.trendPoints ?? []).map((point) => ({
            session_id: payload.sessionId,
            patient_id: payload.patientId,
            bucket_index: point.bucketIndex,
            recorded_at: point.recordedAt,
            cadence_spm: point.cadenceSpm,
            intensity: point.intensity,
          }));

          const { error: trendError } = await supabase
            .from("session_metrics_3s")
            .upsert(pointsPayload, { onConflict: "session_id,bucket_index" });

          if (trendError) {
            console.error("[session_metrics_3s][upsert][failure]", trendError.message);
          }
        }

        await get().refreshDashboardData();
      },
    }),
    {
      name: "step-motion-app-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        progressEntries: state.progressEntries,
        sessionMetricSeries: state.sessionMetricSeries,
        goalSteps: state.goalSteps,
        cadenceTargets: state.cadenceTargets,
        patientDirectory: state.patientDirectory,
      }),
    }
  )
);