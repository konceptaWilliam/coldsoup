"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const KEY = "coldsoup:themeMode";

export type ThemeMode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

// Status-bar / browser-chrome colour per scheme (matches --surface).
export const THEME_COLORS: Record<Scheme, string> = { light: "#F2EFE8", dark: "#1A1A18" };

/** Point every theme-color meta at the in-app scheme (overrides the OS media variants). */
export function applyThemeColor(scheme: Scheme): void {
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", THEME_COLORS[scheme]));
}

type ThemeContextType = {
  mode: ThemeMode;
  scheme: Scheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  scheme: "light",
  setMode: () => {},
});

function systemScheme(): Scheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function storedMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {}
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize synchronously from storage so the first scheme effect never
  // clobbers the pre-paint theme back to light for a frame.
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [system, setSystem] = useState<Scheme>(systemScheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(systemScheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  const scheme: Scheme = mode === "system" ? system : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
    document.documentElement.style.colorScheme = scheme;
    applyThemeColor(scheme);
  }, [scheme]);

  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
