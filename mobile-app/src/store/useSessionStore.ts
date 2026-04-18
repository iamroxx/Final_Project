import { create } from "zustand";
import type { ProcessedMetrics } from "../types";

type SessionState = {
  isRunning: boolean;
  sessionId: string | null;
  latestMetrics: ProcessedMetrics | null;
  setRunning: (running: boolean) => void;
  setSessionId: (sessionId: string | null) => void;
  setLatestMetrics: (metrics: ProcessedMetrics | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  isRunning: false,
  sessionId: null,
  latestMetrics: null,
  setRunning: (running) => set({ isRunning: running }),
  setSessionId: (sessionId) => set({ sessionId }),
  setLatestMetrics: (metrics) => set({ latestMetrics: metrics })
}));
