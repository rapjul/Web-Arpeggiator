---
status: accepted
date: 2026-09-23
decision-makers: [rapjul, Antigravity]
consulted: []
informed: []
---

# 0017. Zero-Stderr Test Runner Execution and Diagnostic Log Assertion Policy

## Context and Problem Statement

As the Web Arpeggiator test suite expanded to test defensive error handling, failure recoveries, and hostile input conditions, tests exercising fallback code paths inadvertently flooded the test runner console output with `console.error` and `console.warn` emissions. 

While these logs indicated that defensive recovery mechanisms were functioning as designed in production code, emitting unhandled error messages to `stderr` during normal test execution creates severe problems:
1. **Low Signal-to-Noise Ratio**: Terminal noise desensitizes developers and `CI` watchers to actual unexpected errors, deprecations, and audio context failures.
2. **Ambiguous Test Results**: A test suite may report all tests passing while displaying dozens of stack traces and red error messages, causing uncertainty during audits and pull request reviews.
3. **Incomplete Error Assertions**: When a test permits `console.error` to execute unintercepted, it fails to verify that the application logged the expected diagnostic message, log level, and error payload.

We need an enforced architectural testing standard that eliminates test runner `stderr` pollution while mandating explicit verification of diagnostic logs on negative code paths.

## Decision Drivers

- Maintain a clean, 100% signal-to-noise ratio in local `Vitest` runs and GitHub Actions `CI` pipelines.
- Verify that defensive catch blocks and fallback paths properly record diagnostic diagnostics with the correct log level (`error` vs `warn`).
- Establish consistent patterns for log interception, dependency injection, and spy cleanup across all unit test suites.
- Provide unambiguous guidelines for human contributors and AI coding agents.

## Considered Options

- **Option 1: Global console suppression during tests**: Globally mock or silence `console.error` and `console.warn` in a setup file (e.g., `tests/setup.ts`).
- **Option 2: Explicit log interception and assertion per test suite**: Require tests exercising error conditions to intercept logs (via injectable `logger` dependencies or scoped spies) and assert on the diagnostic emission.
- **Option 3: Tolerate expected stderr output**: Accept terminal log pollution as inevitable during negative condition testing.

## Decision Outcome

Chosen option: **Option 2 (Explicit log interception and assertion per test suite)**, because global suppression (Option 1) hides genuine unexpected runtime errors and regressions, while tolerating noise (Option 3) erodes test suite readability and confidence.

The standard defines the following mandatory requirements:

### 1. Zero Unhandled Stderr Policy
- Test suites must run with zero unhandled `stderr` or console noise.
- Any test that triggers an intentional `console.error` or `console.warn` must intercept the call.

### 2. Mandatory Diagnostic Assertions
- Tests intercepting a diagnostic log must assert that the expected log was invoked with the appropriate message string, regular expression, or error context:
  ```typescript
  expect(logger.error).toHaveBeenCalledWith(
      "Failed to parse preset:",
      expect.any(Error),
  );
  ```
- This guarantees that errors are neither silently swallowed nor misdiagnosed.

### 3. Injectable Logger Preference
- Production controllers and managers with logging requirements should accept an optional `logger` dependency (defaulting to global `console`):
  ```javascript
  export function createPresetWorkflowController(dependencies) {
      const { logger = console } = dependencies;
      // ...
      logger.error?.("Failed to copy share link:", error);
  }
  ```
- Test fixtures can then pass a mock logger (`{ warn: vi.fn(), error: vi.fn() }`), avoiding global mutations entirely.

### 4. Bounded Spy Lifecycle
- When testing modules that log directly to global `console`, tests must spy on `console.error` or `console.warn` and restore the spy in a `finally` block or test teardown hook:
  ```typescript
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
      // Execute error-path under test
      expect(consoleErrorSpy).toHaveBeenCalledWith("AudioContext failed to start/resume:", expect.any(Error));
  } finally {
      consoleErrorSpy.mockRestore();
  }
  ```
- This ensures an unexpected throw in the test cannot leak a silenced console spy into subsequent tests.

### Positive Consequences

- Clean terminal output: test runs finish with 100% green status and 0 extraneous log lines.
- Complete behavioral testing: diagnostic logs are treated as first-class observable contracts of defensive design.
- Immediate detection of regressions: any unexpected `console.error` or `console.warn` immediately stands out.

### Negative Consequences

- Requires writing explicit spy or mock logger setup for every negative condition test case.

## Links

- [ADR 0001: Vitest and V8 Coverage Tooling](./0001-vitest-and-v8-coverage-tooling.md)
- [ADR 0003: Defensive Input Validation and Edge-Case Testing Policy](./0003-defensive-input-validation-and-edge-case-testing-policy.md)
- [ADR 0004: Strict Type Safety and Meaningful Behavioral Testing](./0004-strict-type-safety-and-meaningful-behavioral-testing.md)
- [Vitest Configuration](../../vitest.config.ts)
- [Architecture Guide](../../AGENTS.md)
