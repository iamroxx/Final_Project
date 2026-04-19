import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import type { UserRole } from "../types";

type Props = {
  onLogin: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  onSignup: (payload: { fullName: string; email: string; password: string; role: UserRole; patientCode?: string }) => Promise<{ ok: boolean; error?: string }>;
};

export function LoginScreen({ onLogin, onSignup }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("patient");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    const result = mode === "login"
      ? await onLogin(email, password)
      : await onSignup({
          fullName,
          email,
          password,
          role,
          patientCode: role === "patient" ? patientCode : undefined,
        });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? `${mode === "login" ? "Login" : "Sign up"} failed.`);
      return;
    }

    setError(null);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-950"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View className="flex-1 justify-center px-6">
        <View className="rounded-[32px] border border-slate-800 bg-slate-900 p-6">
          <Text className="text-xs uppercase tracking-[0.35em] text-cyan-400">Step Motion</Text>
          <Text className="mt-3 text-4xl font-black text-white">{mode === "login" ? "Login" : "Sign Up"}</Text>
          <Text className="mt-2 text-sm leading-6 text-slate-300">
            {mode === "login"
              ? "Sign in before opening the app."
              : "Create a new patient or doctor account to start using Step Motion."}
          </Text>

          <View className="mt-5 flex-row rounded-2xl bg-slate-950 p-1">
            <Pressable
              onPress={() => {
                setMode("login");
                setError(null);
              }}
              className={`flex-1 rounded-xl px-3 py-3 ${mode === "login" ? "bg-cyan-500" : "bg-transparent"}`}
            >
              <Text className={`text-center text-xs font-semibold uppercase tracking-wide ${mode === "login" ? "text-slate-950" : "text-slate-300"}`}>
                Login
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setMode("signup");
                setError(null);
              }}
              className={`flex-1 rounded-xl px-3 py-3 ${mode === "signup" ? "bg-cyan-500" : "bg-transparent"}`}
            >
              <Text className={`text-center text-xs font-semibold uppercase tracking-wide ${mode === "signup" ? "text-slate-950" : "text-slate-300"}`}>
                Sign Up
              </Text>
            </Pressable>
          </View>

          <View className="mt-6 gap-4">
            {mode === "signup" ? (
              <View>
                <Text className="mb-2 text-xs uppercase tracking-wide text-slate-400">Full Name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-white"
                  placeholder="Enter your full name"
                  placeholderTextColor="#64748b"
                />
              </View>
            ) : null}

            <View>
              <Text className="mb-2 text-xs uppercase tracking-wide text-slate-400">Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-white"
                placeholder="you@example.com"
                placeholderTextColor="#64748b"
              />
            </View>

            <View>
              <Text className="mb-2 text-xs uppercase tracking-wide text-slate-400">Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-white"
                placeholder="Enter your password"
                placeholderTextColor="#64748b"
              />
            </View>

            {mode === "signup" ? (
              <View>
                <Text className="mb-2 text-xs uppercase tracking-wide text-slate-400">Role</Text>
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => setRole("patient")}
                    className={`flex-1 rounded-2xl border px-4 py-3 ${role === "patient" ? "border-cyan-500 bg-cyan-500/20" : "border-slate-700 bg-slate-950"}`}
                  >
                    <Text className={`text-center text-xs font-semibold uppercase tracking-wide ${role === "patient" ? "text-cyan-300" : "text-slate-300"}`}>
                      Patient
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRole("doctor")}
                    className={`flex-1 rounded-2xl border px-4 py-3 ${role === "doctor" ? "border-cyan-500 bg-cyan-500/20" : "border-slate-700 bg-slate-950"}`}
                  >
                    <Text className={`text-center text-xs font-semibold uppercase tracking-wide ${role === "doctor" ? "text-cyan-300" : "text-slate-300"}`}>
                      Doctor
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {mode === "signup" && role === "patient" ? (
              <View>
                <Text className="mb-2 text-xs uppercase tracking-wide text-slate-400">Patient ID</Text>
                <TextInput
                  value={patientCode}
                  onChangeText={setPatientCode}
                  autoCapitalize="characters"
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-white"
                  placeholder="PAT00003"
                  placeholderTextColor="#64748b"
                />
                <Text className="mt-2 text-xs text-slate-400">
                  Use the ID generated by your doctor. Patient sign-up is not allowed without this ID.
                </Text>
              </View>
            ) : null}
          </View>

          {error ? <Text className="mt-4 text-sm text-rose-400">{error}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            className={`mt-6 rounded-2xl px-4 py-4 ${isSubmitting ? "bg-cyan-700" : "bg-cyan-500"}`}
          >
            <Text className="text-center text-base font-semibold text-slate-950">
              {isSubmitting
                ? "Please wait..."
                : mode === "login"
                  ? "Log In"
                  : "Create Account"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}