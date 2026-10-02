# Rhythm Sync — service 0.3.0 / API 5

RGB Settings has Onboard Effects, Custom Effects and Rhythm Sync. Opening a tab
or choosing a mode changes only the draft. Apply starts background playback;
subsequent edits are coalesced and bound to that playback session. A restarted
service or another editor invalidates the old session. Closing the browser
leaves native playback running. Return to onboard stops host playback.

Without a compatible background service, Rhythm uses the same blurred,
keyboard-inert gate as Custom Effects. Try demo is available only in that gate.
The unlocked editor has Apply and Return to onboard; it has no separate demo
button. Demo is explicitly illustrative synthetic audio, requires no keyboard,
and does not capture audio or write USB.

## Modes and geometry

| Keys | Mode |
| --- | --- |
| 169 | Dazzling Rock |
| 170 | Clouds |
| 171 | Light Field, global `08/02` |
| 172 | Gurgling Stream |
| 173 | Blooming Passion |
| 428 | Dynamic Spectrum |
| 180 | Off |

The HERO68 profile uses all 68 real POS values, including AltRight/POS71.
`tools/generate-rhythm-profile.mjs` filters the RE ring, column and eight bloom
patterns to this board; it checks coverage before writing the native profile.
Legacy mode 168 is rejected. Algorithms follow the supplied RE with immediate
attack and millisecond cadence rather than retaining stock input delays.

Side 500 means leave onboard. Side 501 (one-end meter), 502 (center-out meter)
and 503 (rise/fall light field) have renderers and protocol tests, but **live
side capability is false**. Starting them is rejected by both API and native
helper. Count, LED order, RGB channel order, `0E/01`, `0E/02` and restoration
still need physical verification; demo's 18 positions are illustrative.

## Native pipeline

Windows 10 1703+/11 shared-mode event-driven WASAPI loopback captures the default
playback endpoint or a fixed endpoint. Capture, sliding PCM window, DSP, rhythm
rendering, encoding and HID writes run in the native helper. Node handles
configuration, persistence and preview; browser work is outside this pipeline.
Capture accepts float32 and PCM16/24/32 and averages channels. Endpoint loss,
format change or discontinuity restarts/resets the sliding window and history.

Scalar input is normalized positive peak minus mean with linear sensitivity.
Attack is immediate; release defaults to 80 ms and ranges from 0–200 ms.
Spectrum uses periodic Hann by default, FFT256, the RE nonlinear magnitude
transform, 64 bins, a double-buffered 256×64 field and the HERO68 samples from
the 22×6 grid. Gain is `db × 30`; latest overlapping samples are used.

The HID owner uses monotonic 16.667 ms deadlines. A late deadline skips older
work, never catches up with a burst. Key frames use report ID09, 56-byte chunks,
checksum, at most 32 color groups/196 bytes/four reports, preserving black.
Configuration batches pause playback and resume it afterward. Hall requests
run between frame batches. API pending work is bounded to 32 transactions;
custom rendering coalesces ticks, and preview retains one unsent latest event
per slow client. OS write completion is not firmware ACK or LED readback.

## API and persistence

- `GET /audio/devices`: active playback endpoints and default flag.
- `POST /rhythm/start`: `{configuration: RhythmConfiguration}` starts a new session.
- `POST /rhythm/config`: `{configuration, sessionId}` edits the active session.
- Existing `/stop` returns to onboard. `/start` with an empty body resumes saved RGB.
- `/status`: supported modes, side capability, audio state/errors, target/actual
  FPS, frame gaps, dropped/repeated frames, stage durations and latency samples.
- `/frames`: completed, quantized key colors, audio level, session and sequence.

Rhythm config version1 lives in `rhythm-preset.json`; Custom presets are retained.
`preset.json` version3 stores playback and saved mode so tray Start saved RGB
continues the last selected engine. Web drafts use a separate localStorage key.

## Verification and limits

Run `npm test`, `npm run build`, `npm run build:service`,
`tools/check-native-rhythm.cmd` and `tools/check-native-audio.cmd`.
The audio probe plays low-volume synthetic pulses through the default endpoint.
`node tools/verify-rhythm-service.mjs 600 .refactor/rhythm-final --audio` runs an
isolated service on port16869 with separate state and restores onboard on exit.
It measures heavy Custom and Spectrum, each with and without ten-key Hall,
for 150 seconds each. Results are in `reports/rhythm-hardware-benchmark.json`.

The acceptance targets are 58–60 completed USB frames/s and frame gap p95≤20 ms
without configuration writes. They measure completed host writes, not light.
Sample-to-write p95≤35 ms and physical audio-to-light p95≤50 ms are separate
targets. Physical latency requires a synchronized sensor measurement.

WASAPI's QPC timestamps use 100 ns units for the first frame
([Microsoft GetBuffer documentation](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)).
The helper adds the positive-peak sample offset. This machine's endpoint can
report timestamps ahead of capture receipt. Negative latency samples are
excluded and counted in `audioTimestampInvalid`, rather than clamped to zero.
`captureToWriteP95Ms` measures receipt-to-completed-write separately and does
not prove the sample or physical latency targets. Silence produces no latency
samples. Side output and optical latency remain unverified.

Profile-selection timeout recovery serializes WebHID request/ACK transactions,
uses an origin-wide Web Lock across direct-HID tabs, and reads active slot90
after a missing select10 ACK. It retries only the same idempotent selection,
at most three attempts, and never treats a different slot as success. The same
recovery also runs inside service configuration batches.
