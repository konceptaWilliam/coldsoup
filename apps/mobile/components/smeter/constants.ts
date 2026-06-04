// S-meter keeps its own neo-brutalist skin (yellow / hard black borders /
// offset shadows), independent of the app's light/dark theme tokens — it is a
// deliberate "app-in-app". Ported from rehersal-pain-planner's PainFace.

export const NB = {
  surface: "#F5F5F5",
  white: "#FFFFFF",
  black: "#000000",
  yellow: "#FDE047", // yellow-300 — primary action
  yellowSoft: "#FEF9C3", // yellow-100 — selected label box
  green: "#4ADE80", // best-day card
  red: "#FCA5A5", // worst-day card
  muted: "#525252",
} as const;

// 1–6 pain scale, green → dark red. Index = score - 1.
export const FACE_COLORS = ["#22C55E", "#86EFAC", "#FBBF24", "#FB923C", "#EF4444", "#991B1B"] as const;

// i18n keys for each score label (built client-side via useTranslation).
export const PAIN_LABEL_KEYS = [
  "smeter.pain.1",
  "smeter.pain.2",
  "smeter.pain.3",
  "smeter.pain.4",
  "smeter.pain.5",
  "smeter.pain.6",
] as const;

// Metro requires static literal require() paths — keep this an inline array.
export const FACE_IMAGES = [
  require("../../assets/pain/1.png"),
  require("../../assets/pain/2.png"),
  require("../../assets/pain/3.png"),
  require("../../assets/pain/4.png"),
  require("../../assets/pain/5.png"),
  require("../../assets/pain/6.png"),
];

export const FACE_SIZES: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 36,
  md: 52,
  lg: 64,
  xl: 88,
};

export function clampScore(value: number): number {
  return Math.max(1, Math.min(6, Math.round(value)));
}
