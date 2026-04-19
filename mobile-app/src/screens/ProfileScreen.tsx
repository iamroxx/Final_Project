import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAppStore } from "../store/useAppStore";
import { useSessionStore } from "../store/useSessionStore";

type Props = {
  onBack: () => void;
};

export function ProfileScreen({ onBack }: Props) {
  const currentUser = useAppStore((state) => state.currentUser);
  const updateProfile = useAppStore((state) => state.updateProfile);
  const logout = useAppStore((state) => state.logout);
  const resetSession = useSessionStore((state) => state.resetSession);

  const [fullName, setFullName] = useState(currentUser?.fullName ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  if (!currentUser) return null;

  const initials = currentUser.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const roleLabel = currentUser.role === "doctor" ? "Doctor" : "Patient";
  const roleBadgeClass = currentUser.role === "doctor"
    ? "bg-violet-500/20 text-violet-300"
    : "bg-cyan-500/20 text-cyan-300";

  async function handleSave() {
    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", ok: false });
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setMessage({ text: "Password must be at least 6 characters.", ok: false });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    const result = await updateProfile({
      fullName: fullName.trim() || undefined,
      email: email.trim() || undefined,
      newPassword: newPassword || undefined,
    });
    setIsSaving(false);

    if (result.ok) {
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ text: "Profile updated successfully.", ok: true });
    } else {
      setMessage({ text: result.error ?? "Failed to update profile.", ok: false });
    }
  }

  function handleLogout() {
    resetSession();
    void logout();
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-950"
      contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Back button */}
      <Pressable onPress={onBack} className="mx-5 mb-2 self-start rounded-xl bg-slate-800 px-4 py-2">
        <Text className="text-sm font-semibold text-slate-200">← Back</Text>
      </Pressable>

      {/* Avatar + identity */}
      <View className="mx-5 mt-4 items-center rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-cyan-500">
          <Text className="text-3xl font-black text-slate-950">{initials}</Text>
        </View>
        <Text className="mt-3 text-xl font-bold text-white">{currentUser.fullName}</Text>
        <Text className="mt-1 text-sm text-slate-400">{currentUser.email}</Text>
        <View className={`mt-2 rounded-full px-3 py-1 ${roleBadgeClass}`}>
          <Text className="text-xs font-semibold uppercase tracking-wide">{roleLabel}</Text>
        </View>
        {currentUser.patientCode ? (
          <View className="mt-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2">
            <Text className="text-center text-[10px] uppercase tracking-widest text-slate-400">Share Code</Text>
            <Text className="mt-1 text-center text-base font-mono font-bold tracking-widest text-cyan-400">
              {currentUser.patientCode}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Edit form */}
      <View className="mx-5 mt-4 rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <Text className="mb-4 text-base font-bold text-white">Edit Profile</Text>

        <Text className="mb-1 text-xs uppercase tracking-wide text-slate-400">Full Name</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your full name"
          placeholderTextColor="#64748b"
          className="mb-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white"
        />

        <Text className="mb-1 text-xs uppercase tracking-wide text-slate-400">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          className="mb-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white"
        />

        <Text className="mb-1 text-xs uppercase tracking-wide text-slate-400">New Password</Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Leave blank to keep current"
          placeholderTextColor="#64748b"
          secureTextEntry
          className="mb-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white"
        />

        <Text className="mb-1 text-xs uppercase tracking-wide text-slate-400">Confirm Password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Repeat new password"
          placeholderTextColor="#64748b"
          secureTextEntry
          className="mb-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white"
        />

        {message ? (
          <View
            className={`mb-4 rounded-xl border px-4 py-3 ${
              message.ok
                ? "border-emerald-700 bg-emerald-950"
                : "border-rose-700 bg-rose-950"
            }`}
          >
            <Text className={`text-sm ${message.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {message.text}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => { void handleSave(); }}
          disabled={isSaving}
          className={`rounded-2xl px-4 py-3 ${isSaving ? "bg-slate-600" : "bg-cyan-500"}`}
        >
          {isSaving ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text className="text-center text-sm font-semibold text-slate-950">Save Changes</Text>
          )}
        </Pressable>
      </View>

      {/* Danger zone */}
      <View className="mx-5 mt-4 rounded-3xl border border-rose-900/50 bg-slate-900 p-5">
        <Text className="mb-1 text-base font-bold text-white">Account</Text>
        <Text className="mb-4 text-xs text-slate-400">Logging out will end your current session.</Text>
        <Pressable
          onPress={handleLogout}
          className="rounded-2xl border border-rose-700 bg-rose-950 px-4 py-3"
        >
          <Text className="text-center text-sm font-semibold text-rose-300">Log Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
