import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { Accelerometer, Gyroscope, Pedometer } from "expo-sensors";
import * as Location from "expo-location";
import type { MotionCalibration, ProcessedMetrics } from "../../types";

type UseSensorStreamOptions = {
  enabled: boolean;
  sessionId: string | null;
  motionCalibration: MotionCalibration | null;
  samplingRateHz?: number;
  onMetrics: (metrics: ProcessedMetrics) => void;
};

// Haversine formula — returns distance in metres between two WGS-84 coordinates.
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useSensorStream({
  enabled,
  sessionId,
  motionCalibration,
  samplingRateHz = 50,
  onMetrics
}: UseSensorStreamOptions) {
  const [sampleCount, setSampleCount] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [gpsDistanceM, setGpsDistanceM] = useState(0);
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const gravRef = useRef({ x: 0, y: 0, z: 0 });
  const hasGravityBaselineRef = useRef(false);
  const gpsSpeedRef = useRef<number | null>(null);
  const lastGpsPositionRef = useRef<{ lat: number; lon: number } | null>(null);
  const gpsDistanceMRef = useRef(0);
  const hwStepTotalRef = useRef(0);
  const lastStepTimestampRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number>(0);
  const stepTimestampsRef = useRef<number[]>([]);
  const cadenceSmoothedRef = useRef(0);
  const magWindowRef = useRef<number[]>([]);
  const smoothMagRef = useRef<number>(0);
  const prevMagRef = useRef<number>(0);
  const prevPrevMagRef = useRef<number>(0);
  const lastEmitMsRef = useRef(0);

  function classifyActivity(cadenceSpm: number, intensity: number): "idle" | "walking" | "running" {
    if (cadenceSpm >= 165 || intensity >= 0.9) {
      return "running";
    }
    if (cadenceSpm >= 45 || intensity >= 0.22) {
      return "walking";
    }
    return "idle";
  }

  function emitLocalMetrics(now: number) {
    const elapsedSinceStart = now - sessionStartedAtRef.current;
    const STABILIZE_MS = 3000;

    // Cadence based on steps taken over elapsed time (stable rate estimate).
    const CADENCE_WINDOW_MS = 10000;
    const MIN_CADENCE_WINDOW_MS = 3000;
    const stepTimes = stepTimestampsRef.current;
    const recentStepTimes = stepTimes.filter((ts) => ts >= now - CADENCE_WINDOW_MS);

    let cadenceRaw = 0;
    if (recentStepTimes.length >= 4) {
      const elapsedWindowMs = Math.max(
        MIN_CADENCE_WINDOW_MS,
        recentStepTimes[recentStepTimes.length - 1] - recentStepTimes[0]
      );
      cadenceRaw = ((recentStepTimes.length - 1) * 60000) / elapsedWindowMs;
    } else if (hwStepTotalRef.current >= 4) {
      const elapsedSinceStartMs = Math.max(MIN_CADENCE_WINDOW_MS, now - sessionStartedAtRef.current);
      cadenceRaw = ((hwStepTotalRef.current - 1) * 60000) / elapsedSinceStartMs;
    }

    // Decay cadence to 0 after user stops stepping for a while.
    const lastStepTs = lastStepTimestampRef.current;
    if (lastStepTs !== null && now - lastStepTs > 3000) {
      cadenceRaw = 0;
    }

    // Keep startup cadence at zero while filters settle.
    if (elapsedSinceStart < STABILIZE_MS) {
      cadenceRaw = 0;
    }

    const prevCadence = cadenceSmoothedRef.current;
    const cadenceSpm = prevCadence === 0
      ? cadenceRaw
      : 0.25 * cadenceRaw + 0.75 * prevCadence;
    cadenceSmoothedRef.current = cadenceSpm;
    const avgStepIntervalMs = cadenceSpm > 0 ? 60000 / cadenceSpm : 0;

    const window = magWindowRef.current;
    const intensity = elapsedSinceStart < STABILIZE_MS
      ? 0
      : window.length > 0
        ? Math.min(1, window.reduce((sum, v) => sum + v, 0) / window.length / 1.2)
        : 0;

    const activityState = classifyActivity(cadenceSpm, intensity);

    const metrics: ProcessedMetrics = {
      timestamp: now,
      stepCountTotal: hwStepTotalRef.current,
      cadenceSpm: Number(cadenceSpm.toFixed(2)),
      avgStepIntervalMs: Number(avgStepIntervalMs.toFixed(2)),
      intensity: Number(intensity.toFixed(3)),
      activityState,
    };
    onMetrics(metrics);
  }

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

  useEffect(() => {
    if (!enabled) {
      setStreamError(null);
      return;
    }

    let mounted = true;
    let accSub: { remove: () => void } | null = null;
    let gyroSub: { remove: () => void } | null = null;
    let pedometerSub: { remove: () => void } | null = null;
    let locationSub: Location.LocationSubscription | null = null;

    const startSensors = async () => {
      try {
        setStreamError(null);

        // --- Hardware pedometer (primary step source) ---
        const pedometerPermissionGranted = await requestPedometerPermission();
        const pedometerPermission = { granted: pedometerPermissionGranted, status: pedometerPermissionGranted ? "granted" : "denied" };
        console.info("[sensor-permission][status]", {
          at: new Date().toISOString(),
          pedometer: pedometerPermission.status,
          pedometerGranted: pedometerPermission.granted,
        });
        if (!pedometerPermission.granted) {
          throw new Error("Activity recognition permission denied. Enable it in phone settings.");
        }

        const pedometerAvailable = await Pedometer.isAvailableAsync();
        if (!pedometerAvailable) {
          throw new Error("Hardware step counter is not available on this device.");
        }

        // --- Accelerometer + Gyroscope (for intensity / cadence only) ---
        const [accAvailable, gyroAvailable] = await Promise.all([
          Accelerometer.isAvailableAsync(),
          Gyroscope.isAvailableAsync()
        ]);
        if (!accAvailable || !gyroAvailable) {
          throw new Error("Required motion sensors are not available on this device.");
        }
        const [accPermission, gyroPermission] = await Promise.all([
          Accelerometer.requestPermissionsAsync(),
          Gyroscope.requestPermissionsAsync()
        ]);
        if (!accPermission.granted || !gyroPermission.granted) {
          throw new Error("Motion permission denied. Enable motion/activity permission in phone settings.");
        }

        // --- GPS (best-effort) ---
        try {
          const locPermission = await Location.requestForegroundPermissionsAsync();
          console.info("[sensor-permission][status]", {
            at: new Date().toISOString(),
            location: locPermission.status,
            locationGranted: locPermission.granted
          });
          if (locPermission.granted) {
            locationSub = await Location.watchPositionAsync(
              { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 3 },
              (loc) => {
                const speed = loc.coords.speed ?? 0;
                gpsSpeedRef.current = speed;
                const { latitude: lat, longitude: lon, accuracy } = loc.coords;
                // Skip samples with poor accuracy (>15 m horizontal error).
                if (accuracy !== null && accuracy > 15) return;
                // Only accumulate distance when the device is actually moving.
                // 0.5 m/s ≈ 1.8 km/h — well below a slow walk; filters GPS drift while stationary.
                if (speed < 0.5) {
                  // Still update position so next real movement has a fresh start point.
                  lastGpsPositionRef.current = { lat, lon };
                  return;
                }
                const prev = lastGpsPositionRef.current;
                if (prev !== null) {
                  const delta = haversineM(prev.lat, prev.lon, lat, lon);
                  // Require at least 3 m positional change to guard against speed spikes + GPS noise.
                  if (delta >= 3) {
                    gpsDistanceMRef.current += delta;
                    setGpsDistanceM(gpsDistanceMRef.current);
                  }
                }
                lastGpsPositionRef.current = { lat, lon };
              }
            );
          }
        } catch {
          console.warn("[sensor-permission][location-unavailable]");
        }

        if (!mounted) return;

        // Start local magnitude-based step detection state.
        setSampleCount(0);
        setGpsDistanceM(0);
        gpsDistanceMRef.current = 0;
        lastGpsPositionRef.current = null;
        hwStepTotalRef.current = 0;
        hasGravityBaselineRef.current = false;
        sessionStartedAtRef.current = Date.now();
        lastStepTimestampRef.current = null;
        stepTimestampsRef.current = [];
        cadenceSmoothedRef.current = 0;
        magWindowRef.current = [];
        smoothMagRef.current = 0;
        prevMagRef.current = 0;
        prevPrevMagRef.current = 0;
        lastEmitMsRef.current = 0;

        // Pedometer sensor is still permission-checked for device compatibility,
        // but step counting is now purely magnitude-based from accelerometer.
        pedometerSub = null;

        const intervalMs = Math.floor(1000 / samplingRateHz);
        Accelerometer.setUpdateInterval(intervalMs);
        Gyroscope.setUpdateInterval(intervalMs);

        accSub = Accelerometer.addListener((acc) => {
          const now = Date.now();
          const GRAV_ALPHA = 0.02;
          if (!hasGravityBaselineRef.current) {
            gravRef.current = { x: acc.x, y: acc.y, z: acc.z };
            hasGravityBaselineRef.current = true;
          } else {
            gravRef.current = {
              x: GRAV_ALPHA * acc.x + (1 - GRAV_ALPHA) * gravRef.current.x,
              y: GRAV_ALPHA * acc.y + (1 - GRAV_ALPHA) * gravRef.current.y,
              z: GRAV_ALPHA * acc.z + (1 - GRAV_ALPHA) * gravRef.current.z,
            };
          }
          const linX = acc.x - gravRef.current.x;
          const linY = acc.y - gravRef.current.y;
          const linZ = acc.z - gravRef.current.z;
          // Orientation-independent step signal from resultant linear acceleration.
          const magnitude = Math.sqrt(linX * linX + linY * linY + linZ * linZ);
          const MAG_SMOOTH_ALPHA = 0.2;
          const smoothMag =
            smoothMagRef.current === 0
              ? magnitude
              : MAG_SMOOTH_ALPHA * magnitude + (1 - MAG_SMOOTH_ALPHA) * smoothMagRef.current;
          smoothMagRef.current = smoothMag;

          magWindowRef.current.push(smoothMag);
          if (magWindowRef.current.length > samplingRateHz * 2) {
            magWindowRef.current.shift();
          }

          // Dynamic threshold: mean + k*std over rolling 2s window.
          const window = magWindowRef.current;
          const mean = window.reduce((sum, v) => sum + v, 0) / Math.max(1, window.length);
          const variance = window.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / Math.max(1, window.length);
          const std = Math.sqrt(variance);
          const dynamicThreshold = Math.max(0.12, mean + 0.9 * std);
          const minProminence = Math.max(0.04, 0.35 * std);

          // Peak detection with refractory period (industry-standard pedometer pattern).
          const current = smoothMag;
          const prev = prevMagRef.current;
          const prevPrev = prevPrevMagRef.current;
          const REFRACTORY_MS = 420;
          const WARMUP_MS = 2000;
          const gyroMag = Math.sqrt(
            gyroRef.current.x * gyroRef.current.x +
            gyroRef.current.y * gyroRef.current.y +
            gyroRef.current.z * gyroRef.current.z
          );

          const isPeakShape = prev > prevPrev && prev >= current;
          const isAboveThreshold = prev >= dynamicThreshold;
          const hasProminence = (prev - mean) >= minProminence;
          const notRotationBurst = gyroMag < 3.0;
          const isPeak = isPeakShape && isAboveThreshold && hasProminence && notRotationBurst;
          const afterWarmup = now - sessionStartedAtRef.current >= WARMUP_MS;
          const enoughGap =
            lastStepTimestampRef.current === null || now - lastStepTimestampRef.current >= REFRACTORY_MS;

          if (isPeak && afterWarmup && enoughGap) {
            hwStepTotalRef.current += 1;
            stepTimestampsRef.current.push(now);
            if (stepTimestampsRef.current.length > 200) {
              stepTimestampsRef.current = stepTimestampsRef.current.slice(-200);
            }
            lastStepTimestampRef.current = now;
          }

          prevPrevMagRef.current = prev;
          prevMagRef.current = current;

          setSampleCount((n) => n + 1);

          // Throttle UI metric emission to ~10 Hz for smooth real-time updates.
          if (now - lastEmitMsRef.current >= 100) {
            lastEmitMsRef.current = now;
            emitLocalMetrics(now);
          }
        });

        gyroSub = Gyroscope.addListener((gyro) => { gyroRef.current = gyro; });

      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to initialize motion sensors.";
        setStreamError(message);
      }
    };

    void startSensors();

    return () => {
      mounted = false;
      accSub?.remove();
      gyroSub?.remove();
      pedometerSub?.remove();
      locationSub?.remove();
    };
  }, [enabled, motionCalibration, onMetrics, samplingRateHz, sessionId]);

  return { sampleCount, streamError, gpsDistanceM };
}
