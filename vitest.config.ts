import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
            "@audio": fileURLToPath(new URL("./src/audio", import.meta.url)),
            "@storage": fileURLToPath(new URL("./src/storage", import.meta.url)),
            "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
            "@pwa": fileURLToPath(new URL("./src/pwa", import.meta.url)),
        },
    },
    test: {
        globals: true,
        environment: "happy-dom",
        include: ["tests/unit/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html", "lcov"],
            include: ["src/**/*.js"],
            exclude: ["src/pwa/pwa.js", "src/app.js"],
            thresholds: {
                statements: 75,
                branches: 75,
                functions: 75,
                lines: 75,
            },
        },
    },
});
