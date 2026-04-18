import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, Text, ToastAndroid, View } from "react-native";
import { Accelerometer, Gyroscope, Pedometer } from "expo-sensors";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MetricCard } from "../components/MetricCard";
import { useSensorStream } from "../services/sensors/useSensorStream";
import { startSession, stopSession } from "../services/api/sessionApi";
import { ensureAnonymousUser } from "../services/firebase/auth";
import { useSessionStore } from "../store/useSessionStore";

const STEP_GOAL = 4000;
const TREND_POINTS = 30;

type TrendPoint = {
  cadence: number;
  intensity: number;
};

type PermissionState = {
  pedometer: boolean;
  accelerometer: boolean;
  gyroscope: boolean;
  location: boolean;
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getActivityPillClass(activity: "idle" | "walking" | "running") {
  if (activity === "running") {
    return "bg-rose-100 text-rose-700";
  }
  if (activity === "walking") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-slate-200 text-slate-700";
}

type MiniChartProps = {
  label: string;
  values: number[];
  colorClassName: string;
};

function MiniChart({ label, values, colorClassName }: MiniChartProps) {
  const maxValue = Math.max(...values, 1);

  return (
    <View className="rounded-2xl bg-slate-800 p-3">
      <Text className="mb-2 text-xs uppercase tracking-wide text-slate-300">{label}</Text>
      <View className="h-16 flex-row items-end gap-[2px]">
        {values.map((value, index) => {
          const normalizedHeight = Math.max((value / maxValue) * 100, 6);
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

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [startError, setStartError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [permissionState, setPermissionState] = useState<PermissionState>({
    pedometer: false,
    accelerometer: false,
    gyroscope: false,
    location: false,
  });
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const {
    isRunning,
    sessionId,
    latestMetrics,
    setRunning,
    setSessionId,
    setLatestMetrics
  } = useSessionStore();

  const { sampleCount, streamError } = useSensorStream({
    enabled: isRunning,
    sessionId,
    onMetrics: setLatestMetrics
  });

  useEffect(() => {
    if (!isRunning || !startedAt) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, startedAt]);

  const activityLabel = useMemo(() => latestMetrics?.activityState ?? "idle", [latestMetrics]);
  const steps = latestMetrics?.stepCountTotal ?? 0;
  const progress = Math.min(steps / STEP_GOAL, 1);
  const progressPercent = Math.round(progress * 100);
  const cadence = Math.round(latestMetrics?.cadenceSpm ?? 0);
  const interval = Math.round(latestMetrics?.avgStepIntervalMs ?? 0);
  const intensity = Math.round((latestMetrics?.intensity ?? 0) * 100);
  const cadenceSeries = useMemo(() => trend.map((point) => point.cadence), [trend]);
  const intensitySeries = useMemo(() => trend.map((point) => point.intensity), [trend]);
  const allPermissionsGranted = useMemo(
    () => permissionState.pedometer && permissionState.accelerometer && permissionState.gyroscope && permissionState.location,
    [permissionState]
  );

  function showErrorToast(message: string) {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }

    Alert.alert("Error", message);
  }

  async function requestStartupPermissions() {
    setCheckingPermissions(true);

    try {
      const [pedometerAvailableRes, accAvailableRes, gyroAvailableRes] = await Promise.allSettled([
        Pedometer.isAvailableAsync(),
        Accelerometer.isAvailableAsync(),
        Gyroscope.isAvailableAsync(),
      ]);

      const pedometerAvailable = pedometerAvailableRes.status === "fulfilled" ? pedometerAvailableRes.value : false;
      const accAvailable = accAvailableRes.status === "fulfilled" ? accAvailableRes.value : false;
      const gyroAvailable = gyroAvailableRes.status === "fulfilled" ? gyroAvailableRes.value : false;

      const [pedometerPermissionRes, accPermissionRes, gyroPermissionRes] = await Promise.allSettled([
        Pedometer.requestPermissionsAsync(),
        Accelerometer.requestPermissionsAsync(),
        Gyroscope.requestPermissionsAsync(),
      ]);

      const pedometerGranted = pedometerPermissionRes.status === "fulfilled" ? pedometerPermissionRes.value.granted : false;
      const accelerometerGranted = accPermissionRes.status === "fulfilled" ? accPermissionRes.value.granted : false;
      const gyroscopeGranted = gyroPermissionRes.status === "fulfilled" ? gyroPermissionRes.value.granted : false;

      // Read current location status first; request only if not already granted.
      const currentLocationPermission = await Location.getForegroundPermissionsAsync();
      let locationGranted = currentLocationPermission.granted || currentLocationPermission.status === "granted";
      if (!locationGranted) {
        const requestedLocationPermission = await Location.requestForegroundPermissionsAsync();
        locationGranted = requestedLocationPermission.granted || requestedLocationPermission.status === "granted";
      }

      let androidActivityGranted = true;
      if (Platform.OS === "android") {
        const androidPermission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
        if (androidPermission) {
          const hasAndroidPermission = await PermissionsAndroid.check(androidPermission);
          if (!hasAndroidPermission) {
            const result = await PermissionsAndroid.request(androidPermission);
            androidActivityGranted = result === PermissionsAndroid.RESULTS.GRANTED;
          }
        }
      }

      setPermissionState({
        pedometer: pedometerAvailable && pedometerGranted && androidActivityGranted,
        accelerometer: accAvailable && accelerometerGranted,
        gyroscope: gyroAvailable && gyroscopeGranted,
        location: locationGranted,
      });
    } finally {
      setCheckingPermissions(false);
    }
  }

  useEffect(() => {
    void requestStartupPermissions();
  }, []);

  useEffect(() => {
    if (!startError) {
      return;
    }
    showErrorToast(startError);
  }, [startError]);

  useEffect(() => {
    if (!streamError) {
      return;
    }
    showErrorToast(streamError);
  }, [streamError]);

  async function requestPedometerPermission(): Promise<boolean> {
    try {
      const permission = await Pedometer.requestPermissionsAsync();
      if (permission.granted) {
        return true;
      }
    } catch {
      // Fall back to Android runtime permission request below.
    }

    if (Platform.OS !== "android") {
      return false;
    }

    const androidPermission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
    if (!androidPermission) {
      return false;
    }

    const alreadyGranted = await PermissionsAndroid.check(androidPermission);
    if (alreadyGranted) {
      return true;
    }

    const result = await PermissionsAndroid.request(androidPermission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  function logClick(action: string) {
    const payload = {
      action,
      at: new Date().toISOString(),
      isRunning,
      sessionId,
      steps
    };
    console.info("[ui-click]", payload);
  }

  useEffect(() => {
    if (!latestMetrics || !isRunning) {
      return;
    }

    const nextPoint = {
      cadence: Math.max(Math.round(latestMetrics.cadenceSpm), 0),
      intensity: Math.max(Math.round(latestMetrics.intensity * 100), 0)
    };

    setTrend((previous) => {
      const updated = [...previous, nextPoint];
      return updated.slice(-TREND_POINTS);
    });
  }, [isRunning, latestMetrics]);

  async function handleStart() {
    if (isRunning) {
      return;
    }
    if (!allPermissionsGranted) {
      setStartError("Allow all required permissions before starting a session.");
      return;
    }
    setStartError(null);
    console.info("[session-start][request]", {
      at: new Date().toISOString(),
      isRunning,
      sessionId
    });

    try {
      const pedometerPermissionGranted = await requestPedometerPermission();
      if (!pedometerPermissionGranted) {
        throw new Error("Pedometer permission is required. Please allow Activity Recognition.");
      }

      const pedometerAvailable = await Pedometer.isAvailableAsync();
      if (!pedometerAvailable) {
        throw new Error("Pedometer is not available on this device.");
      }

      const user = await ensureAnonymousUser();
      const result = await startSession(user.uid);
      setSessionId(result.sessionId);
      setStartedAt(Date.now());
      setElapsedMs(0);
      setTrend([]);
      setRunning(true);

      console.info("[session-start][success]", {
        at: new Date().toISOString(),
        userId: user.uid,
        sessionId: result.sessionId
      });
    } catch (error) {
      const fallbackMessage = "Failed to start session. Check Firebase Auth settings and try again.";
      const message = error instanceof Error ? error.message : fallbackMessage;
      setStartError(message);

      console.error("[session-start][failure]", {
        at: new Date().toISOString(),
        error: message
      });
    }
  }

  async function handleStop() {
    if (!sessionId) {
      setRunning(false);
      return;
    }
    try {
      await stopSession(sessionId);
      setRunning(false);
      setSessionId(null);
      setStartedAt(null);
    } catch (error) {
      const fallbackMessage = "Failed to stop session. Please try again.";
      const message = error instanceof Error ? error.message : fallbackMessage;
      setStartError(message);
    }
  }

  return (
    <View className="flex-1 bg-slate-950">
      <ScrollView
        className="flex-1 bg-slate-950"
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pb-3 pt-3">
        <Text className="text-3xl font-black text-white">Step Motion</Text>
        <Text className="mt-1 text-sm text-slate-300">Live movement dashboard</Text>
        </View>

        <View className="mx-5 rounded-3xl bg-slate-900 p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm uppercase tracking-widest text-slate-300">Session</Text>
          <Text className={`rounded-full px-3 py-1 text-xs font-semibold ${isRunning ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
            {isRunning ? "Live" : "Paused"}
          </Text>
        </View>

        <Text className="mt-4 text-6xl font-black text-white">{steps}</Text>
        <Text className="text-sm text-slate-300">steps</Text>

        <View className="mt-5">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-slate-300">Goal Progress</Text>
            <Text className="text-xs font-semibold text-white">{progressPercent}%</Text>
          </View>
          <View className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
            <View className="h-3 rounded-full bg-cyan-400" style={{ width: `${progressPercent}%` }} />
          </View>
          <Text className="mt-2 text-xs text-slate-300">{steps} / {STEP_GOAL} steps</Text>
        </View>

        <View className="mt-5 flex-row items-center justify-between rounded-2xl bg-slate-800 px-4 py-3">
          <View>
            <Text className="text-xs uppercase text-slate-400">Timer</Text>
            <Text className="text-2xl font-bold text-white">{formatDuration(elapsedMs)}</Text>
          </View>
          <Text className={`rounded-full px-3 py-2 text-xs font-semibold ${getActivityPillClass(activityLabel)}`}>
            {activityLabel.toUpperCase()}
          </Text>
        </View>
        </View>

        <View className="mt-4 flex-row flex-wrap justify-between gap-y-3 px-5">
        <MetricCard
          label="Cadence"
          value={`${cadence} spm`}
        />
        <MetricCard
          label="Step Interval"
          value={`${interval} ms`}
        />
        <MetricCard
          label="Intensity"
          value={`${intensity}%`}
        />
        <MetricCard
          label="Samples"
          value={String(sampleCount)}
        />
        </View>

        <View className="mt-4 gap-3 px-5">
        <Text className="text-sm font-semibold text-slate-200">Last 30s Trend</Text>
        <MiniChart label="Cadence (spm)" values={cadenceSeries} colorClassName="bg-cyan-400" />
        <MiniChart label="Intensity (%)" values={intensitySeries} colorClassName="bg-fuchsia-400" />
        </View>

        <View className="mt-4 px-5">
        <Text className="text-sm text-slate-300">Session ID: {sessionId ?? "-"}</Text>
        {startError ? (
          <Text className="mt-2 text-sm text-red-600">{startError}</Text>
        ) : null}
        {streamError ? (
          <Text className="mt-2 text-sm text-amber-400">{streamError}</Text>
        ) : null}
        </View>

        <View className="mt-auto flex-row gap-3 px-5 pb-8 pt-6">
        <Pressable
          onPressIn={() => logClick("start_session_button")}
          onPress={handleStart}
          className={`flex-1 rounded-2xl px-4 py-4 ${isRunning || !allPermissionsGranted ? "bg-slate-600" : "bg-cyan-500"}`}
          disabled={isRunning || !allPermissionsGranted}
        >
          <Text className="text-center text-base font-semibold text-slate-950">Start Session</Text>
        </Pressable>

        <Pressable
          onPressIn={() => logClick("stop_session_button")}
          onPress={handleStop}
          className={`flex-1 rounded-2xl px-4 py-4 ${isRunning && allPermissionsGranted ? "bg-rose-500" : "bg-slate-600"}`}
          disabled={!isRunning || !allPermissionsGranted}
        >
          <Text className="text-center text-base font-semibold text-white">Stop Session</Text>
        </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={!allPermissionsGranted}
        transparent
        animationType="fade"
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full rounded-3xl bg-slate-900 p-5">
            <Text className="text-xl font-black text-white">Permissions Required</Text>
            <Text className="mt-2 text-sm text-slate-300">
              Allow all permissions to use Step Motion.
            </Text>

            <View className="mt-4 gap-2">
              <View className="flex-row items-center justify-between rounded-xl bg-slate-800 px-3 py-2">
                <Text className="text-sm text-slate-100">Pedometer / Activity Recognition</Text>
                <Text className={`rounded-full px-2 py-1 text-xs font-semibold ${permissionState.pedometer ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300"}`}>
                  {permissionState.pedometer ? "Allowed" : "Not Allowed"}
                </Text>
              </View>

              <View className="flex-row items-center justify-between rounded-xl bg-slate-800 px-3 py-2">
                <Text className="text-sm text-slate-100">Accelerometer</Text>
                <Text className={`rounded-full px-2 py-1 text-xs font-semibold ${permissionState.accelerometer ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300"}`}>
                  {permissionState.accelerometer ? "Allowed" : "Not Allowed"}
                </Text>
              </View>

              <View className="flex-row items-center justify-between rounded-xl bg-slate-800 px-3 py-2">
                <Text className="text-sm text-slate-100">Gyroscope</Text>
                <Text className={`rounded-full px-2 py-1 text-xs font-semibold ${permissionState.gyroscope ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300"}`}>
                  {permissionState.gyroscope ? "Allowed" : "Not Allowed"}
                </Text>
              </View>

              <View className="flex-row items-center justify-between rounded-xl bg-slate-800 px-3 py-2">
                <Text className="text-sm text-slate-100">Location</Text>
                <Text className={`rounded-full px-2 py-1 text-xs font-semibold ${permissionState.location ? "bg-emerald-500/20 text-emerald-300" : "bg-orange-500/20 text-orange-300"}`}>
                  {permissionState.location ? "Allowed" : "Not Allowed"}
                </Text>
              </View>
            </View>

            {checkingPermissions ? (
              <View className="mt-4 flex-row items-center gap-2">
                <ActivityIndicator color="#22d3ee" />
                <Text className="text-sm text-slate-300">Checking permissions...</Text>
              </View>
            ) : null}

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => {
                  void requestStartupPermissions();
                }}
                className="flex-1 rounded-2xl bg-cyan-500 px-4 py-3"
              >
                <Text className="text-center text-sm font-semibold text-slate-950">Grant Again</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void Linking.openSettings();
                }}
                className="flex-1 rounded-2xl bg-slate-700 px-4 py-3"
              >
                <Text className="text-center text-sm font-semibold text-white">Open Settings</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
