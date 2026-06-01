export { };

declare global {
  interface Window {
    currentNotes: string[];
    currentOctaveShift: number;
    currentOctaveRange: number;
    isPlaying: boolean;
    arpPattern: any;
    activeSynth: any;
    currentWaveform: string;
    audioEngine: any;
    __WEB_ARP_TEST__: any;
    __WEB_ARP_STEP_HIGHLIGHT__: any;
    WebArpPresetStore: any;
    WebArpPWA: any;
    __patternGenerator: any;
    __WEB_ARP_ASSET_MANIFEST__: any;
    __WEB_ARP_PWA_STATE__: any;
    WebArpPWAState: any;
    filterNoteInput: any;
    filterNumericInput: any;
    startAudio: any;
    showToast: (message: string, type?: string) => void;
    lamejs: any;
  }
}
