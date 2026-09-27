export type Hero68Key = {
  id: string
  label: string
  width?: number
  matrixKey?: number
  indicator?: 'lock' | 'fn'
}

export type Hero68Row = Hero68Key[]

/**
 * AULA Hero68 visual layout (68 keys / 65%).
 *
 * This layout follows the physical Hero68 board more closely than the
 * reference Wootility 60HE screenshot:
 * - right column uses Ins / Del / PgUp / PgDn
 * - arrow cluster is the standard 65% arrangement
 * - total key count remains 68 so protocol mapping stays 1:1 later
 */
export const HERO68_LAYOUT: Hero68Row[] = [
  [
    { id: 'Escape', label: 'Esc', matrixKey: 256 },
    { id: 'Digit1', label: '1', matrixKey: 257 },
    { id: 'Digit2', label: '2', matrixKey: 258 },
    { id: 'Digit3', label: '3', matrixKey: 259 },
    { id: 'Digit4', label: '4', matrixKey: 260 },
    { id: 'Digit5', label: '5', matrixKey: 261 },
    { id: 'Digit6', label: '6', matrixKey: 262 },
    { id: 'Digit7', label: '7', matrixKey: 263 },
    { id: 'Digit8', label: '8', matrixKey: 264 },
    { id: 'Digit9', label: '9', matrixKey: 265 },
    { id: 'Digit0', label: '0', matrixKey: 266 },
    { id: 'Minus', label: '-', matrixKey: 267 },
    { id: 'Equal', label: '=', matrixKey: 268 },
    { id: 'Backspace', label: 'Backspace', width: 2, matrixKey: 269 },
    { id: 'Insert', label: 'Ins', matrixKey: 270 },
  ],
  [
    { id: 'Tab', label: 'Tab', width: 1.5, matrixKey: 512 },
    { id: 'KeyQ', label: 'Q', matrixKey: 513 },
    { id: 'KeyW', label: 'W', matrixKey: 514 },
    { id: 'KeyE', label: 'E', matrixKey: 515 },
    { id: 'KeyR', label: 'R', matrixKey: 516 },
    { id: 'KeyT', label: 'T', matrixKey: 517 },
    { id: 'KeyY', label: 'Y', matrixKey: 518 },
    { id: 'KeyU', label: 'U', matrixKey: 519 },
    { id: 'KeyI', label: 'I', matrixKey: 520 },
    { id: 'KeyO', label: 'O', matrixKey: 521 },
    { id: 'KeyP', label: 'P', matrixKey: 522 },
    { id: 'BracketLeft', label: '[', matrixKey: 523 },
    { id: 'BracketRight', label: ']', matrixKey: 524 },
    { id: 'Backslash', label: '\\', width: 1.5, matrixKey: 525 },
    { id: 'Delete', label: 'Del', matrixKey: 526 },
  ],
  [
    { id: 'CapsLock', label: 'Caps', width: 1.75, matrixKey: 768, indicator: 'lock' },
    { id: 'KeyA', label: 'A', matrixKey: 769 },
    { id: 'KeyS', label: 'S', matrixKey: 770 },
    { id: 'KeyD', label: 'D', matrixKey: 771 },
    { id: 'KeyF', label: 'F', matrixKey: 772 },
    { id: 'KeyG', label: 'G', matrixKey: 773 },
    { id: 'KeyH', label: 'H', matrixKey: 774 },
    { id: 'KeyJ', label: 'J', matrixKey: 775 },
    { id: 'KeyK', label: 'K', matrixKey: 776 },
    { id: 'KeyL', label: 'L', matrixKey: 777 },
    { id: 'Semicolon', label: ';', matrixKey: 778 },
    { id: 'Quote', label: "'", matrixKey: 779 },
    { id: 'Enter', label: 'Enter', width: 2.25, matrixKey: 781 },
    { id: 'PageUp', label: 'PgUp', matrixKey: 782 },
  ],
  [
    { id: 'ShiftLeft', label: 'L-Shift', width: 2.25, matrixKey: 1024 },
    { id: 'KeyZ', label: 'Z', matrixKey: 1026 },
    { id: 'KeyX', label: 'X', matrixKey: 1027 },
    { id: 'KeyC', label: 'C', matrixKey: 1028 },
    { id: 'KeyV', label: 'V', matrixKey: 1029 },
    { id: 'KeyB', label: 'B', matrixKey: 1030 },
    { id: 'KeyN', label: 'N', matrixKey: 1031 },
    { id: 'KeyM', label: 'M', matrixKey: 1032 },
    { id: 'Comma', label: ',', matrixKey: 1033 },
    { id: 'Period', label: '.', matrixKey: 1034 },
    { id: 'Slash', label: '/', matrixKey: 1035 },
    { id: 'ShiftRight', label: 'R-Shift', width: 1.75, matrixKey: 1037 },
    { id: 'ArrowUp', label: '↑', matrixKey: 1038 },
    { id: 'PageDown', label: 'PgDn', matrixKey: 1039 },
  ],
  [
    { id: 'ControlLeft', label: 'L-Ctrl', width: 1.25, matrixKey: 1280 },
    { id: 'MetaLeft', label: 'L-Win', width: 1.25, matrixKey: 1281 },
    { id: 'AltLeft', label: 'L-Alt', width: 1.25, matrixKey: 1282 },
    { id: 'Space', label: 'Spacebar', width: 6.25, matrixKey: 1286 },
    { id: 'AltRight', label: 'R-Alt', matrixKey: 1290 },
    { id: 'Fn', label: 'Fn', matrixKey: 1291, indicator: 'fn' },
    { id: 'ControlRight', label: 'R-Ctrl', matrixKey: 1292 },
    { id: 'ArrowLeft', label: '←', matrixKey: 1293 },
    { id: 'ArrowDown', label: '↓', matrixKey: 1294 },
    { id: 'ArrowRight', label: '→', matrixKey: 1295 },
  ],
]

export const HERO68_KEY_IDS = HERO68_LAYOUT.flat().map((key) => key.id)

const WOOTILITY_DEMO_HUES: Record<string, number> = {
  Escape: 314,
  Digit1: 270, Digit2: 240, Digit3: 210, Digit4: 180, Digit5: 150, Digit6: 120,
  Digit7: 91, Digit8: 68, Digit9: 46, Digit0: 46, Minus: 30, Equal: 14,
  Backspace: 0, Insert: 0,

  Tab: 314,
  KeyQ: 270, KeyW: 240, KeyE: 210, KeyR: 180, KeyT: 150, KeyY: 120,
  KeyU: 91, KeyI: 68, KeyO: 46, KeyP: 46, BracketLeft: 30, BracketRight: 14,
  Backslash: 0, Delete: 0,

  CapsLock: 314,
  KeyA: 270, KeyS: 240, KeyD: 210, KeyF: 180, KeyG: 150, KeyH: 120,
  KeyJ: 91, KeyK: 68, KeyL: 46, Semicolon: 46, Quote: 30,
  Enter: 0, PageUp: 0,

  ShiftLeft: 314,
  KeyZ: 270, KeyX: 240, KeyC: 210, KeyV: 180, KeyB: 150, KeyN: 120,
  KeyM: 91, Comma: 68, Period: 46, Slash: 46, ShiftRight: 14,
  ArrowUp: 7, PageDown: 0,

  ControlLeft: 314, MetaLeft: 314, AltLeft: 270,
  AltRight: 46, Fn: 30, ControlRight: 14,
  ArrowLeft: 14, ArrowDown: 7, ArrowRight: 0,
}

function wootilityColor(hue: number) {
  // Only the static demo palette is muted; device RGB frames stay unchanged.
  return `hsl(${hue} 80% 41%)`
}

export function makeDemoLighting(): Record<string, string> {
  const frame: Record<string, string> = {}

  for (const key of HERO68_LAYOUT.flat()) {
    if (key.id === 'Space') {
      frame[key.id] = [240, 210, 180, 150, 120, 91, 68]
        .map((hue, index, values) => `${wootilityColor(hue)} ${Math.round(index / (values.length - 1) * 100)}%`)
        .join(', ')
      frame[key.id] = `linear-gradient(90deg, ${frame[key.id]})`
      continue
    }

    frame[key.id] = wootilityColor(WOOTILITY_DEMO_HUES[key.id] ?? 0)
  }

  return frame
}
