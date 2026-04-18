import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MetricCard } from "../components/MetricCard";
import { useSensorStream } from "../services/sensors/useSensorStream";
import { startSession, stopSession } from "../services/api/sessionApi";
import { ensureAnonymousUser } from "../services/firebase/auth";
import { useSessionStore } from "../store/useSessionStore";


export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    isRunning,
    sessionId,
    latestMetrics,
    setRunning,
    setSessionId,
    setLatestMetrics
  } = useSessionStore();

  const { sampleCount } = useSensorStream({
    enabled: isRunning,
    sessionId,
    onMetrics: setLatestMetrics
  });

  const activityLabel = useMemo(() => latestMetrics?.activityState ?? "idle", [latestMetrics]);

  async function handleStart() {
    if (isRunning) {
      return;
    }
    const user = await ensureAnonymousUser();
    const result = await startSession(user.uid);
    setSessionId(result.sessionId);
    setRunning(true);
  }

  async function handleStop() {
    if (!sessionId) {
      setRunning(false);
      return;
    }
    await stopSession(sessionId);
    setRunning(false);
    setSessionId(null);
  }

  return (
    <View className="flex-1 bg-slate-100" style={{ paddingTop: insets.top }}>
      <View className="px-5 pb-4 pt-3">
        <Text className="text-3xl font-black text-slate-900">Step Motion</Text>
        <Text className="mt-1 text-sm text-slate-600">
          Real-time step, cadence, and activity analysis
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-3 px-5">
        <MetricCard
          label="Steps"
          value={String(latestMetrics?.stepCountTotal ?? 0)}
        />
        <MetricCard
          label="Cadence"
          value={`${Math.round(latestMetrics?.cadenceSpm ?? 0)} spm`}
        />
        <MetricCard
          label="Interval"
          value={`${Math.round(latestMetrics?.avgStepIntervalMs ?? 0)} ms`}
        />
        <MetricCard
          label="Activity"
          value={activityLabel}
        />
      </View>

      <View className="mt-4 px-5">
        <Text className="text-sm text-slate-600">Captured samples: {sampleCount}</Text>
        <Text className="text-sm text-slate-600">Session ID: {sessionId ?? "-"}</Text>
      </View>

      <View className="mt-auto flex-row gap-3 px-5 pb-8 pt-6">
        <Pressable
          onPress={handleStart}
          className={`flex-1 rounded-xl px-4 py-4 ${isRunning ? "bg-slate-300" : "bg-brand-500"}`}
          disabled={isRunning}
        >
          <Text className="text-center text-base font-semibold text-white">Start Session</Text>
        </Pressable>

        <Pressable
          onPress={handleStop}
          className={`flex-1 rounded-xl px-4 py-4 ${isRunning ? "bg-red-500" : "bg-slate-300"}`}
          disabled={!isRunning}
        >
          <Text className="text-center text-base font-semibold text-white">Stop Session</Text>
        </Pressable>
      </View>
    </View>
  );
}
