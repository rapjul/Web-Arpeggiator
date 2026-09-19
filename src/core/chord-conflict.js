/**
 * Pure chord/scale conflict resolution helpers.
 *
 * @module chord-conflict
 */

import { buildChordNotes, resolveChordDefinition } from "./chord-builder.js";
import { quantizeToScale } from "./pattern-core.js";

/**
 * Compares a requested chord with the active scale without changing application state.
 *
 * @param {{chordType?: unknown, root?: unknown, notes?: unknown}} [request={}] - Chord request.
 * @param {{enabled?: unknown, root?: unknown, scale?: unknown}} [scale={}] - Active scale configuration.
 * @returns {{chordType: string, chordName: string, root: string, requestedNotes: string[], adaptedNotes: string[], changedPitches: Array<{index: number, requested: string, adapted: string}>, hasConflict: boolean}} Conflict details and both possible note sequences.
 */
export function resolveChordConflict(request = {}, scale = {}) {
    const chordType = typeof request.chordType === "string" ? request.chordType : "major";
    const root = typeof request.root === "string" ? request.root : "C";
    const requestedNotes = Array.isArray(request.notes)
        ? request.notes.filter((note) => typeof note === "string")
        : buildChordNotes(chordType, root);
    const scaleName = typeof scale.scale === "string" ? scale.scale : "chromatic";
    const scaleIsActive =
        scale.enabled === true || (scale.enabled === undefined && scaleName !== "chromatic");
    const adaptedNotes = scaleIsActive
        ? quantizeToScale(
              requestedNotes,
              typeof scale.root === "string" ? scale.root : root,
              scaleName,
          )
        : [...requestedNotes];
    const changedPitches = requestedNotes.flatMap((requested, index) => {
        const adapted = adaptedNotes[index] ?? requested;
        return adapted === requested ? [] : [{ index, requested, adapted }];
    });

    return {
        chordType,
        chordName: resolveChordDefinition(chordType).name,
        root,
        requestedNotes: [...requestedNotes],
        adaptedNotes,
        changedPitches,
        hasConflict: changedPitches.length > 0,
    };
}
