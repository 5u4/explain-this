import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts"],
          testTimeout: 5_000,
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/test/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
