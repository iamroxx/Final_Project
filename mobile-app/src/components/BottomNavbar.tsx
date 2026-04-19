import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppRoute } from "../types";

type NavItem = {
  route: AppRoute;
  label: string;
};

type Props = {
  items: NavItem[];
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
};

export function BottomNavbar({ items, currentRoute, onNavigate }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="border-t border-slate-800 bg-slate-950 px-3 pt-3"
      style={{ paddingBottom: insets.bottom + 12 }}
    >
      <View className="flex-row rounded-3xl bg-slate-900 p-2">
        {items.map((item) => {
          const isActive = currentRoute === item.route;
          return (
            <Pressable
              key={item.route}
              onPress={() => onNavigate(item.route)}
              className={`flex-1 rounded-2xl px-3 py-3 ${isActive ? "bg-cyan-500" : "bg-transparent"}`}
            >
              <Text className={`text-center text-xs font-semibold uppercase tracking-[0.2em] ${isActive ? "text-slate-950" : "text-slate-300"}`}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}