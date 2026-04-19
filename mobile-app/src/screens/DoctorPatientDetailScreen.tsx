import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import type { AppUser, SessionMetricPoint } from "../types";

type Props = {
  currentUser: AppUser;
  patientId: string;
  onBack: () => void;
  onEditTargets: () => void;
};

const DEFAULT_CADENCE_TARGET_SPM = 70;
const CADENCE_AVERAGE_WINDOW_DAYS = 7;

type GraphSeries = {
  id: string;
  label: string;
  color: string;
  values: number[];
};

type LineGraphCardProps = {
  title: string;
  series: GraphSeries[];
  yAxisLabel: string;
  xAxisLabel: string;
  referenceLineValue?: number;
  referenceLineLabel?: string;
};

function LineGraphCard({
  title,
  series,
  yAxisLabel,
  xAxisLabel,
  referenceLineValue,
  referenceLineLabel,
}: LineGraphCardProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const chartHeight = 120;
  const padX = 14;
  const padY = 12;

  const allValues = useMemo(() => series.flatMap((entry) => entry.values), [series]);

  const chartScale = useMemo(() => {
    if (allValues.length === 0 || chartWidth <= 0) {
      return null;
    }

    const plotW = Math.max(chartWidth - padX * 2, 1);
    const plotH = Math.max(chartHeight - padY * 2, 1);
    const scaleValues = referenceLineValue !== undefined && Number.isFinite(referenceLineValue)
      ? [...allValues, referenceLineValue]
      : allValues;
    const maxV = Math.max(...scaleValues, 1);
    const minV = Math.min(...scaleValues, 0);
    const range = Math.max(maxV - minV, 1e-6);

    return {
      plotW,
      plotH,
      minV,
      maxV,
      range,
    };
  }, [allValues, chartWidth, chartHeight, padX, padY, referenceLineValue]);

  const chartPointGroups = useMemo(() => {
    if (!chartScale) {
      return [] as Array<{ id: string; color: string; points: Array<{ x: number; y: number }> }>;
    }

    return series.map((entry) => {
      const points = entry.values.map((value, index) => {
        const ratio = entry.values.length > 1 ? index / (entry.values.length - 1) : 0.5;
        const x = padX + ratio * chartScale.plotW;
        const y = padY + (1 - (value - chartScale.minV) / chartScale.range) * chartScale.plotH;
        return { x, y };
      });

      return {
        id: entry.id,
        color: entry.color,
        points,
      };
    });
  }, [chartScale, padX, padY, series]);

  const referenceLineTop = useMemo(() => {
    if (!chartScale || referenceLineValue === undefined || !Number.isFinite(referenceLineValue)) {
      return null;
    }

    const normalized = (referenceLineValue - chartScale.minV) / chartScale.range;
    const clamped = Math.max(0, Math.min(1, normalized));
    return padY + (1 - clamped) * chartScale.plotH;
  }, [chartScale, padY, referenceLineValue]);

  const legendEntries = useMemo(() => {
    if (series.length <= 3) {
      return series;
    }

    const [first, ...rest] = series;
    return [first, { id: "others", label: `${rest.length} other sessions`, color: "#64748b", values: [] }];
  }, [series]);

  return (
    <View className="rounded-2xl bg-slate-800 p-4">
      <Text className="text-sm font-semibold text-white">{title}</Text>
      {allValues.length < 2 ? (
        <Text className="mt-3 text-sm text-slate-300">Not enough points yet. Run the session longer to collect graph data.</Text>
      ) : (
        <>
          <View className="mt-3 flex-row flex-wrap gap-3">
            {legendEntries.map((entry) => (
              <View key={entry.id} className="flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <Text className="text-xs text-slate-300">{entry.label}</Text>
              </View>
            ))}
          </View>

          <View
            className="mt-3 h-[120px] rounded-xl bg-slate-900"
            onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}
          >
            {referenceLineTop !== null ? (
              <View
                className="absolute border-t border-dashed border-slate-600"
                style={{
                  left: padX,
                  width: chartScale?.plotW ?? Math.max(chartWidth - padX * 2, 1),
                  top: referenceLineTop,
                }}
              />
            ) : null}

            {chartPointGroups.map((group) => (
              <View key={group.id} className="absolute left-0 right-0 top-0 bottom-0">
                {group.points.slice(0, -1).map((point, index) => {
                  const next = group.points[index + 1];
                  const dx = next.x - point.x;
                  const dy = next.y - point.y;
                  const length = Math.sqrt(dx * dx + dy * dy);
                  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                  const centerX = (point.x + next.x) / 2;
                  const centerY = (point.y + next.y) / 2;

                  return (
                    <View
                      key={`${group.id}-seg-${index}`}
                      className="absolute h-[2px]"
                      style={{
                        backgroundColor: group.color,
                        width: length,
                        left: centerX - length / 2,
                        top: centerY - 1,
                        transform: [{ rotate: `${angle}deg` }],
                      }}
                    />
                  );
                })}

                {group.points.map((point, index) => (
                  <View
                    key={`${group.id}-dot-${index}`}
                    className="absolute h-2 w-2 rounded-full"
                    style={{ backgroundColor: group.color, left: point.x - 4, top: point.y - 4 }}
                  />
                ))}
              </View>
            ))}
          </View>

          {referenceLineTop !== null && referenceLineLabel ? (
            <Text className="mt-2 text-[11px] text-slate-400">{referenceLineLabel}</Text>
          ) : null}

          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-[11px] text-slate-400">Y: {yAxisLabel}</Text>
            <Text className="text-[11px] text-slate-400">X: {xAxisLabel}</Text>
          </View>
        </>
      )}
    </View>
  );
}

function formatRecordedAt(value?: string): string {
  if (!value) {
    return "No recorded session";
  }

  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatLegendTimestamp(value?: string): string {
  if (!value) {
    return "Unknown time";
  }

  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function DoctorPatientDetailScreen({ patientId, onBack, onEditTargets }: Props) {
  const progressEntries = useAppStore((state) => state.progressEntries);
  const sessionMetricSeries = useAppStore((state) => state.sessionMetricSeries);
  const patientDirectory = useAppStore((state) => state.patientDirectory);
  const cadenceTargets = useAppStore((state) => state.cadenceTargets);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<"latest" | "all">("latest");

  const selectedPatientSessions = useMemo(() => {
    return progressEntries
      .filter((entry) => entry.patientId === patientId)
      .sort((a, b) => +new Date(b.recordedAt) - +new Date(a.recordedAt));
  }, [progressEntries, patientId]);

  const todayCadenceSpm = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const todaysEntries = progressEntries.filter((entry) => {
      if (entry.patientId !== patientId) {
        return false;
      }

      const recordedAt = new Date(entry.recordedAt).getTime();
      return recordedAt >= dayStart && recordedAt < dayEnd;
    });

    if (todaysEntries.length === 0) {
      return 0;
    }

    const weightedDuration = todaysEntries.reduce((sum, entry) => sum + Math.max(entry.durationSeconds, 0), 0);
    if (weightedDuration > 0) {
      const weightedCadence = todaysEntries.reduce(
        (sum, entry) => sum + entry.cadenceSpm * Math.max(entry.durationSeconds, 0),
        0
      );
      return weightedCadence / weightedDuration;
    }

    return todaysEntries.reduce((sum, entry) => sum + entry.cadenceSpm, 0) / todaysEntries.length;
  }, [patientId, progressEntries]);

  const sevenDayAverageCadenceSpm = useMemo(() => {
    if (selectedPatientSessions.length === 0) {
      return 0;
    }

    const windowStart = Date.now() - CADENCE_AVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const windowEntries = selectedPatientSessions.filter((entry) => {
      const recordedAt = new Date(entry.recordedAt).getTime();
      return Number.isFinite(recordedAt) && recordedAt >= windowStart;
    });

    if (windowEntries.length === 0) {
      return 0;
    }

    const weightedDuration = windowEntries.reduce((sum, entry) => sum + Math.max(entry.durationSeconds, 0), 0);
    if (weightedDuration > 0) {
      const weightedCadence = windowEntries.reduce(
        (sum, entry) => sum + entry.cadenceSpm * Math.max(entry.durationSeconds, 0),
        0
      );
      return weightedCadence / weightedDuration;
    }

    return windowEntries.reduce((sum, entry) => sum + entry.cadenceSpm, 0) / windowEntries.length;
  }, [selectedPatientSessions]);

  const cadenceTargetSpm = cadenceTargets[patientId] ?? DEFAULT_CADENCE_TARGET_SPM;

  const cadenceProgressPercent = useMemo(() => {
    if (sevenDayAverageCadenceSpm <= 0 || cadenceTargetSpm <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((sevenDayAverageCadenceSpm / cadenceTargetSpm) * 100)));
  }, [cadenceTargetSpm, sevenDayAverageCadenceSpm]);

  const dailyCadenceStatus = useMemo(() => {
    if (todayCadenceSpm <= 0) {
      return "No daily cadence data yet";
    }
    if (todayCadenceSpm >= cadenceTargetSpm) {
      return "Daily target achieved";
    }
    return "Daily target not achieved yet";
  }, [cadenceTargetSpm, todayCadenceSpm]);

  useEffect(() => {
    if (!selectedPatientSessions.length) {
      setSelectedSessionId(null);
      return;
    }

    if (!selectedSessionId || !selectedPatientSessions.some((session) => session.sessionId === selectedSessionId)) {
      setSelectedSessionId(selectedPatientSessions[0].sessionId ?? null);
    }
  }, [selectedPatientSessions, selectedSessionId]);

  const selectedSeries: SessionMetricPoint[] = selectedSessionId
    ? sessionMetricSeries[selectedSessionId] ?? []
    : [];

  const selectedIntensitySeries = selectedSeries.map((point) => Number((point.intensity * 100).toFixed(2)));
  const selectedCadenceSeries = selectedSeries.map((point) => point.cadenceSpm);

  const overlayIntensitySeries: GraphSeries[] = useMemo(() => {
    if (graphMode === "latest" || !selectedPatientSessions.length) {
      return selectedSessionId
        ? [{
            id: "selected",
            label: `Selected: ${formatLegendTimestamp(selectedPatientSessions[0]?.recordedAt)}`,
            color: "#e879f9",
            values: selectedIntensitySeries,
          }]
        : [];
    }

    return selectedPatientSessions
      .map((session) => {
        const id = session.sessionId ?? session.id;
        const points = sessionMetricSeries[id] ?? [];
        const isSelected = id === selectedSessionId;
        return {
          id,
          label: isSelected
            ? `Selected: ${formatLegendTimestamp(session.recordedAt)}`
            : formatLegendTimestamp(session.recordedAt),
          color: isSelected ? "#e879f9" : "#64748b",
          values: points.map((point) => Number((point.intensity * 100).toFixed(2))),
        };
      })
      .filter((entry) => entry.values.length > 0);
  }, [graphMode, selectedIntensitySeries, selectedPatientSessions, selectedSessionId, sessionMetricSeries]);

  const overlayCadenceSeries: GraphSeries[] = useMemo(() => {
    if (graphMode === "latest" || !selectedPatientSessions.length) {
      return selectedSessionId
        ? [{
            id: "selected",
            label: `Selected: ${formatLegendTimestamp(selectedPatientSessions[0]?.recordedAt)}`,
            color: "#22d3ee",
            values: selectedCadenceSeries,
          }]
        : [];
    }

    return selectedPatientSessions
      .map((session) => {
        const id = session.sessionId ?? session.id;
        const points = sessionMetricSeries[id] ?? [];
        const isSelected = id === selectedSessionId;
        return {
          id,
          label: isSelected
            ? `Selected: ${formatLegendTimestamp(session.recordedAt)}`
            : formatLegendTimestamp(session.recordedAt),
          color: isSelected ? "#22d3ee" : "#64748b",
          values: points.map((point) => point.cadenceSpm),
        };
      })
      .filter((entry) => entry.values.length > 0);
  }, [graphMode, selectedCadenceSeries, selectedPatientSessions, selectedSessionId, sessionMetricSeries]);

  const patient = patientDirectory[patientId];
  const displayPatientCode = patient?.patientCode ?? patientId;

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="rounded-3xl bg-slate-900 p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xl font-bold text-white">{patient?.fullName ?? `Patient ${patientId.slice(0, 8)}`}</Text>
            <Text className="mt-1 text-sm text-slate-300">{patient?.email ?? patientId}</Text>
            <Text className="mt-1 text-xs text-cyan-300">ID: {displayPatientCode}</Text>
          </View>
          <Pressable onPress={onBack} className="rounded-full border border-slate-700 px-3 py-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-200">Back To List</Text>
          </Pressable>
        </View>

        <Text className="mt-4 text-sm text-slate-300">Select a session to view its 3-second cadence and intensity graph.</Text>

        <Pressable onPress={onEditTargets} className="mt-4 rounded-2xl bg-cyan-500 px-4 py-3">
          <Text className="text-center text-sm font-semibold text-slate-950">Edit Targets</Text>
        </Pressable>

        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-slate-400">Cadence Target Progress</Text>
            <Text className="text-xs font-semibold text-white">{cadenceProgressPercent}%</Text>
          </View>
          <View className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-700">
            <View className="h-3 rounded-full bg-emerald-400" style={{ width: `${cadenceProgressPercent}%` }} />
          </View>
          <Text className="mt-2 text-xs text-slate-300">
            7-day average cadence: {sevenDayAverageCadenceSpm > 0 ? `${sevenDayAverageCadenceSpm.toFixed(1)} spm` : "-"} | Target: {cadenceTargetSpm} spm
          </Text>
          <Text className="mt-1 text-xs text-cyan-300">
            Today: {todayCadenceSpm > 0 ? `${todayCadenceSpm.toFixed(1)} spm` : "-"} | {dailyCadenceStatus}
          </Text>
        </View>

        <View className="mt-4 flex-row rounded-2xl bg-slate-800 p-1">
          <Pressable
            onPress={() => setGraphMode("latest")}
            className={`flex-1 rounded-xl px-3 py-2 ${graphMode === "latest" ? "bg-cyan-500" : "bg-transparent"}`}
          >
            <Text className={`text-center text-xs font-semibold uppercase ${graphMode === "latest" ? "text-slate-950" : "text-slate-300"}`}>
              Latest Session
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setGraphMode("all")}
            className={`flex-1 rounded-xl px-3 py-2 ${graphMode === "all" ? "bg-cyan-500" : "bg-transparent"}`}
          >
            <Text className={`text-center text-xs font-semibold uppercase ${graphMode === "all" ? "text-slate-950" : "text-slate-300"}`}>
              All Sessions Overlay
            </Text>
          </Pressable>
        </View>

        {selectedSessionId ? (
          <View className="mt-5 gap-3">
            <LineGraphCard
              title="Cadence Trend (spm every 3s)"
              series={overlayCadenceSeries}
              yAxisLabel="Cadence (spm)"
              xAxisLabel="Time (seconds, 3s buckets)"
              referenceLineValue={cadenceTargetSpm}
              referenceLineLabel={`Target cadence: ${cadenceTargetSpm} spm`}
            />
            <LineGraphCard
              title="Intensity Trend (% every 3s)"
              series={overlayIntensitySeries}
              yAxisLabel="Intensity (%)"
              xAxisLabel="Time (seconds, 3s buckets)"
            />
          </View>
        ) : null}

        <View className="mt-5 gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sessions</Text>
          {selectedPatientSessions.length === 0 ? (
            <Text className="text-sm text-slate-300">No sessions recorded for this patient yet.</Text>
          ) : (
            selectedPatientSessions.map((session) => {
              const id = session.sessionId ?? session.id;
              const isActive = selectedSessionId === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setSelectedSessionId(id)}
                  className={`rounded-2xl px-4 py-3 ${isActive ? "bg-cyan-500" : "bg-slate-800"}`}
                >
                  <Text className={`text-sm font-semibold ${isActive ? "text-slate-950" : "text-white"}`}>
                    Session {id.slice(0, 8)}
                  </Text>
                  <Text className={`mt-1 text-xs ${isActive ? "text-slate-900" : "text-slate-300"}`}>
                    {formatRecordedAt(session.recordedAt)} | {session.stepCount} steps
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}
