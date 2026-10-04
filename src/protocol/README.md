# Hero68 protocol integration point

## Sources and evidence

The command builders, report codec and physical key positions were ported from
the external `hero68_re` workspace and its AULA bundle/hardware captures. The
original protocol reports and golden packet fixtures are not shipped here.
Runnable checks in [tests](../../tests/) exercise the code in this repository;
[profile/remap notes](../../docs/PROFILE_REMAP_NOTES.md#protocol-reference) document
profile commands. Test fixtures do not establish additional hardware evidence.

## Bridge integration

The UI does **not** guess any device opcodes.

The existing per-key UI state is normalized in `deviceBridge.ts` and every key already exposes:
- `keyId`
- `matrixKey`
- `matrixHex`
- row / column derived from the existing matrix key

To connect the RE'd protocol later:
1. implement a `Hero68ProtocolEncoder.encodeSave(snapshot)` that returns the real HEX packets;
2. implement a `Hero68Transport.sendHex(hex)` using your WebHID/HID transport;
3. call `registerHero68Protocol(encoder, transport)` during app startup.

The WebHID module registers the existing encoder and device manager. Save calls
reject when the protocol is not ready; transport and readback failures keep the
draft available for retry instead of reporting a local device save.
