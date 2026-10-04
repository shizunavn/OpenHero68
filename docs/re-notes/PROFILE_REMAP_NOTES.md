# My Profile and Key Remap

The two pages replace the profile/remap placeholders in the root `src` app.
The `openhero68-baseline` copy is not the active app and was not changed.

## UI reference

The supplied `Wootility-Src/assets/index-BaoALhfv.js` provides the profile name
editor/export controls, layer selector and remap editor patterns. The HERO68 UI
uses its own layout and the three actual onboard slots/layers supported by AULA.
Each profile keeps a separate local draft. The keyboard preview shows the
assigned action; unsupported/custom action codes remain visible as hexadecimal
values and are preserved until explicitly edited.

Key Remap provides all 184 recovered AULA actions in ten searchable categories,
per-key factory restore, and layer copy/paste. My Profile provides profile naming,
slot selection, a settings summary, and JSON export of the current draft.

## Protocol reference

The original source is an external `hero68_re` workspace, not shipped with this repository. The following source report names are historical provenance, not local links.

- `docs/RGB_AND_REMAP_RE_2026-09-21.md`: remap writes/reads use `0x03/0x83`,
  layer in ZONE, six-byte `POS:u16be | ACTION:u32be` records, up to nine records
  per independent transaction. The action is a vendor 32-bit value, including
  Fn, modifiers, media and mouse actions.
- `docs/static_bundle_catalog.json`: canonical action catalog and all 68 factory
  bindings for each of the three layers. The relevant data was copied into
  [the bundled remap catalog](../../src/protocol/hero68/remapCatalog.json); no external path is needed at runtime.
- The external static RE profile report (section 6): profile selection/read use `0x10/0x90`;
  profile naming uses `0x1a/0x9a` with the slot in ZONE. Writes declare LEN=56,
  include the actual UTF-8 length in the first data byte, and allow up to 55
  UTF-8 bytes. Inner length 255 means the default name.

The app reads all layers before enabling Save. Remap writes include edited keys
only, wait for acknowledgements, and read back each edited mapping. Incomplete,
duplicate, unexpected or mismatched replies fail the operation and keep the
draft available. Profile names also require successful readback after writes.
Optional name-read failures retain the local/default display name.

## Validation

- `npm run build`: TypeScript and Vite production build.
- `npm run test:profile-remap`: eight tests covering full factory layouts,
  independent batch sizes, exact vendor action preservation, changed-key-only
  writes, malformed/readback failures, and the profile-name wire format.
- Browser checks: My Profile and Key Remap rendering, selecting/assigning and
  restoring a key, media search, reload persistence, slot isolation, and desktop
  and narrow layouts.

The new hardware read/write paths have been tested with a simulated requester.
No physical keyboard settings were changed during UI validation. A connected
HERO68 still needs a live read/save/readback check for the new app integration,
particularly the source-confirmed profile-name commands.
