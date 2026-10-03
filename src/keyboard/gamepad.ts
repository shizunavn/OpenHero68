import { HERO68_KEY_IDS } from "./hero68Layout";
import { HERO68_KEY_POSITIONS } from "../protocol/hero68/keyPositions";

export const GAMEPAD_ACTIONS = [
  "A",
  "B",
  "X",
  "Y",
  "Start",
  "Back",
  "Guide",
  "Up",
  "Down",
  "Left",
  "Right",
  "LB",
  "RB",
  "LClick",
  "RClick",
  "LUp",
  "LDown",
  "LLeft",
  "LRight",
  "RUp",
  "RDown",
  "RLeft",
  "RRight",
  "LT",
  "RT",
] as const;
export type GamepadAction = (typeof GAMEPAD_ACTIONS)[number];
export type CurvePoint = [number, number];
export type GamepadBinding = {
  keyId: string;
  action: GamepadAction;
  startMm: number;
  endMm: number;
};
export type GamepadConfiguration = {
  version: 1;
  rate: 50 | 100 | 200;
  bindings: GamepadBinding[];
  curve: CurvePoint[];
  snappy: boolean;
  square: boolean;
  angleEnabled: boolean;
  angle: number;
};
export const CURVE_PRESETS: Record<string, CurvePoint[]> = {
  Linear: [
    [0, 0],
    [1, 1],
  ],
  Aggressive: [
    [0, 0],
    [0.25, 0.55],
    [1, 1],
  ],
  Slow: [
    [0, 0],
    [0.7, 0.25],
    [1, 1],
  ],
  Smooth: [
    [0, 0],
    [0.25, 0.12],
    [0.75, 0.88],
    [1, 1],
  ],
  Instant: [
    [0, 0],
    [0.01, 1],
    [1, 1],
  ],
};
export const isAnalogAction = (action: GamepadAction) =>
  [
    "LUp",
    "LDown",
    "LLeft",
    "LRight",
    "RUp",
    "RDown",
    "RLeft",
    "RRight",
    "LT",
    "RT",
  ].includes(action);
export function defaultGamepad(): GamepadConfiguration {
  return {
    version: 1,
    rate: 200,
    bindings: [
      ["KeyW", "LUp"],
      ["KeyS", "LDown"],
      ["KeyA", "LLeft"],
      ["KeyD", "LRight"],
      ["KeyQ", "LT"],
      ["KeyE", "RT"],
      ["Space", "A"],
    ].map(([keyId, action]) => ({
      keyId,
      action: action as GamepadAction,
      startMm: 0.1,
      endMm: 3.4,
    })),
    curve: [
      [0, 0],
      [0.33, 0.33],
      [0.67, 0.67],
      [1, 1],
    ],
    snappy: true,
    square: false,
    angleEnabled: false,
    angle: 45,
  };
}
export function validateGamepad(input: unknown): GamepadConfiguration {
  const v = input as GamepadConfiguration;
  if (
    !v ||
    v.version !== 1 ||
    ![50, 100, 200].includes(v.rate) ||
    !Array.isArray(v.bindings) ||
    v.bindings.length > 68
  )
    throw Error("Invalid gamepad configuration");
  const seen = new Set<string>();
  const bindings = v.bindings.map((b) => {
    if (
      !b ||
      !HERO68_KEY_IDS.includes(b.keyId) ||
      seen.has(b.keyId) ||
      !GAMEPAD_ACTIONS.includes(b.action) ||
      !Number.isFinite(b.startMm) ||
      !Number.isFinite(b.endMm) ||
      b.startMm < 0 ||
      b.endMm > 3.4 ||
      b.endMm - b.startMm < 0.01 - 1e-9
    )
      throw Error("Invalid gamepad binding");
    seen.add(b.keyId);
    return { ...b };
  });
  if (!Array.isArray(v.curve) || v.curve.length < 2 || v.curve.length > 16)
    throw Error("Invalid analog curve");
  const curve = v.curve.map((p, i) => {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      p.some((n) => !Number.isFinite(n) || n < 0 || n > 1) ||
      (i > 0 && (p[0] <= v.curve[i - 1][0] || p[1] < v.curve[i - 1][1]))
    )
      throw Error("Curve must be monotonic");
    return [p[0], p[1]] as CurvePoint;
  });
  if (
    curve[0][0] !== 0 ||
    curve[0][1] !== 0 ||
    curve.at(-1)![0] !== 1 ||
    curve.at(-1)![1] !== 1
  )
    throw Error("Curve endpoints must be 0 and 1");
  if (
    ["snappy", "square", "angleEnabled"].some(
      (k) => typeof v[k as keyof GamepadConfiguration] !== "boolean",
    ) ||
    !Number.isFinite(v.angle) ||
    v.angle < 30 ||
    v.angle > 60
  )
    throw Error("Invalid joystick settings");
  return {
    version: 1,
    rate: v.rate,
    bindings,
    curve,
    snappy: v.snappy,
    square: v.square,
    angleEnabled: v.angleEnabled,
    angle: v.angle,
  };
}
export function restoreGamepad(value: unknown) {
  try {
    return validateGamepad(value);
  } catch {
    return defaultGamepad();
  }
}
export function curveValue(curve: CurvePoint[], value: number) {
  const x = Math.max(0, Math.min(1, value));
  for (let i = 1; i < curve.length; i++)
    if (x <= curve[i][0]) {
      const a = curve[i - 1],
        b = curve[i];
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  return 1;
}
export type GamepadReport = {
  buttons: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lt: number;
  rt: number;
};
export const GAMEPAD_BUTTONS: Partial<Record<GamepadAction, number>> = {
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
  Start: 16,
  Back: 32,
  LClick: 64,
  RClick: 128,
  LB: 256,
  RB: 512,
  Guide: 1024,
  A: 4096,
  B: 8192,
  X: 16384,
  Y: 32768,
};
export function mapGamepad(
  config: GamepadConfiguration,
  samples: Record<string, { distanceMm: number; pressed: boolean }>,
): GamepadReport {
  const values: Partial<Record<GamepadAction, number>> = {};
  let buttons = 0;
  for (const b of config.bindings) {
    const s = samples[b.keyId];
    if (!s) continue;
    if (!isAnalogAction(b.action)) {
      if (s.pressed) buttons |= GAMEPAD_BUTTONS[b.action] ?? 0;
      continue;
    }
    const p = curveValue(
      config.curve,
      (s.distanceMm - b.startMm) / (b.endMm - b.startMm),
    );
    values[b.action] = Math.max(values[b.action] ?? 0, p);
  }
  const axis = (p: number, n: number) =>
    config.snappy ? (p === n ? 0 : p > n ? p : -n) : p - n;
  const stick = (prefix: "L" | "R") => {
    let x = axis(values[`${prefix}Right`] ?? 0, values[`${prefix}Left`] ?? 0),
      y = axis(values[`${prefix}Up`] ?? 0, values[`${prefix}Down`] ?? 0);
    if (config.angleEnabled) {
      const magnitude = Math.hypot(x, y);
      y *= Math.tan((config.angle * Math.PI) / 180);
      const altered = Math.hypot(x, y);
      if (altered) {
        x *= magnitude / altered;
        y *= magnitude / altered;
      }
    }
    if (!config.square) {
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
    }
    return [
      Math.round(Math.max(-1, Math.min(1, x)) * 32767),
      Math.round(Math.max(-1, Math.min(1, y)) * 32767),
    ];
  };
  const [lx, ly] = stick("L"),
    [rx, ry] = stick("R");
  return {
    buttons,
    lx,
    ly,
    rx,
    ry,
    lt: Math.round((values.LT ?? 0) * 255),
    rt: Math.round((values.RT ?? 0) * 255),
  };
}
/** Stable native wire format; validated before any mutation. No firmware packets here. */
export function nativeGamepadCommand(config: GamepadConfiguration) {
  const v = validateGamepad(config);
  return (
    "gamepad-config:" +
    `${v.rate};${Number(v.snappy)};${Number(v.square)};${Number(v.angleEnabled)};${v.angle};` +
    v.curve.map((p) => p.join(",")).join("|") +
    ";" +
    v.bindings
      .map((b) =>
        [
          HERO68_KEY_POSITIONS[b.keyId],
          GAMEPAD_ACTIONS.indexOf(b.action),
          b.startMm,
          b.endMm,
        ].join(","),
      )
      .join("|")
  );
}
