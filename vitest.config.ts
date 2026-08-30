import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: "happy-dom",
            include: ["tests/unit/**/*.test.ts"],
            coverage: {
                provider: "v8",
                reporter: ["text", "json-summary", "cobertura", "html"],
                include: ["src/**/*.{js,ts}"],
                exclude: ["src/pwa/pwa.js", "src/app.js"],
                thresholds: {
                    perFile: true,
                    statements: 80,
                    branches: 70,
                    functions: 80,
                    lines: 80,
                },
            },
        },
    }),
);
