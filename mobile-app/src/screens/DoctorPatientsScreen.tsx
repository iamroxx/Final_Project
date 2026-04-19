import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import type { AppUser } from "../types";

type Props = {
  currentUser: AppUser;
  onOpenPatientDetails: (patientId: string) => void;
};

type PatientSortOption = "name-asc" | "name-desc" | "email-asc" | "added-newest" | "added-oldest";

export function DoctorPatientsScreen({ currentUser, onOpenPatientDetails }: Props) {
  const generatePatientInvite = useAppStore((state) => state.generatePatientInvite);
  const patientDirectory = useAppStore((state) => state.patientDirectory);
  const assignedPatientIds = currentUser.assignedPatientIds ?? [];
  const [latestGeneratedCode, setLatestGeneratedCode] = useState<string | null>(null);
  const [latestGeneratedExpiry, setLatestGeneratedExpiry] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [sortOption, setSortOption] = useState<PatientSortOption>("name-asc");
  const [showSortModal, setShowSortModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const patients = assignedPatientIds.map((id) => ({
    id,
    fullName: patientDirectory[id]?.fullName ?? `Patient ${id.slice(0, 8)}`,
    email: patientDirectory[id]?.email ?? id,
    patientCode: patientDirectory[id]?.patientCode,
  }));
  const assignedIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    assignedPatientIds.forEach((id, index) => {
      map[id] = index;
    });
    return map;
  }, [assignedPatientIds]);
  const normalizedSearch = searchInput.trim().toLowerCase();
  const filteredPatients = useMemo(() => {
    if (!normalizedSearch) {
      return patients;
    }

    return patients.filter((patient) => {
      const searchable = [patient.fullName, patient.email, patient.patientCode ?? patient.id]
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [normalizedSearch, patients]);
  const sortedFilteredPatients = useMemo(() => {
    const list = [...filteredPatients];

    if (sortOption === "name-asc") {
      list.sort((a, b) => a.fullName.localeCompare(b.fullName));
    } else if (sortOption === "name-desc") {
      list.sort((a, b) => b.fullName.localeCompare(a.fullName));
    } else if (sortOption === "email-asc") {
      list.sort((a, b) => a.email.localeCompare(b.email));
    } else if (sortOption === "added-newest") {
      list.sort((a, b) => (assignedIndexMap[b.id] ?? -1) - (assignedIndexMap[a.id] ?? -1));
    } else if (sortOption === "added-oldest") {
      list.sort((a, b) => (assignedIndexMap[a.id] ?? Number.MAX_SAFE_INTEGER) - (assignedIndexMap[b.id] ?? Number.MAX_SAFE_INTEGER));
    }

    return list;
  }, [assignedIndexMap, filteredPatients, sortOption]);

  async function handleGeneratePatientId() {
    setIsSubmitting(true);
    const result = await generatePatientInvite();
    setIsSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error ?? "Unable to generate patient ID.");
      return;
    }

    setSubmitError(null);
    setLatestGeneratedCode(result.patientCode ?? null);
    setLatestGeneratedExpiry(result.expiresAt ?? null);
  }

  return (
    <>
      <ScrollView className="flex-1 bg-slate-950" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="rounded-3xl bg-slate-900 p-5">
        <Text className="text-xl font-bold text-white">Patients List</Text>
        <Text className="mt-2 text-sm leading-6 text-slate-300">
          This page shows only assigned patients. Tap a patient to open the separate detail page.
        </Text>

        <View className="mt-5 rounded-2xl bg-slate-800 p-4">
          <Text className="text-xs uppercase tracking-wide text-slate-400">Generate Patient ID</Text>
          <Text className="mt-2 text-sm text-slate-300">
            Generate a temporary patient ID and share it with your patient. It expires in 3 hours if unused.
          </Text>
          <Pressable
            onPress={handleGeneratePatientId}
            disabled={isSubmitting}
            className={`mt-3 rounded-2xl px-4 py-3 ${isSubmitting ? "bg-cyan-700" : "bg-cyan-500"}`}
          >
            <Text className="text-center text-sm font-semibold text-slate-950">
              {isSubmitting ? "Generating..." : "Generate ID"}
            </Text>
          </Pressable>
          {latestGeneratedCode ? (
            <View className="mt-3 rounded-2xl border border-cyan-700 bg-slate-950 px-4 py-3">
              <Text className="text-[10px] uppercase tracking-widest text-slate-400">Latest Patient ID</Text>
              <Text className="mt-1 text-base font-bold tracking-wider text-cyan-300">{latestGeneratedCode}</Text>
              {latestGeneratedExpiry ? (
                <Text className="mt-1 text-xs text-slate-400">
                  Expires: {new Date(latestGeneratedExpiry).toLocaleString()}
                </Text>
              ) : null}
            </View>
          ) : null}
          {submitError ? <Text className="mt-3 text-sm text-rose-400">{submitError}</Text> : null}
        </View>
      </View>

        <View className="rounded-3xl bg-slate-900 p-5">
          <Text className="text-sm font-semibold text-white">Assigned Patients</Text>

          <View className="mt-3 flex-row items-center gap-2">
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Search by name, email, or patient ID"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
            />
            <Pressable
              onPress={() => setShowSortModal(true)}
              className="h-[46px] w-[52px] items-center justify-center rounded-2xl border border-slate-700 bg-slate-800"
            >
              <Text className="text-sm font-bold text-slate-200">↑↓</Text>
            </Pressable>
          </View>

          <View className="mt-4 gap-3">
            {patients.length === 0 ? (
              <Text className="text-sm text-slate-300">No patients assigned yet. Add one using shared ID or link.</Text>
            ) : sortedFilteredPatients.length === 0 ? (
              <Text className="text-sm text-slate-300">No patients matched your search.</Text>
            ) : (
              sortedFilteredPatients.map((patient) => (
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

      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <Pressable className="flex-1 items-center justify-center bg-black/60 px-6" onPress={() => setShowSortModal(false)}>
          <Pressable className="w-full rounded-3xl border border-slate-700 bg-slate-900 p-5" onPress={(e) => e.stopPropagation()}>
            <Text className="text-base font-bold text-white">Sort Patients</Text>
            <Text className="mt-1 text-xs text-slate-400">Choose how the assigned list should be ordered.</Text>

            <View className="mt-4 gap-2">
              <Pressable
                onPress={() => {
                  setSortOption("name-asc");
                  setShowSortModal(false);
                }}
                className={`rounded-2xl px-4 py-3 ${sortOption === "name-asc" ? "border border-cyan-700 bg-slate-800" : "bg-slate-800"}`}
              >
                <Text className="text-sm font-semibold text-white">Name A-Z</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSortOption("name-desc");
                  setShowSortModal(false);
                }}
                className={`rounded-2xl px-4 py-3 ${sortOption === "name-desc" ? "border border-cyan-700 bg-slate-800" : "bg-slate-800"}`}
              >
                <Text className="text-sm font-semibold text-white">Name Z-A</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSortOption("email-asc");
                  setShowSortModal(false);
                }}
                className={`rounded-2xl px-4 py-3 ${sortOption === "email-asc" ? "border border-cyan-700 bg-slate-800" : "bg-slate-800"}`}
              >
                <Text className="text-sm font-semibold text-white">Email A-Z</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSortOption("added-newest");
                  setShowSortModal(false);
                }}
                className={`rounded-2xl px-4 py-3 ${sortOption === "added-newest" ? "border border-cyan-700 bg-slate-800" : "bg-slate-800"}`}
              >
                <Text className="text-sm font-semibold text-white">Added Date (Newest)</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSortOption("added-oldest");
                  setShowSortModal(false);
                }}
                className={`rounded-2xl px-4 py-3 ${sortOption === "added-oldest" ? "border border-cyan-700 bg-slate-800" : "bg-slate-800"}`}
              >
                <Text className="text-sm font-semibold text-white">Added Date (Oldest)</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => setShowSortModal(false)} className="mt-4 rounded-2xl bg-slate-700 px-4 py-3">
              <Text className="text-center text-sm font-semibold text-white">Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
