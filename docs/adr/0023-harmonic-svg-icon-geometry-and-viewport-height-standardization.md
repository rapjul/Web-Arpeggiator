---
status: accepted
date: 2026-10-02
decision-makers: [rapjul, Antigravity]
consulted: []
informed: []
---

# 0023. Harmonic SVG Icon Geometry, Viewport Height Standardization, and Asset Parity

## Context and Problem Statement

Web Arpeggiator displays visual icons across two primary control surfaces: the **Pattern Direction** selector and the **Synthesizer Waveform** selector. These icons exist both inline within `index.html` (for direct DOM rendering with Tailwind CSS `currentColor` inheritance) and as standalone SVG files in `public/images/patterns/` and `public/images/waveforms/` (for modular assets, offline documentation, PWA previews, and OS file managers).

A comprehensive visual and mathematical audit revealed several visual discrepancies, proportional squashing, and asset integrity issues:

1. **Duplicate Icon Bug**: The `Random Step` pattern direction button erroneously shared the identical coordinate path of `Down-Up (Repeated)`, creating visual confusion and misrepresenting the step-and-hold musical behavior.
2. **Viewport Squashing and Disproportionate Margins**: Linear pattern icons (`Up`, `Down`, `Up-Down`, `Down-Up`) and repeated patterns utilized only $12.5\%\text{--}44\%$ of the 32px viewport height (some spanning merely 4 to 14 coordinate units), creating large empty vertical margins and causing them to appear squashed next to synthesis waveform buttons.
3. **Waveform Geometry and Duty Cycle Ambiguity**:
   - **`Sawtooth`**: Displayed three cramped cycles rather than the classic synthesizer convention of two bold, spacious cycles.
   - **`Triangle`**: Displayed a multi-cycle waveform rather than a single pure bipolar oscilloscope cycle with constant slope and clean zero-crossing entry and exit.
   - **`Square` vs. `Pulse`**: Lacked clear visual distinction between a symmetrical 50% square wave and a narrow pulse wave.
   - **`Sine`**: The initial path exhibited degenerate boundary control points ($P_0 = P_1$ and $P_2 = P_3$ resulting in zero-velocity boundary singularities) and stretched across $X \in [2, 30]$ while all other waveforms spanned $X \in [4, 28]$. An intermediate refactoring introduced collinear control points through the center crossover, causing the transition between crest and trough to render as a straight diagonal line.
4. **Temporal Progression Inversion**: `Down` and `Down-Up` paths were drawn right-to-left temporally, reversing standard left-to-right musical timeline progression.
5. **Absence of Automated Viewport and Parity Gates**: The test suite lacked automated verification for SVG icon viewport utilization, icon path uniqueness, and markup-to-asset parity.

## Decision Drivers

- Standardize vertical viewport utilization across all path-based pattern and waveform icons ($\ge 71.875\%$ [$\ge 23$ units] for path-based patterns, $75\%$ [$24$ units, $Y \in [4, 28]$] for waveforms; circle-based octave cycles span 21–22 units [$65.6\%\text{--}68.75\%$]).
- Resolve the `Random Step` duplicate bug with an authentic Sample-and-Hold stepped bar glyph.
- Establish clear, authentic synthesizer waveform iconography with distinct 50% square and 25% pulse duty cycles.
- Ensure the `Sine` waveform icon exhibits continuous active curvature across four congruent quadrants with broad horizontal crests and a steep zero-crossing transition, free of straight-line defects.
- Guarantee left-to-right temporal drawing progression ($X_{\text{start}} < X_{\text{end}}$).
- Synchronize inline markup with standalone SVG assets, including fallback `:root { color: #38bdf8; }` styling for OS and Markdown previews.
- Implement a dependency-free automated test suite validating rendered Bézier curve extrema, path uniqueness, and asset parity.

## Considered Options & Icon Design Specifications

### 1. Pattern Direction Icons ($32\times32$ Viewport)

- **`Random Step` (`d="M3 20 H8 V4 H14 V28 H20 V10 H26 V18 H29"`)**:
  - *Design*: Replaced the duplicated `Down-Up (Repeated)` path with a 4-step Sample-and-Hold waveform featuring staggered horizontal plateaus connected by vertical step transitions.
  - *Bounds*: $X \in [3, 29]$ (width 26), $Y \in [4, 28]$ (height 24 units / 75%).
  - *Rationale*: Visually communicates discrete, un-interpolated pitch steps characteristic of sample-and-hold circuits.
- **`Random Cycle` (`d="M3 8h5c8 0 8 16 16 16h5 M24 20l5 4-5 4 M3 24h5c8 0 8-16 16-16h5 M24 4l5 4-5 4"`)**:
  - *Design*: Dual interleaved S-curved cycle trajectories with directional arrowheads; the descending cycle enters at $(3, 8)$ and terminates at $(29, 24)$, while the mirrored ascending cycle enters at $(3, 24)$ and terminates at $(29, 8)$.
  - *Bounds*: Rendered coordinates and Bézier curves span $X \in [3, 29]$ and $Y \in [4, 28]$ (24 units / $75\%$ height).
  - *Rationale*: Depicts cyclical shuffle playback of all active notes within each pattern cycle across dual crossover paths.
- **`Random Walk` (`d="M3 16 C 5 8, 7 4, 10 4 C 13 4, 15 28, 18 28 C 21 28, 23 10, 26 10 C 27 10, 28 14, 29 14"`)**:
  - *Design*: Multi-segment cubic Bézier S-curves entering at $(3, 16)$, arcing to a crest at $(10, 4)$, plunging to a trough at $(18, 28)$, and settling at $(29, 14)$.
  - *Bounds*: Rendered mathematical extrema tangentially touch $Y = 4$ and $Y = 28$ ($75\%$ viewport height).
  - *Rationale*: Represents smooth Brownian motion / constrained adjacent-note wander.
- **`Drunkard's Walk` (`d="M3 18 Q 7 13, 11 17 T 16 4 L 22 28 Q 26 21, 29 16"`)**:
  - *Design*: Smooth quadratic curve (`Q`) reflected across the running cursor (`T`) to apex $(16, 4)$, followed by a dramatic reflected leap to $(22, 28)$ and quadratic recovery.
  - *Bounds*: $X \in [3, 29]$, $Y \in [4, 28]$ ($75\%$ viewport height).
  - *Rationale*: Captures erratic wander with sudden, unpredictable leaps.
- **`Up` (`d="M4 28 L28 4"`) & `Down` (`d="M4 4 L28 28"`)**:
  - *Design*: Clean diagonal trajectories spanning $X \in [4, 28]$ and $Y \in [4, 28]$ (24 units / 75% height).
  - *Temporal Invariant*: Both start at $X = 4$ and terminate at $X = 28$, ensuring left-to-right temporal progression.
- **`Up-Down` (`d="M4 28 L16 4 L28 28"`) & `Down-Up` (`d="M4 4 L16 28 L28 4"`)**:
  - *Design*: Symmetrical V-pyramids with single-point exclusive apex $(16, 4)$ or valley $(16, 28)$, spanning 24 units in height.
- **`Up-Down (Repeated)` (`d="M3 28 H7 L13 4 H19 L25 28 H29"`) & `Down-Up (Repeated)` (`d="M3 4 H7 L13 28 H19 L25 4 H29"`)**:
  - *Design*: Replaced malformed coordinate syntax with prominent trapezoidal shelves (`H19`), providing a wide 6-unit horizontal plateau at apex and base.
  - *Rationale*: Clearly distinguishes repeated boundary note playback from exclusive endpoint patterns.
- **`Octave Cycle` (`octaveCycle`, `octaveCycleReverse`, `octaveCyclePingPong`)**:
  - *Design*: Composed of discrete SVG `<circle>` nodes arranged across three octave tiers ($C_y \in [8, 24]$ with radius $r \in [2.5, 3.0]$), rendering 21–22 units of visual ink span ($65.6\%\text{--}68.75\%$ viewport height).
  - *Rationale*: Employs discrete circular pitch beads rather than continuous stroke paths to convey stepping across multiple octave registers.

### 2. Synthesizer Waveform Icons ($32\times32$ Viewport)

- **`Sine` (`d="M4 16 C5 8 7 4 10 4 C13 4 15 8 16 16 C17 24 19 28 22 28 C25 28 27 24 28 16"`)**:
  - *Design*: Four congruent, dynamically curving cubic Bézier quadrants.
    - $Q_1$ (`(4, 16) → (10, 4)`): Enters at $(4, 16)$ with slope 8, bending smoothly via control points $(5, 8)$ and $(7, 4)$ into a 3-unit horizontal tangent at $(10, 4)$.
    - $Q_2$ (`(10, 4) → (16, 16)`): Exact geometric mirror of $Q_1$, departing $(10, 4)$ via tangent handle $(13, 4)$ and accelerating through second control point $(15, 8)$ into a steep slope 8 zero-crossing at $(16, 16)$.
    - $Q_3$ (`(16, 16) → (22, 28)`): Exact point reflection of $Q_2$, departing $(16, 16)$ at slope 8 via control point $(17, 24)$ and rounding into the trough at $(22, 28)$ via tangent handle $(19, 28)$.
    - $Q_4$ (`(22, 28) → (28, 16)`): Exact geometric mirror of $Q_3$, departing $(22, 28)$ via tangent handle $(25, 28)$ and arcing smoothly via control point $(27, 24)$ to $(28, 16)$.
  - *Elimination of Straight-Line Defect*: Replaced earlier collinear control points with active dynamic curvature ($\kappa \approx 0.089$, ~3x higher curvature), ensuring the transition through zero-crossing matches the curvature of the outer arcs.
  - *Bounds*: $X \in [4, 28]$ (24 units wide, 4px margins), $Y \in [4, 28]$ (24 units / 75% height).
- **`Sawtooth` (`d="M4 28 L16 4 V28 L28 4 V28"`)**:
  - *Design*: Two symmetrical upward ramps with vertical flybacks.
  - *Bounds*: $X \in [4, 28]$ (12px cycle width), $Y \in [4, 28]$ (24 units / 75% height).
- **`Triangle` (`d="M4 16 L10 4 L22 28 L28 16"`)**:
  - *Design*: One pure bipolar oscilloscope cycle with constant slope and clean zero-crossing entry/exit at $(4, 16)$ and $(28, 16)$.
  - *Bounds*: $X \in [4, 28]$, $Y \in [4, 28]$ (24 units / 75% height).
- **`Square` (`d="M4 28 V4 H10 V28 H16 V4 H22 V28 H28"`)**:
  - *Design*: Two symmetrical 50% duty cycles (High = 6px, Low = 6px).
  - *Bounds*: $X \in [4, 28]$, $Y \in [4, 28]$ (24 units / 75% height).
- **`Pulse` (`d="M4 28 V4 H7 V28 H16 V4 H19 V28 H28"`)**:
  - *Design*: Two distinct narrow 25% duty cycles (High = 3px, Low = 9px).
  - *Rationale*: Visually clarifies the harmonic difference between standard square and narrow pulse waveforms.

## Automated Verification Contract

The automated test suite in `tests/unit/svg-asset-integrity.test.ts` enforces the following invariants:

1. **Exact Mathematical Bézier Extrema**: Evaluates stationary points $B'(t) = 0$ for $t \in [0, 1]$ via quadratic formula discriminant analysis (`getCubicExtrema`, `getQuadraticExtrema`) rather than relying on control point bounding boxes, ordering curve endpoints chronologically after any interior stationary values so terminal coordinates represent true path boundaries.
2. **Smooth Quadratic Cursor Tracking**: Tracks the running cursor and reflects previous control points for `T` / `t` commands.
3. **SVG Number Grammar, Mandatory Initial Moveto & Strict Command/Token Validation**: Supports scientific notation exponents, explicit leading signs, and omitted leading zeros, requires path definitions to begin strictly with a `moveto` command (`M` or `m`) per W3C SVG specifications, and asserts that path definitions contain legal command sequences with non-empty arguments for all parameter-requiring commands, valid numbers, and clean separators, rejecting non-moveto initial commands, parameterless commands, unconsumed input, stray tokens, or invalid characters.
4. **Canonical Path Normalization (`canonicalizeResolvedGeometry`)**: Converts relative and absolute command variants into canonical absolute geometry commands, expands multi-pair `moveto` commands into implicit line segments per W3C SVG specifications, collapses redundant consecutive collinear line segments, and normalizes traversal direction so forward and reversed identical strokes yield identical keys.
5. **ViewBox Dimensions, Origin, Geometry Bounds, Comment Exclusion & Transform Prohibition**: Validates complete SVG `viewBox` coordinates (`0 0 32 32`), excludes HTML/XML comments via iterative inside-out sanitization (`while` loop removing nested `<!-- ... -->` blocks) to prevent dead or nested markup from being measured as live geometry, asserts that rendered path coordinates (including effective 2-unit stroke extents) and circle extents remain strictly within visible viewport bounds $[0, 32]$ without clipping, verifies that no containing `<svg>`, `<path>`, or `<circle>` elements declare `transform` attributes (preserving untransformed 1:1 viewport coordinate systems across both inline and standalone assets), and calculates vertical span ratios relative to `viewBox.height` to enforce the $\ge 71.875\%\text{--}75\%$ height utilization contract across path-based icons ($\ge 23\text{--}24$ units) and $\ge 65.625\%$ across circle-based octave icons ($\ge 21$ units).
6. **Universal Visual Uniqueness**: Registers all 18 icons (10 path-based patterns, 5 waveforms, and 3 circle-based octave patterns canonicalized via sorted geometric signatures) in a unified duplicate detection registry, asserting zero duplicate visual representations.
7. **Bidirectional Presentation Attributes, Stylesheet Parity & Theming**: Verifies path definition matching and `0 0 32 32` `viewBox` conformance between inline HTML markup and standalone SVG files. Asserts full presentation attribute parity across both formats: zero `transform` attributes on containing `<svg>`, `<path>`, or `<circle>` elements, `fill="none"` on containing `<svg>` elements (with `class="stroke-current"` on inline `<svg>` elements), `stroke="currentColor"`, `stroke-width="2"`, `fill="none"`, `stroke-linecap="round"`, and `stroke-linejoin="round"` across standalone `<path>` elements, `stroke-linecap="round"` and `stroke-linejoin="round"` across inline `<path>` elements, and `:root { color: #38bdf8; }` fallback styling in all standalone assets. Verifies that `./styles/components.css` defines `stroke-width: 2` across every individual button SVG selector (`.waveform-btn svg`, `.pattern-btn svg`, and `.octave-btn svg`), tracking declarations in cascade order to ensure each selector resolves to 2 and rejecting missing declarations or subsequent overriding widths. Also verifies circle styling parity (`fill="var(--ui-accent-soft)"` inline and `fill="currentColor"` standalone).
8. **Per-Trajectory Temporal Progression & Monotonic Segment Progression**: Validates that every directional progression trajectory across all subpaths progresses strictly from left to right ($X_{\text{start}} < X_{\text{end}}$), while asserting that every individual segment within the trajectory progresses monotonically forward ($X_s \le X_e$ with non-negative Bézier $X$ derivatives $B'(t) \ge 0$), preventing retrograde loops or interior right-to-left backtracking.

## Consequences

- All 15 path-based pattern direction and synthesis waveform icons utilize $\ge 71.875\%\text{--}75\%$ vertical viewport height ($\ge 23\text{--}24$ units), eliminating squashing and empty padding (with the 3 circle-based octave-cycle icons spanning 21–22 units / $65.6\%\text{--}68.75\%$, bounded by circle radii).
- The `Random Step` duplicate bug is permanently resolved with an authentic Sample-and-Hold glyph.
- Waveforms clearly convey their acoustic duty cycles (50% Square vs. 25% Pulse).
- The `Sine` wave features continuous curvature across four congruent quadrants with zero straight-line artifacts.
- All linear and generative patterns strictly adhere to left-to-right temporal drawing.
- Standalone SVGs render cleanly in OS file managers, image viewers, and documentation with theme-aware sky-blue fallbacks.
- The automated test suite catches geometry regressions, duplicate paths, or viewport shrinking in CI in under 30ms without extra dependencies.

### Negative / Trade-offs

- Custom SVG path parser in `tests/unit/svg-asset-integrity.test.ts` requires maintenance if new SVG command types (e.g., elliptical arcs `A`) are added in the future.

### Neutral

- Viewport coordinates remain within the standard $32\times32$ box, avoiding changes to UI button layouts, Tailwind utility classes, or SVG viewBox configurations.

## Links

- [Architecture Guide](../architecture.md)
- [Pattern Directions Guide](../pattern-directions.md)
- [Styling Guide](../styling-guide.md)
- [ADR 0007: Semantic Theme Tokens and Modular Styles](./0007-semantic-theme-tokens-and-modular-styles.md)
- [ADR 0021: Fluid Responsive Layout, Control Sizing, and Typography Balancing](./0021-fluid-wrapping-and-card-aware-responsive-layout.md)
- [Automated Integrity Test Suite](../../tests/unit/svg-asset-integrity.test.ts)
