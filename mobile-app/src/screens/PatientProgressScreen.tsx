import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { MetricCard } from "../components/MetricCard";
import { useAppStore } from "../store/useAppStore";
import type { AppUser } from "../types";

type Props = {
  currentUser: AppUser;
};

function formatRecordedAt(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function PatientProgressScreen({ currentUser }: Props) {
  const allProgressEntries = useAppStore((state) => state.progressEntries);
  const progressEntries = useMemo(
    () => allProgressEntries.filter((entry) => entry.patientId === currentUser.id),
    [allProgressEntries, currentUser.id]
  );

  const totalSteps = progressEntries.reduce((total, entry) => total + entry.stepCount, 0);
  const totalSessions = progressEntries.length;

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        <MetricCard label="Sessions" value={String(totalSessions)} />
        <MetricCard label="Total Steps" value={String(totalSteps)} />
      </View>

      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-xl font-bold text-white">Recorded progress</Text>
        <Text className="mt-2 text-sm text-slate-300">
          Every stopped session is saved here so you and your doctor can review progress over time.
        </Text>

        {progressEntries.length === 0 ? (
          <View className="mt-5 rounded-2xl bg-slate-800 p-4">
            <Text className="text-sm text-slate-300">No progress entries yet. Start a session from the dashboard to create one.</Text>
          </View>
        ) : (
          progressEntries.map((entry) => (
            <View key={entry.id} className="mt-4 rounded-2xl bg-slate-800 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-white">{entry.stepCount} steps</Text>
                <Text className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold uppercase text-cyan-300">
                  {entry.activityState}
                </Text>
              </View>
              <Text className="mt-2 text-sm text-slate-300">{formatRecordedAt(entry.recordedAt)}</Text>
              <Text className="mt-3 text-sm text-slate-200">
                Distance {entry.distanceM.toFixed(1)} m | Duration {entry.durationSeconds}s | Cadence {entry.cadenceSpm.toFixed(0)} spm
              </Text>
              {entry.notes ? <Text className="mt-3 text-sm text-slate-300">{entry.notes}</Text> : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}