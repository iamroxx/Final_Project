import { Text, View } from "react-native";

type Props = {
  label: string;
  value: string;
};

export function MetricCard({ label, value }: Props) {
  return (
    <View className="w-[48%] rounded-2xl bg-white p-4 shadow-sm">
      <Text className="text-xs uppercase text-slate-500">{label}</Text>
      <Text className="mt-2 text-2xl font-bold text-slate-900">{value}</Text>
    </View>
  );
}
