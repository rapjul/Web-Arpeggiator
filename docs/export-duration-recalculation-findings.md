# Export Duration Recalculation Findings

This note records which controls affect the offline export duration estimate and when the UI must recalculate it.

## Duration inputs

The offline export duration is calculated from:

- The normalized loop count.
- The number of steps in the materialized pattern.
- The selected note interval.
- The selected BPM.
- The fixed two-second offline reverb render tail.

The materialized step count includes the selected notes, pattern direction, and Octave Layers. It is shared by the displayed estimate and the offline renderer.

## Controls that recalculate the estimate

| Control | Why it affects the estimate | Refresh path |
| --- | --- | --- |
| BPM | Changes the duration of every step. | Direct input handler. |
| Loop count | Changes the number of rendered pattern cycles. | Direct input and change handlers. |
| Notes | Changes the base number of pattern steps. | Direct input handler and pattern rebuild on change. |
| Pattern direction | May expand or reorder the materialized step sequence. | Shared pattern rebuild. |
| Note interval | Changes the duration of every step. | Shared pattern rebuild. |
| Octave Layers | Multiplies the number of pattern notes before direction is applied. | Shared pattern rebuild. |
| Octave Shift | Rebuilds the materialized pattern after transposition. | Shared pattern rebuild. |
| Scale quantization, root, and type | Rebuild the materialized pattern after quantization settings change. | Shared pattern rebuild. |
| Synth type and gate length | Already rebuild the pattern, so the estimate is refreshed even though buffer length is unchanged. | Shared pattern rebuild. |

## Controls intentionally excluded

The following controls alter sound or note placement but not the scheduled offline buffer duration:

- Swing changes timing within a pattern cycle, not the cycle boundary used by the offline transport stop time.
- Envelope, filter, synth, gain, delay, and reverb mix controls change audio character, not the calculated buffer length.
- The reverb tail remains a fixed two seconds; there is no user-controlled reverb-decay setting that would require recalculation.

If a future change makes the reverb tail configurable or changes the offline transport stop boundary, that input must be added to the shared duration calculation and the refresh list above.

## Initial display and test coverage

Before JavaScript initializes the app state, the export card shows the neutral message `Calculating export duration…` rather than a potentially stale numeric duration.

The browser regression test covers estimate refreshes for:

- BPM and loop-count changes, including loop-count normalization.
- Notes entered through the input event before the field loses focus.
- Octave Layers and the Up-Down direction.
- Note-interval changes.
