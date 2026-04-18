import { apiClient } from "./client";

export async function startSession(userId: string) {
  const response = await apiClient.post("/api/session/start", { userId });
  return response.data as { sessionId: string; startedAt: number };
}

export async function stopSession(sessionId: string) {
  const response = await apiClient.post("/api/session/stop", { sessionId });
  return response.data as { sessionId: string; stoppedAt: number };
}
