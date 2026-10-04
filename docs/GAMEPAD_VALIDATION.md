# Recorded Gamepad / shared Hall validation

## 0.4.1 follow-up — 2026-10-04

- Full JavaScript regression run: 508 passed. Subsequently added hook-remap and
  partial-write recovery cases passed with the targeted Gamepad suites.
- Firmware empty action was written/read back as zero on an unused HERO68 key
  using the existing service owner, then restored and read back as its original
  action. All three remap layers and Advanced Key position lists were readable.
  This verifies the wire transaction and restoration, not anti-cheat acceptance.
- Simulated service integration covered Start/Stop, original remap projection
  in settings, edits while blocking, durable recovery after process termination,
  and fast tester subscriptions without additional Hall consumers.
- Native fast stream with output disabled: 59.0 Hz, p99 interval 17.48 ms,
  zero Hall requests and zero frames after stream Stop (1.5-second sample).
- Native hook lifecycle test installed an empty, inactive hook 12 times on its
  dedicated thread. Pure policy tests covered held/released keys, repeat events,
  extended scan codes and cleanup. No user key injection was used for validation.
- Web and full Windows builds passed. Browser checks confirmed shared binding
  icons, default firmware mode, optional hook warning and live tester animation.
- Physical sleep/unplug recovery and suppression in specific games remain
  unverified. No extended stress test or second live Xbox device was run.

Date: 2026-10-03. Windows x64, connected AULA HERO68, installed ViGEmBus
1.22.0. These are measurements on this machine, not guarantees for every USB
controller or system load.

## Automated checks

- Web production build and service TypeScript/native builds passed.
- Full JavaScript regression suite: **498 passed, 0 failed**.
- Native broker/mapping checks passed: due-key batching, nine-key limit, empty
  demand, frequency changes, bounded p99, late reads/backoff, malformed replies,
  curves, max/OR mapping, Snappy and stale-sample neutralization.
- Real ViGEm/XInput adapter test passed for neutral, held stick + A button,
  independent 50 ms watchdog, waiting for rest before rearming, pause and stop.
- Hardware lifecycle checks passed for zero idle Hall requests, RGB without
  analog input, two browser streams, closing one stream, independent RGB/gamepad
  stop, read-only configuration while running and gamepad profile changes.
- Browser UI checked at 1280 px and 460 px widths: all three tabs, key binding,
  right-click removal, curve presets, Apply, Start/Stop and analog demo.
- Windows ZIP verified: launcher 0.4.0, eight required entries, file-by-file
  hashes and archive checksum. The web ZIP was also verified.

## Short hardware benchmark

Each scenario ran about **5 seconds after 1.5 seconds of warm-up**. The assigned
gamepad keys in these scenarios use analog bindings at 200 Hz. Source:
`.refactor/gamepad-benchmark-final-short/summary.json` and its per-second JSONL.

| Scenario | Minimum Gamepad Hall Hz | Hall p99 ms | LED FPS | Hall timeouts |
| --- | ---: | ---: | ---: | ---: |
| 6 bindings + Pressure Wave | 200.06 | 6.00 | 59.99 | 0 |
| 10 bindings + Pressure Wave | 199.99 | 6.00 | 60.00 | 0 |
| 10 bindings + Touch | 199.92 | 6.50 | 60.05 | 0 |
| 10 bindings + Jelly | 200.04 | 7.00 | 59.56 | 0 |
| 10 bindings + AOE | 199.97 | 6.75 | 59.95 | 0 |
| 10 bindings + Mixing + monitor 68 | 199.97 | 7.25 | 59.93 | 0 |

Every scenario had a verified final XInput report. The request queue had at most
one pending request in these sampled runs. RGB demand remained 100 Hz for keys
not shared with 200 Hz gamepad input; no rate-reduction policy was enabled.
CPU averaged approximately 13–23% of one logical core, including Node and the
native helper. Combined working set peaked at approximately 94 MB in this run.
Short runs establish rate/lifecycle behavior, not long-duration memory stability.

## Completed 5-minute sample and canceled extended run

The completed 6-binding Pressure Wave scenario ran **303.08 seconds**:

- Minimum Hall average: **199.999 Hz**, lifetime p99 **6.00 ms**.
- Xbox report average: **199.998 Hz**, recent output p99 **5.56 ms**.
- LED output: **59.99 FPS**, recent frame p99 **17.88 ms**.
- Hall timeouts: **0**; final XInput verification: **true**.
- Mean combined CPU: **14.05% of one logical core**; peak combined working set:
  **92.48 MB**; maximum sampled pending requests: **1**.

Source: `.refactor/gamepad-benchmark-qualification/summary.json`. The next scenario
was interrupted and is retained only as partial JSONL. The planned 30-minute
suite and 2-hour stress run did **not** finish: extended testing was canceled
at the user's direction. No 2-hour result is claimed. The isolated service was
shut down and the previously running Rhythm service was restored and confirmed
connected and enabled.

## Remaining manual checks

Physical USB cable unplug/replug and real Windows sleep/wake were not exercised.
Their neutral/rearm paths are implemented and pause/watchdog logic is tested,
but these device-level checks remain unverified. Keyboard suppression remains
disabled. These validated packages target GitHub release v0.4.0. Public website
deployment is separate from publishing the GitHub release.

## Web UI and access gate update

The Gamepad page now uses a neutral keyboard preview, icon mapping palette,
switch controls and graphical curve presets. Tester consumer/key details are
collapsed under Diagnostics. This web update does not change the native Hall,
RGB or gamepad output pipeline.

- `npm run build` and the 10 targeted gamepad/access tests passed.
- Browser fixture checks verified missing service, unsupported service and
  missing ViGEmBus gates, disconnect locking and recovery. The page remains
  blurred and inert when `driverAvailable` is absent or false; enabled status
  and tester demo cannot bypass the gate.
- At desktop and 460px widths: mapping selection/removal, curve preset changes,
  Apply, Start/Stop and local tester analog preview were checked. The demo W
  input at 3.4 mm reached `ly: 32767`. No horizontal overflow was observed.
- These UI checks used a simulated service. They did not open a HID device,
  install/remove a driver, or run additional stress tests. Driver availability
  in the real service comes from its native ViGEm connection probe; the web
  requires explicit confirmation and asks for service restart after install.
