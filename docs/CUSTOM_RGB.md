# Custom RGB and background service

Run `service/dist/Hero68RgbService.exe`, then RGB Settings > Custom Effects >
Start service RGB. Start transfers this preset to the service and routes
keyboard configuration through the service-owned HID connection, so AP, RT
and deadzone remain editable while RGB runs. Preset edits coalesce at 40 ms
intervals with at most one in-flight request. Closing the editor/page leaves
playback running. Switching to Onboard restores firmware lighting immediately;
the bridge retains the HID handle so AP/RT/Save keep using one transport.
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

The control panel is http://127.0.0.1:16868/ (Onboard, Exit service, import,
and Check for updates).
Configuration and local transport logs are in
`%LOCALAPPDATA%/OpenHero68/rgb-service`. A saved enabled preset resumes when
the executable is restarted after an unexpected exit; graceful Exit disables
playback. It reconnects after device I/O failures. Only one launcher runs.
The HTTP server binds only loopback, validates Host and allowed Origin, and
requires JSON for mutations. For another editor origin launch the exe with
`--allow-origin https://your-host:port`. Configuration requests use a restricted
command allowlist checked by both the HTTP service and native bridge.

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
- FX Multicolor chooses a random hue from eight saturated colors, preferring
  colors different from the base at the trigger key and avoiding consecutive
  repeats. A press keeps one hue throughout its ripple/reaction/trail; analog
  Jelly/AOE keep it until travel returns to rest. Touch keeps one hue for the
  whole active bar, even when the deepest key changes. Scan/Breath choose once
  per animation cycle. The underlying color is reduced slightly inside active
  Multicolor FX so their shapes stand out on rainbow bases; fades remain smooth.
  Mixing's RGB components and RT Display's status colors retain their semantics.
- RT Display shows green/red from the reported Hall pressed flag. The flag's
  exact correspondence to the firmware RT output state is not established.

Travel normalizes against 3.4 mm, suppresses rest travel <=0.08 mm, and eases
in from 0.08 to 0.16 mm for analog effects. Mixing uses the deepest arrow's
normalized travel as opacity instead of switching to an opaque near-black
layer on tiny ADC fluctuations. That is a host assumption, not per-key calibration. Preview clicks
simulate full travel. Hall input in the service remains available without the
browser, via passive `98/01`, at most nine positions per response. Whole-board
snapshots are eight consecutive requests, not an atomic 68-key snapshot.

Target output is 40 FPS; a native high-resolution waitable timer paces frames
when Hall streaming is idle. Hall polling is owned by the service and shared
with the web over `/hall/stream`. A web Hall Stream no longer starts a second
USB polling loop. Up to ten selected keys are prioritized; a full-board viewer
gets batched updates at about 30 Hz. Actual rate depends on simultaneous LED
traffic: a live ten-key test with RGB measured about 152 samples/key/s and
39 FPS, with no HID timeouts over two minutes. This is below the standalone
200 Hz benchmark, so the UI must not claim 200 Hz during concurrent playback.
Firmware live RGB `08/01`
is fire-and-forget: IPC acknowledges OS write completion, not a firmware ACK.
Hall and identity replies still validate checksum, command, zone and positions.
Live LED IDs are POS bytes: the fw0320 parser at `08021C9C` calls `08012D08`,
looks up the POS in the u16 table at `08029B9E`, and translates the resulting
index through the coordinate tables. These are not fake UI matrix values.

While service RGB runs, the web preview receives `/frames` server-sent events
after each completed output frame. It displays the same quantized colors sent
to the keyboard, including random FX colors, without running a separate local
animation clock. This confirms OS write completion; it is not LED readback.

The aggregate CMD08 length is a byte. A 68-key frame with 68 unique groups would
need 340 bytes. The renderer therefore selects at most 32 colors by farthest
point palette sampling, maps each key to the nearest color, and submits at most
196 aggregate bytes / four sequential packets. Frames with <=32 colors retain
their exact colors. Frames are serialized with Hall reads; there is no unbounded
queue or overlapping device I/O. Onboard mode submits `08/02 [0,0,0]` but
keeps HID open for configuration; Quit closes it.
No persistent `06`/`04` writes are used for animation.

The known live protocol addresses main keys only. The 18 side LEDs retain their
onboard effect; the preview's side frame is not streamed. Rhythm Sync, Gamepad,
Spiral/Noise host FX are outside this service. The control panel checks GitHub
Releases and can install a signed core-only update. The stable native launcher
verifies the Ed25519 manifest and SHA-256 hash, restarts the core, and rolls
back if its health check fails. An update requiring a newer launcher directs
the user to download the full ZIP. The private signing key stays outside the
repository.

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
