# 0017. Optional Creation Walkthrough

* Status: accepted
* Deciders: rapjul, Codex
* Date: 2026-09-17

## Context and Problem Statement

New users can see the main controls without knowing which changes matter first. A mandatory tutorial would interrupt experienced users and a separate demo mode could drift away from the real creation workflow. The application needs lightweight guidance that follows real user actions and can be paused without affecting a project.

## Decision Drivers

* Teach the core workflow with the controls users already have.
* Keep the walkthrough optional, resumable, skippable, and restartable.
* Avoid creating settings-history entries or changing musical values automatically.
* Persist only tutorial progress, separately from project settings and browser presets.

## Decision Outcome

Add an Optional quick guide card with five steps: choose a sound, choose notes or a chord, change the rhythm, adjust the tone, and save or export the idea. Starting the walkthrough reveals the current step and listens for the corresponding real controls: sound-starter cards, notes/chord actions, interval/BPM/pattern changes, tone controls, and save/export actions. Matching the current step advances it; unrelated actions do not.

The controller stores `{ state, stepIndex }` under `webArpCreationWalkthrough`. Skip stores a paused state, Resume continues at the stored step, Restart begins at step one, and completion remains available as a restartable guide. No walkthrough action calls settings-history or changes the current project.

## Consequences

* Guidance remains aligned with the real application controls.
* Beginners get a clear sequence without being forced through a modal tutorial.
* Progress survives reloads but is not included in presets, sessions, or undo/redo.
* Future example playback can be added as an injected action without changing the progress contract.

## Links

* [Architecture Guide](../architecture.md)
* [ADR 0006: Persistent Settings History and Default Resets](./0006-persistent-settings-history-and-default-resets.md)
