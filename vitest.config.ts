import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@syncert/core": fileURLToPath(
        new URL(
          "./vendor/syncert-core/packages/core/src/index.ts",
          import.meta.url,
        ),
      ),
      "@syncert/crypto": fileURLToPath(
        new URL(
          "./vendor/syncert-core/packages/crypto/src/index.ts",
          import.meta.url,
        ),
      ),
      "@syncert/protocol": fileURLToPath(
        new URL(
          "./vendor/syncert-core/packages/protocol/src/index.ts",
          import.meta.url,
        ),
      ),
    },
  },
  test: { include: ["test/**/*.test.ts"], testTimeout: 20_000 },
});
