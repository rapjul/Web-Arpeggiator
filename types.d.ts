import type * as Tone from "tone";

/**
 * Shape of the PWA asset manifest defining version and precached assets.
 */
export interface WebArpAssetManifest {
    /** Current asset cache version string */
    cacheVersion?: string;
    /** Relative path to the application shell */
    appShell?: string;
    /** Fallback URL for navigation requests */
    navigationFallback?: string;
    /** List of asset URLs precached by the service worker */
    assets?: string[];
}

/**
 * Shape of the internal PWA runtime state.
 */
export interface WebArpPWAState {
    /** Active asset cache version */
    cacheVersion: string;
    /** Indicates whether the service worker is registered */
    serviceWorkerRegistered: boolean;
    /** Relative URL of the registered service worker */
    serviceWorkerUrl: string | null;
    /** Error message string or null if registration succeeded */
    serviceWorkerError: string | null;
    /** Indicates whether an updated worker is waiting to activate */
    hasWaitingWorker: boolean;
}

/**
 * Public PWA management API.
 */
export interface WebArpPWA {
    /** Registers the service worker */
    registerServiceWorker: () => Promise<ServiceWorkerRegistration | null>;
    /** Checks for service worker updates */
    refreshServiceWorker: () => Promise<ServiceWorkerRegistration | null>;
    /** Signals the waiting service worker to skip waiting and activate */
    activateWaitingWorker: () => Promise<Record<string, unknown>>;
    /** Clears runtime and precache caches */
    clearCaches: () => Promise<string[]>;
    /** Lists registered cache storage names */
    listCaches: () => Promise<string[]>;
    /** Returns the active ServiceWorkerRegistration */
    getRegistration: () => ServiceWorkerRegistration | null;
    /** Returns a snapshot of current PWA state */
    getState: () => WebArpPWAState;
}

/**
 * Metadata options for saving a preset record in IndexedDB.
 */
export interface WebArpPresetMetadata {
    /** Unique preset identifier */
    id?: string;
    /** User-defined display name */
    name?: string;
    /** Optional original filename if imported or saved from file */
    filename?: string | null;
    /** Origin of the preset record (e.g. manual, imported) */
    source?: string;
}

/**
 * Stored preset record snapshot in IndexedDB.
 */
export interface WebArpPresetRecord {
    /** Unique preset identifier */
    id?: string;
    /** User-defined display name */
    name?: string;
    /** ISO timestamp when the preset was saved */
    savedAt: string;
    /** Optional original filename if imported or saved from file */
    filename?: string | null;
    /** Origin of the preset record (e.g. manual, imported) */
    source?: string;
    /** Serializable settings object */
    settings: Record<string, unknown>;
}

/**
 * Preset storage persistence layer interface for IndexedDB.
 */
export interface WebArpPresetStore {
    /** Database name identifier */
    dbName: string;
    /**
     * Saves a named preset record.
     *
     * @param settings - Serializable settings object to persist.
     * @param metadata - Optional metadata properties such as id, name, filename, and source.
     * @returns Promise resolving to the saved WebArpPresetRecord.
     */
    save: (
        settings: Record<string, unknown>,
        metadata?: WebArpPresetMetadata,
    ) => Promise<WebArpPresetRecord>;
    /** Retrieves a preset by ID */
    get: (id: string) => Promise<WebArpPresetRecord | null>;
    /** Loads the most recently saved preset */
    loadLatest: () => Promise<WebArpPresetRecord | null>;
    /** Lists all saved preset records */
    list: () => Promise<WebArpPresetRecord[]>;
    /** Deletes a preset by ID */
    remove: (id: string) => Promise<void>;
    /** Clears all stored presets */
    clear: () => Promise<void>;
    /** Saves current workspace session snapshot */
    saveLastSession: (settings: Record<string, unknown>) => Promise<WebArpPresetRecord>;
    /** Loads the last saved workspace session */
    loadLastSession: () => Promise<WebArpPresetRecord | null>;
}

/**
 * Union of synthesizer instances supported by Web Arpeggiator audio engine.
 */
export type WebArpSynth =
    | Tone.Synth
    | Tone.FMSynth
    | Tone.AMSynth
    | Tone.MonoSynth
    | Tone.DuoSynth
    | Tone.PluckSynth
    | Tone.MembraneSynth
    | Tone.PolySynth;

/**
 * Pattern traversal direction names supported by Tone.Pattern.
 */
export type TonePatternDirection =
    | "up"
    | "down"
    | "upDown"
    | "downUp"
    | "alternateUp"
    | "alternateDown"
    | "random"
    | "randomOnce"
    | "randomWalk";

/**
 * Global window type augmentations for Web Arpeggiator.
 */
declare global {
    interface Window {
        /** Currently selected notes */
        currentNotes: string[];
        /** Active octave shift offset (-3 to 3) */
        currentOctaveShift: number;
        /** Active octave range multiplier (1 to 5) */
        currentOctaveRange: number;
        /** Indicates whether playback transport is running */
        isPlaying: boolean;
        /** Active Tone.js pattern instance */
        arpPattern: Tone.Pattern<string> | null;
        /** Currently active synthesizer instance */
        activeSynth: WebArpSynth | null;
        /** Current waveform name */
        currentWaveform: string;
        /** Audio engine controller */
        audioEngine: unknown;
        /** Test hooks interface */
        __WEB_ARP_TEST__: Record<string, unknown>;
        /** Step highlighting UI callback */
        __WEB_ARP_STEP_HIGHLIGHT__: (index: number) => void;
        /** Preset storage persistence layer */
        WebArpPresetStore?: WebArpPresetStore;
        /** PWA runtime manager */
        WebArpPWA?: WebArpPWA;
        /** Pattern generator module reference */
        __patternGenerator?: Record<string, unknown>;
        /** PWA asset manifest cache list */
        __WEB_ARP_ASSET_MANIFEST__?: WebArpAssetManifest;
        /** PWA runtime state container */
        __WEB_ARP_PWA_STATE__?: WebArpPWAState;
        /** Global PWA state helper */
        WebArpPWAState?: WebArpPWAState;
        /** Input filtering handler for note sequences */
        filterNoteInput: (event: KeyboardEvent) => boolean;
        /** Input filtering handler for numeric fields */
        filterNumericInput: (event: KeyboardEvent) => boolean;
        /** Global audio initialization handler */
        startAudio: () => Promise<void>;
        /** Global toast notification handler */
        showToast: (message: string, type?: string) => void;
        /** LameJS MP3 encoder library instance */
        lamejs: typeof import("@breezystack/lamejs");
    }
}
