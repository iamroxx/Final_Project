import { useMemo, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MetricCard } from "../components/MetricCard";
import { useAppStore } from "../store/useAppStore";
import type { AppUser, ProgressEntry } from "../types";

type Props = {
  currentUser: AppUser;
};

const DEFAULT_STEP_GOAL = 100;
const DEFAULT_CADENCE_TARGET_SPM = 70;
const CADENCE_AVERAGE_WINDOW_DAYS = 7;

type MiniChartProps = {
  label: string;
  values: number[];
  colorClassName: string;
  fixedMaxValue: number;
  yAxisRangeLabel: string;
};

function MiniChart({ label, values, colorClassName, fixedMaxValue, yAxisRangeLabel }: MiniChartProps) {
  const safeMaxValue = Math.max(fixedMaxValue, 1);

  return (
    <View className="rounded-2xl bg-slate-800 p-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs uppercase tracking-wide text-slate-300">{label}</Text>
        <Text className="text-[10px] text-slate-400">Y: {yAxisRangeLabel}</Text>
      </View>
      <View className="h-20 flex-row items-end gap-[2px]">
        {values.map((value, index) => {
          const clampedValue = Math.max(0, Math.min(value, safeMaxValue));
          const normalizedHeight = Math.max((clampedValue / safeMaxValue) * 100, 4);
          return (
            <View
              key={`${label}-${index}`}
              className={`flex-1 rounded-sm ${colorClassName}`}
              style={{ height: `${normalizedHeight}%` }}
            />
          );
        })}
      </View>
    </View>
  );
}

function formatRecordedAt(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function PatientProgressScreen({ currentUser }: Props) {
  const [selectedEntry, setSelectedEntry] = useState<ProgressEntry | null>(null);

  const allProgressEntries = useAppStore((state) => state.progressEntries);
  const sessionMetricSeries = useAppStore((state) => state.sessionMetricSeries);
  const goalSteps = useAppStore((state) => state.goalSteps);
  const cadenceTargets = useAppStore((state) => state.cadenceTargets);
  const progressEntries = useMemo(
    () => allProgressEntries.filter((entry) => entry.patientId === currentUser.id),
    [allProgressEntries, currentUser.id]
  );
  const stepGoal = goalSteps[currentUser.id] ?? DEFAULT_STEP_GOAL;
  const cadenceTargetSpm = cadenceTargets[currentUser.id] ?? DEFAULT_CADENCE_TARGET_SPM;

  const totalSteps = progressEntries.reduce((total, entry) => total + entry.stepCount, 0);
  const totalSessions = progressEntries.length;

  const todayCadenceSpm = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const todaysEntries = progressEntries.filter((entry) => {
      const recordedAt = new Date(entry.recordedAt).getTime();
      return recordedAt >= dayStart && recordedAt < dayEnd;
    });

    if (todaysEntries.length === 0) {
      return 0;
    }

    const weightedDuration = todaysEntries.reduce((sum, entry) => sum + Math.max(entry.durationSeconds, 0), 0);
    if (weightedDuration > 0) {
      const weightedCadence = todaysEntries.reduce(
        (sum, entry) => sum + entry.cadenceSpm * Math.max(entry.durationSeconds, 0),
        0
      );
      return weightedCadence / weightedDuration;
    }

    return todaysEntries.reduce((sum, entry) => sum + entry.cadenceSpm, 0) / todaysEntries.length;
  }, [progressEntries]);

  const sevenDayAverageCadenceSpm = useMemo(() => {
    const windowStart = Date.now() - CADENCE_AVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const entries = progressEntries.filter((entry) => {
      const recordedAt = new Date(entry.recordedAt).getTime();
      return Number.isFinite(recordedAt) && recordedAt >= windowStart;
    });

    if (entries.length === 0) {
      return 0;
    }

    const weightedDuration = entries.reduce((sum, entry) => sum + Math.max(entry.durationSeconds, 0), 0);
    if (weightedDuration > 0) {
      const weightedCadence = entries.reduce(
        (sum, entry) => sum + entry.cadenceSpm * Math.max(entry.durationSeconds, 0),
        0
      );
      return weightedCadence / weightedDuration;
    }

    return entries.reduce((sum, entry) => sum + entry.cadenceSpm, 0) / entries.length;
  }, [progressEntries]);

  const cadenceProgressPercent = useMemo(() => {
    if (sevenDayAverageCadenceSpm <= 0 || cadenceTargetSpm <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((sevenDayAverageCadenceSpm / cadenceTargetSpm) * 100)));
  }, [cadenceTargetSpm, sevenDayAverageCadenceSpm]);

  const dailyCadenceStatus = useMemo(() => {
    if (todayCadenceSpm <= 0) {
      return "No daily cadence data yet";
    }
    if (todayCadenceSpm >= cadenceTargetSpm) {
      return "Daily target achieved";
    }
    return "Daily target not achieved yet";
  }, [cadenceTargetSpm, todayCadenceSpm]);

  return (
    <View className="flex-1 bg-slate-950">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-2xl font-black text-white">Progress Overview</Text>
        <Text className="mt-2 text-sm text-slate-300">
          Track your completed sessions, walking cadence, and long-term rehab improvements.
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        <MetricCard label="Sessions" value={String(totalSessions)} />
        <MetricCard label="Total Steps" value={String(totalSteps)} />
      </View>

      <View className="rounded-3xl bg-slate-900 p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs uppercase tracking-wide text-slate-300">Cadence Target Progress</Text>
          <Text className="text-xs font-semibold text-white">{cadenceProgressPercent}%</Text>
        </View>
        <View className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-700">
          <View className="h-3 rounded-full bg-emerald-400" style={{ width: `${cadenceProgressPercent}%` }} />
        </View>
        <Text className="mt-2 text-xs text-slate-300">
          7-day average cadence: {sevenDayAverageCadenceSpm > 0 ? `${sevenDayAverageCadenceSpm.toFixed(1)} spm` : "-"} | Target: {cadenceTargetSpm} spm
        </Text>
        <Text className="mt-1 text-xs text-cyan-300">
          Today: {todayCadenceSpm > 0 ? `${todayCadenceSpm.toFixed(1)} spm` : "-"} | {dailyCadenceStatus}
        </Text>
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
            <TouchableOpacity key={entry.id} onPress={() => setSelectedEntry(entry)} activeOpacity={0.75}>
              <View className="mt-4 rounded-2xl bg-slate-800 p-4">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-bold text-white">{entry.stepCount} steps</Text>
                  <Text className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold uppercase text-cyan-300">
                    {entry.activityState}
                  </Text>
                </View>
                <Text className="mt-2 text-sm text-slate-300">{formatRecordedAt(entry.recordedAt)}</Text>
                <Text className="mt-2 text-xs text-slate-400">Tap to view details →</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
      </ScrollView>

      <Modal
        visible={selectedEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <Pressable className="flex-1 items-center justify-center bg-black/60" onPress={() => setSelectedEntry(null)}>
            <Pressable
            style={{ width: "90%", maxHeight: Dimensions.get("window").height * 0.8 }}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView
              className="rounded-3xl bg-slate-900"
              contentContainerStyle={{ padding: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {selectedEntry && (() => {
                const entry = selectedEntry;
                const sessionKey = entry.sessionId ?? entry.id;
                const points = sessionMetricSeries[sessionKey] ?? [];
                const cadenceValues = points.map((point) => point.cadenceSpm);
                const intensityValues = points.map((point) => Number((point.intensity * 100).toFixed(2)));
                const goalPercent = Math.max(0, Math.min(100, Math.round((entry.stepCount / stepGoal) * 100)));

                return (
                  <>
                    <View className="mb-4 flex-row items-center justify-between">
                      <Text className="text-xl font-bold text-white">Session Details</Text>
                      <Pressable onPress={() => setSelectedEntry(null)} className="rounded-full bg-slate-700 px-4 py-2">
                        <Text className="text-sm font-semibold text-white">Close</Text>
                      </Pressable>
                    </View>

                    <View className="flex-row items-center justify-between">
                      <Text className="text-2xl font-bold text-white">{entry.stepCount} steps</Text>
                      <Text className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold uppercase text-cyan-300">
                        {entry.activityState}
                      </Text>
                    </View>
                    <Text className="mt-2 text-sm text-slate-300">{formatRecordedAt(entry.recordedAt)}</Text>

                    <View className="mt-4">
                      <View className="mb-2 flex-row items-center justify-between">
                        <Text className="text-xs uppercase tracking-wide text-slate-300">Session Goal Progress</Text>
                        <Text className="text-xs font-semibold text-white">{goalPercent}%</Text>
                      </View>
                      <View className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                        <View className="h-2 rounded-full bg-cyan-400" style={{ width: `${goalPercent}%` }} />
                      </View>
                      <Text className="mt-2 text-xs text-slate-300">{entry.stepCount} / {stepGoal} steps</Text>
                    </View>

                    <Text className="mt-4 text-sm text-slate-200">
                      Distance {entry.distanceM.toFixed(1)} m | Duration {entry.durationSeconds}s | Cadence {entry.cadenceSpm.toFixed(0)} spm
                    </Text>

                    {points.length > 0 && (
                      <View className="mt-4 gap-2">
                        <MiniChart
                          label="Cadence Trend (3s)"
                          values={cadenceValues}
                          colorClassName="bg-cyan-400"
                          fixedMaxValue={150}
                          yAxisRangeLabel="0-150"
                        />
                        <MiniChart
                          label="Intensity Trend (3s %)"
                          values={intensityValues}
                          colorClassName="bg-fuchsia-400"
                          fixedMaxValue={100}
                          yAxisRangeLabel="0-100%"
                        />
                      </View>
                    )}

                    {entry.notes ? <Text className="mt-4 text-sm text-slate-300">{entry.notes}</Text> : null}
                  </>
                );
              })()}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}