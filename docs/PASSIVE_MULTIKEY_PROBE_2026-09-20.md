# HERO68 passive multi-key probe

This build intentionally removes the 0x94 calibration stream from Hall Stream.
Firmware 0323 changes physical key LEDs while 0x94 calibration mode is active and can commit per-key Hall endpoints, so it is not suitable as a transparent visualizer.

## Why Col02 is being probed

Windows enumerates firmware 0323 MI_02 with two vendor-defined HID top-level collections: `Col01` and `Col02`. The existing RE tooling and Open-Hero68 control transport used the known report-ID-9 control collection only. The official AULA HUB device picker itself filters by VID/PID rather than by usage page, so this build mirrors that permission request and inspects every collection/report descriptor Chromium exposes on the opened MI_02 HID device.

## Passive mode behavior

- Does **not** send `0x94/00` calibration start.
- Does **not** send `0x98/00` distance-stream start.
- Does **not** send an RGB/LED mode command.
- Reads stored calibration endpoints with `0x94/05` only, so a raw ADC stream can be mapped to millimetres without entering calibration state.
- Listens to every input report ID on the already-open WebHID interface.
- Ignores report ID 9 for passive discovery because that is the already-known command/response channel.
- Shows live secondary report IDs, rates, lengths and a short hex preview.
- Attempts conservative decoding only when packet fields contain real HERO68 hardware positions.

## Test

1. Connect HERO68.
2. Open Hall Stream.
3. Choose **Passive** and press **Start stream**.
4. Hold **M + N** together for 2–3 seconds, then try **W + A + S + D**.
5. Check the `Passive HID probe` panel.

If a secondary report ID appears, send a screenshot of that panel. If `Decoder` also changes from `no known Hall record shape detected yet`, the app has already recognized a plausible passive Hall packet format and should begin rendering it on the keyboard.

If no secondary reports appear at all, Col02 is either silent during normal operation or Chromium is not exposing its input path under this interface. That result is still useful: it rules out the most promising zero-write path before any command fuzzing.
