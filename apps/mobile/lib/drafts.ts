import AsyncStorage from "@react-native-async-storage/async-storage";

// One AsyncStorage entry per thread holds the unsent compose text. Survives
// navigation away and app kill. Writes are fire-and-forget.
const prefix = "coldsoup:draft:";

const key = (threadId: string) => `${prefix}${threadId}`;

export async function getDraft(threadId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(key(threadId))) ?? "";
  } catch {
    return "";
  }
}

export function setDraft(threadId: string, body: string) {
  AsyncStorage.setItem(key(threadId), body).catch(() => {});
}

export function clearDraft(threadId: string) {
  AsyncStorage.removeItem(key(threadId)).catch(() => {});
}
