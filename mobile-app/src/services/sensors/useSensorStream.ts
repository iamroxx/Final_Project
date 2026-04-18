import { useEffect, useRef, useState } from "react";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { lowPassFilter, vectorMagnitude } from "../../processing/filters";
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
  const accRef = useRef({ x: 0, y: 0, z: 0 });
  const gyroRef = useRef({ x: 0, y: 0, z: 0 });
  const filteredMagRef = useRef(9.81);
  const bufferRef = useRef<SensorSample[]>([]);

  useEffect(() => {
    if (!enabled || !sessionId) {
      return;
    }

    const intervalMs = Math.floor(1000 / samplingRateHz);
    Accelerometer.setUpdateInterval(intervalMs);
    Gyroscope.setUpdateInterval(intervalMs);

    const accSub = Accelerometer.addListener((acc) => {
      accRef.current = acc;
      const now = Date.now();
      const magnitude = vectorMagnitude(acc.x, acc.y, acc.z);
      const filtered = lowPassFilter(filteredMagRef.current, magnitude);
      filteredMagRef.current = filtered;

      bufferRef.current.push({
        timestamp: now,
        ax: acc.x,
        ay: acc.y,
        az: acc.z,
        gx: gyroRef.current.x,
        gy: gyroRef.current.y,
        gz: gyroRef.current.z,
        magnitude: filtered
      });
      setSampleCount((n) => n + 1);
    });

    const gyroSub = Gyroscope.addListener((gyro) => {
      gyroRef.current = gyro;
    });

    const flushTimer = setInterval(async () => {
      if (bufferRef.current.length === 0 || !sessionId) {
        return;
      }

      const batch = bufferRef.current;
      bufferRef.current = [];

      try {
        const response = await sendSensorBatch({
          sessionId,
          samplingRateHz,
          samples: batch
        });
        onMetrics(response.metrics);
      } catch {
        bufferRef.current = batch.concat(bufferRef.current);
      }
    }, 1000);

    return () => {
      accSub.remove();
      gyroSub.remove();
      clearInterval(flushTimer);
      bufferRef.current = [];
    };
  }, [enabled, onMetrics, samplingRateHz, sessionId]);

  return { sampleCount };
}
