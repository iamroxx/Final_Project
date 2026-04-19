import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppRoute, AppUser, ProgressEntry, SessionMetricPoint, UserRole } from "../types";
import { supabase } from "../services/supabase/client";

const INITIAL_PROGRESS_ENTRIES: ProgressEntry[] = [];
const INITIAL_GOALS: Record<string, number> = {};
const INITIAL_CADENCE_TARGETS: Record<string, number> = {};

type LoginResult = {
  ok: boolean;
  error?: string;
};

type SignupPayload = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
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
  patientDirectory: Record<string, { id: string; fullName: string; email: string; patientCode?: string }>;
  initializeAuth: () => Promise<void>;
  refreshDashboardData: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (payload: SignupPayload) => Promise<LoginResult>;
  logout: () => Promise<void>;
  addPatientByShareLink: (value: string) => Promise<LoginResult>;
  setPatientDailyGoal: (patientId: string, dailyGoal: number) => Promise<LoginResult>;
  setPatientCadenceTarget: (patientId: string, cadenceTargetSpm: number) => Promise<LoginResult>;
  setPatientTargets: (patientId: string, dailyGoal: number, cadenceTargetSpm: number) => Promise<LoginResult>;
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
          set({ progressEntries: [], sessionMetricSeries: {}, goalSteps: {}, cadenceTargets: {}, patientDirectory: {} });
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
          .select("patient_id, daily_step_goal, target_cadence_spm")
          .in("patient_id", visibleIds)
          .returns<GoalRow[]>();

        const nextGoals: Record<string, number> = {};
        const nextCadenceTargets: Record<string, number> = {};
        (goalRows ?? []).forEach((row) => {
          nextGoals[row.patient_id] = row.daily_step_goal;
          if (row.target_cadence_spm) {
            nextCadenceTargets[row.patient_id] = row.target_cadence_spm;
          }
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
      signup: async ({ fullName, email, password, role }) => {
        const normalizedEmail = email.trim().toLowerCase();
        const cleanName = fullName.trim();

        if (!cleanName) {
          return { ok: false, error: "Full name is required." };
        }
        if (!normalizedEmail.includes("@")) {
          return { ok: false, error: "Enter a valid email address." };
        }
        if (password.trim().length < 6) {
          return { ok: false, error: "Password must be at least 6 characters." };
        }

        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              role,
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
          patientDirectory: {},
        });
      },
      addPatientByShareLink: async (value) => {
        const user = get().currentUser;
        if (!user || user.role !== "doctor") {
          return { ok: false, error: "Only doctors can add patient profiles." };
        }

        const parsed = extractPatientIdentifier(value);
        if (!parsed) {
          return { ok: false, error: "Paste a valid patient ID or share link." };
        }

        let resolvedPatientId = parsed.patientId;
        let profileQuery = supabase
          .from("profiles")
          .select("id, role, patient_code");

        if (resolvedPatientId) {
          profileQuery = profileQuery.eq("id", resolvedPatientId);
        } else if (parsed.patientCode) {
          profileQuery = profileQuery.eq("patient_code", parsed.patientCode);
        }

        const { data: patientProfile, error: lookupError } = await profileQuery.single<PatientLookupRow>();

        if (lookupError || !patientProfile) {
          return { ok: false, error: "Patient not found. Check the patient code and try again." };
        }

        if (patientProfile.role !== "patient") {
          return { ok: false, error: "Only patient profiles can be assigned." };
        }

        resolvedPatientId = patientProfile.id;

        if (resolvedPatientId === user.id) {
          return { ok: false, error: "You cannot add your own profile as a patient." };
        }

        const { error } = await supabase
          .from("doctor_patient_assignments")
          .upsert(
            {
              doctor_id: user.id,
              patient_id: resolvedPatientId,
              status: "active",
            },
            { onConflict: "doctor_id,patient_id" }
          );

        if (error) {
          return { ok: false, error: error.message };
        }

        await get().refreshDashboardData();
        return { ok: true };
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