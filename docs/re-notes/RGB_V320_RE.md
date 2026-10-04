# RGB preview and onboard settings — firmware 0320

The original updater was not run, modified or flashed. The supplied V3.20 EXE
matches the existing RE copy: SHA-256
`8f4b35d542a39a4d03f50fff26e0258f6c1fd31de2b5c535fe2809d988a999d0`.
The reused `firmware/0320/firmware.bin` is SHA-256
`3cd37447b8f89061e958dfddf89f109f660f2def8dccba8a1cab57b955a4f361`.
Flash addresses below equal file offsets plus `0x08008000`.

## Coverage and implementation

The earlier catalog, protocol, side-effect dispatcher and serializer notes in
`hero68_re/docs` were reused. Missing main effect arithmetic was recovered from
the two 20-entry dispatch tables at `0x080208FA` and `0x080209BC`.

Rather than substituting visually similar JavaScript animations, the port uses
a bounded Thumb arithmetic IR. `tools/export-rgb-firmware.py` decodes the closed
RGB call graph into `src/keyboard/rgbFirmware0320.json`; `rgbArm.ts` implements
its integer operations, flags, wraparound, LUT reads and SRAM state. The IR
contains the effect formulas and their shared helpers directly, rather than a
hand-transcribed approximation. It cannot access USB, flash writes or MMIO.
`rgbPreview.ts` is the independent simulation API; React only displays frames.

| ID | UI label | Initialize | Frame handler | Evidence covered |
|---:|---|---|---|---|
| 0 | Off | 080205B4 | 08020A68 | threshold/clear |
| 1 | Static | 080205B4 | 08020AAC | configured color or seeded palette |
| 2 | Breathing | 080205C4 | 08021274 | LUT, phase, integer channel scaling |
| 3 | Rainbow | 080205DC | 080213A8 | 192-phase palette cycle, uniform fill |
| 4 | Reactive | 080205EC | 0802143C | press masks, shared decay |
| 5 | Starry | 08020620 | 08021470 | PRNG, per-column state |
| 6 | Ripple | 0802064C | 080214E8 | autonomous state/LUT transitions |
| 7 | Key Ripples | 080206B4 | 08021600 | key-event masks, shared decay |
| 8 | Raindrops | 08020714 | 08021634 | PRNG/shared updates |
| 9 | Snowflakes | 08020718 | 080216B8 | held-key mask, per-cell decay |
| 10 | Continuous Flow | 08020300 | 08020B0C | phase/grid traversal |
| 11 | Windmill | 08020320 | 08020B94 | grid/phase arithmetic |
| 12 | Follow Shadow | 08020330 | 08020CE8 | press/release and per-cell state |
| 13 | Light Wave | 08020408 | 08020D18 | LUT/grid traversal |
| 14 | Scan | 08020440 | 08020D7C | LUT/grid traversal |
| 15 | Rotating Circle | 08020470 | 08020E9C | LUT/grid traversal |
| 16 | Waterfall | 080204C0 | 08020F60 | LUT/grid traversal |
| 17 | Bloom | 080204E0 | 08021008 | LUT/grid traversal |
| 18 | Spinning Storm | 08020500 | 08021134 | LUT/grid traversal |
| 19 | Per-key Color | 08020528 | 0802120C | three persistent color planes |

All listed handlers and their reachable arithmetic helpers are included in the
IR. Single/Multicolor and speed branches remain original instructions. Exact
artistic/marketing names for effects 10–18 are not algorithm definitions.

Side IDs 0–5 reuse `0x0801BD94`, TBB `0x0801BE10`: Off, spatial Rainbow,
Color Cycle, Static, Breathing, Bounce. There are 18 logical positions, not a
claim of 18 physical LED packages. The UI shows their logical sequence; the
physical side-strip orientation/fan-out still needs hardware comparison.

## Time, color, events and state

* Main MIX is stored at **`20000068`**, confirmed independently by the command
  handler literal at `0801DF40`, the Static color helper literal at `0801FFE8`,
  and Scan's literal at `08020E70`. MIX 7 selects Multicolor. The initial preview
  adapter incorrectly wrote `20000058`, so the effects stayed in Single mode
  (white settings rendered gray/white). The old reference adapter repeated that
  mistake: its passing frames did not validate Multicolor. Both adapters are now
  corrected and the fixtures regenerated. Separate semantic tests require
  chromatic output with Single RGB set to white in all 18 illuminated effects,
  including a dedicated Scan regression. Off and Per-key Color have no MIX effect.
* The preview now executes main dispatcher `080208B8`, including deferred mode
  initialization via flag bit 1. The Thumb port distinguishes word-aligned PC
  for literal loads from the unaligned PC used by TBB at `080208FA`.
* SysTick initialization `0x080218F0` divides the clock by 2000. The job installed
  by `0x0801C398` has period 1; callback `0x080190B8` increments 16-bit counters
  at `20000080`, `20000086`, `20000088`. Nominal simulation step is **0.5 ms**.
  Cooperative scheduling and LED transmission can delay actual output.
* Main speed threshold is `25 + 10*(5-speed)`, recovered at `0x08015722` and
  `0x0801DBC2`, giving 75/65/55/45/35 ticks. Handlers retain their individual
  comparisons (`>` versus `>=`) and fixed thresholds. Side speed uses the
  original LUT at `0x080226EF`.
* Main brightness is raw 0–20, output `floor(channel * brightness / 20)`.
  **Correction to the proposed plan:** side brightness is a LUT index 0–4 at
  `0x08029B98`, values `[0,5,10,15,20]`. Sending indices 5–20 would read adjacent
  unrelated data. Its UI therefore uses 0/25/50/75/100%, with wire values 0–4.
  This supersedes the earlier generic protocol note for the side zone.
* `0x080145F0` limits estimated combined RGB current: compute
  `sum(floor(channel*160/255))`; if greater than 240, replace each channel with
  `floor(channel*240/sum)`. Thus static Single white becomes 127/127/127.
  Custom table colors follow their own original handler and are not subjected
  to an invented gamma curve. Screen light is not calibrated LED light.
* PRNG `0x080101CC`: `seed = (seed*0x41C64E6D + 12345) mod 2^32`, return
  `seed >>> 1`, seed at `20000444`. Replay starts with seed 1. This is reproducible
  sample state, not synchronization with the keyboard's current random state.
* Press entry `0x080200B8` dispatches **only modes 4, 7, 9, 12**; release entry
  `0x0802009C` dispatches modes 9 and 12. The byte queue consumer at
  `0x080110E0` strips bit 7 for releases. Mode 7's previously suggested label
  “Music reactive” was incorrect: it consumes key events, not a microphone.
  Mode 6 is autonomous. Masks/per-cell arrays provide simultaneous cell state
  across the 21×6 grid; there is no invented one-effect-at-a-time restriction.
* Real reset `0x08020040`, clear `0x080111B4` and frame clear `0x0801699C` are
  executed in the port. Settings changes retain other SRAM/counters/PRNG and
  invoke the appropriate original initializer. Replay starts a fresh sample.

## Coordinate spaces

There are three distinct spaces:

1. The existing confirmed configuration protocol POS table in `keyPositions.ts`.
2. Event/custom-plane indices translated by ROM `0x08022153` (126 entries),
   followed by coordinate tables `0x0802228A` and `0x08022308`.
3. The frame at `20000DBC`: `column*18 + row*3`, subsequently serialized as
   five physical key rows with 15/15/14/14/10 entries, rows 1–5. Row 0 is padding.

Preview maps those serialized rows onto the 68 frontend keys, and inverts the
ROM table for events/custom-plane loading. Protocol POS is never used directly
as an effect index. The 16×6 output transpose/GRB swap belongs to transmission,
not screen rendering. Geometry is supported by the serializer RE, but physical
key/LED ordering still needs a controlled hardware comparison.

## Environment adapters

The external calls excluded from the arithmetic graph are:

| Address | Adapter contract |
|---|---|
| 0801558C | Persistent color planes are supplied from the host draft |
| 08019050 | Config RGB/table bytes have already been loaded into isolated SRAM |
| 08012204 | Offline flash-busy query returns 0 |
| 0801F320 | Offline flash polling has no action |
| 080166BC | Physical side output scaler has no hardware action; display applies its LUT brightness |
| 080166A4 | Physical key output scaler has no hardware action; display applies key brightness |
| 08021A04 | Keyboard status indicators/lock overlays are excluded from the effect preview |

These adapters are shared by the original ARM reference execution, but the
reference CPU implementation is independent (Unicorn 2.1.4). Fixtures verify
effect arithmetic rather than flash/peripheral behavior. Keyboard indicator,
sleep/lock overrides and Hall processing are outside this preview's scope.

## Settings and verification

`rgb.ts` implements `04/84` zones 1/6 and `06/86` zone 0. Table groups have at
most 11 records, transaction TOTAL/SEQ. Table readback completes before mode 19
is selected, including when an already active mode-19 table changes. Side MIX
keeps seven populated bytes while declaring LEN=4 and recomputing checksum.
Every changed component is read back before its baseline advances. Failure
keeps the remaining draft; unknown modes and nonstandard MIX values survive
hydration. Controls/preview have no transport dependency or packet writes.

Zone comparisons use wire semantics, not JSON property order. In MIX=7 the
firmware skips Single RGB writes (`0801DBE0` → `0801DC8C` for keys,
`0801DDE6` → `0801DE58` for side), so a readback can retain old Single RGB.
Those inactive bytes are excluded from mismatch/dirty checks while mode, MIX,
brightness and speed remain verified. Single mode still verifies all RGB bytes.
Regression coverage reproduces retained Single colors on both zones and confirms
that a valid key readback allows the following Side Light write to complete.

Draft/baseline/dirty fields are stored per onboard profile. Old persistence
without RGB hydrates from the keyboard before Save. Manual Refresh preserves
explicit edits; successful Save replaces them with readback. RGB selection is
local to the page and never changes AP/RT selection. Background service capability
defaults to unavailable; Custom Effects has no active buttons or fake installer.

`tests/fixtures/rgb0320.json` contains **300 original-ARM cases**: all 20 key
modes × 5 speeds × Single/Multicolor, all 6 side modes × 5 speeds × both forms,
and 40 long runs with mode transitions through tick 20000 (10 seconds). Each
case includes fixed multi-key press/release events and exact raw frames. The
test suite compares every recorded key/side byte. Additional tests cover 68-key
mapping, brightness endpoints, table grouping, unknown-mode preservation,
legacy hydration, mode-19 order, no-op Save, readback and partial failure.

To reproduce offline, install `tools/requirements-rgb-re.txt` using **py**, then
run `py tools/export-rgb-firmware.py`, `py tools/rgb-reference.py`, `npm test`,
`npm run build`. Firmware is read from the existing user-provided RE workspace;
the browser build does not need Python or Unicorn.

Validation levels remain separate:

* **Recovered:** closed main/side RGB arithmetic, LUTs, reset/event paths.
* **Frame checked:** the recorded 300 cases against the original ARM CPU,
  including long phase progression and actual mode changes. This is not an
  exhaustive proof for every possible seed/input history.
* **Hardware:** existing main protocol/custom-table evidence is reused. This
  implementation's side MIX round trip is simulated; physical round trip,
  LED ordering/appearance and V3.23 effect equivalence are **not confirmed**.
  No firmware or settings were flashed to obtain the fixtures.
