# Documentation

## Features and usage

- [Custom RGB and the background service](CUSTOM_RGB.md)
- [Rhythm Sync](RHYTHM_SYNC.md)
- [Gamepad and shared Hall](GAMEPAD.md)
- [Gamepad validation and unverified scenarios](GAMEPAD_VALIDATION.md)
- [Macros UI](MACRO_UI.md)
- [Advanced Keys UI](ADVANCED_KEYS_UI.md)
- [Protocol implementation and evidence](../src/protocol/README.md)
- [Changelog](../CHANGELOG.md)
- [Windows service release notes](releases/)

## Reverse-engineering notes

These notes describe recovered behavior and the evidence available when written.
External capture files and original RE workspaces are not included in this repo.

- [Deadzone disabled behavior — local static RE, 2026-09-26](re-notes/DEADZONE_RE_NOTES.md)
- [HERO68 firmware 0x0320 — static RE notes](re-notes/FIRMWARE_RE_0320_DISASM_NOTES.md)
- [HERO68 firmware 0x0320 RE: passive multi-key Hall path](re-notes/FIRMWARE_RE_0320_MULTIKEY.md)
- [HERO68 0323 — 0x98 scheduler probe](re-notes/HALL_STREAM_0X98_SCHEDULER_PROBE.md)
- [Hall Stream: official multi-key calibration path](re-notes/HALL_STREAM_OFFICIAL_MULTIKEY.md)
- [HEROMusicServe.exe — tài liệu Reverse Engineering đầy đủ](re-notes/HEROMusicServe_RE_full_v2.md)
- [HERO68 v3 macro write RE (CMD 0x05)](re-notes/MACRO_CMD05_RE.md)
- [HERO68 on-board macro key binding (CMD 0x03)](re-notes/MACRO_KEYBIND_CMD03_RE.md)
- [HERO68 passive multi-key probe](re-notes/PASSIVE_MULTIKEY_PROBE_2026-09-20.md)
- [My Profile and Key Remap](re-notes/PROFILE_REMAP_NOTES.md)
- [RGB preview and onboard settings — firmware 0320](re-notes/RGB_V320_RE.md)
- [HERO68 switch selector capture verification](re-notes/SWITCH_SELECTOR_CAPTURE_NOTES.md)

## Archived investigations and fixes

Historical validation and UI research; consult current feature docs for usage.

- [Hall telemetry recovery and stable scrollbars](archive/HALL_RECOVERY_AND_SCROLLBARS.md)
- [Hall Stream fix (firmware 0323)](archive/HALL_STREAM_FIX_2026-09-20.md)
- [Hall Stream multi-key + release UI fix](archive/HALL_STREAM_MULTIKEY_RELEASE_FIX.md)
- [Hall Stream round-robin multi-key fix](archive/HALL_STREAM_ROUND_ROBIN_FIX.md)
- [Wootility Advanced Keys UI review — 2026-09-27](archive/WOOTILITY_ADVANCED_UI_REVIEW.md)
