import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative base so the bundle works from the Android WebView as well as any static host.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { target: "es2020", outDir: "dist", chunkSizeWarningLimit: 1000 },
  server: { host: true, port: 5173 },
});
