type HapticName = "light" | "medium" | "success" | "warning" | "error";

const HAPTIC_PATTERNS: Record<HapticName, VibratePattern> = {
  light: 10,
  medium: 20,
  success: [12, 24, 12],
  warning: [20, 30, 20],
  error: [30, 40, 30],
};

export type HapticPattern = HapticName | VibratePattern;

export function haptic(pattern: HapticPattern = "light"): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }

  try {
    const vibratePattern =
      typeof pattern === "string" ? HAPTIC_PATTERNS[pattern] : pattern;
    return navigator.vibrate(vibratePattern);
  } catch {
    return false;
  }
}
