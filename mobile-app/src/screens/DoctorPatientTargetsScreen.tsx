import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import type { AppUser } from "../types";

type Props = {
  currentUser: AppUser;
  patientId: string;
  onBack: () => void;
};

const DEFAULT_CADENCE_TARGET_SPM = 70;

export function DoctorPatientTargetsScreen({ patientId, onBack }: Props) {
  const patientDirectory = useAppStore((state) => state.patientDirectory);
  const goalSteps = useAppStore((state) => state.goalSteps);
  const cadenceTargets = useAppStore((state) => state.cadenceTargets);
  const setPatientTargets = useAppStore((state) => state.setPatientTargets);

  const [goalInput, setGoalInput] = useState("100");
  const [cadenceTargetInput, setCadenceTargetInput] = useState(String(DEFAULT_CADENCE_TARGET_SPM));
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const patient = patientDirectory[patientId];
  const displayPatientCode = patient?.patientCode ?? patientId;
  const currentGoal = goalSteps[patientId] ?? 100;
  const cadenceTargetSpm = cadenceTargets[patientId] ?? DEFAULT_CADENCE_TARGET_SPM;

  useEffect(() => {
    setGoalInput(String(currentGoal));
  }, [currentGoal, patientId]);

  useEffect(() => {
    setCadenceTargetInput(String(cadenceTargetSpm));
  }, [cadenceTargetSpm, patientId]);

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

    if (!result.ok) {
      setSaveMessage(result.error ?? "Could not save targets.");
      return;
    }

    setSaveMessage("Targets saved.");
  }

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
            <Text className="text-xs font-semibold uppercase tracking-wide text-slate-200">Back To Detail</Text>
          </Pressable>
        </View>

        <Text className="mt-4 text-sm text-slate-300">Update this patient's walking targets from this page.</Text>

        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Assigned Cadence Target</Text>
          <Text className="mt-2 text-sm text-slate-300">Current target: {cadenceTargetSpm} spm</Text>
          <View className="mt-3 flex-row items-center gap-3">
            <TextInput
              value={cadenceTargetInput}
              onChangeText={setCadenceTargetInput}
              keyboardType="number-pad"
              placeholder="Enter cadence target"
              placeholderTextColor="#64748b"
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            />
          </View>
        </View>

        <View className="mt-4 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Assigned Daily Step Goal</Text>
          <Text className="mt-2 text-sm text-slate-300">Current goal: {currentGoal} steps/day</Text>
          <View className="mt-3 flex-row items-center gap-3">
            <TextInput
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="number-pad"
              placeholder="Enter daily steps"
              placeholderTextColor="#64748b"
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            />
          </View>
        </View>

        <Pressable
          onPress={handleSaveTargets}
          disabled={isSavingTargets}
          className={`mt-4 rounded-2xl px-4 py-4 ${isSavingTargets ? "bg-cyan-700" : "bg-cyan-500"}`}
        >
          <Text className="text-center text-base font-semibold text-slate-950">{isSavingTargets ? "Saving" : "Save"}</Text>
        </Pressable>

        {saveMessage ? <Text className="mt-3 text-sm text-cyan-300">{saveMessage}</Text> : null}
      </View>
    </ScrollView>
  );
}
