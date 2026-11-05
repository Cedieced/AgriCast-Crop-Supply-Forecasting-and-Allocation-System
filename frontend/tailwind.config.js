/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: { colors: { agri: { 50: "#eff7ee", 100: "#dcefd9", 600: "#39834c", 700: "#2c6e3d", 900: "#183b28" } } } },
  plugins: [],
};
