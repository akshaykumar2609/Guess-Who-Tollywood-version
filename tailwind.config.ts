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
        // Tollywood-flavored palette
        tolly: {
          red: "#e50914",
          gold: "#f5c518",
          ink: "#0b0d17",
          panel: "#151a2d",
          card: "#1d2440",
          muted: "#8b93b0",
        },
      },
      fontFamily: {
        display: ["'Trebuchet MS'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
