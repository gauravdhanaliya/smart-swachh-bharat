import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit + integration tests for the web app (src/). The server and
// tests/locationAdapters.test.js use Node's own runner: npm run test:node.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
