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

export type UserRole = "doctor" | "patient";

export type AppRoute = "home" | "dashboard" | "progress" | "patients" | "patient-detail" | "patient-targets" | "profile";

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  patientCode?: string;
  role: UserRole;
  assignedPatientIds?: string[];
};

export type ProgressEntry = {
  id: string;
  patientId: string;
  sessionId?: string | null;
  recordedAt: string;
  stepCount: number;
  distanceM: number;
  durationSeconds: number;
  cadenceSpm: number;
  avgStepIntervalMs: number;
  intensity: number;
  activityState: "idle" | "walking" | "running";
  notes?: string;
};

export type SessionMetricPoint = {
  bucketIndex: number;
  recordedAt: string;
  cadenceSpm: number;
  intensity: number;
};

export type PatientSchedule = {
  /** Duration of each session in minutes */
  sessionDurationMinutes: number;
  /** Max number of sessions per day */
  sessionsPerDay: number;
  /** Minimum rest time between sessions in the same day (minutes) */
  cooloffMinutes: number;
  /** Active weekdays: 0=Sun, 1=Mon, ..., 6=Sat */
  activeDays: number[];
  /** ISO date "YYYY-MM-DD" or null */
  startDate: string | null;
  /** ISO date "YYYY-MM-DD" or null */
  endDate: string | null;
};
