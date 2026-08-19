import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      CORS_ORIGIN: "http://localhost:3000",
      DATABASE_CONNECTION_TIMEOUT_MS: "5000",
      DATABASE_URL: "postgresql://lite_notion:lite_notion@localhost:5432/lite_notion?schema=public",
      NODE_ENV: "test",
      PORT: "3001",
    },
    environment: "node",
    include: ["src/**/*.spec.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
