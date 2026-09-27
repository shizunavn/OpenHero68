# Advanced Keys UI

The Advanced Keys page offers SOCD, DKS, Mod Tap, Toggle, MPT and END. It uses the supplied mode icons, a neutral keyboard preview, a two-column mode/binding overview and a selection/configuration flow. Existing bindings are marked on their physical keys and can be edited or removed.

Only Main Layer is exposed. The dynamic RE did not establish usable Fn-layer position-list replies; no editable Fn layer or Rappy Snappy mode is implied by this UI.

Add binding / Apply changes stages a binding in the current profile draft. The shared Save button reads the current device bindings before modifying them, refuses a stale baseline, preserves unchanged bindings, then reads back the result. Profile drafts survive reload and profile switching. Unknown firmware binding types are retained and cannot be edited or removed.

The wire integration follows the existing fw0320 RE: depths are hundredths of a millimeter, Mod Tap action 1 is hold/action 2 is tap, and SOCD modes 0/1/3/4 are neutral/last/first-key/second-key priority. Existing mode 2 is preserved without claiming Rappy Snappy support.

DKS clicks use mask 10. Dragged hold intervals use the verified masks 14, [6,12,0,0], [6,4,12,0] and [0,6,12,0], depending on the interval. The displayed hold span represents the physical press/release journey rather than raw firmware bytes. The alternative pattern selector supports keyboard operation.

Validation completed:

- Production TypeScript/Vite build passes.
- Full automated suite: 350 passing tests; seven Advanced Keys tests cover all six mode round trips, presets, conflict replacement, action order/depth scale, create/edit/delete, preserving unchanged/unknown bindings, malformed replies and stale baseline refusal.
- Browser checks cover all six editors, SOCD presets and priority, draft persistence after reload, DKS action search/hold selection/drag, invalid depth rejection, and binding removal.
- The output tester is a disclosure on the overview for a connected, loaded profile with saved bindings and no pending Advanced Key changes. It shows actual browser key-down/key-up events; Tab remains available to leave the tester.

This implementation has not yet performed an end-to-end USB save from the new UI. The protocol is based on prior physical RE and verified here with a simulated requester/readback.

## Presets and UI fixes

Six additional preset cards follow the supplied Wootility screenshots and the [official preset release description](https://wooting.io/wootility/changelogs/5.4.1): DKS running on WASD or W, Mod Tap arrows, Mod Tap Fn 2 on Caps Lock, Toggle Fn 1, and Toggle Fn 2 on Caps Lock. These are HERO68 adaptations, not copied Wooting wire data. The 65% board uses R-Alt/R-Shift/R-Ctrl/Fn as the Mod Tap arrow positions. DKS movement is held from 0.1 mm through the press; Shift is held between the deep press/release points at 3.4 mm. HERO68 catalog Fn/Fn1 actions map to Fn Layer 1/2 respectively. Fn output actions are distinct from editing bindings on a Fn layer.

Presets stage all their bindings atomically. Overlapping bindings get an explicit replacement dialog; SOCD pairs are removed as a whole, unrelated bindings are preserved, capacity is checked and unknown firmware bindings cannot be overwritten. The existing profile Save/readback flow handles the staged bindings.

Actuation Point and Rapid Trigger now replay their page and keyboard entrance animations on navigation. Numeric controls use a visible Mixed label rather than a narrow number-input placeholder. The label disappears while entering a uniform replacement value, and remains readable in Actuation Point, RT and both dead zones. Selected preview keys use one border without duplicate inset shadows or outer focus rings.

Browser validation also covered all six new preset cards, four-binding application, conflict review/replacement, preserving other bindings, Mixed numeric edits, both page/keyboard animation names and a selected key with 1px border/no shadow/no outline. Screenshots are in `reports/advanced-keys-ui/`.

The UX pass makes local draft and device save separate, explicit actions, adds selection progress and behavior summaries, distinguishes suggested SOCD pairs from ready-made presets, and removes inactive Undo/Redo controls. DKS defaults to action/pattern rows; depth editing and the press/release matrix are available under Fine-tune depths & action points. Existing custom states remain unchanged. Action search accepts punctuation variants (e.g. L-Ctrl); scrolling the result list keeps the picker open. Browser checks cover SOCD slot replacement, invalid delay feedback, picker scrolling, and DKS pattern changes.

Advanced Key icons follow the current profile draft across Quick Settings, Actuation Point, Rapid Trigger, RGB Settings, Main Layer Key Remap and Hall Stream. All previews, including Advanced Keys itself, use the same centered icon at 2.6 times the keyboard font size. Dead Zone preview hides Advanced Key icons so its values remain unobstructed. Other numeric overlays remain visible in the corners on bound keys. Key Remap icons use 45% opacity, and Fn layers keep their own mapping labels because Advanced Keys are Main Layer bindings. Switch Selector is unchanged. `GamepadKeyboardPreview.tsx` provides the shared preview for future Gamepad integration without adding a page or navigation item. Pass `advancedBindings` from the active profile when that page is implemented.
