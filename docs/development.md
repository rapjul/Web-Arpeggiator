# Development and Testing

## Requirements

Install the project dependencies with Bun:

```bash
bun install
```

## Development Commands

```bash
bun run dev
bun run build
bun run format:check
bun run lint
bun run typecheck
```

## Composition Boundaries

`src/app.js` is intentionally kept as the composition root. It performs DOM lookup, owns shared application state, composes the settings manager, and connects controller callbacks to the live audio graph. It should not accumulate feature-specific event handlers.

UI behavior belongs in focused controllers: `workspace-controller.js` handles history, resets, autosave, and session restoration; `export-controls-controller.js` handles recording and export controls; `preset-workflow-controller.js` handles URL, file, and browser-preset actions; and the existing pattern, synth, transport, effects, onboarding, keyboard, and visualizer controllers handle their respective controls. Audio lifecycle boundaries are `runtime-controller.js` for deferred Tone loading and graph construction, `playback-controller.js` for transport and suspended-context recovery, and `static-loop-renderer.js` for one-cycle preview rendering.

When adding a new interaction, keep DOM references and cross-feature callback wiring in `app.js`, inject platform dependencies into the focused controller, and return a teardown method for every listener-owning controller. Preserve the existing settings-manager, settings-history, session-manager, and export contracts when moving orchestration code.

## Test Commands

```bash
bun run test:unit
bun run test:coverage
bun run test:e2e
bun run test:all
```

`test:e2e` installs the Playwright Chromium build when it is missing. When the matching browser is already installed, Playwright reuses it without downloading again.

Vitest owns unit tests and V8 coverage. Playwright owns Chromium browser behavior, including UI interactions, PWA lifecycle, canvas, downloaded files, and generated-audio recording. The current Vitest coverage ratchet is configured in [`vitest.config.ts`](../vitest.config.ts); its long-term target is 80% statements, 70% branches, 80% functions, and 80% lines.

For browser scenarios, wait for observable UI or platform states and validate files through the browser download event. See [ADR 0011](./adr/0011-playwright-browser-testing.md) for runner ownership and [ADR 0012](./adr/0012-observable-playwright-synchronization-and-artifact-validation.md) for test-design rules.
