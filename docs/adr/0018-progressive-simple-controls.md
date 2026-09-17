# 0018. Progressive Disclosure for Simple Controls

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-17

## Context and Problem Statement

The Simple interface should support a beginner's first musical loop without presenting every advanced choice at once. The application must still preserve its existing pattern directions and sound-design controls, and switching interface modes must remain presentation-only.

## Decision Drivers

* Keep the first musical choices visible: sound, notes or chords, key, tempo, pattern, volume, playback, and export.
* Prefer plain-language primary labels while retaining technical explanations below them.
* Emphasize Up, Down, Up-Down, and Random without removing any existing pattern direction.
* Keep synthesis, envelope, filter, effects, and less common directions available without duplicating their controllers or settings.
* Preserve keyboard access and avoid putting hidden controls in the tab sequence.

## Decision Outcome

Simple mode uses the labels Volume, Tempo, Pattern, Note length, Stay in key, and Key for the primary controls. The first four pattern directions are direct choices; the remaining directions move into a native More pattern directions disclosure. Synth, Envelope, Filter, and Effects use native expandable cards that close in Simple mode and remain open in Full mode. Octave, keyboard, visualizer, and real-time recording remain advanced sections hidden from Simple mode.

All controls continue to use the existing application controllers and settings model. The interface-mode controller changes only visibility and disclosure state, so opening a section or switching modes does not create a settings-history entry.

## Consequences

* Beginners can make a first loop with fewer visible choices.
* Experienced users retain every existing pattern and sound-design control.
* The same controls remain available to automation, presets, undo/redo, and keyboard navigation.
* Native `details` elements provide a small, touch-friendly progressive-disclosure surface without another custom state model.

## Links

* [Architecture Guide](../architecture.md)
* [ADR 0016: Persisted Simple and Full Interface Modes](./0016-persisted-interface-mode.md)
