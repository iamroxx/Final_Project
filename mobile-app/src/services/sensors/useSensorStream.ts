import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { Accelerometer, Gyroscope, Pedometer } from "expo-sensors";
import * as Location from "expo-location";
import { vectorMagnitude } from "../../processing/filters";
import { sendSensorBatch } from "../api/ingestApi";
import type { ProcessedMetrics, SensorSample } from "../../types";

type UseSensorStreamOptions = {
  enabled: boolean;
  sessionId: string | null;
  samplingRateHz?: number;
  onMetrics: (metrics: ProcessedMetrics) => void;
};

export function useSensorStream({
  enabled,
  sessionId,
  samplingRateHz = 50,
  onMetrics
}: UseSensorStreamOptions) {
  const [sampleCount, setSampleCount] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const gravRef = useRef({ x: 0, y: 0, z: 9.81 });
  const gpsSpeedRef = useRef<number | null>(null);
  // Hardware step count from Pedometer (cumulative since watch started)
  const hwStepBaseRef = useRef<number>(0);   // value at session start
  const hwStepTotalRef = useRef<number>(0);  // latest cumulative value
  const bufferRef = useRef<SensorSample[]>([]);

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
    if (!enabled || !sessionId) {
      setStreamError(null);
      return;
    }

    let mounted = true;
    let accSub: { remove: () => void } | null = null;
    let gyroSub: { remove: () => void } | null = null;
    let pedometerSub: { remove: () => void } | null = null;
    let locationSub: Location.LocationSubscription | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;

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
              { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
              (loc) => { gpsSpeedRef.current = loc.coords.speed ?? 0; }
            );
          }
        } catch {
          console.warn("[sensor-permission][location-unavailable]");
        }

        if (!mounted) return;

        // Capture baseline so steps are relative to session start
        hwStepBaseRef.current = 0;
        hwStepTotalRef.current = 0;

        // Subscribe to hardware step counter — fires whenever the chip detects a step
        pedometerSub = Pedometer.watchStepCount((result) => {
          // result.steps is cumulative since subscription started
          hwStepTotalRef.current = result.steps;
        });

        const intervalMs = Math.floor(1000 / samplingRateHz);
        Accelerometer.setUpdateInterval(intervalMs);
        Gyroscope.setUpdateInterval(intervalMs);

        accSub = Accelerometer.addListener((acc) => {
          const now = Date.now();
          const GRAV_ALPHA = 0.02;
          gravRef.current = {
            x: GRAV_ALPHA * acc.x + (1 - GRAV_ALPHA) * gravRef.current.x,
            y: GRAV_ALPHA * acc.y + (1 - GRAV_ALPHA) * gravRef.current.y,
            z: GRAV_ALPHA * acc.z + (1 - GRAV_ALPHA) * gravRef.current.z,
          };
          const linX = acc.x - gravRef.current.x;
          const linY = acc.y - gravRef.current.y;
          const linZ = acc.z - gravRef.current.z;
          const magnitude = vectorMagnitude(linX, linY, linZ);

          bufferRef.current.push({
            timestamp: now,
            ax: acc.x, ay: acc.y, az: acc.z,
            gx: gyroRef.current.x, gy: gyroRef.current.y, gz: gyroRef.current.z,
            magnitude
          });
          setSampleCount((n) => n + 1);
        });

        gyroSub = Gyroscope.addListener((gyro) => { gyroRef.current = gyro; });

        flushTimer = setInterval(async () => {
          if (bufferRef.current.length === 0 || !sessionId) return;

          const batch = bufferRef.current;
          bufferRef.current = [];
          const start = Date.now();

          try {
            const response = await sendSensorBatch({
              sessionId,
              samplingRateHz,
              samples: batch,
              gpsSpeedMs: gpsSpeedRef.current ?? undefined,
              // Send hardware step count so backend uses it as ground truth
              hwStepCount: hwStepTotalRef.current,
            });
            const latencyMs = Date.now() - start;
            onMetrics(response.metrics);
            setStreamError(null);
            console.info("[batch-send][success]", {
              at: new Date().toISOString(), sessionId,
              sampleCount: batch.length, latencyMs,
              hwSteps: hwStepTotalRef.current
            });
          } catch {
            const latencyMs = Date.now() - start;
            setStreamError("Failed to send sensor data to backend. Check network and API URL.");
            bufferRef.current = batch.concat(bufferRef.current);
            console.error("[batch-send][failure]", {
              at: new Date().toISOString(), sessionId,
              sampleCount: batch.length, latencyMs
            });
          }
        }, 1000);

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
      if (flushTimer) clearInterval(flushTimer);
      bufferRef.current = [];
    };
  }, [enabled, onMetrics, samplingRateHz, sessionId]);

  return { sampleCount, streamError };
}
