# OpenHero68 baseline v0.9.42

Actuation Point UI pass based on the supplied Wootility v5 source bundle, while preserving the HERO68 protocol and existing profile behavior.

- Implemented the sidebar **Actuation Point** page instead of the previous placeholder.
- Added per-key/multi-key selection with live actuation overlays on the keyboard preview.
- Added a Wootility-inspired actuation editor with switch preview, vertical travel control, selected-key state, and 0.10–3.40 mm limits.
- Added a local **Visual Feedback** tester that simulates key travel and shows the configured actuation threshold without sending HID packets.
- Actuation values now snap consistently to 0.05 mm when dragging or typing; other controls keep their own configured step.
- Retains the offline RGB preview fix so a fresh profile can show Multicolor before connecting.

## v0.9.37 responsive scaling

Responsive scaling pass based on the Wootility source bundle supplied in the conversation.

- Reworked the main shell so the rail, secondary sidebar, page padding and cards respond continuously to the available viewport instead of jumping between a few fixed desktop widths.
- Reworked the Hero68 preview to use ResizeObserver-driven fitting like Wootility: one measured font-size scale is computed from the preview container and the keyboard geometry is expressed in em units. This avoids transform/zoom scaling and stays much sharper when DevTools is docked or Windows/browser scaling changes.
- Quick Settings now keeps three columns while there is enough real content width, then moves to two/one columns using container queries rather than a viewport-only breakpoint.
- Settings and Switch Selector use container queries so their own available width controls layout changes.
- Switch Selector keyboard preview also scales continuously with its container.
- Wide/2K displays retain the same maximum content size instead of inflating the UI.
- The secondary sidebar now auto-compacts to an icon-only rail when the viewport becomes narrow, matching Wootility's behavior when DevTools is docked; the existing Compact sidebar setting now also forces the same mode manually.

## v0.9.37 dynamic scaling

- Added a live ResizeObserver/visualViewport based app scale for desktop widths below the reference canvas.
- The whole application now scales as one coordinated layout instead of only shrinking individual keyboard/cards.
- Uses CSS `zoom` rather than `transform: scale()` so Chromium reflows/re-rasterizes text and SVG more cleanly.
- Keyboard preview keeps its own container-based ResizeObserver fitting, matching the pattern used by Wootility's keyboard renderer.
- Mobile keeps the existing native responsive layout instead of desktop zoom scaling.


## v0.9.39 — Wootility-style Actuation + embedded Hall Test

- Reworked **Actuation Point** into the Wootility-style keyboard + three-card layout.
- Replaced the old simulated Visual Feedback card with a real **Live Hall Test**.
- Live Hall Test reuses the existing `hero68HallStream.start(..., 'direct-poll')` path from the Hall Stream diagnostic page.
- While Live Hall Test is active, the keyboard preview shows realtime Hall travel overlays for moving keys.
- The test card follows the most recently moving selected key, displays live travel, the selected key's AP threshold, ACTUATED/READY state, and measured refresh rate.
- Hall streaming is now allowed from Actuation Point even when Advanced Pages are hidden, and is stopped automatically when leaving Actuation/Hall Stream pages.


## v0.9.40 — deterministic Select All

- `Select all keys` rebuilds selection from the canonical 68-key layout via a functional state update.
- `allSelected` now verifies every real key ID instead of trusting only `Set.size`.
- Key toggles normalize away stale/invalid IDs before applying the click.
- Selection action buttons explicitly use `type="button"`.
- Repeated partial → Select all → Discard cycles now converge to exactly 68 / 0 keys even while Hall telemetry is causing frequent UI renders.


## v0.9.42 — Actuation deselect stops Live Hall

- Discard selection now stops Actuation Live Hall immediately.
- Manually deselecting the final selected key also stops Live Hall automatically.
- The standalone Hall Stream page is unaffected.
