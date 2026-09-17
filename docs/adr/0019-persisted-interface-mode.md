# 0019. Persisted Simple and Full Interface Modes

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-17

## Context and Problem Statement

The application exposes many controls even though a first-time user mainly needs a sound, notes or chords, a key, tempo, pattern direction, playback, and export. Hiding advanced controls can reduce the initial cognitive load, but the choice must not alter the musical project or make the full instrument inaccessible.

## Decision Drivers

* Give first-time users an explicit Simple or Full choice before sound starters.
* Keep all existing controls available through a persistent mode switch.
* Store presentation preference separately from musical settings, history, presets, and sessions.
* Preserve keyboard and screen-reader behavior when advanced sections are hidden.

## Decision Outcome

The first-visit Quick Start modal asks users to choose **Simple controls** or **Full controls** before showing factory sound starters or Start from Scratch. Returning visitors default to Full controls when no preference has been saved. The Interface selector remains visible at the top of the application and persists changes in `localStorage` under `webArpInterfaceMode`.

Simple controls retain Sound Starters, Transport, Pattern, Scale Quantization, Offline Audio Export, and Preset Management. The controller hides the octave, keyboard, synthesis, envelope, filter, effects, visualizer, and real-time recording sections by setting both `hidden` and `aria-hidden`; switching back to Full restores them. The selected mode is not part of `ArpeggiatorSettings`, so changing it does not create a musical history entry or modify a preset.

Incoming URL presets continue to bypass the first-visit choice and load their musical values unchanged. An Escape dismissal without an explicit mode choice falls back to the Full presentation.

## Consequences

* Beginners see a smaller starting surface without losing access to advanced controls.
* The presentation preference survives reloads but does not contaminate musical project data.
* Advanced controls are removed from the tab sequence while Simple mode is active.
* Future simple-mode work can add guidance without duplicating the underlying controllers.

## Links

* [Architecture Guide](../architecture.md)
* [ADR 0006: Persistent Settings History and Default Resets](./0006-persistent-settings-history-and-default-resets.md)
