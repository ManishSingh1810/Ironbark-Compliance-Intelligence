/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
