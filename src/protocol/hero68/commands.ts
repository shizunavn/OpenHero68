// Ported from the hero68_re reverse-engineering workspace (typescript/src/commands.ts).
// Every builder here returns exactly the packet shape recovered from the official
// AULA bundle / hardware captures. See docs/PROTOCOL_0323.md for confidence levels.
import { buildReport, mmUnits, u16be, u32be } from "./codec";
import type {
  ActuationConfig,
  LightingConfig,
  PollingRate,
  RapidTriggerConfig,
} from "./types";

export const POLLING_RATES = [125, 250, 500, 1000, 2000, 4000, 8000] as const;

function chunkRecords<T>(records: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < records.length; offset += size) chunks.push(records.slice(offset, offset + size));
  return chunks;
}

function assertSameLayer(configs: readonly { layer?: 0 | 1 | 2 }[]): 0 | 1 | 2 {
  const layer = configs[0]?.layer ?? 0;
  if (configs.some((config) => (config.layer ?? 0) !== layer)) {
    throw new RangeError("all records in one HERO68 batch must use the same layer");
  }
  return layer;
}

function actuationRecord(config: ActuationConfig): number[] {
  return [
    ...u16be(config.keyId),
    ...u16be(mmUnits(config.distanceMm, config.precisionMm)),
    Number(config.global),
  ];
}

function rapidTriggerRecord(config: RapidTriggerConfig): number[] {
  return [
    ...u16be(config.keyId),
    Number(config.enabled),
    ...u16be(mmUnits(config.releaseMm, config.precisionMm)),
    ...u16be(mmUnits(config.pressMm, config.precisionMm)),
    Number(config.global),
  ];
}

export function writeActuation(config: ActuationConfig): Uint8Array {
  return buildReport({
    command: 0x13,
    // The selected profile is session state set by CMD 0x10. CMD 0x13 zone
    // carries the layer, not the profile slot.
    zone: config.layer ?? 0,
    data: actuationRecord(config),
  });
}

/**
 * Source-faithful AP batching: official sync_distance() packs 11 x 5-byte
 * records (55 bytes) into each independent report.
 */
export function writeActuationBatch(configs: readonly ActuationConfig[]): Uint8Array[] {
  if (configs.length === 0) return [];
  const layer = assertSameLayer(configs);
  return chunkRecords(configs, 11).map((batch) => buildReport({
    command: 0x13,
    zone: layer,
    data: batch.flatMap(actuationRecord),
  }));
}

export function readActuation(keyIds: Iterable<number>): Uint8Array {
  return buildReport({command: 0x93, data: Array.from(keyIds).flatMap(u16be)});
}

export function writeRapidTrigger(config: RapidTriggerConfig): Uint8Array {
  return buildReport({
    command: 0x19,
    zone: config.layer ?? 0,
    data: rapidTriggerRecord(config),
  });
}

/**
 * Source-faithful RT batching: official sync_rt() packs 6 x 8-byte records
 * (48 bytes) per independent report and retries the write ACK.
 */
export function writeRapidTriggerBatch(configs: readonly RapidTriggerConfig[]): Uint8Array[] {
  if (configs.length === 0) return [];
  const layer = assertSameLayer(configs);
  return chunkRecords(configs, 6).map((batch) => buildReport({
    command: 0x19,
    zone: layer,
    data: batch.flatMap(rapidTriggerRecord),
  }));
}

export function readRapidTrigger(keyIds: Iterable<number>): Uint8Array {
  return buildReport({command: 0x99, data: Array.from(keyIds).flatMap(u16be)});
}

export function writeRemap(
  layer: 0 | 1 | 2,
  mappings: Iterable<readonly [number, number]>,
): Uint8Array[] {
  const records = Array.from(mappings, ([keyId, keycode]) => [...u16be(keyId), ...u32be(keycode)]);
  const chunks: number[][][] = [];
  for (let offset = 0; offset < records.length; offset += 9) chunks.push(records.slice(offset, offset + 9));
  // Official sync_keys() sends each nine-key batch as an independent request.
  return chunks.map((chunk) => buildReport({
    command: 0x03,
    zone: layer,
    data: chunk.flat(),
  }));
}

export function readRemap(layer: 0 | 1 | 2, keyIds: Iterable<number>): Uint8Array[] {
  const values = Array.from(keyIds);
  const chunks: number[][] = [];
  for (let offset = 0; offset < values.length; offset += 9) chunks.push(values.slice(offset, offset + 9));
  // Official _fetch_keys() treats every 9-key read as an independent request.
  return chunks.map((chunk) => buildReport({
    command: 0x83,
    zone: layer,
    data: chunk.flatMap(u16be),
  }));
}

function switchTypeRecord(keyId: number, switchType: number): number[] {
  if (!Number.isInteger(switchType) || switchType < 0 || switchType > 0xff) {
    throw new RangeError("switchType must fit in one byte");
  }
  return [...u16be(keyId), switchType];
}

export function writeSwitchType(keyId: number, switchType: number): Uint8Array {
  return buildReport({command: 0x15, zone: 0, data: switchTypeRecord(keyId, switchType)});
}

/** Official sync_key_type() packs 18 x 3-byte records (54 bytes). */
export function writeSwitchTypeBatch(records: readonly (readonly [number, number])[]): Uint8Array[] {
  return chunkRecords(records, 18).map((batch) => buildReport({
    command: 0x15,
    zone: 0,
    data: batch.flatMap(([keyId, switchType]) => switchTypeRecord(keyId, switchType)),
  }));
}

export function readSwitchType(keyIds: Iterable<number>): Uint8Array {
  return buildReport({command: 0x95, zone: 0, data: Array.from(keyIds).flatMap(u16be)});
}

export function selectProfile(slot: 0 | 1 | 2): Uint8Array {
  return buildReport({command: 0x10, data: [slot]});
}

export function readActiveProfile(): Uint8Array {
  return buildReport({command: 0x90, data: [0]});
}

export function writePollingRate(rate: PollingRate): Uint8Array {
  const level = POLLING_RATES.indexOf(rate);
  if (level < 0) throw new RangeError(`unsupported polling rate ${rate}`);
  return buildReport({command: 0x04, zone: 0x17, data: [level]});
}

export function readPollingRate(): Uint8Array {
  return buildReport({command: 0x84, zone: 0x17, data: [0]});
}

export function writeLighting(config: LightingConfig): Uint8Array {
  return buildReport({
    command: 0x04,
    zone: config.zone,
    data: [
      config.mode,
      config.mix ? 7 : 0,
      ...config.rgb,
      config.brightness,
      config.speed,
    ],
  });
}

export function readLighting(zone: 1 | 6): Uint8Array {
  return buildReport({command: 0x84, zone, data: []});
}

export function advancedModTap(
  layer: 0 | 1 | 2,
  keyId: number,
  tapKeycode: number,
  holdKeycode: number,
  delayMs: number,
): Uint8Array {
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 2,
    data: [...u16be(keyId), ...u32be(tapKeycode), ...u32be(holdKeycode), ...u16be(delayMs)],
  });
}

export function advancedSocd(
  layer: 0 | 1 | 2,
  keyIds: readonly [number, number],
  mode: number,
): Uint8Array {
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 4,
    data: [2, ...u16be(keyIds[0]), ...u16be(keyIds[1]), mode],
  });
}

export function liveRgb(rgb: readonly [number, number, number], keyIds: readonly number[]): Uint8Array[] {
  const chunks: number[][] = [];
  for (let offset = 0; offset < keyIds.length; offset += 52) {
    const keys = keyIds.slice(offset, offset + 52);
    chunks.push([...rgb, keys.length, ...keys]);
  }
  return chunks.map((data, sequence) => buildReport({
    command: 0x08,
    zone: 1,
    total: chunks.length,
    sequence,
    data,
  }));
}

export function advancedTgl(
  layer: 0 | 1 | 2,
  keyId: number,
  keycode: number,
  delayMs: number,
): Uint8Array {
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 1,
    data: [...u16be(keyId), ...u32be(keycode), ...u16be(delayMs)],
  });
}

export function advancedDks(
  layer: 0 | 1 | 2,
  keyId: number,
  thresholds: readonly [number, number, number, number],
  actions: readonly (readonly [number, readonly [number, number, number, number]])[],
): Uint8Array {
  const data = [...u16be(keyId)];
  for (const t of thresholds) data.push(...u16be(t));
  for (const [keycode, mask] of actions) data.push(...u32be(keycode), ...mask);
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 3,
    data,
  });
}

export function advancedMpt(
  layer: 0 | 1 | 2,
  keyId: number,
  actions: readonly (readonly [number, number])[],
): Uint8Array {
  const data = [...u16be(keyId), actions.length];
  for (const [keycode, distance] of actions) data.push(...u32be(keycode), ...u16be(distance));
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 5,
    data,
  });
}

export function advancedEnd(
  layer: 0 | 1 | 2,
  keyId: number,
  keycode: number,
): Uint8Array {
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 6,
    data: [...u16be(keyId), ...u32be(keycode)],
  });
}

export function advancedDelete(
  layer: 0 | 1 | 2,
  keyId: number,
): Uint8Array {
  return buildReport({
    command: 0x12,
    zone: layer,
    reserved: 0,
    data: [...u16be(keyId), 0],
  });
}

export function readAdvancedKeyPositions(layer: 0 | 1 | 2): Uint8Array {
  return buildReport({command: 0x92, zone: layer, data: []});
}

export function readAdvancedKey(layer: 0 | 1 | 2, keyId: number): Uint8Array {
  return buildReport({command: 0x92, zone: layer, data: [...u16be(keyId)]});
}

export type DeadZoneWriteRecord = {
  layer: 0 | 1 | 2;
  keyId: number;
  topMm: number;
  bottomMm: number;
  precisionMm: number;
  global?: boolean;
  enabled?: boolean;
};

function deadZoneRecord(config: DeadZoneWriteRecord): number[] {
  const topUnits = mmUnits(config.topMm, config.precisionMm);
  const bottomUnits = mmUnits(config.bottomMm, config.precisionMm);
  return [
    ...u16be(config.keyId),
    ...u16be(topUnits),
    ...u16be(bottomUnits),
    Number(config.global ?? true),
    Number(config.enabled ?? true),
  ];
}

export function writeDeadZone(
  layer: 0 | 1 | 2,
  keyId: number,
  topMm: number,
  bottomMm: number,
  precisionMm: number,
  global: boolean = true,
  enabled: boolean = true,
): Uint8Array {
  return buildReport({
    command: 0x16,
    zone: layer,
    data: deadZoneRecord({ layer, keyId, topMm, bottomMm, precisionMm, global, enabled }),
  });
}

/** Official sync_safe_area() packs 6 x 8-byte records (48 bytes). */
export function writeDeadZoneBatch(configs: readonly DeadZoneWriteRecord[]): Uint8Array[] {
  if (configs.length === 0) return [];
  const layer = assertSameLayer(configs);
  return chunkRecords(configs, 6).map((batch) => buildReport({
    command: 0x16,
    zone: layer,
    data: batch.flatMap(deadZoneRecord),
  }));
}

export function readDeadZone(keyIds: Iterable<number>): Uint8Array {
  return buildReport({command: 0x96, data: Array.from(keyIds).flatMap(u16be)});
}

export function writeProfileName(slot: 0 | 1 | 2, name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  if (encoded.length > 55) throw new RangeError("name cannot exceed 55 UTF-8 bytes");
  // Official sync_profile_name always declares LEN=56; data[0] is the
  // actual UTF-8 length. See hero68_re/docs/STATIC_RE_COMPLETE.md, section 6.
  const data = new Uint8Array(56);
  data[0] = encoded.length;
  data.set(encoded, 1);
  return buildReport({command: 0x1a, zone: slot, data});
}

export function readProfileName(slot: 0 | 1 | 2): Uint8Array {
  return buildReport({command: 0x9a, zone: slot, data: []});
}

export function readSwitchCapabilities(): Uint8Array {
  return buildReport({command: 0x82, zone: 3, data: []});
}

export function readAdvancedKeyCapabilities(): Uint8Array {
  return buildReport({command: 0x82, zone: 4, data: []});
}

export function readPrecisionRt(): Uint8Array {
  return buildReport({command: 0x82, zone: 6, data: []});
}

export function readPrecisionDistance(): Uint8Array {
  return buildReport({command: 0x82, zone: 8, data: []});
}

export function calibrationCaptureStart(): Uint8Array {
  return buildReport({command: 0x94, zone: 0, data: []});
}

export function calibrationCaptureStop(): Uint8Array {
  return buildReport({command: 0x94, zone: 4, data: []});
}

export function readCalibrationRanges(keyIds: Iterable<number>): Uint8Array[] {
  const values = Array.from(keyIds);
  const reports: Uint8Array[] = [];
  for (let offset = 0; offset < values.length; offset += 9) {
    reports.push(buildReport({command: 0x94, zone: 5, data: values.slice(offset, offset + 9).flatMap(u16be)}));
  }
  return reports;
}

export function calibrationDistanceStart(): Uint8Array {
  return buildReport({command: 0x98, zone: 0, data: []});
}

export function calibrationDistanceSync(keyIds: Iterable<number>): Uint8Array {
  const values = Array.from(keyIds);
  if (values.length > 28) throw new RangeError("0x98/01 supports at most 28 positions per report");
  return buildReport({command: 0x98, zone: 1, data: values.flatMap(u16be)});
}

export function calibrationDistanceExit(): Uint8Array {
  return buildReport({command: 0x98, zone: 2, data: []});
}

export function readFirmwareVersion(): Uint8Array {
  return buildReport({command: 0x82, zone: 2, data: []});
}

export function readDeviceUuid(): Uint8Array {
  return buildReport({command: 0x82, zone: 1, data: []});
}

export function readRhythmSupport(): Uint8Array {
  return buildReport({command: 0x82, zone: 9, data: []});
}

export function writeOsMode(isMac: boolean): Uint8Array {
  return buildReport({command: 0x04, zone: 17, data: [Number(isMac)]});
}

export function readOsMode(): Uint8Array {
  return buildReport({command: 0x84, zone: 17, data: []});
}

export function writeWinLock(locked: boolean): Uint8Array {
  return buildReport({command: 0x04, zone: 21, data: [Number(locked)]});
}

export function readWinLock(): Uint8Array {
  return buildReport({command: 0x84, zone: 21, data: []});
}

export function writeSleepLevel(level: number): Uint8Array {
  return buildReport({command: 0x04, zone: 19, data: [level]});
}

export function readSleepLevel(): Uint8Array {
  return buildReport({command: 0x84, zone: 19, data: [0]});
}

export function writeHallDebounce(enabled: boolean): Uint8Array {
  return buildReport({command: 0x04, zone: 24, data: [Number(enabled)]});
}

export function readHallDebounce(): Uint8Array {
  return buildReport({command: 0x84, zone: 24, data: [0]});
}

export function writeAutoCalibration(enabled: boolean): Uint8Array {
  return buildReport({command: 0x04, zone: 25, data: [Number(enabled)]});
}

export function readAutoCalibration(): Uint8Array {
  return buildReport({command: 0x84, zone: 25, data: [0]});
}

export function readBattery(): Uint8Array {
  return buildReport({command: 0x87, data: []});
}

export function resetFactory(sourceArgument: number = 0): Uint8Array {
  if (!Number.isInteger(sourceArgument) || sourceArgument < 0 || sourceArgument > 0xff) {
    throw new RangeError("sourceArgument must fit in one byte");
  }
  // Source quirk: reset_factory(t) overwrites TOTAL, not the zero data byte.
  // Non-zero semantics are intentionally not inferred from the bundle.
  return buildReport({command: 0x11, total: sourceArgument, data: [0]});
}

export function liveIdle(): Uint8Array {
  return buildReport({command: 0x08, zone: 2, data: [0, 0, 0]});
}

export function writeMechDebounceMode(mode: number): Uint8Array {
  return buildReport({command: 0x04, zone: 29, data: [mode]});
}

export function readMechDebounceMode(): Uint8Array {
  return buildReport({command: 0x84, zone: 29, data: [0]});
}

export function writeMechDebounceTime(timeUs: number): Uint8Array {
  return buildReport({command: 0x04, zone: 30, data: u16be(timeUs)});
}

export function readMechDebounceTime(): Uint8Array {
  return buildReport({command: 0x84, zone: 30, data: [0]});
}
