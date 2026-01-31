/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")], // ✅ DaisyUI plugin here
  daisyui: {
    themes: ["light", "dark", "cupcake", "retro"], // enable extra themes
  },
}
