import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// This baseline measures every production source file, including app.js and
// pwa.js. Raise it as controller extraction adds characterization coverage;
// reach the 80/70/80/80 global target once no composition root is untested.
const COVERAGE_RATCHET = {
    statements: 75,
    branches: 65,
    functions: 65,
    lines: 75,
};

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: "happy-dom",
            include: ["tests/unit/**/*.test.ts", "tests/perf/**/*.test.ts"],
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
