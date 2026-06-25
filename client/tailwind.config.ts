import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        foundry: {
          primary: "#00D4B5",
          primaryHover: "#00B89E",
          primaryActive: "#00A18A",
          primaryLight: "#E6FAF6",
          accent: "#5E67FF",
          background: "#FFFFFF",
          surface: "#F8F9FA",
          surfaceHover: "#F1F3F5",
          border: "#E5E7EB",
          textPrimary: "#111827",
          textSecondary: "#4B5563",
          textTertiary: "#6B7280",
          textDisabled: "#9CA3AF",
        },
      },
    },
  },
  plugins: [],
};

export default config;
