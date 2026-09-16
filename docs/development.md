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
