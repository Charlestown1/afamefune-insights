/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070a",
          900: "#0a0e14",
          850: "#0d121a",
          800: "#111826",
          700: "#1a2333",
          600: "#26324a",
          500: "#3a4a68"
        },
        gold: {
          400: "#e8c477",
          500: "#d4af5a",
          600: "#b8933f"
        },
        up: "#2fbf8f",
        down: "#e5534b"
      },
      fontFamily: {
        display: ["Georgia", "'Times New Roman'", "serif"],
        sans: ["-apple-system", "BlinkMacSystemFont", "'Segoe UI'", "Roboto", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};
