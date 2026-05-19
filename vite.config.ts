/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/ai": "http://127.0.0.1:5174",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
});
