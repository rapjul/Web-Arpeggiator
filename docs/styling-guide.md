# Web Arpeggiator Styling & Design System Guide

This guide documents the styling architecture, design tokens, typography casing hierarchy, responsive layout patterns, and control ergonomic conventions used across the Web Arpeggiator application.

---

## 1. Architecture & Modular Stylesheet Structure

The application couples Tailwind CSS utilities for high-level layouts with a modular CSS architecture in `styles/` driven by semantic CSS custom properties (design tokens).

The stylesheet manifest in `styles.css` imports modular sheets in cascade order:

```css
@import "tailwindcss";
@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/components.css";
@import "./styles/visualizer.css";
@import "./styles/keyboard.css";
@import "./styles/features.css";
```

### Module Responsibilities

| File | Purpose | Key Responsibilities |
| :--- | :--- | :--- |
| `styles/tokens.css` | Design Tokens | Semantic color tokens (`--ui-surface`, `--ui-accent`, `--ui-border`), typography, focus rings, shadows, and z-index layers. |
| `styles/base.css` | Base Elements & Controls | Range sliders, numeric inputs, disabled control styles, native selects, `<details>` accordion summaries, and document-level reset rules. |
| `styles/components.css` | Component & Control Patterns | Pattern button subgrids, octave shift/range button keypads, Peak VU meter, toast notifications, custom CSS tooltips, and container queries. |
| `styles/visualizer.css` | Canvas Visualizer | Oscilloscope, FFT, and Loop Map canvas containers and footer controls. |
| `styles/keyboard.css` | Virtual Piano Keyboard | Natural/accidental key sizing, active highlight styling, and responsive layout. |
| `styles/features.css` | Application Features | Sticky transport bar, dialogs, chord conflict resolution modal, and startup overlays. |

---

## 2. Typography & Text Casing Hierarchy Standard

To maintain visual order and avoid typographic clutter across cards, modals, and toolbars, the application enforces a strict 4-tier text casing standard:

| Hierarchy Level | UI Role & Elements | Casing Standard | Formatting Rules | Examples |
| :--- | :--- | :--- | :--- | :--- |
| **Level 1** | Card titles, modal headers, major section headings (`h1`, `h2`, `h3`, card `<summary>`) | **Title Case** | High contrast, bold/semibold, no all-caps | `Pattern`, `Transport`, `Synthesis Engine`, `Audio Export`, `Sound Starters` |
| **Level 2** | Sub-sections, fieldset legends, control group headers, form labels (`legend`, `label`, group headers) | **Title Case** | Neutral-subtle, medium/semibold, **never all-caps / no `uppercase`** | `Linear Patterns`, `Octave Cycles`, `Generative & Random`, `Octave Shift`, `Octave Layers`, `Root Note`, `Scale Type`, `Audio Export Mode` |
| **Level 3** | Interactive triggers, button labels, select options, tabs (`button`, `option`, `.pattern-btn span`) | **Title Case** | Action-oriented, semibold, concise | `Reshuffle Pattern`, `Start Audio`, `Save Preset`, `Reversed Octaves`, `Drunkard's Walk`, `Harmonic Minor` |
| **Level 4** | Descriptive guidance, helper text, radio descriptions, badges, tooltips (`p`, `.text-muted`, tooltips) | **Sentence case** | Dimmed/muted, regular weight, natural sentence syntax | `Space-separated note names (e.g. C4 E4 G4)`, `Seamless loop (WAV)`, `Include effects tail`, `Auto decay tail: ~4.5s` |

> [!IMPORTANT]
> **Sub-sections Never Use All-Caps**: Group headers (such as `Linear Patterns`, `Octave Cycles`, `Generative & Random`) must be styled with strict **Title Case** using `font-semibold text-gray-300 text-xs`, avoiding all-caps or Tailwind's `uppercase` utility.

---

## 3. Spacing System & Responsive Breakpoint Chain

The dashboard uses a balanced, middle-ground responsive spacing chain that maximizes usable card content width on narrow mobile viewports while preserving comfortable margins on desktop screens.

### Viewport Spacing Breakdown

| Spacing Dimension | `< 640px` (Mobile) | `>= 640px` (Desktop / Tablet) |
| :--- | :--- | :--- |
| **Body Padding** | `px-2 pt-2` (8px sides / top) | `sm:p-4` (16px all sides) |
| **Body Bottom Clearance** | `80px + safe-area-inset-bottom` | `16px` |
| **Dashboard Container** | `p-4` (16px) | `sm:p-8` (32px) |
| **Grid Gap** | `gap-4` (16px) | `sm:gap-6` (24px) |
| **Card Padding** | `p-3` (12px) | `sm:p-4` (16px) |

### Usable Card Content Width Targets

- **320px Viewport**: Usable card width is `>= 246px`.
- **375px Viewport** (e.g. iPhone SE): Usable card width is `>= 300px`, allowing the virtual piano keyboard to render without horizontal scroll clipping.
- **Fixed Mobile Transport Clearance**: The `body` element maintains dynamic bottom padding on viewports `< 640px` via:

  ```css
  padding-bottom: calc(var(--ui-mobile-bar-height) + env(safe-area-inset-bottom, 0px));
  ```

---

## 4. Container Query Patterns & Modular Keypads

Controls are styled relative to their immediate card container width (`@container`) rather than viewport media queries, ensuring robust behavior when cards wrap across different grid spans.

### A. Pattern Direction Subgrids

The 13 pattern directions are divided into 3 semantic sub-sections (`Linear Patterns`, `Octave Cycles`, `Generative & Random`). Buttons within each sub-section are arranged using a responsive CSS grid:

```css
.pattern-subgrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
  width: 100%;
}

@container (max-width: 480px) {
  .pattern-subgrid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@container (max-width: 340px) {
  .pattern-subgrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

### B. Octave Keypad Layout

- **Wide Container (`>= 280px`)**: Octave shift (`-3` to `+3`) and octave range (`1` to `5`) buttons stretch horizontally to fill the row using `flex: 1 1 0px` and responsive padding:

  ```css
  .octave-btn {
    flex: 1 1 0px;
    min-width: 0;
    width: 100%;
    max-width: 6rem;
    min-height: 44px;
    padding: 0.375rem 0.25rem;
    font-size: 0.875rem;
    font-weight: 600;
  }

  @container (min-width: 360px) {
    .octave-btn {
      padding: 0.45rem clamp(0.35rem, 1.5cqi, 0.75rem);
    }
  }
  ```

- **Narrow Container (`< 280px`)**: Buttons form a balanced 3-1-3 musical keypad without empty side voids:
  - **Row 1 (`-3`, `-2`, `-1`)**: 3 equal buttons (`flex: 1 1 calc(33.333% - 0.375rem)`).
  - **Row 2 (`0`)**: 1 centered anchor pill (`flex: 1 1 100%; max-width: 160px;`).
  - **Row 3 (`+1`, `+2`, `+3`)**: 3 equal buttons (`flex: 1 1 calc(33.333% - 0.375rem)`).
  - **Octave Layers (`1` to `5`)**: 3 buttons in Row 1 (`calc(33.333% - 0.375rem)`), 2 buttons in Row 2 (`calc(50% - 0.375rem)`).

---

## 5. Control Ergonomics & Accessibility Invariants

### Range Sliders (`input[type="range"]`)

- **Alignment**: Flush left within the card container (`margin-inline: 0 auto;`).
- **Vertical Separation**: `margin-top: 0.625rem;` (`10px`) ensures slider thumbs and tracks do not crowd the label or helper text above.
- **Maximum Width**: Capped at `max-width: 480px; width: 100%;` for ergonomic reachability across ultra-wide displays.

### Peak VU Meter (`#vu-meter-container`)

- **Alignment**: Flush left (`margin-inline: 0 auto; max-width: 480px;`) aligning directly with synth and volume sliders above it.

### Bounded Numeric Inputs (`#loop-count` & `#offline-export-tail-seconds`)

- Small 1–4 digit inputs must never stretch across the card. Explicit width rules constrain them:
  - `#loop-count`: `width: 5.25rem; max-width: 5.25rem;`
  - `#offline-export-tail-seconds`: `width: 5.75rem; max-width: 5.75rem;`

### Scale Quantization Card-Aware Container Stacking

- Rather than relying on viewport media queries, `#quantizer-controls` is controlled by `@container (min-width: 420px)` on its parent card section:
  - When card width is `< 420px` (such as on mobile screens or in intermediate 2-column grid cards at 768px viewport where each card is ~340px), the controls stack vertically (`flex-direction: column`).
  - Stacked dropdown selects are constrained to `max-width: 22rem` to prevent excessive horizontal stretching while giving `100%` available space to avoid truncation on long scale option names like `Phrygian (Spanish / Tension)`.
  - When card width is `>= 420px`, the controls switch to `flex-direction: row` with Root Note taking `33.333%` and Scale Type taking `66.667%`.

### Disabled State Conventions

All disabled inputs, buttons, and selects share unified visual and accessible affordances:
- `opacity: 0.45`
- `cursor: not-allowed` (pointer events remain active to display the not-allowed cursor affordance on hover)
- `background-color: var(--ui-surface-disabled, #1f2937)`
- `border-color: var(--ui-border-subtle, #374151)`
- `color: var(--ui-text-muted, #9ca3af)`
- Programmatic synchronization with `aria-disabled="true"`.

### Custom Tooltips (`.has-custom-tooltip`)

- **Zero-Overflow Resting Invariant**: Inactive tooltips declare `display: none; opacity: 0; visibility: hidden;` on their `::after` and `::before` pseudo-elements. This completely removes the 180px tooltips from the card layout tree, guaranteeing zero horizontal container blowout on compact mobile viewports (e.g. 375px/390px).
- **Discrete Transitions**: Supported modern browsers (Chrome 117+, Safari 17.5+, Firefox 129+) smoothly animate tooltip entry and exit using `@starting-style` and `transition-behavior: allow-discrete;`. Older browsers degrade gracefully to instant display toggling with zero visual artifacts.
- **Reduced Motion Support**: An `@media (prefers-reduced-motion: reduce)` block disables `transition` on tooltip pseudo-elements, honoring user accessibility preferences by displaying tooltips instantly without sliding or fading motion.

### Pointer vs Help Cursors

- **Interactive Controls**: Always use `cursor: pointer` on buttons, radios, and sliders that trigger immediate state changes (including waveform and pattern buttons with custom tooltips).
- **Informational Badges**: Reserved for read-only help indicators (e.g. `#vu-meter-info`), which use `cursor: help`.
