import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import type { AppUser } from "../types";

type Props = {
  currentUser: AppUser;
  onOpenPatientDetails: (patientId: string) => void;
};

export function DoctorPatientsScreen({ currentUser, onOpenPatientDetails }: Props) {
  const addPatientByShareLink = useAppStore((state) => state.addPatientByShareLink);
  const patientDirectory = useAppStore((state) => state.patientDirectory);
  const [shareInput, setShareInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const patients = (currentUser.assignedPatientIds ?? []).map((id) => ({
    id,
    fullName: patientDirectory[id]?.fullName ?? `Patient ${id.slice(0, 8)}`,
    email: patientDirectory[id]?.email ?? id,
    patientCode: patientDirectory[id]?.patientCode,
  }));

  async function handleAddPatient() {
    if (!shareInput.trim()) {
      setSubmitError("Paste a patient ID or share link first.");
      return;
    }

    setIsSubmitting(true);
    const result = await addPatientByShareLink(shareInput.trim());
    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error ?? "Unable to add patient.");
      return;
    }

    setSubmitError(null);
    setShareInput("");
  }

  return (
    <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-xl font-bold text-white">Patients List</Text>
        <Text className="mt-2 text-sm leading-6 text-slate-300">
          This page shows only assigned patients. Tap a patient to open the separate detail page.
        </Text>

        <View className="mt-5 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Add Patient To Dashboard</Text>
          <TextInput
            value={shareInput}
            onChangeText={setShareInput}
            placeholder="Paste patient ID or share link"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            className="mt-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
          <Pressable
            onPress={handleAddPatient}
            disabled={isSubmitting}
            className={`mt-3 rounded-2xl px-4 py-3 ${isSubmitting ? "bg-cyan-700" : "bg-cyan-500"}`}
          >
            <Text className="text-center text-sm font-semibold text-slate-950">
              {isSubmitting ? "Adding..." : "Add Patient"}
            </Text>
          </Pressable>
          {submitError ? <Text className="mt-3 text-sm text-rose-400">{submitError}</Text> : null}
        </View>
      </View>

      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-sm font-semibold text-white">Assigned Patients</Text>

        <View className="mt-4 gap-3">
          {patients.length === 0 ? (
            <Text className="text-sm text-slate-300">No patients assigned yet. Add one using shared ID or link.</Text>
          ) : (
            patients.map((patient) => (
              <Pressable
                key={patient.id}
                onPress={() => onOpenPatientDetails(patient.id)}
                className="rounded-2xl bg-slate-800 px-4 py-4"
              >
                <Text className="text-base font-bold text-white">{patient.fullName}</Text>
                <Text className="mt-1 text-sm text-slate-300">{patient.email}</Text>
                <Text className="mt-1 text-xs text-cyan-300">ID: {patient.patientCode ?? patient.id}</Text>
                <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-cyan-300">Open Details</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
