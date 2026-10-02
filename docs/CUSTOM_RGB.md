# Custom RGB and background service

RGB Settings opens Onboard Effects by default. Switching editor tabs does not
change keyboard playback. In Custom Effects, an offline service blurs the editor;
Try demo unlocks a local preview without HID writes or Hall polling. Download app
opens Settings > Background Service with the download and setup tutorial.

Run `service/dist/Hero68RgbService.exe`, then RGB Settings > Custom Effects >
Apply to keyboard. Apply transfers this preset to the service and routes
keyboard configuration through the service-owned HID connection, so AP, RT
and deadzone remain editable while RGB runs. Only edits following a successful
Apply are sent live. Losing the service or changing profile/session cancels
queued updates and requires Reapply; drafts remain local. Preset edits coalesce at 40 ms
intervals with at most one in-flight request. Closing the editor/page leaves
playback running. Use onboard lighting restores firmware lighting immediately;
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
- Aurora is a Custom Base option with brightness, ribbon width, speed and palettes.
  It drifts continuous vertical color curtains across the five-row layout without
  shimmer. Brightness affects the base independently of FX. Existing Aurora FX
  presets still render; new layers use Comet and reactive effects instead.
  Existing Aurora layers offer Move Aurora to Base, retaining palette, color,
  width and speed and converting opacity to base brightness.
  Aurora requires the background app and cannot be staged as an onboard mode.
  Comet sends two staggered stars with fading
  tails horizontally or vertically. Both offer Aurora, Sunset and Ice palettes
  or a single color. Palettes are stored in the existing version-1 preset.
- Pressure Wave emits rings every 500 ms while travel is active. Brightness follows
  strike velocity estimated from successive Hall positions, not held depth.
  Hero68 has no force telemetry; velocity is a proxy for strike strength. Faster
  strikes flash brighter, then settle over 600 ms to a quarter of their peak
  while held. Wave propagation uses the configured speed. Released rings fade, with at most 64 live
  rings. The service polls Hall automatically even after closing the browser.
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

The service reports `supportedEffects` in `/status`. The web editor blocks Apply
when the service cannot render a preset's effects and opens the setup/update
tutorial instead. Services without this field support only the legacy effects;
Demo can still preview the new effects without updating the app.
Aurora Base additionally requires `supportedBaseEffects: ["aurora"]`; an older
app supporting Aurora FX must still update before applying the new base format.

Travel normalizes against 3.4 mm, suppresses rest travel <=0.08 mm, and eases
in from 0.08 to 0.16 mm for analog effects. Mixing uses the deepest arrow's
normalized travel as opacity instead of switching to an opaque near-black
layer on tiny ADC fluctuations. That is a host assumption, not per-key calibration. Preview clicks
simulate full travel. Hall input in the service remains available without the
browser, via passive `98/01`, at most nine positions per response. Whole-board
snapshots are eight consecutive requests, not an atomic 68-key snapshot.

Target output is 60 FPS. A native high-resolution waitable timer owns USB
deadlines and writes each complete frame batch before servicing Hall commands.
Node renders the existing engine using elapsed time and submits the newest
frame in one IPC operation. The native worker repeats the last complete frame
if rendering is delayed; `/status` exposes distinct `renderFps` and `reusedFrames`
so repeated output is visible. Hall polling is owned by the service and shared
with the web over `/hall/stream`. A web Hall Stream no longer starts a second
USB polling loop. Up to ten selected keys are prioritized at a 100 Hz target;
a full-board viewer gets batched updates at about 30 Hz. Actual rate depends
on simultaneous LED traffic. For comparison, an older 40 FPS build's 60-second live ten-key test measured
88.9 samples/key/s and 38.4 FPS, with no HID timeouts. Ten keys require two
sequential Hall requests per snapshot, so the UI must not claim an achieved
100 Hz rate during concurrent playback. This measures telemetry throughput,
not end-to-end game input latency.
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
need 340 bytes. The renderer therefore merges neighboring colors into at most
32 groups, averaging their colors and favoring preceding key groups to reduce
palette flicker. Identical frames reuse their encoding, and fully black keys
remain black. It submits at most
196 aggregate bytes / four sequential packets. Frames with <=32 colors retain
their exact colors. Frames are serialized with Hall reads; there is no unbounded
queue or overlapping device I/O. Onboard mode submits `08/02 [0,0,0]` but
keeps HID open for configuration; Quit closes it.
No persistent `06`/`04` writes are used for animation.

The known live protocol addresses main keys only. The 18 side LEDs retain their
onboard effect; the preview's side frame is not streamed. Rhythm Sync is described
in [RHYTHM_SYNC.md](RHYTHM_SYNC.md). Gamepad and Spiral/Noise host FX remain outside
this service. The tray Check for updates
checks GitHub Releases through the local service and shows a window message
when current, without opening the control panel. Compatible signed core
updates are applied and restarted automatically. A release requiring a newer
native launcher downloads a checksum-verified ZIP into the local service
downloads folder and asks whether to open it; quit the old tray app and
extract the ZIP over its folder before restarting. The native launcher
verifies the Ed25519 manifest and SHA-256 hash for core updates and rolls back
if its health check fails. The private signing key stays outside the repository.

## Build and verification

`npm run build:service` bundles the existing engine and builds both native
executables with MSVC /MT, copying the current Node runtime into the package.
Set `HERO68_VCVARS` to override the build machine's vcvars64.bat path.
If a running app locks native outputs, use
`npm run build:service -- --out-dir .refactor/rgb-service-check` to build separately.
`npm run build` verifies the editor. Tests cover packet limits/checksums/POS,
base-engine reuse, composition, analog FX distinctions and preset restoration:

```
node --test tests/custom-rgb.test.mjs tests/rgb-service.test.mjs
```

Normal profile Save still only writes onboard zones and painted key colors.
Host layers live in the local profile and exported preset; Start service RGB
stores a separate copy for background playback.

## Hosted web and browser permission

The Windows app accepts the production website `https://open-hero68.pages.dev`
as well as the existing local development origins. Cloudflare preview domains
and unrelated sites are not automatically allowed. The app still listens only
on `127.0.0.1:16868`; users can explicitly add another origin with `--allow-origin`.

On recent Edge/Chrome versions, choose **Allow** when the website asks to access
apps and services on this device. The web shows a static arrow and explanation
while that permission is pending, and keeps preview/demo available. If blocked,
allow access from the site controls beside the address bar, then **Check again**.
The service timeout starts after granting permission, with a bounded 90-second
wait for an unanswered prompt. Browsers without the permission API retain the
ordinary service check. See [Microsoft's LNA guidance](https://learn.microsoft.com/en-us/deployedge/ms-edge-local-network-access).

Core 0.2.3 includes support for the Pages origin. Quit the tray app before
extracting the complete updated Windows package. A newer bundled core takes
precedence over an older downloaded core when the updated app starts.
