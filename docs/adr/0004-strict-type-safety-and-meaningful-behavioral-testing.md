# 0004. Strict Type Safety, Meaningful Behavioral Testing, and Explicit-Any Prohibition

* Status: accepted
* Deciders: rapjul, Antigravity
* Date: 2026-08-29

## Context and Problem Statement

As the Web Arpeggiator test suite expanded to achieve rigorous branch and statement coverage thresholds, loose type assertions (such as `as any`, `: any`, and `<any>`) were occasionally introduced in unit test fixtures. While `as any` allows rapid creation of partial DOM or audio context mock objects, it completely disables TypeScript compiler type-checking, obscures interface drift between tests and production implementations, and allows silent bugs (such as property renames or misspelled keys) to pass undetected.

Furthermore, chasing arbitrary coverage percentages on defensive UI/Canvas layers can incentivize writing artificial "mock-only" tests that test mock mechanics rather than real application behavior.

We need an enforced project standard that guarantees strict type safety, prohibits explicit `any` assertions, and establishes guidelines for writing genuinely meaningful behavioral tests.

## Decision Drivers

* Maintain type integrity and compile-time contract verification across all source files and test suites.
* Prevent interface drift between production source modules and test fixture mocks.
* Establish clear criteria distinguishing meaningful behavioral tests from artificial mock branch-padding.
* Provide automated linter and CI quality gates that immediately catch explicit `any` usage.

## Decision Outcome

Chosen standard: **Strict Type Safety and Meaningful Behavioral Testing Policy**, defined as follows:

1. **Zero-Tolerance for Explicit `any` (`noExplicitAny`)**:
   - The use of `any`, `as any`, or `<any>` is strictly prohibited across all source files (`src/`) and test suites (`tests/`).
   - Enforced by the Biome linter via `"suspicious": { "noExplicitAny": "error" }` in `./biome.json` and validated on every pull request.

2. **Strongly Typed Test Fixture Pattern**:
   - Test suites must derive mock fixture types directly from the functions and interfaces under test:
     ```typescript
     // Derive exact context parameter types from module factories
     type AudioEngineContext = Parameters<typeof createAudioEngine>[0];
     type MockDom = AudioEngineContext["dom"];
     type MockActions = AudioEngineContext["actions"];
     ```
   - Partial mocks must use TypeScript utility types (e.g. `Partial<T>`, `Pick<T, K>`) or explicit mock interfaces, ensuring that all fixture properties conform to the actual production contract.
   - When hostile boundary inputs or invalid enum values must be tested against defensive guards, tests must use typed assertions (such as `as Parameters<typeof fn>[0]` or `as unknown as TargetType`) rather than untyped `any`.

3. **Meaningful Behavioral Testing Standards**:
   - Tests must assert observable functional outcomes, state transitions, audio routing, mathematical transformations, or defensive error recovery (e.g., audio decode failures, IndexedDB unavailability, network retry exhaustion, corrupted URL presets).
   - Contributors and AI agents must NOT write low-value tests whose sole purpose is to execute both branches of optional DOM element existence checks (`if (dom.someSlider) ...`) via dummy mock toggles.
   - Quality gates balance thoroughness with test maintainability:
     - **Statements**: $\ge 80\%$ per-file
     - **Branches**: $\ge 70\%$ per-file
     - **Functions**: $\ge 80\%$ per-file
     - **Lines**: $\ge 80\%$ per-file

### Positive Consequences

* Compile-time detection of mock and interface mismatches during refactors.
* Clean, self-documenting test fixtures that mirror production contracts.
* High signal-to-noise ratio in test suites: every test validates real user-facing behavior or defensive resilience.
* Automated CI prevention of accidental type-erasure.

### Negative Consequences

* Requires defining explicit TypeScript fixture types or helper factories for unit test context objects.

## Links

* [ADR 0001: Vitest and V8 Coverage Tooling](./0001-vitest-and-v8-coverage-tooling.md)
* [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
* [ADR 0003: Defensive Input Validation and Edge-Case Testing Policy](./0003-defensive-input-validation-and-edge-case-testing-policy.md)
* [Biome Configuration](../../biome.json)
* [Vitest Configuration](../../vitest.config.ts)
* [Architecture Guide](../../AGENTS.md)
