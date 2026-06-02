import { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme";

/** A single pulsing placeholder block. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const { c } = useTheme();
  const op = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.4, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.View style={[{ backgroundColor: c.border, opacity: op }, style]} />;
}

/** Group-list rows (Groups tab + drawer). */
export function GroupListSkeleton({ count = 6 }: { count?: number }) {
  const { c } = useTheme();
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ width: 7, height: 7, marginRight: 10, transform: [{ rotate: "45deg" }], backgroundColor: c.border }} />
          <Skeleton style={{ height: 12, width: `${40 + ((i * 17) % 40)}%` }} />
        </View>
      ))}
    </View>
  );
}

/** Thread-list rows (group screen). */
export function ThreadListSkeleton({ count = 7 }: { count?: number }) {
  const { c } = useTheme();
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Skeleton style={{ height: 12, width: `${45 + ((i * 13) % 35)}%` }} />
            <Skeleton style={{ height: 10, width: 28 }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Skeleton style={{ height: 10, width: `${30 + ((i * 19) % 40)}%` }} />
            <Skeleton style={{ height: 16, width: 52 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Chat message rows (thread screen). */
export function MessagesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View style={{ paddingVertical: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: "flex-start" }}>
          <Skeleton style={{ width: 28, height: 28 }} />
          <View style={{ flex: 1, gap: 5 }}>
            <Skeleton style={{ height: 11, width: 90 }} />
            <Skeleton style={{ height: 13, width: `${50 + ((i * 23) % 45)}%` }} />
            {i % 3 === 0 && <Skeleton style={{ height: 13, width: `${30 + ((i * 11) % 30)}%` }} />}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Member rows (members screen). */
export function MemberListSkeleton({ count = 6 }: { count?: number }) {
  const { c } = useTheme();
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Skeleton style={{ width: 36, height: 36 }} />
          <Skeleton style={{ height: 13, width: `${35 + ((i * 17) % 35)}%` }} />
        </View>
      ))}
    </View>
  );
}
