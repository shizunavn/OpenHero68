# HERO68 v3 macro write RE (CMD 0x05)

## What `hello.pcapng` proves

The capture supplied for the `hello` macro starts before the macro is created, records the sequence `zxcvbnm,./` plus the mouse action, and includes the click on the official editor's Save button.

The HERO68 control device is VID:PID `372e:103e` (bcdDevice `0320`). During the captured editor Save flow there is no vendor-HID OUT transfer to the HERO68. The trace only contains the ordinary keyboard input reports for the recorded keys (Z, X, C, V, B, N, M, comma, period and slash) and the UI mouse input on the other HID device.

Therefore the official editor's Save button is not the point at which the firmware macro blob is written. The official v3 controller confirms the actual write occurs as part of syncing key data that references a macro.

## Recovered official serializer

Static recovery from the official v3 controller gives three relevant methods:

- `_transfer_macro_to_raw_data()` converts each macro event to four bytes.
- `_sync_macro()` builds the macro offset/length table and concatenates all macro entries.
- `_send_macro_to_device()` splits the blob into 56-byte chunks and sends command `0x05`.

Each event is encoded as:

```
byte 0 = (actionCode & 0xF0) | duration[19:16]
byte 1 = duration[15:8]
byte 2 = duration[7:0]
byte 3 = action value
```

`actionCode` and `action value` come from the recovered 108-entry macro action catalog. Keyboard press/release use action nibbles `0x00` / `0x80`; mouse press/release use `0x20` / `0xA0`.

Each macro entry is:

```
nameLength:u8
name:utf8[nameLength]
events:4 bytes each
```

The blob starts with one four-byte little-endian table row per macro:

```
offset:u16le
length:u16le
```

The first offset equals `macroCount * 4`. Offsets point into the complete blob.

## CMD 0x05 transport

The blob is split into chunks of at most 56 bytes. Each chunk uses the normal 64-byte report framing:

```
reportId  = 0x09
command   = 0x05
zone      = 0x00
reserved  = 0x00
total     = chunk count
sequence  = zero-based chunk index
length    = chunk length
data      = chunk bytes
checksum  = normal HERO68 checksum
```

The official controller waits for an exact echoed report before advancing to the next fragment. OpenHero68 now mirrors that behavior and retries a failed fragment up to five times with 20 ms between attempts.

## Playback mode is separate

Playback mode is not serialized into CMD `0x05`. The official key sync writes a six-byte CMD `0x03` mapping record for a macro-assigned key:

```
pos:u16be
0x03
macroType:u8
repeatCount:u8
macroIndex:u8
```

Recovered macro type values include BUTTON=`2`, CIRCLE=`1`, REPEAT=`4`. Because OpenHero68 does not yet expose macro-to-key assignment, the current integration writes macro definitions only. The local playback selector remains metadata until assignment is implemented.

## OpenHero68 integration

`src/protocol/hero68/macroDevice.ts` implements the recovered serializer and CMD `0x05` transfer. `MacroPage` now:

1. validates and stores the editable macro locally;
2. if HERO68 is connected, serializes the complete non-empty local library;
3. writes it using CMD `0x05` and requires exact echo ACKs;
4. reports local-only vs on-device sync status separately.

There is no recovered macro-definition read command, so local storage remains the editable source of truth. The official controller sends no CMD `0x05` when the macro list is empty, so deletion of the last local macro is not claimed to erase the device macro region.
