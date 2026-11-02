/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite runs this file in Node. The project has no Node types, so process.env is declared here.
declare const process: { env: Record<string, string | undefined> };

// Windows runners in CI sometimes stall for several seconds; a real hang still fails, after 30 s.
const timeout = process.env.CI ? 30_000 : undefined;

// Port 1420 is what the Tauri shell expects during `tauri dev`.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022" },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: timeout, hookTimeout: timeout },
});
