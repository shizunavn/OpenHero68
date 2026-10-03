# HERO68 switch selector capture verification

Verified against the supplied USB captures and the extracted official web-app catalog on 2026-09-26.

## Switch mapping

| Official preset | Firmware ID (decimal) |
| --- | ---: |
| Wing Chun | 4 |
| Meteor Magnetic | 13 |
| Jade Pro | 1 |
| Uranus Gaming | 3 |
| Magneto King | 5 |
| Jade King | 14 |
| Dragon King | 15 |
| Jade | 16 |
| Pink King Scroll | 22 |
| Jade Emperor Scroll | 24 |
| Ice King Axle | 27 |
| Black King | 8 |

The table records the historical official catalog. OpenHero68 no longer exposes
the preset for ID 27 or labels it with that model name. It displays
`Stored profile (ID 27)` and preserves the raw ID during reads and saves.
Command `0x95` reads the firmware's stored calibration profile, not the physical
switch model. Removing a UI preset must not silently rewrite that stored ID.

The individual-key capture contains 13 switch writes, in this order:

`8 → 4 → 13 → 1 → 3 → 5 → 14 → 15 → 16 → 22 → 24 → 27 → 8`

This is consistent with the recalled order, with Black King also selected at the beginning. Names are resolved using the official extracted catalog and English translation strings, rather than inferred from the capture alone.

## Packet evidence

`switch_hero68_ZXM,_INDIVIUALKEY.pcapng` contains 13 outgoing command `0x15` reports and 13 corresponding incoming echoes. Every switch write targets positions `56, 57, 62, 63`, corresponding to **Z, X, M, comma**.

Each update uses the sequence `0x15 → 0x13 → 0x19 → 0x16` (switch, actuation, RT, deadzone). In this capture, actuation is 0.80 mm; RT is enabled with 0.20 mm press/release; deadzone is enabled with 0.10 mm top/bottom. The captured global flag is 1 even though only those four positions are sent.

`switch_hero68.pcapng` contains no matching HERO68 vendor configuration reports. Its observed keyboard/mouse input and descriptor traffic cannot establish global switch-change behavior. The capture does not establish why the configuration traffic is absent.

There are no `0x95` switch readback reports in the individual-key capture. Readback preservation is covered by synthetic tests, not demonstrated by this capture. No hardware writes were performed during this verification.

## Changes and validation

- Expanded the UI from four presets to all 12 above.
- Corrected the previous label: ID 16 is **Jade**, while **Jade King** is ID 14.
- Centralized name/ID mapping for the UI and protocol encoder.
- Preserved unknown firmware IDs on readback so a later save does not replace them with Meteor.
- Added generic switch icons for presets whose product photos are unavailable.
- Compared all 52 generated reports from the 13 update sequences against captured bytes; they match exactly.
- Build passed; 12 tests passed across profile/remap and switch coverage. Browser inspection confirmed all 12 preset cards appear.

Reproduce with `rtk proxy node tools/analyze-switch-captures.cjs`, `rtk proxy node --test tests/profile-remap.test.mjs tests/switch-profiles.test.mjs`, and `rtk npm run build`. The normalized capture fixture is `reports/switch-captures.json`. The additional Python inspection helper uses the Windows `py` alias.
