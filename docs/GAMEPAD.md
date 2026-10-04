# Gamepad and shared Hall — service 0.4.6 / API 6

## Using gamepad

Windows x64, one AULA HERO68 and the separately installed official ViGEmBus
1.22.0 driver are required for live output. The portable service includes the
statically linked MIT ViGEmClient adapter and its license; it does not install
or change drivers. The entire Gamepad page stays blurred and inert until a live,
compatible service explicitly reports `driverAvailable: true`. Being enabled
does not substitute for driver confirmation. Missing service, an incompatible
service, and missing ViGEmBus each show an appropriate setup prompt. A lost
service stream locks the page again, even if a previous status was ready.
After installing ViGEmBus, restart the service and use **Check again**.
The tester's local demo is available after this same access check and never
starts hardware polling.

- **Setup & Remap:** select or drag a control onto a keyboard key. Right-click
  removes its binding. Each physical key has one binding; several keys may use
  the same output. Rates are 50, 100 or 200 Hz for analog controls and 200 Hz for
  digital buttons. Start/Stop is also available in the Windows tray.
- **Configuration:** monotonic, piecewise linear curve, Linear/Aggressive/Slow/
  Smooth/Instant presets, per-binding start deadzone and full-output travel,
  circle/square, Snappy and optional 30–60° angle adjustment. Defaults are
  0.10–3.40 mm, linear, circle, Snappy enabled and angle adjustment disabled.
  Snappy chooses the stronger opposing input and cancels ties. With Snappy
  disabled, opposing inputs subtract. Duplicate analog outputs take the maximum;
  duplicate digital buttons use OR. Analog does not depend on keyboard actuation
  or Rapid Trigger; digital buttons use Hall distance and the key's AP, split RT
  thresholds and deadzones read from the selected firmware profile. The diagnostic
  Hall pressed flag is not used as the digital button state. Analog travel inputs
  are hidden for digital bindings. The first press crosses AP; RT releases from
  the deepest pressed point and reactivates from the shallowest released point,
  including below AP until the top deadzone resets the stroke. Settings are read
  at Start, profile/binding changes and after AP/RT/deadzone writes through the
  service. Failed or incomplete readback stops output instead of using defaults.
  This requires the complete Windows 0.4.6 package, including its native helper.
- **Tester:** live Hall travel, expected Xbox report, XInput verification, measured
  Hall/output rates, stale samples and active consumers. XInput may briefly lag
  a changing report or a newly enumerating controller; pending verification is
  displayed rather than assumed successful. Demo never starts hardware polling.

Local drafts and service configurations are stored separately for HERO68 profile
slots 0–2. Import/export accepts version 1 JSON. Changes apply automatically
as one operation; editing an inactive slot does not disrupt the active slot.
Rapid edits coalesce into one latest draft with at most one write in flight;
Start/Stop use the same queue. Curve dragging updates the graph immediately
but writes neither local storage nor service configuration until release.
Canceled gestures restore the previous curve. Live edits neutralize output
while replacing mapping/subscriptions, retain the existing Xbox target and
rewrite firmware remaps only if assigned keys or suppression settings change.
Selecting a physical HERO68 profile through the service also selects its gamepad
configuration. A fresh editor loads the service configuration when there is no
local draft for the current slot.

Keyboard input stays enabled unless **Mapped-key override** is enabled. Its
default backend writes the verified empty remap action `0x00000000` for assigned
keys on all three layers. Before any write, the service flushes a recovery journal
to disk with the exact original actions. Stop, changing profile/configuration,
shutdown, disconnect and suspend restore those actions. A restarted service
recovers the journal with Gamepad disabled. An unplugged device retains its
pending journal and reconnect recovery retries at 250/500/1000/2000 ms. Recovery
checks the HID device path and serial when available; use the original keyboard
and USB port. With firmware that exposes no unique serial, replacing a keyboard
with another identical unit at the same port cannot be distinguished. External
nonzero remap edits are preserved; settings reads see original actions while
Gamepad owns temporary empty remaps. Assigned Advanced Keys are rejected because
emptying a normal remap cannot guarantee blocking their separate actions.

**Windows hook fallback** in Configuration is off by default. Selecting it uses
an independent `WH_KEYBOARD_LL` message thread; the callback never waits for HID,
Xbox output or the service queue. It follows verified standard main-layer remaps,
preserves matching releases for keys pressed before activation and injects only
marked `SendInput` key-up cleanup outside the callback. It affects matching keys
on other keyboards too and cannot promise suppression in games using Raw Input
or higher integrity levels. The anti-cheat warning appears only when this
fallback is selected. Firmware blocking avoids installing this hook; it does
not establish approval from any game's anti-cheat. DirectInput, mouse-to-stick,
kernel keyboard filters and multiple keyboards/controllers remain outside v1.

The full Windows **0.4.1** package is required for keyboard blocking and fast
input streaming; a JavaScript core update alone cannot replace its native helper.
Tester input uses a demand-driven lightweight SSE stream near 60 Hz and separate
animation consumers for the keyboard and controller. Full diagnostics remain
at 4 Hz. An unambiguous standard Xbox browser Gamepad API report may update on
animation frames when it agrees with the native report; otherwise the native
stream is used. The tester adds no Hall subscription and closes its input stream
when leaving the tab, hiding the document or losing service access. Analog
measured Hz excludes the separate 200 Hz digital-button demand.
RGB receives transitions for firmware-blocked keys from the already shared
Gamepad Hall samples, preserving reactive effects without requesting more keys.

## Hall ownership and demand

`service/hallBroker.ts` provides `subscribe`, `update` and `unsubscribe`, validating
each consumer's key set and requested frequency. Native `hall_core.h` receives
their union and merges the active gamepad bindings. Each key uses the highest
active demand. Gamepad and RGB therefore share a single read for common keys.

| Consumer | Source keys | Demand |
| --- | --- | --- |
| Gamepad stick/trigger | Assigned analog bindings | 50/100/200 Hz |
| Gamepad buttons | Assigned digital bindings | 200 Hz |
| RGB Pressure Wave | Enabled layer's output keys | 100 Hz |
| RGB Mixing | Left, Down, Right arrows | 100 Hz |
| RGB Touch/Jelly/AOE | All 68 source keys, independently of output LEDs | 100 Hz |
| Browser Hall Stream | Its requested keys; all 68 for the matrix monitor | 100 Hz |
| Settings visual feedback | Selected tracked keys while enabled | 100 Hz |

Layers with no output, zero opacity or disabled state do not register. Opening
pages, choosing an effect in an unapplied editor and reading gamepad status do
not register. RGB without analog demand continues with zero Hall requests.
RGB demand stays 100 Hz when gamepad is enabled. There is no 60 Hz Hall reduction
policy. Existing RGB render/LED export remains at its existing 60 FPS target.

The native helper owns keyboard HID reads and writes. It batches at most nine
due keys using only passive `0x98/01`. Whole LED frames and configuration
transactions serialize with Hall. Deadlines advance into the future after a
successful read; missed work is not queued or replayed. Shared cache records have
capture timestamps and sequence numbers. Pressure Wave uses capture intervals
and ignores repeated sequences when calculating strike velocity.

Subscriptions replace their key sets atomically. Closing a browser connection
releases only its consumer. Gamepad and applied RGB remain in the service. The
last consumer leaving removes Hall demand and stops subsequent Hall requests;
an already running request is allowed to complete. A browser connected through
the service consumes SSE snapshots rather than polling WebHID. Handoff drains
the old browser polling loop before closing its handle and using the service.
No firmware calibration or hardware polling-rate setting is changed by gamepad.

## Safety and recovery

The ViGEm adapter owns a separate worker and timer. Its watchdog neutralizes
output when any assigned key's last sample is at least 50 ms old, even while
the HID scheduler or service IPC is blocked. Configuration/profile changes,
pauses, suspend and device failures neutralize output and clear arming. Output
resumes only after valid samples show all assigned keys at rest. HID retries
use 250/500/1000/2000 ms backoff; stale caches are cleared. Helper failure closes
the service so its launcher can restart it. Gamepad always starts disabled.

ViGEmBus 1.22.0 initializes its Xbox device with a nonzero captured boot packet,
while its duplicate-report cache starts zero. The adapter forces a one-unit
four-axis cache transition (raw values 1/2/3/4), identifies its own XInput slot,
sends neutral and only then reports
ready. No button or trigger is used during this bootstrap. The native adapter
is isolated in `gamepad_output.h` so another backend can replace it later.

From 0.4.5, a cold Xbox startup that exceeds ViGEmBus 1.22.0's one-second
ready wait keeps the same child plugged in for up to ten more seconds. It awaits
that child's driver readiness signal by repeating WAIT_DEVICE_READY on the
same serial. Output starts only after the driver confirms boot; timeouts
never count as ready. Fatal errors or an expired wait unplug the child and
preserve the Windows error. Only Xbox Start gets a 15-second native watchdog
and 30-second browser request window; normal HID and status deadlines stay
short. This handles delayed Windows enumeration without manual Start retries;
persistent driver failure or all four XInput slots being occupied still fails.

## Local API

The service listens on `127.0.0.1:16868`, enforcing its existing origin and body
limits. Existing RGB/device APIs retain their shape. POST bodies use JSON.

| Endpoint | Behavior |
| --- | --- |
| `GET /gamepad/status` | Configuration, report, XInput, samples, rates, timeouts, consumers |
| `GET /gamepad/events` | Observational SSE status; no Hall subscription |
| `POST /gamepad/config` | `{slot, configuration}`; validate and persist the complete configuration |
| `POST /gamepad/profile` | `{slot}`; neutralize and load that saved gamepad configuration |
| `POST /gamepad/start` | Optional `{slot, configuration}`; connect, create one Xbox target and subscribe |
| `POST /gamepad/stop` | Neutralize, remove target and release gamepad consumers |
| `GET /hall/stream?keys=KeyW,KeyA` | Browser subscription, 100 Hz; disconnect unsubscribes |

Configuration schema is defined in `src/keyboard/gamepad.ts`: `version:1`,
`rate`, `bindings:[{keyId,action,startMm,endMm}]`, `curve:[[x,y],...]`, `snappy`,
`square`, `angleEnabled` and `angle`. Curves have 2–16 points, strict ascending
x, nondecreasing y and fixed `[0,0]`/`[1,1]` endpoints. Bounds and duplicate
physical keys are rejected before mutation. Service persistence uses atomic
file replacement at `%LOCALAPPDATA%\OpenHero68\rgb-service\gamepad.json`.

## Validation and packaging

```powershell
npm test
npm run build
npx tsc --project service/tsconfig.json
node service/build.mjs --out-dir .refactor/gamepad-service
cmd /c tools\check-native-gamepad.cmd
# Requires ViGEmBus; do not run alongside another gamepad test.
cmd /c tools\check-native-gamepad-output.cmd
# Short hardware benchmark; durations are per scenario.
node tools/benchmark-gamepad-service.mjs --seconds 30 --output .refactor/gamepad-benchmark
node tools/package-rgb-service.mjs .refactor/gamepad-service service/releases/gamepad-v0.4.0
node tools/verify-service-package.mjs .refactor/gamepad-service service/releases/gamepad-v0.4.0
```

The benchmark temporarily stops existing service playback and restores it in
`finally`. It uses its own state directory and port 16869. It verifies zero idle
requests, ordinary RGB with no Hall, two browser subscriptions, independent
RGB/gamepad stop, profile changes and concurrent read-only configuration. Six
rate scenarios cover 6/10 analog bindings, Pressure Wave, Touch, Jelly, AOE and
Mixing plus a 68-key monitor. An optional `--stress-seconds` flag adds a continuous
phase with 10 analog bindings, Pressure Wave and a 68-key monitor; it is disabled
by default. The requested 2-hour stress run was canceled at the user's direction.
Logs and summary JSON include Hall/output
Hz and p99, LED FPS, Node+native CPU and RSS, timeout and pending request counts.
The harness keeps bounded in-memory metrics and streams records to disk.

Hall lifetime p99 uses fixed 0.25 ms buckets; recent exact p99 uses a bounded
512-gap window. Metrics reset when a key's requested rate changes. Benchmark
acceptance requires average minimum assigned-key rate >=190 Hz, lifetime Hall
p99 <=10 ms, zero timeouts, a verified final XInput report and a bounded queue.
Measured rates are exposed even when hardware cannot reach the requested rate.

Hardware results are recorded separately from implementation. Sleep/wake and
physical cable unplug/replug need manual device-level verification; automated
watchdog/pause tests do not claim to replace those checks. Packages are local
artifacts until explicitly published. The publisher verifies uploaded assets
before setting the release as the latest download.
See [recorded validation results](GAMEPAD_VALIDATION.md) for measured checks and
their actual durations.
