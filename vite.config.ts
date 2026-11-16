import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// base "./": funciona tanto no localhost quanto em um subcaminho (ex.: GitHub Pages /lucca-rotina/).
export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: { target: "es2020" },
});
