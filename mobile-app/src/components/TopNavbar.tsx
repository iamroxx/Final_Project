import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppUser } from "../types";

type Props = {
  currentUser: AppUser;
  title: string;
  subtitle?: string;
  onNavigateProfile: () => void;
};

export function TopNavbar({ currentUser, title, subtitle, onNavigateProfile }: Props) {
  const insets = useSafeAreaInsets();

  const initials = currentUser.fullName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View
      className="border-b border-slate-800 bg-slate-950 px-5 pb-3"
      style={{ paddingTop: insets.top + 6 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-lg font-bold text-white">{title}</Text>
          {subtitle ? (
            <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>

        <Pressable
          onPress={onNavigateProfile}
          className="flex-row items-center gap-2 rounded-full border border-slate-700 bg-slate-900 pl-3 pr-1.5 py-1.5"
        >
          <Text className="text-xs text-slate-300">{currentUser.fullName.split(" ")[0]}</Text>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-cyan-500">
            <Text className="text-[11px] font-bold text-slate-950">{initials}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
