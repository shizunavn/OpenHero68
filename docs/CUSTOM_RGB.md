# Custom RGB and background service

Run `service/dist/Hero68RgbService.exe`, then RGB Settings > Custom Effects >
Start service RGB. Start transfers this preset to the service and releases
the browser HID connection. Edits made in that editor session are sent after
350 ms debounce. Closing the editor/page leaves playback running. Stop service
RGB releases HID; browser Connect also stops playback before opening WebHID.
Close other keyboard configuration applications while rendering.

The executable is a Windows background application, not an installed Windows
SCM service. It runs in the Windows system tray, without administrator rights
or driver installation. Its menu opens the editor, control panel, logs and
latest release page, starts/stops RGB, and exits gracefully. Optional Auto-start
uses HKCU's Windows Run key and is disabled by default. Extract to a permanent
folder before enabling it; disable it before moving/removing the folder.
Keep the whole `service/dist` folder together: the native launcher starts
the bundled Node runtime and existing TypeScript color engine; the native C++
bridge owns Windows HID. Node/Python need not be installed on the user's PC.
A Windows job object makes the helper processes end with the launcher.

The control panel is http://127.0.0.1:16868/ (Stop RGB, Exit service, import).
Configuration and local transport logs are in
`%LOCALAPPDATA%/OpenHero68/rgb-service`. A saved enabled preset resumes when
the executable is restarted after an unexpected exit; graceful Exit disables
playback. It reconnects after device I/O failures. Only one launcher runs.
The HTTP server binds only loopback, validates Host and allowed Origin, and
requires JSON for mutations. For another editor origin launch the exe with
`--allow-origin https://your-host:port`. It exposes no arbitrary HID command API.

## Rendering and transport

The renderer reuses `FirmwareRgbPreview` for the 20 AULA base effects. Up to
eight host FX layers (including duplicates) compose over the base, using physical
key centers, individual key scopes, enabled flags and opacity. This is a visual
reconstruction, not Wooting source code. User-provided FX notes guided these
host behaviors:

- Scan reverses at the edges; Breath oscillates over time.
- Ripple expands from presses; Reaction lights held keys then fades.
- Trail fades only the pressed key.
- Jelly's area grows with Hall travel; AOE's fixed area scales in brightness.
- Touch displays maximum travel on the ten number keys.
- Mixing uses Left/Down/Right travel for RGB components.
- RT Display shows green/red from the reported Hall pressed flag. The flag's
  exact correspondence to the firmware RT output state is not established.

Travel normalizes against 3.4 mm, suppresses rest travel <=0.08 mm, and eases
in from 0.08 to 0.16 mm for analog effects. Mixing uses the deepest arrow's
normalized travel as opacity instead of switching to an opaque near-black
layer on tiny ADC fluctuations. That is a host assumption, not per-key calibration. Preview clicks
simulate full travel. Hall input in the service remains available without the
browser, via passive `98/01`, at most nine positions per response. Whole-board
snapshots are eight consecutive requests, not an atomic 68-key snapshot.

Target output is 40 FPS; a native high-resolution waitable timer paces frames.
Reactive presets read all 68 keys once per render cycle (approximately 40 Hz),
not the separately benchmarked ten-key 200 Hz path. Firmware live RGB `08/01`
is fire-and-forget: IPC acknowledges OS write completion, not a firmware ACK.
Hall and identity replies still validate checksum, command, zone and positions.
Live LED IDs are POS bytes: the fw0320 parser at `08021C9C` calls `08012D08`,
looks up the POS in the u16 table at `08029B9E`, and translates the resulting
index through the coordinate tables. These are not fake UI matrix values.

The aggregate CMD08 length is a byte. A 68-key frame with 68 unique groups would
need 340 bytes. The renderer therefore selects at most 32 colors by farthest
point palette sampling, maps each key to the nearest color, and submits at most
196 aggregate bytes / four sequential packets. Frames with <=32 colors retain
their exact colors. Frames are serialized with Hall reads; there is no unbounded
queue or overlapping device I/O. Stop submits `08/02 [0,0,0]` and closes HID.
No persistent `06`/`04` writes are used for animation.

The known live protocol addresses main keys only. The 18 side LEDs retain their
onboard effect; the preview's side frame is not streamed. Rhythm Sync, Gamepad,
Spiral/Noise host FX are outside this service. Check for updates opens GitHub
Releases; updates are downloaded and extracted manually.

## Build and verification

`npm run build:service` bundles the existing engine and builds both native
executables with MSVC /MT, copying the current Node runtime into the package.
Set `HERO68_VCVARS` to override the build machine's vcvars64.bat path.
`npm run build` verifies the editor. Tests cover packet limits/checksums/POS,
base-engine reuse, composition, analog FX distinctions and preset restoration:

```
node --test tests/custom-rgb.test.mjs tests/rgb-service.test.mjs
```

Normal profile Save still only writes onboard zones and painted key colors.
Host layers live in the local profile and exported preset; Start service RGB
stores a separate copy for background playback.
