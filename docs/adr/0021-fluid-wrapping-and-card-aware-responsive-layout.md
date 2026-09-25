---
status: accepted
date: 2026-09-25
decision-makers: [rapjul, Antigravity]
consulted: []
informed: []
---

# 0021. Fluid Responsive Layout, Control Sizing, and Typography Balancing

## Context and Problem Statement

Web Arpeggiator features an extensive multi-card interface hosting dense synthesizer, pattern, octave, scale, effect, and offline export controls. In PR #69 (`fix/offline-export-tail-release`) and PR #70 (`fix/offline-export-auto-tail`), new controls were introduced to `#offline-export-tail-control` alongside existing export selectors.

When inspecting the application across modern device viewports (from compact mobile smartphones at 375px/390px, to wide smartphones at 430px, intermediate tablets/split-screens at 768px/820px, and large desktop screens at 1280px+), several responsive layout and ergonomic issues arose:
1. **Unwrapped Horizontal Flex Containers**: In `#offline-export-tail-control`, the container used `flex items-center gap-4` without wrapping, and child `<select>` controls were constrained without flexible sizing. On tablets and mobile screens, this caused a 34px horizontal card blowout (`scrollWidth > clientWidth`) and forced horizontal window scrolling.
2. **Unbounded Slider & Control Stretching**: On wide viewports (800px+), range sliders (`input[type="range"]`), the volume unit (VU) meter, the `#interval` dropdown, and the `#notes` input stretched across the entire width of their parent cards. This resulted in poor ergonomics, excessive thumb travel distance, and visual disharmony.
3. **Button Grid Cramping & Full-Width Blowout**:
   - The 9 **Pattern Direction** radio buttons used rigid container breakpoints (dropping to 3 columns only below 300px), causing severe horizontal compression, truncated labels, and awkward multi-line text wrapping on intermediate mobile viewports.
   - The 7 **Octave Shift** radio buttons (`-3` to `+3`) had oversized min-widths and padding, forcing an awkward wrap into uneven rows on mobile screens.
   - The 5 **Waveform** buttons (`Sine`, `Square`, `Sawtooth`, `Triangle`, `Pulse`) stretched to 100% width on the final orphaned button (`Pulse`) when wrapping into a 4+1 layout.
   - **Chord Starter** buttons used a rigid 6-column grid without intermediate responsive steps, overflowing on small screens.
4. **Typographic Orphans & Text Casing Inconsistencies**:
   - Descriptive helper paragraphs across cards suffered from ragged trailing orphan words (e.g., "below.", "seconds.").
   - Card section titles and control labels suffered from mixed casing styles, alternating arbitrarily between Title Case and Sentence case across the offline export and preset management cards.

We need an enforced architectural design standard that ensures fluid responsive wrapping, ergonomic control width limits, balanced button grids, typography orphan prevention, and standardized label casing across all supported viewport breakpoints without regressions.

## Decision Drivers

- Guarantee zero horizontal page overflow and zero card clipping across all standard device viewports from 320px to 4K displays.
- Establish an ergonomic max-width cap for wide controls (range sliders, VU meter, dropdowns, text inputs) while centering them within their parent cards.
- Preserve button padding and legibility by dynamically adding grid rows as container width narrows instead of compressing button text.
- Maintain compact ergonomic scaling for multi-choice octave shift buttons to keep them on a single continuous row on wide containers (>= 280px), while wrapping into a balanced musical 3–1–3 layout on narrow mobile viewports (< 280px).
- Prevent ragged multi-line text wrapping and single-word orphans in headings, button labels, and helper subtitles.
- Harmonize UI text casing to consistent levels (Title Case for cards, control groups, and action buttons; Sentence case for descriptive help text).
- Validate all responsive constraints and casing rules automatically via `Playwright` E2E and unit test suites across a representative multi-viewport matrix (`320px`, `375px`, `390px`, `430px`, `820px`, `1280px`).

## Considered Options

- **Option 1: Static Breakpoint Overrides via Media Queries**: Add targeted `@media (max-width: ...)` rules in CSS for specific mobile screen widths whenever an overflow bug is reported.
- **Option 2: Fixed-Width Desktop Shell with Horizontal Scroll on Mobile**: Enforce a minimum canvas/dashboard width (e.g., 960px) and let mobile browsers zoom or scroll horizontally.
- **Option 3: Fluid Wrapping, Intrinsic Width Capping, Container-Aware Grids, and Balanced Typography**:
  - Implement fluid flex wrapping (`flex-wrap: wrap`) and responsive width constraints (`w-full sm:w-auto min-w-0 max-w-full`) across all multi-control rows.
  - Apply an ergonomic 480px intrinsic width cap (`max-width: 480px; margin-inline: auto; display: block;`) to range sliders, the VU meter, `#interval`, and `#notes`.
  - Use container queries to adapt button grids based on available card space: Pattern Direction drops to 3 columns at container width <= 480px and 2 columns <= 340px; Waveform centers and caps at 140px; Octave Shift uses compact sizing (`min-width: 34px`) to preserve a single row when container width is >= 280px and wraps into a balanced 3–1–3 layout under 280px; Chord Starters use `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`.
  - Use native CSS `text-wrap: balance` on all headings (`h1`–`h6`), button labels, and helper subtitles (`.card-help-text`, `#offline-export-tail-control > p`).
  - Standardize UI text casing into an explicit 4-level hierarchy with Title Case for labels and Sentence case for body paragraphs.

## Decision Outcome

Chosen option: **Option 3 (Fluid Wrapping, Intrinsic Width Capping, Container-Aware Grids, and Balanced Typography)**.

### 1. Fluid Flex Wrapping and Control Capping Architecture
- **Flex Row Fluidity**: Any control row combining `<label>`, `<select>`, `<input>`, or action buttons must declare `flex-wrap: wrap` with distinct column and row gaps (`gap-x-4 gap-y-2`) and allow child inputs to shrink (`min-w-0 max-w-full`).
- **480px Ergonomic Control Cap**: In [`styles/base.css`](../../styles/base.css), [`styles/components.css`](../../styles/components.css), and [`index.html`](../../index.html), all card `input[type="range"]`, `#vu-meter-container`, `#interval`, and `#notes` are bound to `max-width: 480px; margin-inline: auto;` (with `#notes` and `#interval` centered via `max-w-[480px] mx-auto block`, and `#visualizer-zoom` explicitly opting out in [`styles/visualizer.css`](../../styles/visualizer.css) to preserve its `flex-1` toolbar layout). On compact screens (<= 480px), they span 100% of available card width; on wide displays, they remain comfortably reachable and visually aligned.
- **Flexbox Containment**: `#visualizer-viewport` specifies `min-width: 0;` and `#keyboard-visual` specifies `max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;` to guarantee flex parents never expand beyond viewport boundaries during dynamic DOM rendering.

### 2. Button Grid and Row Wrapping Contracts
- **Pattern Direction**: In [`styles/components.css`](../../styles/components.css), container queries drop the grid from 4 columns to 3 columns at `<= 480px`, and to 2 columns at `<= 340px`. This preserves internal button padding and prevents label text from collapsing into 3 cramped lines.
- **Octave Shift**: Shift buttons (`-3` to `+3`) use compact padding (`padding: 0.375rem 0.45rem; min-width: 34px; font-size: 0.875rem;`) and a centered wrapping flex container (`#octave-shift-buttons`). All 7 buttons fit cleanly on a single horizontal row when card container width is `>= 280px`. In compact mobile viewports (<= 375px where available container width is `< 280px`), a container query wraps the buttons into a balanced musical 3–1–3 layout (`[-3, -2, -1]`, `[0]`, `[+1, +2, +3]`) with the root octave centered on its own row.
- **Waveform**: Buttons use centered alignment (`justify-content: center;`) with a maximum width (`max-width: 140px;`). Container queries split the 5 buttons into balanced 3/2 rows at `<= 440px` and 2/2/1 rows at `<= 280px`, preventing full-width blowout on the final `Pulse` button.
- **Chord Starters**: Responsive grid classes `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5` provide 2 columns on mobile, 3 columns on tablet/intermediate viewports, and 6 columns on desktop. Buttons declare `min-w-0 text-center`, `overflow-wrap: anywhere`, and balanced wrapping.

### 3. Typography Balancing, Accessible Sizing, and Hierarchy Standards
- **Accessible Rem-Based Sizing**: Standardize helper descriptions and card subtitles on `text-xs` (`0.75rem`, standard 12px) in [`index.html`](../../index.html), eliminating static, arbitrary `text-[11px]` hardcoded units to preserve browser root font scaling and WCAG accessibility standards.
- **Balanced Text Wrapping**: Native `text-wrap: balance;` is globally applied in [`styles/base.css`](../../styles/base.css) to:
  - All headings (`h1` through `h6`).
  - Control labels (`label`), fieldset legends (`legend`), and collapsible summaries (`summary`).
  - Button text across `.chord-btn`, `.sound-starter-btn`, and primary action triggers.
  - Card helper subtitles (`.card-help-text`, `#offline-export-mode-help`, `#offline-export-tail-control > p`, `#offline-export-duration`).
  - This eliminates ragged word wraps, balances multi-line headings, and prevents awkward 1–2 word orphan lines.
- **Pretty Paragraph Wrapping**: Native `text-wrap: pretty;` is applied to descriptive body paragraphs (`p`) in [`styles/base.css`](../../styles/base.css), evaluating the final lines of multi-line descriptions to prevent isolated trailing single-word orphans without the layout cost of balancing full paragraphs.
- **Text Casing Hierarchy**:
  - **Level 1 (Card & Section Titles)**: Title Case (e.g., `Sound Starters`, `Synthesizer Settings`, `Pattern & Pitch Configuration`, `Effects Chain`, `Offline Audio Export`, `Preset Management`).
  - **Level 2 (Control Group Labels & Selectors)**: Title Case (e.g., `Audio Export Mode`, `Pattern Cycles:`, `Effects Tail Strategy:`, `Effects Tail:`, `Note Duration`, `Pattern Direction`, `Scale Quantization`).
  - **Level 3 (Buttons & Interactive Triggers)**: Title Case (e.g., `Export Audio`, `Export MIDI (.mid)`, `Include Effects Tail`, `Save Preset`, `Load Preset`, `Browser Storage Recovery`).
  - **Level 4 (Descriptive Subtitles & Guidance Text)**: Sentence case (e.g., "Auto estimates the envelope release and active delay, reverb, and chorus decay, capped at 10 seconds. Custom uses the duration below.").

### 4. Mobile Gutter Tightening and Responsive Spacing Chain Architecture
- **Horizontal Chrome Rebalancing**: On compact mobile screens (`< 640px`), triple-nested desktop padding (`body p-4`, `#app-main p-8`, and card `p-4`) consumed 112px of total horizontal chrome, leaving only 263px for interactive controls on a 375px display (iPhone SE).
- **Middle-Ground Responsive Spacing Chain (Between Default Desktop Padding and Zero Padding)**:
  - `body`: `px-2 pt-2 sm:p-4` (8px mobile padding, 16px desktop padding, naturally omitting mobile bottom padding so element specificity applies cleanly).
  - `#app-main`: `p-4 sm:p-8 gap-4 sm:gap-6` (16px grid padding & 16px card gaps on mobile; 32px padding & 24px gaps on desktop).
  - Card `<section>` elements: `p-3 sm:p-4` (12px padding on mobile, 16px desktop; `#preset-management-section` uses `p-4 sm:p-5`).
  - Sticky Transport Clearance: In [`styles/base.css`](../../styles/base.css), `@media (max-width: 639px) { body { padding-bottom: calc(var(--ui-mobile-bar-height) + env(safe-area-inset-bottom, 0px)); } }` cleanly supplies the fixed transport clearance with standard element specificity, without requiring `!important`.
- **Usable Content Area & Visual Elimination of Cutoffs**:
  - Reclaims 40px of wasted horizontal chrome (72px total chrome vs. 112px previously).
  - Expands card content width from 263px to 303px at 375px viewport (iPhone SE), completely eliminating virtual keyboard horizontal scroll cutoff (2-octave piano keyboard renders 100% horizontally without scrollbars).
  - Preserves an 8px edge safety margin to prevent accidental edge gestures (iOS swipe-back / Android drawer swipes).
  - Reduces mobile page height by ~800px (~11% less scrolling, ~1.5 screenfuls saved).

### Consequences

- Good, because horizontal scrollbars and card overflow bugs are eliminated across all mobile, tablet, and desktop screens.
- Good, because mobile screen space is significantly expanded, eliminating virtual piano keyboard cutoffs on 375px viewports while retaining edge swipe safety.
- Good, because range sliders, dropdowns, and VU meters have ergonomic touch and mouse targets that do not blow out on widescreen monitors.
- Good, because button groups preserve internal padding, visual balance, and icon alignment without clipping.
- Good, because typographic balancing prevents awkward orphans across dynamic card subtitles.
- Good, because text casing is standardized, professional, and validated by unit parity tests.
- Neutral, because new controls and cards added in the future must adhere to the 480px width cap and Title Case conventions.

### Confirmation

Automated `Playwright` E2E tests in [`tests/e2e/dashboard-layout.test.ts`](../../tests/e2e/dashboard-layout.test.ts) test all responsive constraints across a multi-viewport matrix:
- **320px**: Ultra-compact mobile smartphone.
- **375px**: Compact smartphone (iPhone SE).
- **390px**: Standard mobile smartphone (iPhone 12/13/14).
- **430px**: Large smartphone (iPhone 16/17 Pro Max).
- **820px**: Intermediate tablet / split-screen landscape (iPad Air).
- **1280px**: Desktop workstation monitor.

Unit parity tests in [`tests/unit/dom-parity.test.ts`](../../tests/unit/dom-parity.test.ts) assert that Level 2 control group labels follow Title Case formatting.

## Links

- [ADR 0007: Semantic Theme Tokens and Modular Styles](./0007-semantic-theme-tokens-and-modular-styles.md)
- [ADR 0019: Recommended Effects Tail Strategy](./0019-recommended-effects-tail-strategy.md)
- [Architecture Guide](../architecture.md)
