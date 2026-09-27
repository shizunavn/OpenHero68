# HERO68 firmware 0x0320 RE: passive multi-key Hall path

## Image / MCU
- `firmware.bin` contains a Cortex-M vector table at file offset `0x8000`.
- Runtime image base: `0x08010000`; initial SP `0x20017240`; reset handler `0x080101A9`.
- Updater config uses `GEEHY_USB_V2`, VID `372e`, PID `103e`.

## Command dispatcher
Firmware command dispatcher around `0x0801C42A` explicitly branches on `0x94` and `0x98`.

### 0x94 manual calibration
Handler entry `0x0801D3A6`. Zone 0 enters manual calibration and manipulates RAM mode flags at `0x20000050`; zone 4 exits it. This is the red/green LED workflow and is intentionally not used for Hall Stream.

### 0x98 distance mode
Handler entry `0x0801D770`.
- zone 0 sets the distance-mode bit (`0x200`) in the mode word at `0x20000050`; no 0x94 calibration state is entered.
- zone 2 clears the bit.
- zone 1 loops over every requested `POS:u16be` (`0x0801D79A..0x0801D806`). For each key it emits a 6-byte record: `POS:u16be DIST:u16be ADC:u16be`.
- The zone-1 response length is calculated as `(request_len / 2) * 6`. Therefore one request can return multiple keys synchronously.

The 63-byte HID payload leaves 56 data bytes, so 9 records/request is the safe maximum (`9*6=54`).

## Why the previous stream looked like 21 Hz + 1-2 Hz
A separate periodic firmware path around `0x08017F9C..0x08018070` builds unsolicited `0x98/01` reports from a changed/active-key queue. It batches at most nine queued keys and is scheduler-driven. The previous app sent one SYNC, then mostly listened to this event path; that is why one key could dominate the ~21 Hz telemetry while adjacent keys barely appeared.

## New strategy
Stay in non-LED `0x98` mode, but do not rely on the changed-key scheduler. Repeatedly issue zone-1 snapshot requests for all 68 physical positions in 9-key batches. Responses are matched by exact returned POS list so unsolicited `0x98/01` packets cannot satisfy the wrong request.

This is read/diagnostic polling; it does not use `0x94` manual calibration and does not trigger the calibration LED state.

## Stronger finding: zone 1 does not require START in firmware 0320
The `0x98` handler at `0x0801D770` branches on zone immediately. Zone 0 sets the RAM mode bit `0x200`; zone 2 clears it. The zone-1 snapshot branch (`0x0801D79A..0x0801D806`) does not read/test that mode bit before reading the requested keys.

Therefore the new default test is **direct 0x98/01 polling without 0x98/00 START**. If firmware 0323 retained this handler shape, it gives multi-key Hall snapshots without entering any calibration/stream mode at all. A started 0x98 polling mode remains in the UI only as a fallback.
