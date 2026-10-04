# HERO68 protocol implementation

## Device Save and readback

Importing [hero68/webhid.ts](hero68/webhid.ts) registers the real
[encoder](hero68/hero68Encoder.ts) and `Hero68DeviceManager` through
[deviceBridge.ts](deviceBridge.ts). The bridge accepts normalized UI key settings
and the selected onboard profile slot; it rejects Save when registration is
missing. There is no device-save staging mode.

The encoder selects the profile, then batches switch type, actuation, Rapid
Trigger and deadzone writes in the recovered order. Physical positions come
from [keyPositions.ts](hero68/keyPositions.ts), not the UI's `matrixKey` values.
Builders and reply decoders live in [commands.ts](hero68/commands.ts) and
[codec.ts](hero68/codec.ts).

The device manager serializes requests through direct WebHID or the local Windows
service bridge and checks expected acknowledgements. [App.tsx](../App.tsx) reads
back edited key settings, synchronizes macro mappings, remaps, advanced bindings
and onboard RGB, and only then clears edited keys/remaps and shows Saved.
Transport, encoding or readback errors leave those edits available for retry.
The local persisted draft does not prove that a device write succeeded.

## Other protocol paths

- [Remapping and profile names](hero68/remap.ts) use explicit commands and readback;
  [profile/remap notes](../../docs/re-notes/PROFILE_REMAP_NOTES.md) describe the formats.
- [Advanced keys](hero68/advanced.ts) preserve unsupported bindings and verify writes.
- [Macros](hero68/macroDevice.ts) keep the editable library locally and send the
  recovered CMD 0x05 blob when requested. No definition-read command is recovered;
  deleting the last local macro does not establish that device memory was erased.
- [Hall Stream](hero68/hallStream.ts) supports `direct-poll` and `mode-poll`.
  Firmware investigation notes are indexed in [docs](../../docs/README.md).
- [RGB](hero68/rgb.ts) and [Tachyon](tachyon.ts) have separate save/control paths;
  Custom Effects, Rhythm Sync and Gamepad also use the Windows service.

## Sources and evidence

The command builders, report codec and physical key positions were ported from
the external `hero68_re` workspace, its official AULA bundle analysis and
hardware captures. The original full protocol reports, layout source and golden
packet fixtures are not shipped here. Historical external file names in RE notes
are provenance, not promised repository links.

This repository includes the recovered catalogs, implementation and runnable
[tests](../../tests/). Profile/remap, switch-profile, macro, Hall and device-bridge
checks exercise packet formats, simulated requests and error handling. These
checks do not imply that every scenario has been verified on physical hardware.
See [feature documentation and RE notes](../../docs/README.md) for each feature's
recorded evidence and limitations.

## Development

Use the Node version declared in `package.json`, then run `npm ci`,
`npm run build` and `npm test`. WebHID needs Chrome/Edge in a secure context
and the appropriate HERO68 HID interface. Close other keyboard apps before
connecting; do not infer unsupported commands or side-light behavior.
