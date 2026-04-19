import { Alert, Pressable, ScrollView, Share, Text, View } from "react-native";
import { MetricCard } from "../components/MetricCard";
import { useAppStore } from "../store/useAppStore";
import type { AppRoute, AppUser } from "../types";

type Props = {
  currentUser: AppUser;
  onNavigate: (route: AppRoute) => void;
};

export function MainHomeScreen({ currentUser, onNavigate }: Props) {
  const progressEntries = useAppStore((state) => state.progressEntries);
  const goalSteps = useAppStore((state) => state.goalSteps);
  const patientDirectory = useAppStore((state) => state.patientDirectory);
  const selectedDoctorPatientId = useAppStore((state) => state.selectedDoctorPatientId);
  const setSelectedDoctorPatientId = useAppStore((state) => state.setSelectedDoctorPatientId);

  async function sharePatientProfile() {
    const patientIdentifier = currentUser.patientCode ?? currentUser.id;
    const shareLink = currentUser.patientCode
      ? `stepmotion://share-profile?patientCode=${encodeURIComponent(currentUser.patientCode)}`
      : `stepmotion://share-profile?patientId=${encodeURIComponent(currentUser.id)}`;

    try {
      await Share.share({
        message: `Step Motion patient profile\nPatient ID: ${patientIdentifier}\nShare Link: ${shareLink}`,
      });
    } catch (error) {
      Alert.alert("Share failed", error instanceof Error ? error.message : "Unable to share profile link.");
    }
  }

  if (currentUser.role === "doctor") {
    const patientIds = currentUser.assignedPatientIds ?? [];
    const patients = patientIds.map((id) => ({
      id,
      fullName: patientDirectory[id]?.fullName ?? `Patient ${id.slice(0, 8)}`,
    }));
    const orderedPatients = selectedDoctorPatientId
      ? [
          ...patients.filter((patient) => patient.id === selectedDoctorPatientId),
          ...patients.filter((patient) => patient.id !== selectedDoctorPatientId),
        ]
      : patients;
    const visiblePatients = orderedPatients.slice(0, 3);
    const hasMorePatients = patients.length > visiblePatients.length;
    const totalTodaySteps = progressEntries
      .filter((entry) => patientIds.includes(entry.patientId))
      .reduce((total, entry) => total + entry.stepCount, 0);

    return (
      <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
        <View className="rounded-3xl bg-slate-900 p-5">
          <Text className="text-sm uppercase tracking-[0.25em] text-slate-400">Overview</Text>
          <Text className="mt-3 text-3xl font-black text-white">Monitor patient recovery</Text>
          <Text className="mt-2 text-sm leading-6 text-slate-300">
            Review assigned patient progress, recent sessions, and daily goal completion from one place.
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between gap-y-3">
          <MetricCard label="Assigned Patients" value={String(patients.length)} />
          <MetricCard label="Total Logged Steps" value={String(totalTodaySteps)} />
        </View>

        <Pressable onPress={() => onNavigate("patients")} className="rounded-3xl bg-cyan-500 px-5 py-5">
          <Text className="text-xs uppercase tracking-[0.25em] text-slate-950">Patients</Text>
          <Text className="mt-2 text-2xl font-black text-slate-950">Open patient dashboard</Text>
        </Pressable>

        <View className="rounded-3xl bg-slate-900 p-5">
          <Text className="text-sm font-semibold text-white">Assigned list</Text>
          {selectedDoctorPatientId && visiblePatients[0]?.id === selectedDoctorPatientId ? (
            <Text className="mt-1 text-xs text-cyan-300">Last viewed patient pinned on top</Text>
          ) : null}
          {visiblePatients.map((patient) => {
            const patientEntries = progressEntries.filter((entry) => entry.patientId === patient.id);
            const latestEntry = patientEntries[0];
            return (
              <Pressable
                key={patient.id}
                onPress={() => {
                  setSelectedDoctorPatientId(patient.id);
                  onNavigate("patients");
                }}
                className={`mt-4 rounded-2xl p-4 ${patient.id === selectedDoctorPatientId ? "border border-cyan-700 bg-slate-800" : "bg-slate-800"}`}
              >
                <Text className="text-lg font-bold text-white">{patient.fullName}</Text>
                <Text className="mt-1 text-sm text-slate-300">
                  Goal {goalSteps[patient.id] ?? 100} steps
                </Text>
                <Text className="mt-2 text-sm text-slate-200">
                  {latestEntry
                    ? `Latest session: ${latestEntry.stepCount} steps, ${latestEntry.activityState}`
                    : "No sessions recorded yet."}
                </Text>
                <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-cyan-300">Open in patients</Text>
              </Pressable>
            );
          })}
          {hasMorePatients ? (
            <Pressable
              onPress={() => onNavigate("patients")}
              className="mt-4 self-start rounded-full border border-slate-700 bg-slate-800 px-4 py-2"
            >
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-200">More</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  const patientEntries = progressEntries.filter((entry) => entry.patientId === currentUser.id);
  const totalSteps = patientEntries.reduce((total, entry) => total + entry.stepCount, 0);
  const latestEntry = patientEntries[0];

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-sm uppercase tracking-[0.25em] text-slate-400">Welcome Back</Text>
        <Text className="mt-3 text-3xl font-black text-white">{currentUser.fullName}</Text>
        <Text className="mt-2 text-sm leading-6 text-slate-300">
          Use the patient dashboard to record live walking sessions, then check your saved progress history.
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        <MetricCard label="Goal" value={`${goalSteps[currentUser.id] ?? 100} steps`} />
        <MetricCard label="Recorded Steps" value={String(totalSteps)} />
      </View>

      <View className="gap-3">
        <Pressable onPress={() => onNavigate("dashboard")} className="rounded-3xl bg-cyan-500 px-5 py-5">
          <Text className="text-xs uppercase tracking-[0.25em] text-slate-950">Patient Dashboard</Text>
          <Text className="mt-2 text-2xl font-black text-slate-950">Start or stop a live session</Text>
        </Pressable>

        <View className="rounded-3xl bg-slate-900 px-5 py-5">
          <Text className="text-xs uppercase tracking-[0.25em] text-slate-400">Share Profile</Text>
          <Text className="mt-2 text-sm text-slate-200">Patient ID</Text>
          <Text className="mt-1 text-xs text-cyan-300">{currentUser.patientCode ?? currentUser.id}</Text>
          <Pressable onPress={sharePatientProfile} className="mt-4 rounded-2xl bg-cyan-500 px-4 py-3">
            <Text className="text-center text-sm font-semibold text-slate-950">Share With Doctor</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => onNavigate("progress")} className="rounded-3xl bg-slate-900 px-5 py-5">
          <Text className="text-xs uppercase tracking-[0.25em] text-slate-400">Progress History</Text>
          <Text className="mt-2 text-2xl font-black text-white">Review recorded sessions</Text>
          <Text className="mt-2 text-sm text-slate-300">
            {latestEntry
              ? `Latest session logged ${latestEntry.stepCount} steps.`
              : "No sessions recorded yet."}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}