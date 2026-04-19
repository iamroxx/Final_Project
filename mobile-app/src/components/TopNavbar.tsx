import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppUser } from "../types";

type Props = {
  currentUser: AppUser;
  title: string;
  subtitle: string;
  onLogout: () => void;
};

export function TopNavbar({ currentUser, title, subtitle, onLogout }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-b border-slate-800 bg-slate-950 px-5 pb-4"
      style={{ paddingTop: insets.top + 12 }}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-xs uppercase tracking-[0.3em] text-cyan-400">
            {currentUser.role === "doctor" ? "Doctor Portal" : "Patient Portal"}
          </Text>
          <Text className="mt-2 text-3xl font-black text-white">{title}</Text>
          <Text className="mt-1 text-sm text-slate-300">{subtitle}</Text>
        </View>

        <Pressable
          onPress={onLogout}
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2"
        >
          <Text className="text-xs font-semibold uppercase tracking-wide text-slate-200">
            Logout
          </Text>
        </Pressable>
      </View>
    </View>
  );
}