/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Be Vietnam Pro", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        mute: "rgb(var(--mute) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        elev: "rgb(var(--elev) / <alpha-value>)",
        bronze: "rgb(var(--bronze) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        ok: "rgb(var(--ok) / <alpha-value>)",
      },
      boxShadow: {
        glass: "0 8px 40px rgb(0 0 0 / 0.28)",
        lift: "0 12px 40px rgb(0 0 0 / 0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
