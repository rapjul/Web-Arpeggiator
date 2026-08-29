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
            include: [
                "src/core/**/*.js",
                "src/storage/session-manager.js",
                "src/storage/settings-manager.js",
                "src/ui/ui-feedback.js",
                "src/ui/a11y-navigation.js",
            ],
            thresholds: {
                statements: 85,
                branches: 70,
                functions: 85,
                lines: 85,
            },
        },
    },
});
