// Frontend key id -> real hardware key ID ("pos" in the RE workspace) mapping.
//
// *** THIS TABLE REPLACES THE FAKE `matrixKey` UI ADDRESSING SCHEME. ***
//
// `matrixKey` in ../../keyboard/hero68Layout.ts (e.g. Escape=256, KeyW=514) is a
// made-up row/column UI addressing scheme invented for the baseline UI. It has no
// relationship to the AULA wire protocol and must never be sent to the device -
// doing so would silently apply commands to the wrong physical key.
//
// The values below are the real hardware key IDs ("pos") that command builders in
// ./commands.ts expect for their `keyId` parameter (see writeActuation, readActuation,
// writeRapidTrigger, writeDeadZone, etc., and codec.ts's decode*Records functions).
//
// Provenance: every pos value here was looked up programmatically from
// hero68_re/python/hero68/layout.py::HERO68_DEFAULT_KEYS (the ARM32_HID_68 factory
// layer recovered verbatim from the official AULA web bundle) by matching each
// frontend key id to the corresponding physical key's name in that table - e.g.
// frontend "KeyW" -> layout.py name "W" -> pos 30. That correspondence was verified
// against fixtures/golden_packets.json, whose "ap_w_0_10mm_firmware0323" fixture
// hardware-confirms POS=30 for W (packet data: keyId=30, distance=100 units).
//
// The full 68-key table was generated and cross-checked by script against
// layout.py (position-set equality, no duplicates, exactly 68 keys) rather than
// hand-typed from these hardware IDs directly, to avoid re-introducing the same
// class of bug this table exists to fix. See docs/PROTOCOL_0323.md and
// fixtures/golden_packets.json in the hero68_re workspace for the underlying
// evidence.
import { HERO68_KEY_IDS } from "../../keyboard/hero68Layout";

export const HERO68_KEY_POSITIONS: Readonly<Record<string, number>> = {
  Escape: 1,
  Digit1: 15,
  Digit2: 16,
  Digit3: 17,
  Digit4: 18,
  Digit5: 19,
  Digit6: 20,
  Digit7: 21,
  Digit8: 22,
  Digit9: 23,
  Digit0: 24,
  Minus: 25,
  Equal: 26,
  Backspace: 27,
  Insert: 98,

  Tab: 28,
  KeyQ: 29,
  KeyW: 30,
  KeyE: 31,
  KeyR: 32,
  KeyT: 33,
  KeyY: 34,
  KeyU: 35,
  KeyI: 36,
  KeyO: 37,
  KeyP: 38,
  BracketLeft: 39,
  BracketRight: 40,
  Backslash: 41,
  Delete: 99,

  CapsLock: 42,
  KeyA: 43,
  KeyS: 44,
  KeyD: 45,
  KeyF: 46,
  KeyG: 47,
  KeyH: 48,
  KeyJ: 49,
  KeyK: 50,
  KeyL: 51,
  Semicolon: 52,
  Quote: 53,
  Enter: 54,
  PageUp: 102,

  ShiftLeft: 55,
  KeyZ: 56,
  KeyX: 57,
  KeyC: 58,
  KeyV: 59,
  KeyB: 60,
  KeyN: 61,
  KeyM: 62,
  Comma: 63,
  Period: 64,
  Slash: 65,
  ShiftRight: 66,
  ArrowUp: 74,
  PageDown: 103,

  ControlLeft: 67,
  MetaLeft: 68,
  AltLeft: 69,
  Space: 70,
  AltRight: 71,
  Fn: 72,
  ControlRight: 73,
  ArrowLeft: 76,
  ArrowDown: 75,
  ArrowRight: 77,
};

export const HERO68_KEY_ID_BY_POSITION: ReadonlyMap<number, string> = new Map(
  Object.entries(HERO68_KEY_POSITIONS).map(([keyId, pos]) => [pos, keyId]),
);

export function keyIdToPos(keyId: string): number {
  const pos = HERO68_KEY_POSITIONS[keyId];
  if (pos === undefined) throw new RangeError(`no hardware position mapping for key id "${keyId}"`);
  return pos;
}

export function posToKeyId(pos: number): string | undefined {
  return HERO68_KEY_ID_BY_POSITION.get(pos);
}

// Fail loudly at import time (mirroring layout.py's own self-check) rather than
// silently mis-addressing keys: catches a missing/duplicated entry immediately
// instead of at first device write.
(function assertKeyPositionsComplete() {
  const mappedIds = Object.keys(HERO68_KEY_POSITIONS);
  if (mappedIds.length !== HERO68_KEY_IDS.length) {
    throw new Error(
      `HERO68_KEY_POSITIONS has ${mappedIds.length} entries but HERO68_LAYOUT declares ${HERO68_KEY_IDS.length} keys`,
    );
  }
  for (const keyId of HERO68_KEY_IDS) {
    if (!(keyId in HERO68_KEY_POSITIONS)) throw new Error(`HERO68_KEY_POSITIONS is missing frontend key id "${keyId}"`);
  }
  const positions = Object.values(HERO68_KEY_POSITIONS);
  if (new Set(positions).size !== positions.length) {
    throw new Error("HERO68_KEY_POSITIONS assigns the same hardware pos to more than one key id");
  }
})();
