import { View, Text } from "react-native";
import { Link } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/lib/theme";

export default function NotFound() {
  const { c } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
      <Text style={{ color: c.ink, fontSize: 20, fontWeight: "600", marginBottom: 16 }}>{t("notFound.title")}</Text>
      <Link href="/(app)" style={{ color: c.accent, fontSize: 16 }}>
        {t("notFound.goHome")}
      </Link>
    </View>
  );
}
