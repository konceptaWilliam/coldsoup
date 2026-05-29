import { View, Text } from "react-native";
import { Link } from "expo-router";

export default function NotFound() {
  return (
    <View className="flex-1 bg-surface items-center justify-center px-8">
      <Text className="text-ink text-xl font-semibold mb-4">Page not found</Text>
      <Link href="/(app)/(tabs)" className="text-accent text-base">
        Go home
      </Link>
    </View>
  );
}
