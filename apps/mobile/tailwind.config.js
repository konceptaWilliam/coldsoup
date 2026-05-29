/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#1A1A18",
        "ink-soft": "#2A2A27",
        surface: "#F2EFE8",
        "surface-2": "#F7F4ED",
        border: "#E2DDD2",
        "border-strong": "#D0C9BB",
        muted: "#6B6A65",
        "muted-2": "#9A988F",
        accent: "#D97706",
        // status colors — matching web exactly
        "open-bg": "#EAF5EF",
        "open-text": "#2F5A43",
        "open-border": "#8FBFA3",
        "urgent-bg": "#F6E6D4",
        "urgent-text": "#8A4B1F",
        "urgent-border": "#C79B6A",
        "done-bg": "#ECEBE4",
        "done-text": "#5A5954",
        "done-border": "#C7C5BC",
      },
    },
  },
  plugins: [],
};
