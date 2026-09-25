/**
 * Pure chord/scale conflict resolution helpers.
 *
 * @module chord-conflict
 */

import {
    buildChordNotes,
    CHORD_DEFINITIONS,
    normalizeRootPitch,
    resolveChordDefinition,
} from "./chord-builder.js";
import { normalizeNotesSequence, quantizeToScale } from "./pattern-core.js";

/**
 * Compares a requested chord with the active scale without changing application state.
 *
 * @param {{chordType?: unknown, root?: unknown, notes?: unknown}} [request={}] - Chord request.
 * @param {{enabled?: unknown, root?: unknown, scale?: unknown}} [scale={}] - Active scale configuration.
 * @returns {{chordType: string, chordName: string, root: string, requestedNotes: string[], adaptedNotes: string[], changedPitches: Array<{index: number, requested: string, adapted: string}>, hasConflict: boolean}} Conflict details and both possible note sequences.
 */
export function resolveChordConflict(request = {}, scale = {}) {
    const chordRequest = request && typeof request === "object" ? request : {};
    const scaleConfiguration = scale && typeof scale === "object" ? scale : {};
    const chordType =
        typeof chordRequest.chordType === "string" &&
        Object.hasOwn(CHORD_DEFINITIONS, chordRequest.chordType)
            ? chordRequest.chordType
            : "major";
    const root =
        typeof chordRequest.root === "string" ? normalizeRootPitch(chordRequest.root) : "C";
    const normalizedRequestedNotes = Array.isArray(chordRequest.notes)
        ? normalizeNotesSequence(chordRequest.notes.filter((note) => typeof note === "string"))
        : [];
    const requestedNotes =
        normalizedRequestedNotes.length > 0
            ? normalizedRequestedNotes
            : buildChordNotes(chordType, root);
    const scaleName =
        typeof scaleConfiguration.scale === "string" ? scaleConfiguration.scale : "chromatic";
    const scaleIsActive =
        scaleConfiguration.enabled === true ||
        (scaleConfiguration.enabled === undefined && scaleName !== "chromatic");
    const adaptedNotes = scaleIsActive
        ? quantizeToScale(
              requestedNotes,
              typeof scaleConfiguration.root === "string"
                  ? normalizeRootPitch(scaleConfiguration.root)
                  : root,
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
