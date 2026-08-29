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
                reporter: ["text", "json", "html", "lcov"],
                include: ["src/**/*.{js,ts}"],
                exclude: ["src/pwa/pwa.js", "src/app.js"],
            },
        },
    }),
);
