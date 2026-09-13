# Audio export metadata

Every offline WAV and MP3 export carries a versioned Web Arpeggiator record. It captures the complete settings snapshot used at export time, the materialized sequence actually scheduled by the renderer, and the calculated render window. This makes a future import flow possible without trying to reverse-engineer synthesis parameters from PCM data.

Real-time recordings are intentionally excluded: settings can change while they are captured, so one snapshot cannot accurately reproduce them.

## Record schema

The embedded value is UTF-8 JSON with this stable envelope:

```json
{
  "schema": "web-arpeggiator.offline-export",
  "version": 1,
  "application": "Web Arpeggiator",
  "export": {
    "type": "offline-audio",
    "mode": "seamless",
    "loopCount": 4,
    "musicalDurationSeconds": 2,
    "preRollCycles": 3,
    "preRollDurationSeconds": 1.5,
    "tailDurationSeconds": 0,
    "renderDurationSeconds": 3.5,
    "sampleRate": 44100,
    "channelCount": 2,
    "frameCount": 88200
  },
  "pattern": {
    "scheduledNotes": ["C4", "E4", "G4"],
    "stepsPerLoop": 3
  },
  "settings": {
    "bpm": 120,
    "baseNotes": ["C4", "E4", "G4"],
    "direction": "up"
  }
}
```

`settings` is the complete output of the settings serializer, rather than a hand-picked subset. `pattern.scheduledNotes` preserves the exact sequence rendered for randomized directions. A future importer should validate the schema and version, then restore `settings` through the existing settings loader while retaining the rendered sequence for comparison.

## File layouts

- **WAV** uses standard `LIST/INFO` text tags (`INAM`, `ISFT`, and `ICMT`) for discovery and a private `arpg` RIFF chunk for the complete JSON record. The chunk is before `data`; PCM bytes and frame count are unchanged.
- **MP3** uses an ID3v2.4 title and software field plus a `TXXX` frame whose description is `WEB_ARPEGGIATOR_EXPORT` and whose UTF-8 value is the complete JSON record. The ID3 tag precedes the MPEG frames, so the Info/LAME gapless frame remains intact.

The pure readers `readWavExportMetadata` and `readMp3ExportMetadata` return the embedded record or `null`. They provide the binary parsing step for a future upload-and-restore UI; no file-upload UI is included yet.
