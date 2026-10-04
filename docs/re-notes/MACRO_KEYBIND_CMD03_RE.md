# HERO68 on-board macro key binding (CMD 0x03)

Live-confirmed against `save_macro_to_Z.pcapng` from the official AULA application.

## Mapping record

Macro assignment uses the normal remap writer (`CMD 0x03`) and its normal 6-byte mapping record:

```
POS_H POS_L 03 TT CC II
```

- `POS`: physical key position, big-endian u16.
- `03`: macro action type.
- `TT`: macro playback type.
- `CC`: one-byte count.
- `II`: zero-based macro index in the library written by `CMD 0x05`.

Recovered official type values:

```
CIRCLE = 0x01
BUTTON = 0x02
REPEAT = 0x04
```

The capture assigned macro index 0 to physical Z (`POS=0x0038`) using Circle/count 1, producing:

```
00 38 03 01 01 00
```

The report's zone/layer byte selects the remap layer. Therefore the same macro action can be assigned on Main, Fn Layer 1, or Fn Layer 2; assigning it on an Fn layer gives native `Fn + key -> macro` behavior.

## OpenHero68 implementation

`src/protocol/hero68/remap.ts` now exposes `encodeMacroRemap()` and `decodeMacroRemap()` around the `0x03 TT CC II` u32 action.

Key Remap exposes a `Macros` category. Saving a dirty macro mapping first writes the current local macro library with `CMD 0x05`, then writes the key mapping with `CMD 0x03`, and finally uses the existing `CMD 0x83` remap readback verification.

Macro indices are positional in the CMD 0x05 table. Editing an existing macro therefore preserves its existing array position instead of removing/re-appending it.
