# Changelog

UI and Windows service versions are independent. Historical notes below retain
their original validation scope; they are not claims of new hardware testing.

## Service 0.5.3.1 — Beat Pulse input fixes

- Normalize quiet PCM gradually before Beat Pulse spectral analysis, preserving transient attacks and existing noise rejection.
- Analyze high-rate audio at no more than 48 kHz; 192 kHz endpoints previously could never fill the required tempo history.
- Report captured PCM amplitude in the Audio meter instead of rendered LED brightness. Detect audio activity from both positive and negative sample peaks.
- Validate beat lock and tempo with 44.1–192 kHz PCM and quiet playback at -50 dB. Physical LED alignment and accuracy across all music remain unverified.

## Service 0.5.3 / UI 0.9.56 — new Custom and Rhythm effects

- Add Ember, Starlight, Afterglow and Tempo Pulse (BPM) effects, and Ember, Ocean, Sakura and Synthwave palettes.
- Fix Ember height, Starlight density bounds, Afterglow tap/re-press continuity and high-BPM Tempo Pulse tails; include new gradient underlays in automatic color contrast.
- Effects can now declare their own width/speed ranges, speed label and width unit (Tempo Pulse uses 40-200 BPM).
- Add audio Beat Pulse (Rhythm mode 430), sample-clock timing, source-specific beat corrections, complete reset and prediction cancellation on unlock.
- Rebuild the Windows service so `supportedEffects` includes the new effects; older installed apps are asked to update.
- Ship Beat Pulse with the updated native helper through the complete Windows installer and signed setup update. Legacy core-only packages cannot add native mode 430.

## UI 0.9.55 — repository cleanup

- Pin the existing dependency versions and declare the build/test toolchain.
- Read the sidebar UI version from package.json.
- Configure local certificate hosts and extra service origins through environment variables.
- Reject device saves when the protocol is not ready; keep local macro saves.
- Organize documentation and bundled font assets. CSS import order is unchanged.

## Windows service update history

- **Check for updates** in the tray downloads and applies compatible signed core updates automatically.
- When the native launcher also changes (for example for Rhythm Sync), the tray downloads a checksum-verified ZIP instead. Quit the old app, extract all files over the service folder, then start the new launcher. A core-only update is not enough in that case.
- Rhythm Sync needs service core 0.3.0, launcher 0.3.0 and API 5 or newer.
- Firmware keyboard blocking and the fast Gamepad tester require **core 0.4.1, launcher 0.4.1 and API 6**. Upgrade older installations with the complete Windows ZIP because the native helper also changes. Keyboard input stays enabled until Mapped-key override is applied; firmware empty action is its default method. Windows hooking is an optional fallback, disabled by default in Configuration.
- **0.4.2** fixes ViGEm startup cleanup and preserves the original Windows initialization error. Install the complete Windows package for this native fix. Opening Gamepad also avoids a brief blur during the initial check, while still requiring a live service and confirmed ViGEmBus before controls become active.
- **0.4.5** waits for slow initial Xbox driver boot without requiring repeated Start clicks, verifies its own XInput slot and adds drag-out removal for Gamepad bindings. Install the **complete Windows ZIP** for the updated native helper; the signed core requires launcher 0.4.5. RGB/Rhythm also share the new toolbar and preview layout.
- **0.4.6** evaluates digital Gamepad buttons from Hall travel and the selected profile's AP, split Rapid Trigger and deadzones. Changing these settings while running reloads them without recreating Xbox. Install the **complete Windows ZIP**; the signed core requires launcher 0.4.6.
- If you are on 0.2.3 or 0.3.0 and see `Unexpected update source`, download the full 0.3.1 (or newer) ZIP manually once. This is caused by the GitHub repository rename.
- If Auto-start points to an old folder, use **Auto-start: replace old app path** in the new tray menu.

Individual service releases are recorded in [docs/releases](docs/releases/).

## Earlier UI changes

### UI baseline v0.9.42

Actuation Point UI pass based on the supplied Wootility v5 source bundle, while preserving the HERO68 protocol and existing profile behavior.

- Implemented the sidebar **Actuation Point** page instead of the previous placeholder.
- Added per-key/multi-key selection with live actuation overlays on the keyboard preview.
- Added a Wootility-inspired actuation editor with switch preview, vertical travel control, selected-key state, and 0.10–3.40 mm limits.
- Added a local **Visual Feedback** tester that simulates key travel and shows the configured actuation threshold without sending HID packets.
- Actuation values now snap consistently to 0.05 mm when dragging or typing; other controls keep their own configured step.
- Retains the offline RGB preview fix so a fresh profile can show Multicolor before connecting.

### v0.9.37 responsive scaling

Responsive scaling pass based on the Wootility source bundle supplied in the conversation.

- Reworked the main shell so the rail, secondary sidebar, page padding and cards respond continuously to the available viewport instead of jumping between a few fixed desktop widths.
- Reworked the Hero68 preview to use ResizeObserver-driven fitting like Wootility: one measured font-size scale is computed from the preview container and the keyboard geometry is expressed in em units. This avoids transform/zoom scaling and stays much sharper when DevTools is docked or Windows/browser scaling changes.
- Quick Settings now keeps three columns while there is enough real content width, then moves to two/one columns using container queries rather than a viewport-only breakpoint.
- Settings and Switch Selector use container queries so their own available width controls layout changes.
- Switch Selector keyboard preview also scales continuously with its container.
- Wide/2K displays retain the same maximum content size instead of inflating the UI.
- The secondary sidebar now auto-compacts to an icon-only rail when the viewport becomes narrow, matching Wootility's behavior when DevTools is docked; the existing Compact sidebar setting now also forces the same mode manually.

### v0.9.37 dynamic scaling

- Added a live ResizeObserver/visualViewport based app scale for desktop widths below the reference canvas.
- The whole application now scales as one coordinated layout instead of only shrinking individual keyboard/cards.
- Uses CSS `zoom` rather than `transform: scale()` so Chromium reflows/re-rasterizes text and SVG more cleanly.
- Keyboard preview keeps its own container-based ResizeObserver fitting, matching the pattern used by Wootility's keyboard renderer.
- Mobile keeps the existing native responsive layout instead of desktop zoom scaling.


### v0.9.39 — Wootility-style Actuation + embedded Hall Test

- Reworked **Actuation Point** into the Wootility-style keyboard + three-card layout.
- Replaced the old simulated Visual Feedback card with a real **Live Hall Test**.
- Live Hall Test reuses the existing `hero68HallStream.start(..., 'direct-poll')` path from the Hall Stream diagnostic page.
- While Live Hall Test is active, the keyboard preview shows realtime Hall travel overlays for moving keys.
- The test card follows the most recently moving selected key, displays live travel, the selected key's AP threshold, ACTUATED/READY state, and measured refresh rate.
- Hall streaming is now allowed from Actuation Point even when Advanced Pages are hidden, and is stopped automatically when leaving Actuation/Hall Stream pages.


### v0.9.40 — deterministic Select All

- `Select all keys` rebuilds selection from the canonical 68-key layout via a functional state update.
- `allSelected` now verifies every real key ID instead of trusting only `Set.size`.
- Key toggles normalize away stale/invalid IDs before applying the click.
- Selection action buttons explicitly use `type="button"`.
- Repeated partial → Select all → Discard cycles now converge to exactly 68 / 0 keys even while Hall telemetry is causing frequent UI renders.


### v0.9.42 — Actuation deselect stops Live Hall

- Discard selection now stops Actuation Live Hall immediately.
- Manually deselecting the final selected key also stops Live Hall automatically.
- The standalone Hall Stream page is unaffected.
