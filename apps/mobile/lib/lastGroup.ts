import AsyncStorage from "@react-native-async-storage/async-storage";

// Remembers the group the user was last in so the app can reopen straight into
// it instead of the group picker.
const KEY = "coldsoup:lastGroup";

export async function getLastGroup(): Promise<{ id: string; name: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
  } catch {
    return null;
  }
}

export function setLastGroup(group: { id: string; name: string }) {
  AsyncStorage.setItem(KEY, JSON.stringify(group)).catch(() => {});
}

export function clearLastGroup() {
  AsyncStorage.removeItem(KEY).catch(() => {});
}
