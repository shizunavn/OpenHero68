# Request support for a keyboard

Use the [keyboard support form](https://github.com/shizunavn/OpenHero68/issues/new?template=add-a-board.yml)
to request a new model, hardware revision or connection mode. You do not need to
reverse-engineer the keyboard first. Complete the basic fields and write
**Unknown** where the form allows it; captures are optional.

OpenHero68 currently targets the AULA HERO68. HERO84 and other models need their
own evidence and physical testing. Similar release dates, names, key counts or
USB IDs are useful clues, but do not establish protocol compatibility.

## Basic information

1. **Exact model:** copy the full underside/box name and any revision or batch.
   Include switch type/name if known. Do not disassemble the board for this.
2. **Connection:** identify wired USB, 2.4 GHz receiver or Bluetooth. Collect
   evidence separately for each mode you can test; a receiver has its own USB
   identity and may expose different functionality.
3. **USB IDs:** on Windows, open Device Manager, locate the keyboard or receiver,
   then **Properties > Details > Hardware Ids**. Copy entries such as
   `HID\VID_XXXX&PID_YYYY&MI_ZZ`. If several identical HID entries appear, compare
   the list before and after unplugging the board/receiver, or use the device's
   parent/connection view. Include relevant interfaces rather than guessing one.
   On Linux, `lsusb` can identify USB devices; on macOS, System Information's USB
   section can show vendor/product IDs. These OS examples are for collecting
   identity, not a claim that the Windows service runs there. For Bluetooth,
   report the displayed identity and transport; do not invent a USB VID/PID.
4. **Firmware:** copy the exact installed version shown by the official app and
   attach its version/About screen. Preserve leading zeros and hex notation.
   Record keyboard and receiver firmware separately. If no version is exposed,
   say so; do not update or flash merely to complete the request.
5. **Official software:** link the vendor web configurator or download page,
   record its app version, and say which connection modes work with it.
6. **Layout:** attach a clear top-down photo or product layout link, key count,
   ANSI/ISO/JIS if known, and any knob, extra keys or side LEDs. A photo of the
   model label helps identify revisions; hide serial numbers and barcodes first.
7. **Environment and goals:** give OS/browser versions, OpenHero68 versions if
   already tested, desired features, and whether you can test on this exact board.

## Firmware packages (optional)

An official firmware image or updater can help compare protocol handlers between
revisions. Prefer a public **vendor source page and download link**. Record:

- Package filename and advertised firmware version.
- Exact target model, hardware revision and connection/receiver, if specified.
- Installed version on your board, separately from the package's target version.
- Where and when the package was obtained; include release notes if available.
- SHA-256 if you already downloaded the file. On Windows PowerShell:

  ```powershell
  Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\path\to\official-firmware.zip'
  ```

A file hash identifies the exact artifact; it does not prove compatibility or
authenticity. No device firmware dump, updater execution, bootloader entry or
flashing is required for a support request. If redistribution is unclear, link
the official source instead of uploading the binary. Mark third-party sources
explicitly rather than presenting them as official firmware.

## Technical evidence (optional)

Only collect what you are comfortable collecting. There is no required helper
script or coding step. On an unsupported model, capture the **official app's**
normal operations rather than sending OpenHero68's HERO68 commands to it.

### HID identity and descriptors

If you have a HID inspection tool, attach its interface/report descriptor dump
and tool name/version. Useful details are VID/PID, interface number, usage
page/usage, report IDs, input/output/feature report lengths and connection mode.
Windows Hardware Ids alone do not contain the full report descriptor; they are
still enough for an initial request.

### Protocol captures

Existing WebHID send/receive logs or USBPcap/Wireshark captures are useful. A
browser device log or screenshot may show discovery/errors but usually does not
replace report payloads. State what the capture actually contains.

Start with connection, firmware/settings reads and the official Hall travel test.
For travel, press and fully release one named key slowly, then repeat with two
keys together if the official test supports it. This helps distinguish per-key
depth readings from digital press events.

If you already capture settings changes, record **one ordinary setting at a
time**, its old/new values and whether it was saved to a profile. Useful examples
include actuation, RT, an onboard RGB effect and a single-key remap. Keep firmware
updates, factory reset and calibration out of these feature captures. Back up
settings in the vendor app if available before changing them.

Attach small, focused files and label each with:

```text
Model / hardware revision:
Installed keyboard firmware / receiver firmware:
Connection and VID:PID / interface:
Official app URL or version:
Capture tool and version:
Filename:
Timeline:
  00:00 connect; read version and settings
  00:05 open official travel test
  00:08 slowly press W fully, then release
Expected and observed behavior:
Original / changed / restored settings (if applicable):
```

GitHub may require a ZIP for some file types. Review captures before uploading:
avoid unrelated typing and remove serials, account details, tokens and personal
paths from logs/screenshots. Mention any redactions that affect packet analysis.

### Key positions and LED mapping

If known, include physical key to protocol ID/matrix position, Fn-layer mappings,
LED count/order and how each was measured. Separate measured values from guesses.
A HERO84 adapter may need different key IDs, matrix positions, feature limits and
LED order as well as its visible layout.

## How a request becomes supported

A submitted form is a request, not a compatibility declaration. Review should
distinguish identity/layout information, protocol implementation, and actual
hardware validation. Detection alone does not validate settings writes, analog
travel, RGB or gamepad output.

When test builds become available, record the exact model, firmware, connection
and build version, then report each tested feature separately. For example,
successful settings reads do not confirm RGB streaming; a working travel test
does not by itself confirm virtual-controller output or recovery on disconnect.
Features and transports that have not been tested should remain marked unverified.

The form's testing field lets maintainers find volunteers without requiring
hardware ownership or a development-build commitment from every requester.
