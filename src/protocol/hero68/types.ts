// Ported from the hero68_re reverse-engineering workspace (typescript/src/types.ts).
// These types describe the wire protocol recovered from the official AULA HERO68 HE
// web bundle (firmware 0323). See src/protocol/hero68/README.md for provenance notes.

export type ProfileSlot = 0 | 1 | 2;
export type LayerId = 0 | 1 | 2;
export type PhysicalKeyId = number;
export type PollingRate = 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000;
export type Confidence = "confirmed" | "probable" | "unknown";

export interface ActuationConfig {
  profile: ProfileSlot;
  layer?: LayerId;
  keyId: PhysicalKeyId;
  distanceMm: number;
  precisionMm: number;
  global: boolean;
}

export interface RapidTriggerConfig {
  profile: ProfileSlot;
  layer?: LayerId;
  keyId: PhysicalKeyId;
  enabled: boolean;
  releaseMm: number;
  pressMm: number;
  precisionMm: number;
  global: boolean;
}

export interface CalibrationFrame {
  phase: "start" | "sample" | "exit";
  keyIds: PhysicalKeyId[];
}

export interface AdvancedKeyBinding {
  layer: LayerId;
  keyId: PhysicalKeyId;
  type: "DKS" | "MT" | "SOCD";
  payload: Uint8Array;
}

export interface LightingConfig {
  zone: 1 | 6;
  mode: number;
  mix: boolean;
  rgb: readonly [number, number, number];
  brightness: number;
  speed: number;
}

export interface HallFrame {
  timestampMs: number;
  raw: ReadonlyMap<PhysicalKeyId, number>;
  travelMm?: ReadonlyMap<PhysicalKeyId, number>;
}

export interface DecodedReport {
  reportId: 9;
  command: number;
  zone: number;
  reserved: number;
  total: number;
  sequence: number;
  dataLength: number;
  data: Uint8Array;
  checksum: number;
  checksumValid: boolean;
  raw: Uint8Array;
}
