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

For module ownership, composition boundaries, and the deferred `app.js` follow-up, see the [Architecture Guide](./architecture.md). Keep contributor workflow and test-runner guidance in this document.

## Test Commands

```bash
bun run test:unit
bun run test:coverage
bun run test:e2e
bun run test:all
```

Before opening a pull request, run the complete validation set:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test:coverage
bun run build
bun run test:e2e
```

`test:e2e` installs the Playwright Chromium build when it is missing. When the matching browser is already installed, Playwright reuses it without downloading again.

Vitest owns unit tests and V8 coverage. Playwright owns Chromium browser behavior, including UI interactions, PWA lifecycle, canvas, downloaded files, and generated-audio recording. The current Vitest coverage ratchet is configured in [`vitest.config.ts`](../vitest.config.ts); its long-term target is 80% statements, 70% branches, 80% functions, and 80% lines.

For browser scenarios, wait for observable UI or platform states and validate files through the browser download event. See [ADR 0011](./adr/0011-playwright-browser-testing.md) for runner ownership and [ADR 0012](./adr/0012-observable-playwright-synchronization-and-artifact-validation.md) for test-design rules.

## Audio Startup Profiling and Latency Benchmarks

Web Arpeggiator enforces strict startup latency budgets documented in [ADR 0020](./adr/0020-bounded-audio-startup-latency-and-lifecycle-benchmarking.md):
- **Cold Start**: Under 2500ms in headless browser `CI` (typically 400–800ms on desktop hardware).
- **Warm Restart**: Under 300ms from user interaction until the first note step indicator highlights.
- **Subsystem Execution**: Isolated engine construction, 100-cycle timeline compilation, and settings snapshot hydration finish in single-digit to low tens of milliseconds.

### Inspecting Startup Telemetry in DevTools

During local development with `bun run dev`, the application records high-resolution Web Performance API marks and logs a waterfall breakdown table to the browser console as soon as the first note sounds:

```javascript
// Query recorded performance measures in Chrome DevTools Console:
console.table(performance.getEntriesByType("measure").map((m) => ({ Name: m.name, "Duration (ms)": m.duration })));
```

### Running Latency Benchmarks

To run the subsystem algorithmic benchmarks in `Vitest`:

```bash
bun run test:unit tests/unit/audio-startup-benchmarks.test.ts
```

To run the Playwright browser latency suite:

```bash
bunx playwright test tests/e2e/playback-startup-latency.test.ts
```

