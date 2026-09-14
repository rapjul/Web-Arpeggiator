import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// This baseline measures every production source file, including app.js and
// pwa.js. Raise it as controller extraction adds characterization coverage;
// restore the 80/70/80/80 per-file gate once no composition root is untested.
const COVERAGE_RATCHET = {
    statements: 61,
    branches: 56,
    functions: 51,
    lines: 61,
};

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: "happy-dom",
            include: ["tests/unit/**/*.test.ts"],
            coverage: {
                provider: "v8",
                reporter: ["text", "json-summary", "lcov", "cobertura", "html"],
                all: true,
                include: ["src/**/*.{js,ts}"],
                thresholds: COVERAGE_RATCHET,
            },
        },
    }),
);
