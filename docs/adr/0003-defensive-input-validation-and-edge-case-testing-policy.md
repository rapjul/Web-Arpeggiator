# 0003. Defensive Input Validation and Edge-Case Testing Policy

* Status: accepted
* Deciders: rapjul, Antigravity
* Date: 2026-08-29

## Context and Problem Statement

Web Arpeggiator parses inputs from various uncontrolled sources: user-entered text, URL query strings, imported JSON preset files, and IndexedDB snapshots. When inputs contain unknown values (e.g. unknown synth types, unrecognized pattern directions, out-of-bounds BPM, corrupted note strings, or NaN slider values), the application must degrade gracefully to safe defaults without crashing, freezing the audio context, or producing malformed audio/MIDI exports.

We need an enforced project standard for defensive programming and edge-case unit testing.

## Decision Drivers

* Prevent runtime unhandled exceptions and audio glitches from corrupted or unknown inputs.
* Ensure URL query string tampering or obsolete preset files load safely with fallback values.
* Maintain high branch coverage (>70%) across all fallback and validation logic.
* Provide clear requirements for future contributors and AI coding agents.

## Decision Outcome

Chosen standard: **Strict Defensive Input Validation and Mandatory Edge-Case Testing**, defined as follows:

1. **Parsers & Deserializers (`url-preset.js`, `settings-manager.js`, `presets-store.js`)**:
   - All numerical inputs must be clamped between predefined minimum and maximum bounds using helper utilities (`clampInt`, `clampFloat`, `clampNumber`).
   - Unknown synth models, waveforms, scale types, or pattern directions must fall back to stable defaults (`synth`, `sine`, `major`, `up`).
   - Corrupted or invalid note strings must be sanitized or safely ignored without throwing `TypeError`s.
   - All unit test suites must explicitly test:
     - Out-of-bounds numerical inputs (below minimum, above maximum, `NaN`, `Infinity`, `null`, `undefined`).
     - Unknown enum strings / unregistered models.
     - Empty, missing, or malformed data collections.

2. **Dispatchers & Synthesizer Routers (`audio-engine.js`, `pattern-generator.js`)**:
   - `setSynth(type)` and `createOfflineChain()` must handle unknown synth models gracefully by falling back to the basic synthesizer (`synth`).
   - Synth switching unit tests must verify:
     - Strict identity for all registered models.
     - Fallback behavior for nonexistent/unsupported models.

3. **Accessibility & User Interaction (`a11y-navigation.js`, `keyboard-controller.js`)**:
   - Keyboard navigation must support WAI-ARIA Radio Group standards (updating `.checked` and firing `change` events on arrow navigation).
   - Virtual and computer keyboard controllers must ignore inputs when typing inside form fields.

4. **Continuous Quality Gate**:
   - Automated CI testing in `.github/workflows/ci.yaml` evaluates branch coverage and fails if coverage drops below **70%**.

### Positive Consequences

* Robust error resilience: application cannot be crashed by corrupted URLs, legacy presets, or unexpected user typing.
* Comprehensive regression protection locked into CI.
* Clear architectural expectations for human and AI developers.

### Negative Consequences

* Requires writing additional test cases for every new parser or dispatcher added to the codebase.

## Links

* [ADR 0001: Vitest and V8 Coverage Tooling](./0001-vitest-and-v8-coverage-tooling.md)
* [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
* [Vitest Configuration](../../vitest.config.ts)
* [Architecture Guide](../../AGENTS.md)
