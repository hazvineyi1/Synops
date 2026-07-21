import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // These are fast, DB-free unit tests over pure permission + gradebook logic.
    globals: false,
  },
});
