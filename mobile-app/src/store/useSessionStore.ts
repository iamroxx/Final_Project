import { create } from "zustand";
import type { MotionCalibration, ProcessedMetrics } from "../types";

type SessionState = {
  isRunning: boolean;
  sessionId: string | null;
  latestMetrics: ProcessedMetrics | null;
  motionCalibration: MotionCalibration | null;
  setRunning: (running: boolean) => void;
  setSessionId: (sessionId: string | null) => void;
  setLatestMetrics: (metrics: ProcessedMetrics | null) => void;
  setMotionCalibration: (calibration: MotionCalibration | null) => void;
  resetSession: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  isRunning: false,
  sessionId: null,
  latestMetrics: null,
  motionCalibration: null,
  setRunning: (running) => set({ isRunning: running }),
  setSessionId: (sessionId) => set({ sessionId }),
  setLatestMetrics: (metrics) => set({ latestMetrics: metrics }),
  setMotionCalibration: (calibration) => set({ motionCalibration: calibration }),
  resetSession: () => set({
    isRunning: false,
    sessionId: null,
    latestMetrics: null,
    motionCalibration: null,
  })
}));
