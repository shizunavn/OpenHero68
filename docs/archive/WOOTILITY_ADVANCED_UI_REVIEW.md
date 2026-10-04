# Wootility Advanced Keys UI review — 2026-09-27

This is preparation for the HERO68 Advanced Keys page. No app UI or hardware
configuration was changed in this review. Icons will be supplied by the user.

## Source and confidence

- Current web entry: https://wootility.io/. Its published bundle is
  `index-BaoALhfv.js`; CSS is `index-CDXn1GwQ.css`. JavaScript is obfuscated.
  The source-map URL declared by this bundle returned HTTP 404. Detailed
  component findings below therefore come from v4, not presumed v5 internals.
- v4 web entry: https://v4.wootility.io/. Its published
  `index-154c0c6c.js` retains readable component names and React element props.
  This is deployed compiled code, not a development repository checkout.
- Local reference copies: `reports/wootility-ui-source/`. The current asset
  URLs, sizes and hashes are recorded in that folder's `manifest.json`.
- Official DKS guide corroborates the grid and point/drag interactions:
  https://help.wooting.io/article/99-how-to-use-dks.
- v5 layer/hover changes are documented at
  https://wooting.io/wootility/changelogs/5.2.1. Do not assume v4 and v5 share
  identical layout or implementation.

## v4 page structure observed in code

`AKCSettings` switches among overview, creation and active-binding editing.
The overview is a centered, rounded panel with three divided columns:
mode selection, current bindings with a slot counter, and output testing.
It sets a 1320px maximum width, or 832px during creation. Column padding is
2em with 1.5em at the top. These are reference values, not requirements for
the existing HERO68 keyboard width.

`CreateAKCItemList` presents stacked clickable rows: mode icon, bold title,
brief explanation, optional new badge. Hover changes the background/border.
Unavailable modes and exhausted capacity are disabled with explanatory
tooltips. Availability comes from the device, not just the presence of an icon.

`CreateNewAKCItem` collects physical keys after mode selection. One-key modes
have one assignment slot; SOCD/Rappy Snappy require two. Slots are 5em square,
with a dashed empty border and a populated key display. Users can select a
key via the preview or physical input; conflicts produce an explanation.

`AKCActiveItemView` has a header with mode title, help, Delete and Done.
Below it are the editor and additional tools. Escape closes editing only
when another modal, quick binding or an Escape action is not consuming it.
Removal has its own dialog. Done returns to the overview; it is not the
top-level save-to-keyboard operation.

`AKCItemAdditionalTabs` derives its tabs from each mode definition. Binding
catalog, performance settings, tester and advanced settings are conditional;
a single applicable panel can render without a tab bar. Avoid empty tabs.

## Editors observed in code

| Mode | Editor arrangement | HERO68 adaptation |
|---|---|---|
| DKS | Four binding rows and four phase columns; separate down/up phase colors. `_DKSItemEditor` uses explicit CSS grid areas. Click a point for a single activation; `DksPoint` previews and commits dragged spans, preventing conflicting overlaps. Depth values open an edit control. | Present the four phases clearly, but derive held spans from verified HERO68 behavior. Wooting span lengths cannot be serialized directly as HERO68 masks. HERO68 exposes four depth fields; do not assume Wooting's paired depths are a firmware constraint. |
| Mod Tap | `AKC_ModTapEditor` places Hold and Tap slots side by side, with a small tester below. Delay belongs to additional settings. | First HERO68 wire slot is Hold, second is Tap. Delay must use HERO68's protocol. Wooting modifier shortcuts are not yet verified for HERO68. |
| Toggle | `AKC_ToggleKeyEditor` has one large action slot, explanation and tester. | Add the HERO68 delay control; preserve its tested toggle/hold semantics. |
| SOCD | `AKC_SOCDEditor` uses radio choices with per-choice help; its extra simultaneous-bottom-out switch is independent. | Map last input / first key / second key / neutral to HERO68 IDs 1/3/4/0. Do not expose Wooting's bottom-out switch without evidence that HERO68 supports it. |
| Rappy Snappy | Two-key setup, explanation and related performance controls. Help contains an animation. | Support remains unconfirmed on HERO68. Do not label ordinary SOCD as Rappy Snappy. |
| MPT / END | Not established as Wootility editor types in this reviewed v4 code. | Design compatible HERO68 editors: three depth/action rows for MPT; one release-action slot for END. These are our additions, not copied Wootility behavior. |

The output tester distinguishes pressed/released outputs. For HERO68, output
events and Hall depth should remain separate signals; a preview animation
alone does not prove firmware behavior.

## Typography and interaction details

- v4 theme explicitly uses Open Sans for body and headings. Heading variants
  include a 700-weight compact title; `newTitle` is 1.125rem. Many values use
  em/rem and component theme inheritance, so a prop is not a measured screen size.
- Current CSS includes Nunito Sans variable font faces (weight 200–1000).
  It defines 600/700 weights, a 16px-equivalent body token, 20/24px-equivalent
  larger tokens, body line height 1.4 and interface/heading line height 1.2
  at a normal 16px root. Global token definitions do not establish which
  particular Advanced Keys element uses each token.
- v4 `TooltipDefaultProps` uses 250ms opening and 100ms closing delays.
  Follow the user's already accepted faster-close behavior in HERO68.
- Keep selected, hovered, disabled and unavailable states distinct. Hovering
  a binding should identify its physical keys and layer. Maintain the current
  layer while moving between pages, consistent with documented v5 fixes.

## Implementation direction for this project

Use the existing keyboard preview as the selection surface and align the
Advanced Keys panel to its content width. Start with overview → choose mode
→ assign key(s) → editor → Done. Reuse the existing remap action catalog and
help component. Keep draft editing separate from hardware save/readback.
Scope bindings by profile/layer and reject conflicting physical positions.
Use actual HERO68 capacity/readback evidence rather than Wooting limits.

Create icon slots with consistent sizing once the user's assets arrive.
Preserve accessible labels and keyboard interactions independently of SVGs.
DKS needs the most care: store semantic action/hold intent separately from
wire masks, and show the actual verified hold interval instead of assuming
Wooting's visual span endpoints match HERO68's release stages.
