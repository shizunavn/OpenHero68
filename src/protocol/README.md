# Hero68 protocol integration point

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

The Save buttons already call the bridge. Until an encoder/transport is registered, saves are staged/logged rather than inventing packets.
