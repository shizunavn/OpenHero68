# HERO68 0323 — 0x98 scheduler probe

The passive Col02 hypothesis was removed after testing produced no secondary Hall input.

This build compares three non-0x94 modes. None enters manual calibration, so none intentionally triggers the red/green calibration LED state:

- **Whole board**: `0x98/00 START` only. No `0x98/01` SYNC is sent.
- **Empty sync**: `0x98/00 START`, then an empty `0x98/01` SYNC.
- **POS56 ref**: `0x98/00 START`, then `0x98/01` with POS 56. This is the known-good baseline.

Each key's observed telemetry rate is measured independently and shown next to its live travel. The total 0x98 cadence is shown in the Hall Stream footer.

Recommended test: hold the same `M + N` chord for 3–5 seconds in each mode and compare per-key Hz. If Whole board or Empty sync distributes reports fairly, that is the safest passive-ish multi-key path exposed by 0x98. If all three remain constrained to roughly one 6-byte Hall record per ~21 Hz total, the current known web protocol does not expose official-calibration-style multi-record telemetry outside 0x94.
