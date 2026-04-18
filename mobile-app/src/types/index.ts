export type Vector3 = {
  x: number;
  y: number;
  z: number;
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
};

export type ProcessedMetrics = {
  timestamp: number;
  stepCountTotal: number;
  cadenceSpm: number;
  avgStepIntervalMs: number;
  intensity: number;
  activityState: "idle" | "walking" | "running";
};
