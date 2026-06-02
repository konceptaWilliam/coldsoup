import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "coldsoup:themeMode";

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

export interface Palette {
  surface: string;
  surface2: string;
  ink: string;
  inkSoft: string;
  border: string;
  borderStrong: string;
  muted: string;
  muted2: string;
  accent: string;
  // status
  openBg: string;
  openText: string;
  openBorder: string;
  urgentBg: string;
  urgentText: string;
  urgentBorder: string;
  doneBg: string;
  doneText: string;
  doneBorder: string;
  // misc
  highlight: string; // mention bg / pressed row bg
  errorBg: string;
  errorBorder: string;
  errorText: string;
  overlay: string; // modal scrim
  overlayStrong: string; // lightbox scrim (always dark)
  fillStrong: string; // poll bar (voted)
  fillWeak: string; // poll bar (unvoted)
  online: string; // presence dot
}

const light: Palette = {
  surface: "#F2EFE8",
  surface2: "#F7F4ED",
  ink: "#1A1A18",
  inkSoft: "#2A2A27",
  border: "#E2DDD2",
  borderStrong: "#D0C9BB",
  muted: "#6B6A65",
  muted2: "#9A988F",
  accent: "#D97706",
  openBg: "#EAF5EF",
  openText: "#2F5A43",
  openBorder: "#8FBFA3",
  urgentBg: "#F6E6D4",
  urgentText: "#8A4B1F",
  urgentBorder: "#C79B6A",
  doneBg: "#ECEBE4",
  doneText: "#5A5954",
  doneBorder: "#C7C5BC",
  highlight: "#ECE8DF",
  errorBg: "#FEF2F2",
  errorBorder: "#FECACA",
  errorText: "#DC2626",
  overlay: "rgba(26,26,24,0.2)",
  overlayStrong: "rgba(26,26,24,0.92)",
  fillStrong: "rgba(26,26,24,0.28)",
  fillWeak: "rgba(26,26,24,0.12)",
  online: "#2F8F5B",
};

const dark: Palette = {
  surface: "#1A1A18",
  surface2: "#232320",
  ink: "#F2EFE8",
  inkSoft: "#E2DDD2",
  border: "#33322E",
  borderStrong: "#44423C",
  muted: "#9A988F",
  muted2: "#6B6A65",
  accent: "#E8923B",
  openBg: "#1C2B23",
  openText: "#7FB89A",
  openBorder: "#3A5A48",
  urgentBg: "#2E2519",
  urgentText: "#D99A5E",
  urgentBorder: "#6A5230",
  doneBg: "#232320",
  doneText: "#8A887F",
  doneBorder: "#3A3A35",
  highlight: "#2E2D29",
  errorBg: "#2A1A1A",
  errorBorder: "#5A2A2A",
  errorText: "#F08A8A",
  overlay: "rgba(0,0,0,0.6)",
  overlayStrong: "rgba(0,0,0,0.94)",
  fillStrong: "rgba(242,239,232,0.30)",
  fillWeak: "rgba(242,239,232,0.13)",
  online: "#4FB87F",
};

const palettes: Record<Scheme, Palette> = { light, dark };

interface ThemeContextType {
  c: Palette;
  scheme: Scheme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  loaded: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  c: light,
  scheme: "light",
  mode: "system",
  setMode: () => {},
  loaded: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw === "light" || raw === "dark" || raw === "system") setModeState(raw);
      })
      .finally(() => setLoaded(true));
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  const scheme: Scheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

  const value = useMemo<ThemeContextType>(
    () => ({ c: palettes[scheme], scheme, mode, setMode, loaded }),
    [scheme, mode, setMode, loaded]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
