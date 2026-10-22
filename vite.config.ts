import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  server: {
    watch: {
      ignored: [
        "**/.sites-runtime/**",
        "**/playwright-report/**",
        "**/test-results/**",
      ],
    },
  },
  plugins: [react()],
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      include: ["src/engine/**", "src/domain/**", "src/playback/**"],
    },
  },
});
