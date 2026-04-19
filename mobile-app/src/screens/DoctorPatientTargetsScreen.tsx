import { useEffect, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import type { AppUser, PatientSchedule } from "../types";

type Props = {
  currentUser: AppUser;
  patientId: string;
  onBack: () => void;
};

const DEFAULT_CADENCE_TARGET_SPM = 70;
const SCREEN_W = Dimensions.get("window").width;
const MODAL_W = SCREEN_W * 0.9;
const CELL = Math.floor((MODAL_W - 40) / 7);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBR = ["S", "M", "T", "W", "T", "F", "S"];

function CalendarPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (d: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const initDate = value ? new Date(value + "T00:00:00") : today;
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function pick(day: number) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function formatDisplay(iso: string | null) {
    if (!iso) return "Not set";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <View>
      <Text className="text-xs uppercase tracking-wide text-slate-400">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="mt-2 flex-row items-center justify-between rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3"
      >
        <Text className={value ? "text-white" : "text-slate-500"}>{formatDisplay(value)}</Text>
        <Text className="text-lg text-slate-400">▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center bg-black/60"
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{ width: MODAL_W }}
            className="rounded-3xl bg-slate-900 p-5"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable onPress={prevMonth} className="rounded-full bg-slate-700 px-4 py-2">
                <Text className="font-bold text-white">‹</Text>
              </Pressable>
              <Text className="text-base font-bold text-white">
                {MONTH_NAMES[month]} {year}
              </Text>
              <Pressable onPress={nextMonth} className="rounded-full bg-slate-700 px-4 py-2">
                <Text className="font-bold text-white">›</Text>
              </Pressable>
            </View>

            <View className="mb-2 flex-row">
              {DAY_ABBR.map((d, i) => (
                <View key={i} style={{ width: CELL, alignItems: "center" }}>
                  <Text className="text-xs text-slate-400">{d}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {cells.map((day, i) => {
                if (!day) return <View key={i} style={{ width: CELL, height: CELL }} />;
                const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isSelected = iso === value;
                return (
                  <Pressable
                    key={i}
                    style={{
                      width: CELL,
                      height: CELL,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: CELL / 2,
                      backgroundColor: isSelected ? "#06b6d4" : "transparent",
                    }}
                    onPress={() => pick(day)}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: isSelected ? "#0f172a" : "#fff",
                        fontWeight: isSelected ? "700" : "400",
                      }}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => { onChange(null); setOpen(false); }}
              className="mt-4 rounded-2xl bg-slate-800 px-4 py-3"
            >
              <Text className="text-center text-sm text-slate-300">Clear Date</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function DoctorPatientTargetsScreen({ patientId, onBack }: Props) {
  const patientDirectory = useAppStore((state) => state.patientDirectory);
  const goalSteps = useAppStore((state) => state.goalSteps);
  const cadenceTargets = useAppStore((state) => state.cadenceTargets);
  const patientSchedules = useAppStore((state) => state.patientSchedules);
  const setPatientTargets = useAppStore((state) => state.setPatientTargets);
  const setPatientSchedule = useAppStore((state) => state.setPatientSchedule);

  // Goals state
  const [goalInput, setGoalInput] = useState("100");
  const [cadenceTargetInput, setCadenceTargetInput] = useState(String(DEFAULT_CADENCE_TARGET_SPM));
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Schedule state
  const [sessionDurationInput, setSessionDurationInput] = useState("30");
  const [sessionsPerDayInput, setSessionsPerDayInput] = useState("1");
  const [cooloffInput, setCooloffInput] = useState("60");
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);

  const patient = patientDirectory[patientId];
  const displayPatientCode = patient?.patientCode ?? patientId;
  const currentGoal = goalSteps[patientId] ?? 100;
  const cadenceTargetSpm = cadenceTargets[patientId] ?? DEFAULT_CADENCE_TARGET_SPM;
  const existingSchedule = patientSchedules[patientId];

  useEffect(() => {
    setGoalInput(String(currentGoal));
  }, [currentGoal, patientId]);

  useEffect(() => {
    setCadenceTargetInput(String(cadenceTargetSpm));
  }, [cadenceTargetSpm, patientId]);

  useEffect(() => {
    if (existingSchedule) {
      setSessionDurationInput(String(existingSchedule.sessionDurationMinutes));
      setSessionsPerDayInput(String(existingSchedule.sessionsPerDay));
      setCooloffInput(String(existingSchedule.cooloffMinutes));
      setActiveDays(existingSchedule.activeDays);
      setStartDate(existingSchedule.startDate);
      setEndDate(existingSchedule.endDate);
    }
  }, [patientId]);

  // Derived schedule values
  const sessionDuration = Math.max(1, Number(sessionDurationInput) || 30);
  const sessionsPerDay = Math.max(1, Number(sessionsPerDayInput) || 1);
  const cooloffMinutes = Math.max(0, Number(cooloffInput) || 0);
  const totalDailyMinutes =
    sessionsPerDay * sessionDuration + Math.max(sessionsPerDay - 1, 0) * cooloffMinutes;
  const scheduleIsValid = totalDailyMinutes <= 1440;
  const totalHoursDisplay = (totalDailyMinutes / 60).toFixed(1);
  const timeBarPercent = Math.min(100, Math.round((totalDailyMinutes / 1440) * 100));

  function toggleDay(day: number) {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSaveTargets() {
    const parsedGoal = Number(goalInput.trim());
    const parsedCadenceTarget = Number(cadenceTargetInput.trim());

    if (!Number.isFinite(parsedGoal) || parsedGoal <= 0) {
      setSaveMessage("Enter a valid positive daily step goal.");
      return;
    }
    if (!Number.isFinite(parsedCadenceTarget) || parsedCadenceTarget <= 0) {
      setSaveMessage("Enter a valid positive cadence target.");
      return;
    }

    setIsSavingTargets(true);
    const result = await setPatientTargets(patientId, parsedGoal, parsedCadenceTarget);
    setIsSavingTargets(false);
    setSaveMessage(result.ok ? "Goals saved." : (result.error ?? "Could not save goals."));
  }

  async function handleSaveSchedule() {
    if (!scheduleIsValid) {
      setScheduleMessage("Total daily time exceeds 24 hours. Reduce sessions, duration, or cooloff.");
      return;
    }

    const parsedDuration = Number(sessionDurationInput.trim());
    const parsedSessions = Number(sessionsPerDayInput.trim());
    const parsedCooloff = Number(cooloffInput.trim());

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setScheduleMessage("Enter a valid session duration in minutes.");
      return;
    }
    if (!Number.isFinite(parsedSessions) || parsedSessions <= 0) {
      setScheduleMessage("Enter a valid number of sessions per day.");
      return;
    }
    if (!Number.isFinite(parsedCooloff) || parsedCooloff < 0) {
      setScheduleMessage("Cooloff must be 0 or more minutes.");
      return;
    }
    if (activeDays.length === 0) {
      setScheduleMessage("Select at least one active day.");
      return;
    }

    const schedule: PatientSchedule = {
      sessionDurationMinutes: Math.round(parsedDuration),
      sessionsPerDay: Math.round(parsedSessions),
      cooloffMinutes: Math.round(parsedCooloff),
      activeDays: [...activeDays].sort((a, b) => a - b),
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    };

    setIsSavingSchedule(true);
    const result = await setPatientSchedule(patientId, schedule);
    setIsSavingSchedule(false);
    setScheduleMessage(result.ok ? "Schedule saved." : (result.error ?? "Could not save schedule."));
  }

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
      {/* Patient header */}
      <View className="rounded-3xl bg-slate-900 p-5">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-xl font-bold text-white">
              {patient?.fullName ?? `Patient ${patientId.slice(0, 8)}`}
            </Text>
            <Text className="mt-1 text-sm text-slate-300">{patient?.email ?? patientId}</Text>
            <Text className="mt-1 text-xs text-cyan-300">ID: {displayPatientCode}</Text>
          </View>
          <Pressable onPress={onBack} className="rounded-full border border-slate-700 px-3 py-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-200">Back</Text>
          </Pressable>
        </View>
        <Text className="mt-4 text-sm text-slate-300">
          Update this patient's walking goals and schedule from this page.
        </Text>
      </View>

      {/* Walking Goals card */}
      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-lg font-bold text-white">Walking Goals</Text>

        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Cadence Target</Text>
          <Text className="mt-2 text-sm text-slate-300">Current: {cadenceTargetSpm} spm</Text>
          <TextInput
            value={cadenceTargetInput}
            onChangeText={setCadenceTargetInput}
            keyboardType="number-pad"
            placeholder="Cadence (spm)"
            placeholderTextColor="#64748b"
            className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </View>

        <View className="mt-3 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Daily Step Goal</Text>
          <Text className="mt-2 text-sm text-slate-300">Current: {currentGoal} steps/day</Text>
          <TextInput
            value={goalInput}
            onChangeText={setGoalInput}
            keyboardType="number-pad"
            placeholder="Steps per day"
            placeholderTextColor="#64748b"
            className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </View>

        <Pressable
          onPress={handleSaveTargets}
          disabled={isSavingTargets}
          className={`mt-4 rounded-2xl px-4 py-4 ${isSavingTargets ? "bg-cyan-700" : "bg-cyan-500"}`}
        >
          <Text className="text-center text-base font-semibold text-slate-950">
            {isSavingTargets ? "Saving…" : "Save Goals"}
          </Text>
        </Pressable>
        {saveMessage ? <Text className="mt-3 text-sm text-cyan-300">{saveMessage}</Text> : null}
      </View>

      {/* Walking Schedule card */}
      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-lg font-bold text-white">Walking Schedule</Text>
        <Text className="mt-1 text-sm text-slate-300">
          Control session duration, frequency, cooloff time, and which days the patient walks.
        </Text>

        {/* Session Duration */}
        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Session Duration (minutes)</Text>
          <Text className="mt-1 text-xs text-slate-500">How long each walking session lasts.</Text>
          <TextInput
            value={sessionDurationInput}
            onChangeText={setSessionDurationInput}
            keyboardType="number-pad"
            placeholder="e.g. 30"
            placeholderTextColor="#64748b"
            className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
        </View>

        {/* Sessions Per Day */}
        <View className="mt-3 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Sessions Per Day</Text>
          <Text className="mt-1 text-xs text-slate-500">
            Maximum number of sessions the patient can do each day.
          </Text>
          <View className="mt-3 flex-row items-center gap-3">
            <Pressable
              onPress={() =>
                setSessionsPerDayInput((prev) => String(Math.max(1, (Number(prev) || 1) - 1)))
              }
              className="rounded-xl bg-slate-700 px-4 py-3"
            >
              <Text className="text-lg font-bold text-white">−</Text>
            </Pressable>
            <TextInput
              value={sessionsPerDayInput}
              onChangeText={setSessionsPerDayInput}
              keyboardType="number-pad"
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-lg font-semibold text-white"
            />
            <Pressable
              onPress={() =>
                setSessionsPerDayInput((prev) => String((Number(prev) || 1) + 1))
              }
              className="rounded-xl bg-slate-700 px-4 py-3"
            >
              <Text className="text-lg font-bold text-white">+</Text>
            </Pressable>
          </View>
        </View>

        {/* Cooloff Time */}
        <View className="mt-3 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">
            Cooloff Between Sessions (minutes)
          </Text>
          <Text className="mt-1 text-xs text-slate-500">
            Minimum rest time required between sessions in the same day.
          </Text>
          <TextInput
            value={cooloffInput}
            onChangeText={setCooloffInput}
            keyboardType="number-pad"
            placeholder="e.g. 60"
            placeholderTextColor="#64748b"
            editable={sessionsPerDay > 1}
            className={`mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white ${sessionsPerDay <= 1 ? "opacity-40" : ""}`}
          />
          {sessionsPerDay <= 1 && (
            <Text className="mt-1 text-xs text-slate-500">
              Not applicable for a single session per day.
            </Text>
          )}
        </View>

        {/* Daily time validation bar */}
        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs uppercase tracking-wide text-slate-400">Total Daily Walking Time</Text>
            <Text className={`text-xs font-bold ${scheduleIsValid ? "text-emerald-400" : "text-red-400"}`}>
              {totalHoursDisplay}h / 24h
            </Text>
          </View>
          <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
            <View
              className={`h-2 rounded-full ${scheduleIsValid ? "bg-emerald-400" : "bg-red-400"}`}
              style={{ width: `${timeBarPercent}%` }}
            />
          </View>
          <Text className="mt-2 text-xs text-slate-400">
            {sessionsPerDay} session{sessionsPerDay > 1 ? "s" : ""} × {sessionDuration} min
            {sessionsPerDay > 1
              ? ` + ${Math.max(sessionsPerDay - 1, 0)} × ${cooloffMinutes} min cooloff`
              : ""}
            {" "}= {totalDailyMinutes} min total
          </Text>
          {!scheduleIsValid && (
            <Text className="mt-2 text-xs font-semibold text-red-400">
              Exceeds 24 hours. Reduce sessions, duration, or cooloff time.
            </Text>
          )}
        </View>

        {/* Weekday selector */}
        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Active Days</Text>
          <Text className="mt-1 text-xs text-slate-500">
            Select the days of the week the patient should walk.
          </Text>
          <View className="mt-4 flex-row justify-between">
            {(["S", "M", "T", "W", "T", "F", "S"] as const).map((label, day) => {
              const isActive = activeDays.includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(day)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isActive ? "#06b6d4" : "#1e293b",
                    borderWidth: 1,
                    borderColor: isActive ? "#06b6d4" : "#334155",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: isActive ? "#0f172a" : "#94a3b8",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Date range pickers */}
        <View className="mt-4 gap-3">
          <CalendarPicker label="Start Date" value={startDate} onChange={setStartDate} />
          <CalendarPicker label="End Date" value={endDate} onChange={setEndDate} />
        </View>

        <Pressable
          onPress={handleSaveSchedule}
          disabled={isSavingSchedule || !scheduleIsValid}
          className={`mt-5 rounded-2xl px-4 py-4 ${isSavingSchedule || !scheduleIsValid ? "bg-cyan-800" : "bg-cyan-500"}`}
        >
          <Text className="text-center text-base font-semibold text-slate-950">
            {isSavingSchedule ? "Saving…" : "Save Schedule"}
          </Text>
        </Pressable>
        {scheduleMessage ? <Text className="mt-3 text-sm text-cyan-300">{scheduleMessage}</Text> : null}
      </View>
    </ScrollView>
  );
}
