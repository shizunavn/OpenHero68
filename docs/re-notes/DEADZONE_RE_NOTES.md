# Deadzone disabled behavior — local static RE, 2026-09-26

## Result

Disabling custom Deadzone does not mean removing all Hall end thresholds.
The firmware clears the custom override and uses switch preset thresholds.
The fw0320 preset table gives a nominal top fallback of 10 distance units
(0.10 mm) and bottom margin of 5 units (0.05 mm) for all twelve internal presets.
These are preset margins, not a promise that every runtime comparison occurs
exactly at these distances: additional guards and ADC conversion remain active.

The equivalent disabled setter and fallback consumer instruction blocks are
exact byte matches in the live factory fw0323 partial image. The fw0323 preset
table itself is outside that image, so its numerical contents remain unverified.
The original factory profile's host-visible enable/top/bottom defaults have not
been established by this analysis. A previously edited capture is not a factory
reset baseline.

## Inputs and reproduction

External evidence root: `C:/Users/nguye/Downloads/hero68 & f75/hero68_re`.

- `firmware/0320/firmware.bin`, SHA256
  `3cd37447b8f89061e958dfddf89f109f660f2def8dccba8a1cab57b955a4f361`.
- `firmware/0320/fw0320.disasm.txt`.
- `firmware/0323_factory_partial/f1_64k.bin`.
- Existing `docs/9A_STORAGE_STRUCTURE_RE_2026-09-21.md` provides the
  record stride and storage field associations.
- Existing `docs/PRECISION_CORRECTION_2026-09-20.md` confirms 0.01 mm/unit.

Run `rtk proxy node tools/inspect-deadzone.cjs` to extract the preset headers
and reproduce exact-byte searches in the factory dump. This reads files only.
No HID operations, reset, firmware writes, or keyboard setting changes occurred.

## Setter and consumers (fw0320 file offsets)

1. CMD 0x16 handler at 0x16E2C stores requested distances and enable in profile
   storage, then calls 0xE82C with enable normalized into r3 at 0x16E92–0x16EA2.
2. `0xE82C(pos, top, bottom, enable)` selects the 82-byte key record.
   When enable=0, 0xE92C–0xE93C writes:
   `record+0x4A = 0`, `record+0x4C = 0xFFFF`, then recalculates at 0x960C.
   Those are internal sentinel values, not host distances.
3. 0xA416–0xA42A uses record+0x4A when nonzero; otherwise reads preset+4.
   0xA43E–0xA44E uses preset+0xA for the ordinary lower clamp when custom
   top is zero. 0xA450–0xA468 also recognizes the 0xFFFF bottom sentinel.
4. 0x968C–0x96BA selects custom top or preset+4; another branch uses preset+6.
   0x96EC–0x9714 caps bottom against preset+0xA and subtracts 2 units before
   its conversion. Therefore 0.05 mm is a nominal preset margin, not a complete
   description of every effective Hall/RT threshold.
5. With custom Deadzone enabled, 0xE86E–0xE896 caps requested top/bottom at
   travel/4 and enforces a minimum top of 5 units (0.05 mm).
   Enabled bottom=0 follows a separate path storing travel+100; it is not the
   same as disabling the feature.
6. The missing/invalid Hall-storage initialization path at 0xAABC–0xAAFA calls
   0xE82C(0xFF, 0, 0, 0), initializing overrides as disabled for all slots.
   This does not prove the subsequently loaded factory profile enable byte.

## Preset table

0x9A14 copies twelve 16-byte ROM records to runtime headers with stride
0x4EB*2. The ROM pointer at 0x9A80 is 0x080226FC, file offset 0x1A6FC.

| Host switch IDs | Travel | Top fallback | Bottom clamp | Nominal bottom margin |
|---|---:|---:|---:|---:|
| 5, 3, 4, 8, 13, 14, 15, 1, 16, 22, 24 | 340 units | 10 | 335 | 5 |
| 27 | 330 units | 10 | 325 | 5 |

Preset+6 is 25 units for all twelve entries. Its alternative-path use is
confirmed, but its full user-facing meaning is not established here.

## Factory 0323 correspondence

Each following sequence has exactly one exact match in the original partial F1
dump. Addresses are deliberately reported as file/F1 offsets to avoid assuming
a single relocation delta.

| fw0320 file offset | Bytes | factory0323 F1 offset |
|---:|---:|---:|
| 0xE82C | 26 | 0xA858 |
| 0xE86E | 38 | 0xA89A |
| 0xE92C | 20 | 0xA958 |
| 0x968C | 36 | 0x569C |
| 0xA416 | 22 | 0x6426 |
| 0xA450 | 26 | 0x6460 |
| 0x9A2A | 60 | 0x5A3A |

The setter entry's literal loads have the same relative positions but their
literal contents differ between versions; the match establishes the code
structure, not identical RAM addresses. Numerical ROM-table equality is not
claimed for factory0323.
