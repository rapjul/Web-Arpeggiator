# 0007. Semantic Theme Tokens and Modular Styles

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-03

## Context and Problem Statement

The app's styles were contained in one large stylesheet, while palette-specific Tailwind utilities, literal CSS colors, inline visibility styles, and canvas drawing colors were spread through HTML, JavaScript, and CSS. This made a dark default easy to ship but made a later Light or High Contrast mode risky and costly.

## Decision Drivers

* Preserve the current dark appearance without introducing a theme selector yet.
* Make a future Light or High Contrast theme an override of one token layer rather than a whole-app rewrite.
* Keep shared styling discoverable and prevent duplicated hardcoded visual values.

## Decision Outcome

Use concern-based CSS modules imported through `styles.css`. Define dark-default semantic custom properties in `styles/tokens.css`; component and feature styles consume those tokens. Existing Tailwind palette variables are aliased to the semantic tokens so retained layout markup also follows a future theme override.

Visibility and component state use CSS classes or data attributes rather than HTML `style` attributes. Runtime canvas drawing reads the same CSS token palette because canvas does not resolve CSS variables itself.

The app does not implement Light mode, High Contrast mode, persistence, or a theme picker in this decision. A future implementation will add complete token overrides under `html[data-theme="light"]` and `html[data-theme="high-contrast"]`, including canvas and PWA browser-chrome colors.

### Positive Consequences

* Theme colors and reusable visual values have a defined source of truth.
* Feature-specific styles can evolve without making the entry stylesheet harder to navigate.
* Future themes have an explicit extension point.

### Negative Consequences

* New visual styling must choose a semantic token instead of adding a literal palette value.
* PWA manifest colors remain static metadata and must be kept aligned manually with the active default theme.

## Links

* [Architecture Guide](../../AGENTS.md)
* [ADR 0002: Modular ES Source Architecture](./0002-modular-es-source-architecture.md)
