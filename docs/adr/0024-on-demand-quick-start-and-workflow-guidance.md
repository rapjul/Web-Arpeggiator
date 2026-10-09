# 0024. On-Demand Quick Start Reopening and Static Creation Workflow Guidance

* Status: accepted
* Deciders: rapjul, Antigravity
* Date: 2026-10-08

## Context and Problem Statement

First-time users benefit from the Quick Start onboarding modal introduced in [ADR 0022](./0022-persisted-interface-mode.md), which lets them select an interface mode and choose a curated Sound Starter preset. However, once dismissed, returning users and developers had no built-in mechanism to revisit the modal or inspect the Sound Starters library without manually resetting `localStorage`.

Previously, closed PR #72 attempted to solve beginner guidance by introducing an active 5-step checklist (`sound` → `notes` → `rhythm` → `tone` → `export`) backed by global document event listeners (`click`, `input`, `change`) and persistent walkthrough progression state. That approach caused significant architectural tension:
* Global interaction sniffing violated controller boundaries and introduced fragile DOM matching heuristics.
* The "tone" step conflicted directly with Simple mode by matching only master volume (`#post-gain`), misinforming beginners about audio synthesis fundamentals.
* An active guidance card added persistent vertical height above the transport controls, degrading ergonomics on smaller screens.

The application needs an on-demand mechanism to reopen the Quick Start modal at any time and a clear, zero-overhead workflow reference guide that serves beginners without runtime listener overhead or state pollution.

## Decision Drivers

* Enable returning users to reopen the Quick Start modal on demand from the application header.
* Provide an accessible, static visual reference outlining the 4 core phases of arpeggio creation.
* Avoid global event listeners, DOM sniffing, and persistent walkthrough progression state.
* Ensure on-demand modal dismissal never alters active musical parameters, transport state, or settings history ([ADR 0006](./0006-persistent-settings-history-and-default-resets.md)).
* Retain full accessibility with WAI-ARIA modal focus trapping and keyboard focus restoration upon dismissal.
* Maintain parity across both Simple and Full interface modes.

## Decision Outcome

1. **Header On-Demand Trigger (`#quick-start-help-btn`)**:
   A dedicated button is placed in `<header>` adjacent to the interface mode segmented control (`#interface-mode-controls`). Clicking this button invokes `openQuickStartModal({ onDemand: true })`, reveals the Quick Start modal overlay, applies `inert` to `#app-main`, and stores the originating trigger element for post-dismissal focus restoration.

2. **Direct Content Display for Returning Users**:
   When opened on demand (or when `webArpHasVisited === "true"`), the modal bypasses the first-visit interface mode choice (`#quick-start-mode-choice`) and directly presents the Sound Starters grid and workflow guide (`#quick-start-mode-content`). Returning users can freely adjust their interface mode at any time using the header segmented pill control without re-selecting it inside the modal.

3. **Static 4-Step Creation Workflow Reference Guide (`#quick-start-workflow-guide`)**:
   A purely declarative semantic card is embedded within `#quick-start-mode-content` outlining the four fundamental phases of arpeggiator sound design:
   - **Step 1: Choose a Sound**: Select a curated Sound Starter preset or design custom synth waveforms.
   - **Step 2: Define Notes**: Input note sequences, click chord starters, or use scale-quantized randomization.
   - **Step 3: Shape the Rhythm**: Configure BPM tempo, note duration intervals, gate sustain, and pattern directions.
   - **Step 4: Perform & Export**: Play live with interactive keyboard feedback, or export offline to WAV, MP3, and MIDI.
   This section uses semantic Tailwind CSS tokens and incurs zero runtime computation, zero DOM listeners, and zero mutable state.

4. **Non-Destructive On-Demand Dismissal, Activation Coordination & Focus Restoration**:
   A dedicated close button (`#quick-start-close`) is positioned at the top-right of the modal. When the modal is dismissed while in on-demand mode (via `#quick-start-close`, pressing `Escape`, clicking the background overlay, or clicking `#quick-start-scratch`), the controller cleanly closes the overlay and restores keyboard focus to `#quick-start-help-btn` without calling `onStartFromScratch()`, ensuring active synth parameters, pattern notes, transport playback, undo/redo histories, and URL preset imports are completely untouched.
   Furthermore, for returning visitors who reopen the Guide prior to starting audio, `#start-overlay` is safely suspended with `is-hidden` so it cannot obscure the guide; upon modal dismissal, `#start-overlay` is restored and focus is directed to `#start-button` rather than a background control. The preset, scratch, and start-overlay callbacks start audio first upon user gesture and await a bounded session restoration (`waitForInitialSessionRestore()`, 1-second default timeout) before proceeding, preventing storage contention (e.g. a blocked IndexedDB schema upgrade) from indefinitely stranding audio activation or onboarding. Actions that explicitly select settings (`onPresetSelected`, `onStartFromScratch`) mark onboarding as chosen, so any still-pending session restore is discarded via the `canRestoreSession` guard and late URL preset imports are bypassed, while plain start-overlay activation preserves slow session restores. Window-level capturing history shortcuts (`Ctrl/Cmd+Z`, redo), escape resets, and virtual piano keyboard shortcuts are suppressed whenever modal overlays (`quickStartOverlay` or inert `#app-main`) are active.

5. **First-Visit Invariants Preserved**:
   First-visit onboarding continues to show the interface mode choice first, ensures `markVisited()` is invoked upon dismissal or preset selection, and establishes default audio state when dismissed from scratch.

## Consequences

* Returning users can easily explore curated factory sound starters and review the core creation workflow at any point during a session.
* Developers can inspect and test the Quick Start dialog without wiping `localStorage` or resetting browser state.
* A static, purely declarative workflow guide card incurs zero runtime computation, DOM listeners, or progression state tracking, eliminating the state synchronization bugs of active walkthroughs.
* Modal dismissal for returning users is completely non-destructive to active musical compositions.
* The WAI-ARIA focus trap properly contains keyboard navigation within the dialog and returns focus to the header trigger upon closing.

## Links

* [Architecture Guide](../architecture.md)
* [ADR 0006: Persistent Settings History and Default Resets](./0006-persistent-settings-history-and-default-resets.md)
* [ADR 0021: Fluid Wrapping and Card-Aware Responsive Layout](./0021-fluid-wrapping-and-card-aware-responsive-layout.md)
* [ADR 0022: Persisted Simple and Full Interface Modes](./0022-persisted-interface-mode.md)
