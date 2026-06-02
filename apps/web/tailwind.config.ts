import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
        // pastel accent — driven by CSS vars so they can be themed later
        pastel: "var(--pastel)",
        "pastel-ink": "var(--pastel-ink)",
        "pastel-tint": "var(--pastel-tint)",
        "pastel-deep": "var(--pastel-deep)",
        // semantic status colors
        "urgent-ink": "var(--urgent-ink)",
        "urgent-tint": "var(--urgent-tint)",
        "urgent-border": "var(--urgent-border)",
        "done-ink": "var(--done-ink)",
        "done-tint": "var(--done-tint)",
        "done-border": "var(--done-border)",
        // legacy accent (kept for non-status uses)
        accent: "var(--accent)",
        "accent-light": "var(--accent-light)",
        online: "var(--online)",
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "monospace"],
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-up": "fadeUp 360ms ease-out both",
        "pop": "pop 280ms cubic-bezier(.2,.9,.3,1.2)",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
        "breath": "breath 1.6s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
