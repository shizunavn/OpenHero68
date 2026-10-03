# Hall telemetry recovery and stable scrollbars

The workspace, sidebar and nested editors now use an 8 px dark scrollbar with
no arrow buttons. Stable scrollbar gutters reserve width before overflow starts.
Hall dashboard cards remain 240 px high. A fixed two-column, five-row grid shows
ten active keys at once, in keyboard order, without an inner scrollbar. Fully
released keys leave the active list immediately. Larger chords cycle through
groups of ten every 2.2 seconds, with a group indicator; the keyboard preview
continues showing all key travel. Two-handed testing requires no mouse scrolling.

WebHID registers the response waiter before sending, but starts its read deadline
after `sendReport` completes. A separate delivery deadline protects against a
stalled write; that failure marks the channel unavailable so queued commands
cannot overtake an unresolved write.

Read-only Hall polling allows at least 8 ms between successful requests (at most
125 requests per second). Dropped replies retry the same positions, reduce the
batch size, and back off progressively at one-key batches. A temporary outage
keeps the stream active with a recovery indicator and clears stale pressed
visuals. If singleton reads still time out, the serialized control channel closes
and reopens its HID handle once, then verifies it with an identity read. This
does not send firmware reset, polling-rate or calibration commands.

The continuous outage budget is 15 seconds, reset by a successful snapshot.
Physical disconnection, non-timeout transport failures or an exhausted outage
budget still stop the stream and retain a useful diagnostic. Reopening alone
does not count as recovered telemetry.

Transport validation: TypeScript/Vite build and 487 Node tests passed. The
subsequent UI revision also passed the build and browser checks: all ten keys
fit inside the grid without scrolling, and seven automatic groups covered all
68 distinct keys. Page scroll height and dashboard height stayed constant.
These tests use simulated HID devices and samples. A live keyboard stress run
has not been performed for this patch.
