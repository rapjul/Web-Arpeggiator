# 0002. Modular ES Source Architecture

* Status: accepted
* Deciders: rapjul, Antigravity
* Date: 2026-08-29

## Context and Problem Statement

The application originally kept all JavaScript logic in a flat `js/` directory with legacy IIFE (Immediately Invoked Function Expression) wrappers and global `window` attachments. As the application expanded to include multiple synthesizer models, scale quantizers, recording engines, IndexedDB persistence, and visualizer modes, maintaining monolithic files without strict dependency boundaries caused testing friction, duplicate logic, and namespace collisions.

## Decision Drivers

* Need for clean separation of concerns: zero-dependency domain algorithms, Web Audio signal graphs, persistence, and DOM rendering.
* Elimination of legacy IIFE wrappers in favor of standard ES module `import`/`export`.
* Elimination of duplicate business logic across modules (e.g. session auto-saving).
* Clear module dependency layers with clean path aliasing (`@core/*`, `@audio/*`, `@storage/*`, `@ui/*`, `@pwa/*`).

## Considered Options

* **Option 1: Layered modular ES architecture under `./src/` with path aliases**
* **Option 2: Flat `js/` directory with ES module exports**
* **Option 3: Single bundled monolithic script**

## Decision Outcome

Chosen option: **Option 1 (Layered modular ES architecture under `./src/`)**, because:
* Isolates pure algorithms in `./src/core/` (zero DOM / zero Web Audio dependencies) for ultra-fast, robust unit testing.
* Isolates Web Audio graph creation and scheduling in `./src/audio/`.
* Isolates IndexedDB and session persistence in `./src/storage/`.
* Isolates DOM, canvas, and feedback rendering in `./src/ui/`.
* Path aliases in `./vite.config.js` and `./tsconfig.json` allow clean, refactor-resilient imports.

### Structure Overview

```
src/
├── core/       # Pure algorithms (pattern math, MIDI export, URL presets, DSP math)
├── audio/      # Web Audio & Tone.js synthesis, pattern scheduling, recording
├── storage/    # IndexedDB presets store, session manager, settings manager
├── ui/         # Visualizer canvas, virtual keyboard, feedback toasts, a11y navigation
├── pwa/        # Service worker registration & lifecycle
└── app.js      # Main application wiring & transport coordination
```

### Positive Consequences

* Every domain module is independently testable in isolation without initializing Web Audio or DOM trees.
* High cohesion and loose coupling between audio, storage, and UI layers.
* Clear migration path for future TypeScript conversion.

### Negative Consequences

* Requires maintaining path aliases across `vite.config.js`, `tsconfig.json`, and `jsconfig.json`.

## Links

* [Vite Configuration](../../vite.config.js)
* [TypeScript Configuration](../../tsconfig.json)
* [Architecture Guide](../../AGENTS.md)
