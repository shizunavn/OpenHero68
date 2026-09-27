# HERO68 firmware 0x0320 — static RE notes

Image analyzed: `HERO68_FW_0320_firmware.bin` extracted from the official updater package.

## Image layout

- Cortex-M vector table begins at file offset `0x8000`.
- Flash image base for that vector table is `0x08010000`.
- Initial SP: `0x20017240`.
- Reset handler: `0x080101A9` (Thumb).
- Official updater config identifies `GEEHY_USB_V2`, VID `0x372E`, PID `0x103E`.

## Vendor command dispatcher

At approximately `0x0801C42A` the firmware compares the incoming command byte. Relevant branches:

- `CMD 0x94` -> `0x0801D3A6`
- `CMD 0x98` -> `0x0801D770`

### Manual calibration (0x94)

`0x0801D3A6` uses a table branch on the zone byte. Zone 0 enters calibration and zone 4 exits it. The code manipulates the shared mode word at RAM `0x20000050` and initializes calibration state. This is the mode that drives the official calibration workflow/LED state, so Hall Stream must not use it.

### Distance/Hall command (0x98)

`0x0801D770` branches directly on zone:

- zone 0: sets mode bit `0x200` in RAM word `0x20000050`.
- zone 1: iterates all requested POS values and reads Hall state for each.
- zone 2: clears mode bit `0x200`.

Crucially, the zone-1 path does **not** test the mode bit first.

Pseudo-code reconstructed from `0x0801D79A..0x0801D806`:

```c
if (zone == 1) {
    n = request_len / 2;
    for (i = 0; i < n; i++) {
        pos = be16(request.data + i*2);
        idx = pos_to_internal_index(pos);
        matrix_key = internal_index_to_matrix(idx);
        distance = read_distance(matrix_key);
        adc_pressed = read_adc_and_pressed(matrix_key, ...);

        response[i].pos = pos;
        response[i].distance = distance;
        response[i].adc_pressed = adc_pressed;
    }
    response_len = n * 6;
}
```

Each returned record is exactly 6 bytes:

`POS:u16be | DIST:u16be | ADC:u16be`

The HID data area is 56 bytes, therefore 9 records (`54 B`) is the safe full-response batch size.

## Why old Hall Stream favored one key

The firmware has a second, asynchronous 0x98 path around `0x08017F9C..0x08018070`. It builds `0x98/01` reports from a changed/active-key queue and batches up to 9 queued keys. That scheduler is what produced the observed ~21 Hz event cadence and could heavily favor one key while another only appeared occasionally.

The important distinction is:

- **event path:** firmware chooses which changed keys to report;
- **zone-1 request path:** host explicitly asks for arbitrary key positions and firmware returns a snapshot for every requested position.

The previous app sent one `0x98/01` request and then mostly listened to the event path. The new implementation repeatedly uses the request/snapshot path instead.

## Passive path candidate

Because zone 1 is not gated by the zone-0 mode bit in firmware 0320, the cleanest path is:

`0x98/01 [up to 9 POS] -> response -> next batch`

with **no `0x98/00 START` and no `0x94` calibration**.

The app therefore now has:

1. **Direct poll** — default; no 0x98 START, no 0x94, no calibration LED mode.
2. **0x98 mode poll** — fallback if firmware 0323 changed the gating semantics.
3. **Event stream** — old unsolicited scheduler, diagnostic only.

Direct responses are matched against the exact requested POS list so an unrelated unsolicited `0x98/01` report cannot accidentally satisfy the polling request.
