# 0022. Persisted Simple and Full Interface Modes

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

The first-visit Quick Start modal asks users to choose **Simple controls** or **Full controls** before showing factory sound starters or Start from Scratch. Returning visitors default to Full controls when no preference has been saved. The interface mode selector remains visible at the top of the application as a header-integrated segmented pill control (`[ Simple | Full ]`) with accessible WAI-ARIA `role="radiogroup"` keyboard navigation, and persists changes in `localStorage` under `webArpInterfaceMode`.

Simple controls retain Sound Starters, Transport, Pattern, Scale Quantization, Offline Audio Export, and Preset Management. The controller restores the saved mode before revealing the application shell, then hides the swing control, octave, keyboard, synthesis, envelope, filter, effects, Utilities, and real-time recording sections by setting both `hidden` and `aria-hidden`; switching back to Full restores them. The selected mode is not part of `ArpeggiatorSettings`, so changing it does not create a musical history entry or modify a preset.

Switching to Simple controls turns off the virtual keyboard and visualizer and requests a safe stop for an active or still-starting real-time recording before those controls remain unavailable. Recorder readiness is coordinated separately from playback completion so simultaneous Play and Record requests cannot deadlock. Concurrent stop callers share the same result; a real stop failure restores Full controls even when recorder recovery has already returned the capture state to idle. A stale failure from an earlier mode request cannot override a later choice. Switching back to Full exposes the transient tools without restarting them. Synthesis and effect settings remain active because they are part of the musical project rather than transient interface activity.

### Asynchronous Action Invalidation Contract

When asynchronous audio initialization (`startAudio()`) is underway, users may click advanced controls such as **Record** or **Real-Time Export** prior to the `AudioContext` reaching the running state. To guarantee that hidden actions cannot execute unexpectedly if the user switches to Simple mode while initialization is in flight:

* Any transition into Simple mode increments an internal action generation counter via `cancelPendingAdvancedActions()`.
* When `startAudio()` resolves, advanced-only actions compare their captured generation snapshot against the active generation counter. If a mismatch exists or the current interface mode is Simple, the pending action is permanently discarded.
* This generation invalidation ensures that rapidly toggling from Full $\to$ Simple $\to$ Full while audio initialization is pending never resurrects the stale advanced operation.
* The generation counter implements rollover wrapping bounded at `Number.MAX_SAFE_INTEGER` ($2^{53} - 1$), safely wrapping to `1` to maintain exact integer precision and eliminate the ABA wrap-around problem without arbitrary magic thresholds.
* Non-advanced asynchronous workflows, specifically **Offline Audio Export**, remain available in Simple mode and proceed to render even if the interface mode is changed while audio is activating.

Incoming URL presets continue to bypass the first-visit choice and load their musical values unchanged. An Escape dismissal without an explicit mode choice falls back to the Full presentation.

## Consequences

* Beginners see a smaller starting surface without losing access to advanced controls.
* The segmented pill control provides immediate 1-click toggling, eliminates dropdown menu friction, and makes both presentation choices visible at all times.
* The presentation preference survives reloads but does not contaminate musical project data.
* Advanced controls are removed from the tab sequence while Simple mode is active.
* Hidden interaction-only tools cannot keep accepting input or capturing audio without visible controls.
* In-flight advanced operations queued during audio startup cannot execute after an intervening Simple mode transition, even if Full controls are restored before audio initialization settles.
* Future simple-mode work can add guidance without duplicating the underlying controllers.

## Links

* [Architecture Guide](../architecture.md)
* [ADR 0006: Persistent Settings History and Default Resets](./0006-persistent-settings-history-and-default-resets.md)
* [ADR 0018: Awaited Recording Lifecycle and Bounded Audio Resource Ownership](./0018-awaited-recording-lifecycle-and-bounded-audio-resource-ownership.md)
* [ADR 0021: Fluid Wrapping and Card-Aware Responsive Layout](./0021-fluid-wrapping-and-card-aware-responsive-layout.md)
