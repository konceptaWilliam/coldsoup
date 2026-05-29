import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// SecureStore caps each value at 2048 bytes. Supabase stores the whole
// session JSON under one key, which routinely exceeds that. Chunk the value
// across `<key>.0`, `<key>.1`, ... and track the count under `<key>`.
const CHUNK_SIZE = 2000;

const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    const count = Number(head);
    // Non-chunked legacy value (plain string stored directly).
    if (!Number.isInteger(count) || count < 0) return head;
    let value = "";
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  setItem: async (key: string, value: string) => {
    // Clear any stale chunks from a previous, longer value.
    const prev = await SecureStore.getItemAsync(key);
    const prevCount = prev === null ? 0 : Number(prev);
    if (Number.isInteger(prevCount)) {
      for (let i = 0; i < prevCount; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      }
    }
    const chunks = Math.ceil(value.length / CHUNK_SIZE) || 1;
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(key, String(chunks));
  },
  removeItem: async (key: string) => {
    const head = await SecureStore.getItemAsync(key);
    const count = head === null ? 0 : Number(head);
    if (Number.isInteger(count)) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

// SecureStore has no native module on web — fall back to localStorage there.
const webStorageAdapter = {
  getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage?.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? webStorageAdapter : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
