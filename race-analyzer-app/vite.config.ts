import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/xc_2026/",
  server: { host: true, port: 5173 },
});
