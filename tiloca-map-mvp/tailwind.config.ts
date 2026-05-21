import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Sora", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"],
      },
      colors: {
        tiloca: {
          navy: "#080f1a",
          panel: "rgba(8, 15, 26, 0.94)",
          green: "#00d4a0",
          amber: "#f5a623",
          slate: "#1e293b",
          line: "rgba(0, 212, 160, 0.16)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
