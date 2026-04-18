import { apiClient } from "./client";
import type { IngestRequest, ProcessedMetrics } from "../../types";

export async function sendSensorBatch(payload: IngestRequest) {
  const response = await apiClient.post("/api/ingest", payload);
  return response.data as { metrics: ProcessedMetrics };
}
