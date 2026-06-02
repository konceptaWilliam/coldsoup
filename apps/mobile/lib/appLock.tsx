import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, View, Text, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { useTranslation } from "react-i18next";
import { useTheme } from "./theme";

const KEY = "coldsoup:appLock";

type AppLockContextType = {
  enabled: boolean;
  locked: boolean;
  loaded: boolean;
  setEnabled: (b: boolean) => Promise<boolean>;
  unlock: () => void;
};

const AppLockContext = createContext<AppLockContextType>({
  enabled: false,
  locked: false,
  loaded: false,
  setEnabled: async () => false,
  unlock: () => {},
});

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", gap: 24, zIndex: 1000 }}>
      <Text style={{ fontFamily: "monospace", fontSize: 22, fontWeight: "600", color: c.ink, letterSpacing: -0.3 }}>coldsoup</Text>
      <Text style={{ fontFamily: "monospace", fontSize: 11, color: c.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>{t("appLock.title")}</Text>
      <Pressable
        onPress={onUnlock}
        accessibilityRole="button"
        accessibilityLabel={t("appLock.unlock")}
        style={({ pressed }) => ({ backgroundColor: c.ink, paddingVertical: 12, paddingHorizontal: 32, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "500", color: c.surface }}>{t("appLock.unlock")}</Text>
      </Pressable>
    </View>
  );
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const authingRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        const on = v === "1";
        setEnabledState(on);
        if (on) setLocked(true);
      })
      .finally(() => setLoaded(true));
  }, []);

  const unlock = useCallback(async () => {
    if (authingRef.current) return;
    authingRef.current = true;
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t("appLock.prompt"),
        disableDeviceFallback: false,
      });
      if (res.success) setLocked(false);
    } catch {
      // leave locked; user can retry via the Unlock button
    } finally {
      authingRef.current = false;
    }
  }, [t]);

  // Auto-prompt whenever we enter the locked state.
  useEffect(() => {
    if (enabled && locked) unlock();
  }, [enabled, locked, unlock]);

  // Re-lock when the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if ((state === "background" || state === "inactive") && enabled) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  const setEnabled = useCallback(async (b: boolean): Promise<boolean> => {
    if (b) {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!has || !enrolled) return false;
    }
    setEnabledState(b);
    AsyncStorage.setItem(KEY, b ? "1" : "0").catch(() => {});
    if (!b) setLocked(false);
    return true;
  }, []);

  return (
    <AppLockContext.Provider value={{ enabled, locked, loaded, setEnabled, unlock }}>
      <View style={{ flex: 1 }}>
        {children}
        {enabled && locked && <LockScreen onUnlock={unlock} />}
      </View>
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  return useContext(AppLockContext);
}
