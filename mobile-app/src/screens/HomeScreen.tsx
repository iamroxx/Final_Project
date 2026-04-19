import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Linking, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, Text, ToastAndroid, View } from "react-native";
import { Accelerometer, Gyroscope, Pedometer } from "expo-sensors";
import * as Location from "expo-location";
import { MetricCard } from "../components/MetricCard";
import { useSensorStream } from "../services/sensors/useSensorStream";
import { useAppStore } from "../store/useAppStore";
import { useSessionStore } from "../store/useSessionStore";
import type { SessionMetricPoint } from "../types";

const DEFAULT_STEP_GOAL = 100;
const DEFAULT_CADENCE_TARGET_SPM = 70;
const CADENCE_AVERAGE_WINDOW_DAYS = 7;
const TREND_POINTS = 30;
const STEP_LENGTH_M = 0.78;
const SESSION_METRIC_BUCKET_MS = 3000;

type TrendPoint = {
  cadence: number;
  intensity: number;
};

type SessionReport = {
  patientId: string;
  sessionId?: string | null;
  stepCount: number;
  distanceM: number;
  durationSeconds: number;
  cadenceSpm: number;
  avgStepIntervalMs: number;
  intensity: number;
  activityState: "idle" | "walking" | "running";
  trendPoints: SessionMetricPoint[];
  startedAtMs?: number;
  stoppedAtMs: number;
  recordedAt: string;
};

type PermissionState = {
  pedometer: boolean;
  accelerometer: boolean;
  gyroscope: boolean;
  location: boolean;
};

type AxisName = "x" | "y" | "z";

type AxisVector = {
  x: number;
  y: number;
  z: number;
};

type GlowSide = "left" | "right" | "top" | "bottom";



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

function axisLabel(axis: "x" | "y" | "z") {
  if (axis === "x") {
    return "X";
  }
  if (axis === "y") {
    return "Y";
  }
  return "Z";
}

function absoluteDominantAxis(values: AxisVector, excludedAxis?: AxisName | null): AxisName {
  const candidates: AxisName[] = ["x", "y", "z"].filter((axis): axis is AxisName => axis !== excludedAxis);
  return candidates.reduce((bestAxis, axis) => {
    return Math.abs(values[axis]) > Math.abs(values[bestAxis]) ? axis : bestAxis;
  }, candidates[0]);
}

function formatAxisValue(value: number): string {
  return value.toFixed(3);
}

function getGlowSide(axis: AxisName, sign: 1 | -1): GlowSide {
  if (axis === "x") {
    return sign > 0 ? "right" : "left";
  }
  return sign > 0 ? "top" : "bottom";
}

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
      <View className="h-24 flex-row items-end gap-[2px]">
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

export function HomeScreen() {
  const [startError, setStartError] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [awaitingStartConfirmation, setAwaitingStartConfirmation] = useState(false);
  const [tiltAxes, setTiltAxes] = useState<AxisVector>({ x: 0, y: 0, z: 0 });
  const [motionAxes, setMotionAxes] = useState<AxisVector>({ x: 0, y: 0, z: 0 });
  const [calibrationVerticalAxis, setCalibrationVerticalAxis] = useState<AxisName | null>(null);
  const [calibrationCurrentAxis, setCalibrationCurrentAxis] = useState<AxisName | null>(null);
  const [calibrationForwardAxis, setCalibrationForwardAxis] = useState<AxisName | null>(null);
  const [calibrationForwardSign, setCalibrationForwardSign] = useState<1 | -1 | null>(null);
  const [axisHoldProgressMs, setAxisHoldProgressMs] = useState(0);
  const [axisCandidateLabel, setAxisCandidateLabel] = useState<string>("waiting for motion...");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showStopConfirmModal, setShowStopConfirmModal] = useState(false);
  const [showEarlyStopWarningModal, setShowEarlyStopWarningModal] = useState(false);
  const [pendingSessionReport, setPendingSessionReport] = useState<SessionReport | null>(null);
  const [isSavingSessionReport, setIsSavingSessionReport] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [sessionTrendPoints, setSessionTrendPoints] = useState<SessionMetricPoint[]>([]);
  const [permissionState, setPermissionState] = useState<PermissionState>({
    pedometer: false,
    accelerometer: false,
    gyroscope: false,
    location: false,
  });
  const [checkingPermissions, setCheckingPermissions] = useState(true);
  const currentUser = useAppStore((state) => state.currentUser);
  const goalSteps = useAppStore((state) => state.goalSteps);
  const cadenceTargets = useAppStore((state) => state.cadenceTargets);
  const progressEntries = useAppStore((state) => state.progressEntries);
  const patientSchedules = useAppStore((state) => state.patientSchedules);
  const recordProgress = useAppStore((state) => state.recordProgress);
  const {
    isRunning,
    sessionId,
    latestMetrics,
    motionCalibration,
    setRunning,
    setSessionId,
    setLatestMetrics,
    setMotionCalibration
  } = useSessionStore();
  const gravityRef = useRef<AxisVector>({ x: 0, y: 0, z: 0 });
  const hasGravityBaselineRef = useRef(false);
  const calibrationLockedRef = useRef(false);
  // Cumulative absolute-value sum per axis over the 3-second walk window.
  const accumRef = useRef<AxisVector>({ x: 0, y: 0, z: 0 });
  // Cumulative signed sum per axis — used to determine forward direction.
  const signedAccumRef = useRef<AxisVector>({ x: 0, y: 0, z: 0 });
  // Timestamp of the first sample after calibration begins.
  const calibrationStartRef = useRef(0);
  const lastRecordedBucketRef = useRef<number>(-1);
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const calibrationDisplayAxis = calibrationForwardAxis ?? calibrationCurrentAxis;
  const calibrationDisplaySign: 1 | -1 | null = useMemo(() => {
    if (!calibrationDisplayAxis) {
      return null;
    }
    if (calibrationForwardAxis && calibrationForwardSign) {
      return calibrationForwardSign;
    }
    return motionAxes[calibrationDisplayAxis] >= 0 ? 1 : -1;
  }, [calibrationDisplayAxis, calibrationForwardAxis, calibrationForwardSign, motionAxes]);

  const activeGlowSide: GlowSide | null = useMemo(() => {
    if (!calibrationDisplayAxis || !calibrationDisplaySign) {
      return null;
    }
    return getGlowSide(calibrationDisplayAxis, calibrationDisplaySign);
  }, [calibrationDisplayAxis, calibrationDisplaySign]);

  const gradientGlowLayers = useMemo(() => {
    if (!activeGlowSide) {
      return [] as Array<{ style: Record<string, string | number>; alpha: number }>;
    }

    const steps = 10;
    const layers: Array<{ style: Record<string, string | number>; alpha: number }> = [];
    for (let i = 0; i < steps; i += 1) {
      const startPct = (i / steps) * 50;
      const sizePct = 50 / steps;
      const alpha = Math.max(0, 1 - i / (steps - 1));

      if (activeGlowSide === "left") {
        layers.push({
          style: { left: `${startPct}%`, top: 0, bottom: 0, width: `${sizePct}%` },
          alpha,
        });
      } else if (activeGlowSide === "right") {
        layers.push({
          style: { right: `${startPct}%`, top: 0, bottom: 0, width: `${sizePct}%` },
          alpha,
        });
      } else if (activeGlowSide === "top") {
        layers.push({
          style: { top: `${startPct}%`, left: 0, right: 0, height: `${sizePct}%` },
          alpha,
        });
      } else {
        layers.push({
          style: { bottom: `${startPct}%`, left: 0, right: 0, height: `${sizePct}%` },
          alpha,
        });
      }
    }

    return layers;
  }, [activeGlowSide]);

  useEffect(() => {
    if (!isCalibrating || !activeGlowSide) {
      glowOpacity.stopAnimation();
      glowOpacity.setValue(0);
      return;
    }

    glowOpacity.stopAnimation();
    glowOpacity.setValue(0);
    Animated.timing(glowOpacity, {
      toValue: 0.9,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    return () => {
      glowOpacity.stopAnimation();
      glowOpacity.setValue(0);
    };
  }, [activeGlowSide, glowOpacity, isCalibrating]);

  const { sampleCount, streamError } = useSensorStream({
    enabled: isRunning,
    sessionId,
    motionCalibration,
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
  const stepGoal = currentUser?.role === "patient" ? goalSteps[currentUser.id] ?? DEFAULT_STEP_GOAL : DEFAULT_STEP_GOAL;
  const progress = Math.min(steps / stepGoal, 1);
  const progressPercent = Math.round(progress * 100);
  const cadence = Math.round(latestMetrics?.cadenceSpm ?? 0);
  const interval = Math.round(latestMetrics?.avgStepIntervalMs ?? 0);
  const intensity = Math.round((latestMetrics?.intensity ?? 0) * 100);
  const distanceFromStepsM = steps * STEP_LENGTH_M;
  const strideLengthM = !isRunning && steps > 0 ? distanceFromStepsM / steps : 0;
  const cadenceSeries = useMemo(() => trend.map((point) => point.cadence), [trend]);
  const intensitySeries = useMemo(() => trend.map((point) => point.intensity), [trend]);
  const allPermissionsGranted = useMemo(
    () => permissionState.pedometer && permissionState.accelerometer && permissionState.gyroscope && permissionState.location,
    [permissionState]
  );
  const todayCadenceSpm = useMemo(() => {
    if (!currentUser || currentUser.role !== "patient") {
      return 0;
    }

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const todaysEntries = progressEntries.filter((entry) => {
      if (entry.patientId !== currentUser.id) {
        return false;
      }
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
  }, [currentUser, progressEntries]);

  const sevenDayAverageCadenceSpm = useMemo(() => {
    if (!currentUser || currentUser.role !== "patient") {
      return 0;
    }

    const windowStart = Date.now() - CADENCE_AVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const entries = progressEntries.filter((entry) => {
      if (entry.patientId !== currentUser.id) {
        return false;
      }

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
  }, [currentUser, progressEntries]);

  const cadenceTargetSpm = useMemo(() => {
    if (!currentUser || currentUser.role !== "patient") {
      return DEFAULT_CADENCE_TARGET_SPM;
    }

    return cadenceTargets[currentUser.id] ?? DEFAULT_CADENCE_TARGET_SPM;
  }, [cadenceTargets, currentUser]);

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

  // ── Schedule gate ──────────────────────────────────────────────────────────
  // Returns a human-readable reason why the session cannot start, or null if allowed.
  const scheduleGate = useMemo((): string | null => {
    if (!currentUser || currentUser.role !== "patient") return null;
    const schedule = patientSchedules[currentUser.id];
    if (!schedule) return "No schedule assigned yet. Ask your doctor to set a schedule.";

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // Date range check
    if (schedule.startDate && todayStr < schedule.startDate) {
      return `Schedule starts on ${schedule.startDate}. Sessions are not available yet.`;
    }
    if (schedule.endDate && todayStr > schedule.endDate) {
      return `Schedule ended on ${schedule.endDate}. Ask your doctor to extend it.`;
    }

    // Weekday check (0=Sun … 6=Sat)
    const todayDow = now.getDay();
    if (!schedule.activeDays.includes(todayDow)) {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const allowedNames = schedule.activeDays.map((d) => dayNames[d]).join(", ");
      return `Today is not a scheduled walking day. Active days: ${allowedNames}.`;
    }

    // Count today's completed sessions
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const todayEntries = progressEntries.filter((e) => {
      if (e.patientId !== currentUser.id) return false;
      const t = new Date(e.recordedAt).getTime();
      return t >= dayStart && t < dayEnd;
    });

    if (todayEntries.length >= schedule.sessionsPerDay) {
      return `Daily session limit reached (${schedule.sessionsPerDay}/${schedule.sessionsPerDay}). Come back tomorrow.`;
    }

    // Cooloff check — time since last session ended
    if (todayEntries.length > 0) {
      const lastEntry = todayEntries.reduce((latest, e) =>
        new Date(e.recordedAt).getTime() > new Date(latest.recordedAt).getTime() ? e : latest
      );
      const lastEndMs = new Date(lastEntry.recordedAt).getTime();
      const cooloffMs = schedule.cooloffMinutes * 60 * 1000;
      const nextAllowedMs = lastEndMs + cooloffMs;
      if (now.getTime() < nextAllowedMs) {
        const remainingMs = nextAllowedMs - now.getTime();
        const remainMins = Math.ceil(remainingMs / 60000);
        return `Cooloff period active. Next session available in ${remainMins} min.`;
      }
    }

    return null; // All checks passed — session is allowed
  }, [currentUser, patientSchedules, progressEntries]);

  // ── Schedule: session duration limit ──────────────────────────────────────
  // Auto-stop when the doctor-assigned duration elapses.
  useEffect(() => {
    if (!isRunning || !startedAt || !currentUser || currentUser.role !== "patient") return;
    const schedule = patientSchedules[currentUser.id];
    if (!schedule || schedule.sessionDurationMinutes <= 0) return;

    const limitMs = schedule.sessionDurationMinutes * 60 * 1000;
    const remaining = limitMs - elapsedMs;
    if (remaining <= 0) {
      handleStop();
      return;
    }

    const timer = setTimeout(() => {
      handleStop();
    }, remaining);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, startedAt, patientSchedules, currentUser]);

  // Derived: remaining session time based on doctor schedule (for display)
  const scheduledDurationMs = useMemo(() => {
    if (!currentUser || currentUser.role !== "patient") return null;
    const schedule = patientSchedules[currentUser.id];
    if (!schedule || schedule.sessionDurationMinutes <= 0) return null;
    return schedule.sessionDurationMinutes * 60 * 1000;
  }, [currentUser, patientSchedules]);

  const sessionTimeRemainingMs = useMemo(() => {
    if (!isRunning || scheduledDurationMs === null) return null;
    return Math.max(0, scheduledDurationMs - elapsedMs);
  }, [isRunning, scheduledDurationMs, elapsedMs]);

  const isStartBlocked = Boolean(scheduleGate) && !isRunning;

  function showErrorToast(message: string) {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }

    Alert.alert("Error", message);
  }

  function showSuccessToast(message: string) {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }

    Alert.alert("Success", message);
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

  useEffect(() => {
    if (!latestMetrics || !isRunning || !startedAt) {
      return;
    }

    const elapsedFromStart = latestMetrics.timestamp - startedAt;
    if (elapsedFromStart < 0) {
      return;
    }

    const bucketIndex = Math.floor(elapsedFromStart / SESSION_METRIC_BUCKET_MS);
    if (bucketIndex <= lastRecordedBucketRef.current) {
      return;
    }

    lastRecordedBucketRef.current = bucketIndex;
    const bucketRecordedAtMs = startedAt + bucketIndex * SESSION_METRIC_BUCKET_MS;
    const point: SessionMetricPoint = {
      bucketIndex,
      recordedAt: new Date(bucketRecordedAtMs).toISOString(),
      cadenceSpm: Number((latestMetrics.cadenceSpm ?? 0).toFixed(2)),
      intensity: Number((latestMetrics.intensity ?? 0).toFixed(3)),
    };

    setSessionTrendPoints((previous) => [...previous, point]);
  }, [isRunning, latestMetrics, startedAt]);

  useEffect(() => {
    if (!isCalibrating) {
      return;
    }

    calibrationLockedRef.current = false;
    hasGravityBaselineRef.current = false;
    accumRef.current = { x: 0, y: 0, z: 0 };
    signedAccumRef.current = { x: 0, y: 0, z: 0 };
    calibrationStartRef.current = 0;
    setTiltAxes({ x: 0, y: 0, z: 0 });
    setMotionAxes({ x: 0, y: 0, z: 0 });
    setCalibrationVerticalAxis(null);
    setCalibrationCurrentAxis(null);
    setCalibrationForwardAxis(null);
    setCalibrationForwardSign(null);
    setAxisHoldProgressMs(0);
    setAxisCandidateLabel("Walk naturally for 3 seconds...");

    const CALIBRATION_DURATION_MS = 3000;
    const GRAVITY_ALPHA = 0.02;

    Accelerometer.setUpdateInterval(50);

    const sub = Accelerometer.addListener((acc) => {
      // Update slow gravity EMA — used only to identify the vertical axis.
      if (!hasGravityBaselineRef.current) {
        gravityRef.current = { x: acc.x, y: acc.y, z: acc.z };
        hasGravityBaselineRef.current = true;
      } else {
        gravityRef.current = {
          x: GRAVITY_ALPHA * acc.x + (1 - GRAVITY_ALPHA) * gravityRef.current.x,
          y: GRAVITY_ALPHA * acc.y + (1 - GRAVITY_ALPHA) * gravityRef.current.y,
          z: GRAVITY_ALPHA * acc.z + (1 - GRAVITY_ALPHA) * gravityRef.current.z,
        };
      }

      setTiltAxes({ x: acc.x, y: acc.y, z: acc.z });
      const verticalAxis = absoluteDominantAxis(gravityRef.current);
      setCalibrationVerticalAxis(verticalAxis);
      const linear = {
        x: acc.x - gravityRef.current.x,
        y: acc.y - gravityRef.current.y,
        z: acc.z - gravityRef.current.z,
      };
      setMotionAxes(linear);

      if (calibrationLockedRef.current) {
        return;
      }

      const now = Date.now();
      // Record the start time on the very first live sample.
      if (calibrationStartRef.current === 0) {
        calibrationStartRef.current = now;
      }

      // Accumulate absolute values per axis — whichever axis has the most
      // total movement after 3 seconds wins.
      accumRef.current.x += Math.abs(acc.x);
      accumRef.current.y += Math.abs(acc.y);
      accumRef.current.z += Math.abs(acc.z);
      // Signed sum lets us determine forward vs. backward direction.
      signedAccumRef.current.x += acc.x;
      signedAccumRef.current.y += acc.y;
      signedAccumRef.current.z += acc.z;

      const elapsed = now - calibrationStartRef.current;
      setAxisHoldProgressMs(Math.min(elapsed, CALIBRATION_DURATION_MS));

      // Identify the non-vertical axis currently leading.
      const horizontalAxes: AxisName[] = (["x", "y", "z"] as AxisName[]).filter(
        (a): a is AxisName => a !== verticalAxis
      );
      const h0 = horizontalAxes[0];
      const h1 = horizontalAxes[1];
      const leadingAxis: AxisName = accumRef.current[h0] >= accumRef.current[h1] ? h0 : h1;
      setCalibrationCurrentAxis(leadingAxis);
      setAxisCandidateLabel(
        `Walk... ${(elapsed / 1000).toFixed(1)}s / 3.0s — leading: ${axisLabel(leadingAxis)}`
      );

      if (elapsed < CALIBRATION_DURATION_MS) {
        return;
      }

      // ── 3 seconds complete — lock the winner ───────────────────────────────
      const forwardAxis = leadingAxis;
      const forwardSign: 1 | -1 = signedAccumRef.current[forwardAxis] >= 0 ? 1 : -1;
      calibrationLockedRef.current = true;
      setCalibrationForwardAxis(forwardAxis);
      setCalibrationForwardSign(forwardSign);
      setMotionCalibration({
        verticalAxis,
        forwardAxis,
        forwardSign,
        sampledAt: Date.now(),
      });
      setAwaitingStartConfirmation(true);
      setIsCalibrating(false);
      setStartError(
        `Locked on ${forwardSign > 0 ? "+" : "-"}${axisLabel(forwardAxis)} ` +
        `(most active axis over 3s). Tap Start Session to begin.`
      );
    });

    return () => {
      sub.remove();
    };
  }, [isCalibrating, setMotionCalibration]);

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

      const localSessionId = `local-${Date.now()}`;
      setSessionId(localSessionId);
      setLatestMetrics(null);
      setStartedAt(Date.now());
      setElapsedMs(0);
      setTrend([]);
      setSessionTrendPoints([]);
      lastRecordedBucketRef.current = -1;
      setRunning(true);
      setMotionCalibration(null);
      setAwaitingStartConfirmation(false);
      setIsCalibrating(false);
      setStartError(null);

      console.info("[session-start][success]", {
        at: new Date().toISOString(),
        sessionId: localSessionId
      });
    } catch (error) {
      const fallbackMessage = "Failed to start local session. Check sensor permissions and try again.";
      const message = error instanceof Error ? error.message : fallbackMessage;
      setStartError(message);

      console.error("[session-start][failure]", {
        at: new Date().toISOString(),
        error: message
      });
      setIsCalibrating(false);
    }
  }

  function handleStop() {
    const stopTimestampMs = Date.now();

    if (currentUser?.role === "patient") {
      const report: SessionReport = {
        patientId: currentUser.id,
        sessionId,
        stepCount: steps,
        distanceM: Number(distanceFromStepsM.toFixed(2)),
        durationSeconds: Math.max(Math.round(elapsedMs / 1000), 0),
        cadenceSpm: Number((latestMetrics?.cadenceSpm ?? 0).toFixed(2)),
        avgStepIntervalMs: Number((latestMetrics?.avgStepIntervalMs ?? 0).toFixed(2)),
        intensity: Number((latestMetrics?.intensity ?? 0).toFixed(3)),
        activityState: latestMetrics?.activityState ?? "idle",
        trendPoints: sessionTrendPoints,
        startedAtMs: startedAt ?? undefined,
        stoppedAtMs: stopTimestampMs,
        recordedAt: new Date(stopTimestampMs).toISOString(),
      };

      setPendingSessionReport(report);
      setShowStopConfirmModal(true);
    }

    setRunning(false);
    // Keep latest metrics visible after stop; only clear on next start.
    setAwaitingStartConfirmation(false);
  }

  function handleCancelSessionSave() {
    setShowStopConfirmModal(false);
    setPendingSessionReport(null);
  }

  async function handleSaveSessionReport() {
    if (!pendingSessionReport || currentUser?.role !== "patient") {
      setShowStopConfirmModal(false);
      setPendingSessionReport(null);
      return;
    }

    if (pendingSessionReport.stepCount <= 0) {
      setStartError("Session has 0 steps, so it was not uploaded.");
      setShowStopConfirmModal(false);
      setPendingSessionReport(null);
      return;
    }

    setIsSavingSessionReport(true);
    try {
      await recordProgress(pendingSessionReport);
      setShowStopConfirmModal(false);
      setPendingSessionReport(null);
      setStartError(null);
      showSuccessToast("Session report saved successfully.");
    } catch {
      setStartError("Failed to save session report. Please try again.");
    } finally {
      setIsSavingSessionReport(false);
    }
  }

  async function handleRestartSessionFromModal() {
    setShowStopConfirmModal(false);
    setPendingSessionReport(null);
    setStartError(null);
    await handleStart();
  }

  return (
    <View className="flex-1 bg-slate-950">
      <ScrollView
        className="flex-1 bg-slate-950"
        contentContainerStyle={{
          paddingTop: 20,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pb-3 pt-3">
        <Text className="text-3xl font-black text-white">{currentUser?.fullName ?? "Patient Dashboard"}</Text>
        <Text className="mt-1 text-sm text-slate-300">Live rehab dashboard and progress recorder</Text>
        </View>

        <View className="mx-5 rounded-3xl bg-slate-900 p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm uppercase tracking-widest text-slate-300">Session</Text>
          <Text className={`rounded-full px-3 py-1 text-xs font-semibold ${isRunning ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
            {isRunning ? "Live" : "Paused"}
          </Text>
        </View>

        <View className="mt-4 flex-row items-start gap-3">
          <View className="flex-1">
            <Text className="text-6xl font-black text-white">{steps}</Text>
            <Text className="text-sm text-slate-300">steps</Text>
          </View>
          <View className="w-[80%] flex-col gap-2">
            <View className="flex-1">
              <MiniChart
                label="Cadence (spm)"
                values={cadenceSeries}
                colorClassName="bg-cyan-400"
                fixedMaxValue={150}
                yAxisRangeLabel="0-150"
              />
            </View>
            <View className="flex-1">
              <MiniChart
                label="Intensity (%)"
                values={intensitySeries}
                colorClassName="bg-fuchsia-400"
                fixedMaxValue={100}
                yAxisRangeLabel="0-100%"
              />
            </View>
          </View>
        </View>

        <View className="mt-5">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-slate-300">Goal Progress</Text>
            <Text className="text-xs font-semibold text-white">{progressPercent}%</Text>
          </View>
          <View className="h-3 w-full overflow-hidden rounded-full bg-slate-700">
            <View className="h-3 rounded-full bg-cyan-400" style={{ width: `${progressPercent}%` }} />
          </View>
          <Text className="mt-2 text-xs text-slate-300">{steps} / {stepGoal} steps</Text>
        </View>

        <View className="mt-5 flex-row items-center justify-between rounded-2xl bg-slate-800 px-4 py-3">
          <View>
            <Text className="text-xs uppercase text-slate-400">Timer</Text>
            <Text className="text-2xl font-bold text-white">{formatDuration(elapsedMs)}</Text>
          </View>
          <View className="items-end">
            {sessionTimeRemainingMs !== null ? (
              <View className="items-end">
                <Text className="text-[10px] uppercase text-slate-400">Time left</Text>
                <Text className={`text-lg font-bold ${sessionTimeRemainingMs < 60000 ? "text-rose-400" : "text-emerald-300"}`}>
                  {formatDuration(sessionTimeRemainingMs)}
                </Text>
              </View>
            ) : null}
            <Text className={`rounded-full px-3 py-2 text-xs font-semibold ${getActivityPillClass(activityLabel)}`}>
              {activityLabel.toUpperCase()}
            </Text>
          </View>
        </View>
        </View>

        {scheduleGate && !isRunning ? (
          <View className="mx-5 mt-4 rounded-2xl border border-amber-700 bg-amber-950 px-4 py-3">
            <Text className="text-xs font-semibold uppercase tracking-wide text-amber-400">Session Blocked</Text>
            <Text className="mt-1 text-sm text-amber-200">{scheduleGate}</Text>
          </View>
        ) : null}
        {!scheduleGate && currentUser?.role === "patient" && patientSchedules[currentUser.id] && !isRunning ? (
          <View className="mx-5 mt-4 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
            {(() => {
              const s = patientSchedules[currentUser.id];
              const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              const now = new Date();
              const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
              const dayEnd = dayStart + 24 * 60 * 60 * 1000;
              const doneToday = progressEntries.filter((e) => {
                if (e.patientId !== currentUser.id) return false;
                const t = new Date(e.recordedAt).getTime();
                return t >= dayStart && t < dayEnd;
              }).length;
              return (
                <>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Today's Schedule</Text>
                  <Text className="mt-1 text-sm text-slate-200">
                    {s.sessionDurationMinutes} min session · {doneToday}/{s.sessionsPerDay} done · {s.cooloffMinutes} min cooloff
                  </Text>
                  <Text className="mt-1 text-xs text-slate-400">
                    Active days: {s.activeDays.map((d) => dayNames[d]).join(", ")}
                  </Text>
                </>
              );
            })()}
          </View>
        ) : null}

        <View className="mt-4 flex-row gap-3 px-5">
        <Pressable
          onPressIn={() => logClick("start_session_button")}
          onPress={handleStart}
          className={`flex-1 rounded-2xl px-4 py-4 ${isRunning || !allPermissionsGranted || isCalibrating || isStartBlocked ? "bg-slate-600" : "bg-cyan-500"}`}
          disabled={isRunning || !allPermissionsGranted || isCalibrating || isStartBlocked}
        >
          <Text className="text-center text-base font-semibold text-slate-950">
            Start Session
          </Text>
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
          label="Distance"
          value={distanceFromStepsM >= 1000
            ? `${(distanceFromStepsM / 1000).toFixed(2)} km`
            : `${distanceFromStepsM.toFixed(1)} m`}
        />
        <MetricCard
          label="Stride Length"
          value={`${strideLengthM.toFixed(2)} m`}
        />
        <MetricCard
          label="Samples"
          value={String(sampleCount)}
        />
        </View>

        <View className="mt-4 px-5">
        <Text className="text-sm text-slate-300">Session ID: {sessionId ?? "-"}</Text>
        {motionCalibration ? (
          <Text className="mt-1 text-sm text-slate-300">
            Axes: Forward {motionCalibration.forwardSign > 0 ? "+" : "-"}{axisLabel(motionCalibration.forwardAxis)} | Vertical {axisLabel(motionCalibration.verticalAxis)}
          </Text>
        ) : null}
        {startError ? (
          <Text className="mt-2 text-sm text-red-600">{startError}</Text>
        ) : null}
        {streamError ? (
          <Text className="mt-2 text-sm text-amber-400">{streamError}</Text>
        ) : null}
        </View>

      </ScrollView>

      <Modal
        visible={isCalibrating}
        transparent
        animationType="fade"
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="relative w-full overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 p-5">
            {gradientGlowLayers.length > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    opacity: glowOpacity,
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                  },
                ]}
              >
                {gradientGlowLayers.map((layer, index) => (
                  <View
                    key={`glow-${activeGlowSide}-${index}`}
                    pointerEvents="none"
                    style={[
                      {
                        position: "absolute",
                        backgroundColor: `rgba(34, 211, 238, ${layer.alpha})`,
                      },
                      layer.style,
                    ]}
                  />
                ))}
              </Animated.View>
            ) : null}
            <Text className="text-xl font-black text-white">Live Calibration</Text>
            <Text className="mt-2 text-sm text-slate-300">
              Walk naturally for 3 seconds. The axis with the most total movement becomes your forward direction.
            </Text>

            <View className="mt-4 rounded-2xl bg-slate-800 p-3">
              <Text className="text-xs uppercase tracking-wide text-slate-300">Tilt (gravity + orientation)</Text>
              <Text className="mt-2 text-sm text-slate-100">X: {formatAxisValue(tiltAxes.x)}  Y: {formatAxisValue(tiltAxes.y)}  Z: {formatAxisValue(tiltAxes.z)}</Text>
            </View>

            <View className="mt-3 rounded-2xl bg-slate-800 p-3">
              <Text className="text-xs uppercase tracking-wide text-slate-300">Motion (linear acceleration)</Text>
              <Text className="mt-2 text-sm text-slate-100">X: {formatAxisValue(motionAxes.x)}  Y: {formatAxisValue(motionAxes.y)}  Z: {formatAxisValue(motionAxes.z)}</Text>
            </View>

            <View className="mt-3 rounded-2xl bg-slate-800 p-3">
              <View className="flex-row gap-6">
                <Text className="text-sm text-slate-100">
                  Vertical: <Text className="font-semibold text-white">{calibrationVerticalAxis ? axisLabel(calibrationVerticalAxis) : "-"}</Text>
                </Text>
                <Text className="text-sm text-slate-100">
                  Forward: <Text className="font-semibold text-white">
                    {calibrationDisplayAxis && calibrationDisplaySign
                      ? `${calibrationDisplaySign > 0 ? "+" : "-"}${axisLabel(calibrationDisplayAxis)}`
                      : "-"}
                  </Text>
                </Text>
              </View>
              {!calibrationForwardAxis ? (
                <Text className="mt-1 text-xs text-slate-300">
                  {axisCandidateLabel} ({Math.floor((axisHoldProgressMs / 3000) * 100)}%)
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => {
                setIsCalibrating(false);
                setAwaitingStartConfirmation(false);
                setMotionCalibration(null);
                setStartError("Calibration canceled. Tap Start Session to calibrate again.");
              }}
              className="mt-5 rounded-2xl bg-slate-700 px-4 py-3"
            >
              <Text className="text-center text-sm font-semibold text-white">Cancel Calibration</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showStopConfirmModal}
        transparent
        animationType="fade"
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full rounded-3xl bg-slate-900 p-5">
            <Text className="text-xl font-black text-white">Confirm Session Report</Text>
            <Text className="mt-2 text-sm text-slate-300">
              Review the session before uploading it to the database.
            </Text>

            <View className="mt-4 rounded-2xl bg-slate-800 p-4">
              <Text className="text-xs uppercase tracking-wide text-slate-400">Session Summary</Text>
              <Text className="mt-2 text-sm text-slate-100">Steps: {pendingSessionReport?.stepCount ?? 0}</Text>
              <Text className="mt-1 text-sm text-slate-100">Duration: {formatDuration((pendingSessionReport?.durationSeconds ?? 0) * 1000)}</Text>
              <Text className="mt-1 text-sm text-slate-100">Cadence: {(pendingSessionReport?.cadenceSpm ?? 0).toFixed(1)} spm</Text>
              <Text className="mt-1 text-sm text-slate-100">Intensity: {Math.round((pendingSessionReport?.intensity ?? 0) * 100)}%</Text>
              <Text className="mt-1 text-sm text-slate-100">Distance: {(pendingSessionReport?.distanceM ?? 0).toFixed(1)} m</Text>
              <Text className="mt-1 text-sm text-slate-100">Activity: {(pendingSessionReport?.activityState ?? "idle").toUpperCase()}</Text>
            </View>

            {(pendingSessionReport?.stepCount ?? 0) <= 0 ? (
              <Text className="mt-3 text-sm text-amber-300">
                This session has 0 steps and will not be uploaded.
              </Text>
            ) : null}

            <View className="mt-5 gap-3">
              <Pressable
                onPress={() => {
                  void handleRestartSessionFromModal();
                }}
                className="rounded-2xl bg-cyan-500 px-4 py-3"
                disabled={isSavingSessionReport}
              >
                <Text className="text-center text-sm font-semibold text-slate-950">Restart Session</Text>
              </Pressable>

              <View className="flex-row gap-3">
                <Pressable
                  onPress={handleCancelSessionSave}
                  className="flex-1 rounded-2xl bg-slate-700 px-4 py-3"
                  disabled={isSavingSessionReport}
                >
                  <Text className="text-center text-sm font-semibold text-white">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    // If session ended before the doctor-assigned duration, warn first
                    if (
                      scheduledDurationMs !== null &&
                      (pendingSessionReport?.durationSeconds ?? 0) * 1000 < scheduledDurationMs
                    ) {
                      setShowEarlyStopWarningModal(true);
                      return;
                    }
                    void handleSaveSessionReport();
                  }}
                  className={`flex-1 rounded-2xl px-4 py-3 ${
                    (pendingSessionReport?.stepCount ?? 0) <= 0 || isSavingSessionReport
                      ? "bg-slate-600"
                      : "bg-emerald-500"
                  }`}
                  disabled={(pendingSessionReport?.stepCount ?? 0) <= 0 || isSavingSessionReport}
                >
                  <Text className="text-center text-sm font-semibold text-white">
                    {isSavingSessionReport ? "Saving..." : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Early-stop warning modal */}
      <Modal
        visible={showEarlyStopWarningModal}
        transparent
        animationType="fade"
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-6">
          <View className="w-full rounded-3xl bg-slate-900 p-5">
            <Text className="text-xl font-black text-amber-400">Session Incomplete</Text>
            <Text className="mt-2 text-sm text-slate-300">
              Your doctor prescribed a{" "}
              <Text className="font-semibold text-white">
                {scheduledDurationMs !== null ? Math.round(scheduledDurationMs / 60000) : 0} min
              </Text>{" "}
              session, but you only completed{" "}
              <Text className="font-semibold text-white">
                {formatDuration((pendingSessionReport?.durationSeconds ?? 0) * 1000)}
              </Text>
              . Saving an incomplete session may affect your recovery tracking.
            </Text>

            <View className="mt-4 rounded-2xl border border-amber-700 bg-amber-950 px-4 py-3">
              <Text className="text-xs font-semibold uppercase tracking-wide text-amber-400">Prescribed</Text>
              <Text className="mt-1 text-sm text-amber-200">
                {scheduledDurationMs !== null ? Math.round(scheduledDurationMs / 60000) : 0} min required ·{" "}
                {formatDuration((pendingSessionReport?.durationSeconds ?? 0) * 1000)} completed
              </Text>
            </View>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => setShowEarlyStopWarningModal(false)}
                className="flex-1 rounded-2xl bg-slate-700 px-4 py-3"
                disabled={isSavingSessionReport}
              >
                <Text className="text-center text-sm font-semibold text-white">Go Back</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowEarlyStopWarningModal(false);
                  void handleSaveSessionReport();
                }}
                className={`flex-1 rounded-2xl px-4 py-3 ${isSavingSessionReport ? "bg-slate-600" : "bg-amber-600"}`}
                disabled={isSavingSessionReport}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  {isSavingSessionReport ? "Saving..." : "Save Anyway"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
