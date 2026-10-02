/**
 * Pure interface-mode values and normalization.
 *
 * @module interface-mode
 */

/**
 * Identifier for the beginner-friendly Simple interface mode.
 * @type {"simple"}
 */
export const INTERFACE_MODE_SIMPLE = "simple";

/**
 * Identifier for the complete Full interface mode.
 * @type {"full"}
 */
export const INTERFACE_MODE_FULL = "full";

/**
 * Default interface presentation mode for returning visitors when unpersisted.
 * @type {"full"}
 */
export const DEFAULT_INTERFACE_MODE = INTERFACE_MODE_FULL;

/**
 * Normalizes a persisted or UI-provided interface mode.
 *
 * @param {unknown} mode - Requested presentation mode.
 * @param {"simple"|"full"} [fallback=DEFAULT_INTERFACE_MODE] - Safe fallback.
 * @returns {"simple"|"full"} Supported interface mode.
 */
export function normalizeInterfaceMode(mode, fallback = DEFAULT_INTERFACE_MODE) {
    if (mode === INTERFACE_MODE_SIMPLE) return INTERFACE_MODE_SIMPLE;
    if (mode === INTERFACE_MODE_FULL) return INTERFACE_MODE_FULL;
    return fallback === INTERFACE_MODE_SIMPLE ? INTERFACE_MODE_SIMPLE : DEFAULT_INTERFACE_MODE;
}
