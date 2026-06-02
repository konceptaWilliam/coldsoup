import { View, Text, Image, Pressable, Linking } from "react-native";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/lib/theme";

export function LinkPreview({ url }: { url: string }) {
  const { c } = useTheme();
  const { data } = trpc.links.unfurl.useQuery(
    { url },
    { staleTime: 1000 * 60 * 60, gcTime: 1000 * 60 * 60, retry: false }
  );

  if (!data || !data.title) return null;

  let domain = "";
  try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }

  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="button"
      accessibilityLabel={data.title}
      style={({ pressed }) => ({ marginTop: 6, maxWidth: 280, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, opacity: pressed ? 0.8 : 1 })}
    >
      {data.image_url ? (
        <Image source={{ uri: data.image_url }} style={{ width: "100%", height: 140, backgroundColor: c.border }} resizeMode="cover" />
      ) : null}
      <View style={{ padding: 8, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink }} numberOfLines={2}>{data.title}</Text>
        {data.description ? (
          <Text style={{ fontSize: 11, color: c.muted }} numberOfLines={2}>{data.description}</Text>
        ) : null}
        <Text style={{ fontFamily: "monospace", fontSize: 10, color: c.muted2, marginTop: 2 }} numberOfLines={1}>{domain}</Text>
      </View>
    </Pressable>
  );
}
