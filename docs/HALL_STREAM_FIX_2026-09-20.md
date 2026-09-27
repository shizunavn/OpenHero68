# Hall Stream fix (firmware 0323)

This patch stops treating USB reconnect as part of normal Hall telemetry. The RE hardware capture shows 0x98 streaming without a re-enumeration when the tested sequence is used.

Changes:

- Preserve the actual Auto Calibration setting (`84/19`).
- Temporarily disable Auto Calibration (`04/19 = 0`) before entering distance telemetry, matching the successful hardware capture.
- Wait for the `98/00` ACK before sending `98/01`.
- Use the hardware-tested one-position sync list `POS 56` (Z). Firmware 0323 still emits unrelated moved keys, so this enables the whole-keyboard stream without speculative batching.
- On stop, wait for the `98/02` ACK and restore Auto Calibration if it was originally enabled.
- Removed the idea that an HID disconnect is expected during Hall Stream. A disconnect is now treated as a real fault rather than something to auto-resume blindly.

Evidence in the supplied RE workspace: `captures/automated/latest_followup_RE.json` -> `stream_scope_test`. It records polling level 6 (8000 Hz), Auto Calibration originally ON, forced OFF for the 0x98 test, valid `98/00` ACK, live `98/01` frames, valid `98/02` stop, and zero errors.
