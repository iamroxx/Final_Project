export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type AxisName = "x" | "y" | "z";

export type MotionCalibration = {
  verticalAxis: AxisName;
  forwardAxis: AxisName;
  forwardSign: 1 | -1;
  sampledAt: number;
};

export type SensorSample = {
  timestamp: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  magnitude: number;
};

export type IngestRequest = {
  sessionId: string;
  samplingRateHz: number;
  samples: SensorSample[];
  /** GPS ground speed in m/s from expo-location; undefined if permission denied or unavailable */
  gpsSpeedMs?: number;
  /** Cumulative step count from hardware pedometer chip since session started */
  hwStepCount?: number;
};

export type ProcessedMetrics = {
  timestamp: number;
  stepCountTotal: number;
  cadenceSpm: number;
  avgStepIntervalMs: number;
  intensity: number;
  activityState: "idle" | "walking" | "running";
};
