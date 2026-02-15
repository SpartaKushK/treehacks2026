import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--tw-border))",
        input: "hsl(var(--tw-input))",
        ring: "hsl(var(--tw-ring))",
        background: "hsl(var(--tw-background))",
        foreground: "hsl(var(--tw-foreground))",
        primary: {
          DEFAULT: "hsl(var(--tw-primary))",
          foreground: "hsl(var(--tw-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--tw-secondary))",
          foreground: "hsl(var(--tw-secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--tw-destructive))",
          foreground: "hsl(var(--tw-destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--tw-muted))",
          foreground: "hsl(var(--tw-muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--tw-accent))",
          foreground: "hsl(var(--tw-accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--tw-popover))",
          foreground: "hsl(var(--tw-popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--tw-card))",
          foreground: "hsl(var(--tw-card-foreground))",
        },
        // Landing page warm palette
        cream: { DEFAULT: "#FFF8F0", dark: "#F5EDE3" },
        "warm-white": "#FFFDF9",
        charcoal: { DEFAULT: "#2D2A26", light: "#4A4640" },
        teal: { DEFAULT: "#1A7A6D", dark: "#14615A", light: "#E6F5F2" },
        coral: { DEFAULT: "#E8734A", dark: "#D4613A", light: "#FFF0EB" },
        gold: { DEFAULT: "#D4A843", light: "#FFF8E7" },
        navy: { DEFAULT: "#1E3A5F", light: "#E8EEF5" },
        sage: { DEFAULT: "#7BA38C", light: "#EFF6F1" },
        danger: { DEFAULT: "#C0392B", light: "#FDECEB" },
      },
      fontFamily: {
        display: ["Bitter", "Georgia", "serif"],
        body: ["Nunito", "Verdana", "sans-serif"],
      },
      borderWidth: {
        3: "3px",
      },
      borderRadius: {
        lg: "var(--tw-radius)",
        md: "calc(var(--tw-radius) - 2px)",
        sm: "calc(var(--tw-radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
