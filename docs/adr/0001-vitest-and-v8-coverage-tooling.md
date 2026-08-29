# 0001. Vitest and V8 Coverage Tooling

* Status: accepted
* Deciders: rapjul, Antigravity
* Date: 2026-08-29

## Context and Problem Statement

Web Arpeggiator is a client-side Web Audio application built with vanilla JavaScript, Tone.js, and Tailwind CSS. The project previously used Bun's native test runner (`bun test`). However, Bun's built-in test runner lacks granular branch coverage reporting, Happy-DOM lifecycle emulation for complex Web Audio / canvas DOM mocks, and automated CI threshold enforcement gates. We need a reliable testing and coverage solution that measures statement, branch, line, and function coverage while enforcing minimum quality thresholds on every build.

## Decision Drivers

* Need for exact branch coverage metrics to verify conditional synthesizer routing, quantization fallbacks, and UI state switches.
* Seamless compatibility with Vite build configuration and path aliases (`@core/*`, `@audio/*`, etc.).
* Automated CI threshold enforcement that hard-fails when test coverage drops below target bounds.
* Fast execution with modern DOM emulation (Happy-DOM).

## Considered Options

* **Option 1: Vitest with `@vitest/coverage-v8`**
* **Option 2: Bun native test runner (`bun test`)**
* **Option 3: Jest with Babel/ts-jest**

## Decision Outcome

Chosen option: **Option 1 (Vitest with `@vitest/coverage-v8`)**, because:
* Vitest shares the existing `vite.config.js` configuration and path aliases directly via `mergeConfig()`.
* The V8 coverage provider provides fast AST-level statement, branch, function, and line metrics without requiring source transformation or Babel instrumentation.
* Vitest natively supports `happy-dom` for fast DOM and Web Audio mocking.
* Automated threshold gates are configured directly in `./vitest.config.ts` (80% statements, 70% branches, 80% functions, 80% lines).

### Positive Consequences

* Granular branch coverage reporting across all source modules under `./src/`.
* Hard CI failure if any PR or commit drops test coverage below the minimum threshold gates.
* Faster test execution and seamless TypeScript/ESM resolution.

### Negative Consequences

* Introduces devDependencies on `vitest`, `@vitest/coverage-v8`, and `@vitest/spy`.

## Links

* [Vitest Configuration](../../vitest.config.ts)
* [Architecture Guide](../../AGENTS.md)
