// Ported from the hero68_re reverse-engineering workspace (typescript/src/codec.ts).
// Report framing, checksum and record decoders for the AULA HERO68 HE wire protocol
// (firmware 0323). Byte layouts are cited in docs/PROTOCOL_0323.md and cross-checked
// against fixtures/golden_packets.json in the RE workspace.
import type { DecodedReport } from "./types";

export const REPORT_ID = 0x09 as const;
export const PAYLOAD_LENGTH = 63;
export const REPORT_LENGTH = 64;
export const MAX_DATA_LENGTH = 56;

function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be a byte`);
  }
}

export function checksum(payloadWithoutChecksum: Uint8Array): number {
  if (payloadWithoutChecksum.length !== 62) {
    throw new RangeError("checksum input must contain 62 payload bytes");
  }
  let sum = REPORT_ID;
  for (const value of payloadWithoutChecksum) sum += value;
  return (0xff - (sum & 0xff)) & 0xff;
}

export interface BuildReportOptions {
  command: number;
  zone?: number;
  reserved?: number;
  total?: number;
  sequence?: number;
  data?: Iterable<number>;
}

export function buildReport(options: BuildReportOptions): Uint8Array {
  const {
    command,
    zone = 0,
    reserved = 0,
    total = 1,
    sequence = 0,
    data = [],
  } = options;
  const body = Uint8Array.from(data);
  if (body.length > MAX_DATA_LENGTH) throw new RangeError("data is limited to 56 bytes");
  [command, zone, reserved, total, sequence].forEach((value, index) => assertByte(value, `header[${index}]`));
  const report = new Uint8Array(REPORT_LENGTH);
  report[0] = REPORT_ID;
  report.set([command, zone, reserved, total, sequence, body.length], 1);
  report.set(body, 7);
  report[63] = checksum(report.subarray(1, 63));
  return report;
}

export function decodeReport(input: Uint8Array): DecodedReport {
  let report = input;
  if (input.length === PAYLOAD_LENGTH) {
    report = new Uint8Array(REPORT_LENGTH);
    report[0] = REPORT_ID;
    report.set(input, 1);
  }
  if (report.length !== REPORT_LENGTH) throw new RangeError(`expected 63 or 64 bytes, got ${report.length}`);
  if (report[0] !== REPORT_ID) throw new Error(`unexpected report ID 0x${report[0].toString(16)}`);
  const dataLength = report[6];
  if (dataLength > MAX_DATA_LENGTH) throw new RangeError(`invalid data length ${dataLength}`);
  const command = report[1];
  const zone = report[2];

  // Firmware 0323 leaves LEN=0 on several CMD 0x82 feature responses while
  // still returning bytes at the fixed data offset. The official AULA bundle
  // reads these replies by fixed offsets too, so preserve the declared LEN in
  // dataLength but expose the meaningful response bytes in data.
  let effectiveDataLength = dataLength;
  if (command === 0x82 && dataLength === 0) {
    effectiveDataLength = new Map([
      [0x01, 6],  // UUID: fixed 6-byte / 48-bit value
      [0x02, 2],  // firmware version: MINOR, MAJOR
      [0x03, 26], // switch capability bitmap
      [0x04, 56], // GLOBAL + advanced bitmap/padding
      [0x06, 1],  // RT precision multiplier
      [0x08, 1],  // distance precision multiplier/sentinel
      [0x09, 18], // rhythm support reads data[17]
    ]).get(zone) ?? 0;
  }
  return {
    reportId: REPORT_ID,
    command,
    zone,
    reserved: report[3],
    total: report[4],
    sequence: report[5],
    dataLength,
    data: report.slice(7, 7 + effectiveDataLength),
    checksum: report[63],
    checksumValid: report[63] === checksum(report.subarray(1, 63)),
    raw: report.slice(),
  };
}

export function u16be(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RangeError("uint16 required");
  return [(value >>> 8) & 0xff, value & 0xff];
}

export function u32be(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError("uint32 required");
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

export function mmUnits(mm: number, precisionMm: number): number {
  if (!(precisionMm > 0)) throw new RangeError("precisionMm must be positive");
  return Math.round(mm / precisionMm);
}

export interface RemapRecord {
  kind: "remap";
  keyId: number;
  keycode: number;
}

export function decodeRemapRecords(data: Uint8Array): RemapRecord[] {
  if (data.length % 6 !== 0) throw new RangeError("remap data must contain six-byte records");
  const records: RemapRecord[] = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    records.push({
      kind: "remap",
      keyId: (data[offset] << 8) | data[offset + 1],
      keycode: (
        data[offset + 2] * 0x1000000
        + (data[offset + 3] << 16)
        + (data[offset + 4] << 8)
        + data[offset + 5]
      ) >>> 0,
    });
  }
  return records;
}

export function decodeBitmapLsbFirst(data: Uint8Array): number[] {
  const ids: number[] = [];
  for (let byteIndex = 0; byteIndex < data.length; byteIndex++) {
    for (let bit = 0; bit < 8; bit++) {
      if ((data[byteIndex] & (1 << bit)) !== 0) ids.push(byteIndex * 8 + bit);
    }
  }
  return ids;
}

export interface SwitchCapabilities {
  bitmap: Uint8Array;
  supportedIds: number[];
}

export function decodeSwitchCapabilities(data: Uint8Array): SwitchCapabilities {
  return {bitmap: data.slice(), supportedIds: decodeBitmapLsbFirst(data)};
}

export interface AdvancedKeyCapabilities {
  global: number;
  bitmap: Uint8Array;
  supportedIds: number[];
}

export function decodeAdvancedKeyCapabilities(data: Uint8Array): AdvancedKeyCapabilities {
  if (data.length < 1) throw new RangeError("advanced capability payload is missing GLOBAL byte");
  const bitmap = data.slice(1);
  return {global: data[0], bitmap, supportedIds: decodeBitmapLsbFirst(bitmap)};
}

export interface CalibrationRangeRecord {
  keyId: number;
  maxAdc: number;
  minAdc: number;
}

export interface CalibrationLiveRecord {
  keyId: number;
  currentAdc: number;
  minAdc: number;
  pressed: boolean;
  finished: boolean;
}

export interface DistanceCalibrationLiveRecord {
  keyId: number;
  distanceUnits: number;
  adc: number;
  pressed: boolean;
}

function assertSixByteRecords(data: Uint8Array, kind: string): void {
  if (data.length % 6 !== 0) throw new RangeError(`${kind} payload must contain six-byte records`);
}

export function decodeCalibrationRanges(data: Uint8Array): CalibrationRangeRecord[] {
  assertSixByteRecords(data, "calibration range");
  const records: CalibrationRangeRecord[] = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    records.push({
      keyId: (data[offset] << 8) | data[offset + 1],
      maxAdc: (data[offset + 2] << 8) | data[offset + 3],
      minAdc: (data[offset + 4] << 8) | data[offset + 5],
    });
  }
  return records;
}

export function decodeCalibrationLive(data: Uint8Array): CalibrationLiveRecord[] {
  assertSixByteRecords(data, "calibration live");
  const records: CalibrationLiveRecord[] = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    const current = (data[offset + 2] << 8) | data[offset + 3];
    const pressed = (current & 0x8000) !== 0;
    records.push({
      keyId: (data[offset] << 8) | data[offset + 1],
      currentAdc: current & 0x7fff,
      minAdc: (data[offset + 4] << 8) | data[offset + 5],
      pressed,
      finished: !pressed,
    });
  }
  return records;
}

export function decodeDistanceCalibrationLive(data: Uint8Array): DistanceCalibrationLiveRecord[] {
  assertSixByteRecords(data, "distance calibration live");
  const records: DistanceCalibrationLiveRecord[] = [];
  for (let offset = 0; offset < data.length; offset += 6) {
    const adc = (data[offset + 4] << 8) | data[offset + 5];
    records.push({
      keyId: (data[offset] << 8) | data[offset + 1],
      distanceUnits: (data[offset + 2] << 8) | data[offset + 3],
      adc: adc & 0x7fff,
      pressed: (adc & 0x8000) !== 0,
    });
  }
  return records;
}

// --- Added for OpenHero68: read-side decoders for AP / RT / dead-zone -----------------
// These mirror the write-side record layouts already ported into commands.ts (writeActuation,
// writeRapidTrigger, writeDeadZone) and match hero68_re's python/hero68/codec.py::decode_records
// for commands 0x13/0x93, 0x19/0x99 and 0x16/0x96, which decode identically whether the report
// carries a write echo or a read response.

export interface ActuationRecord {
  kind: "actuation";
  keyId: number;
  distanceUnits: number;
  global: number;
}

export function decodeActuationRecords(data: Uint8Array): ActuationRecord[] {
  const records: ActuationRecord[] = [];
  for (let offset = 0; offset + 5 <= data.length; offset += 5) {
    records.push({
      kind: "actuation",
      keyId: (data[offset] << 8) | data[offset + 1],
      distanceUnits: (data[offset + 2] << 8) | data[offset + 3],
      global: data[offset + 4],
    });
  }
  return records;
}

export interface RapidTriggerRecord {
  kind: "rapid_trigger";
  keyId: number;
  enabled: number;
  releaseUnits: number;
  pressUnits: number;
  global: number;
}

export function decodeRapidTriggerRecords(data: Uint8Array): RapidTriggerRecord[] {
  const records: RapidTriggerRecord[] = [];
  for (let offset = 0; offset + 8 <= data.length; offset += 8) {
    records.push({
      kind: "rapid_trigger",
      keyId: (data[offset] << 8) | data[offset + 1],
      enabled: data[offset + 2],
      releaseUnits: (data[offset + 3] << 8) | data[offset + 4],
      pressUnits: (data[offset + 5] << 8) | data[offset + 6],
      global: data[offset + 7],
    });
  }
  return records;
}

export interface DeadZoneRecord {
  kind: "dead_zone";
  keyId: number;
  topUnits: number;
  bottomUnits: number;
  global: number;
  enabled: number;
}

export function decodeDeadZoneRecords(data: Uint8Array): DeadZoneRecord[] {
  const records: DeadZoneRecord[] = [];
  for (let offset = 0; offset + 8 <= data.length; offset += 8) {
    records.push({
      kind: "dead_zone",
      keyId: (data[offset] << 8) | data[offset + 1],
      topUnits: (data[offset + 2] << 8) | data[offset + 3],
      bottomUnits: (data[offset + 4] << 8) | data[offset + 5],
      global: data[offset + 6],
      enabled: data[offset + 7],
    });
  }
  return records;
}


export interface SwitchTypeRecord {
  kind: "switch_type";
  keyId: number;
  switchType: number;
}

export function decodeSwitchTypeRecords(data: Uint8Array): SwitchTypeRecord[] {
  const records: SwitchTypeRecord[] = [];
  for (let offset = 0; offset + 3 <= data.length; offset += 3) {
    records.push({
      kind: "switch_type",
      keyId: (data[offset] << 8) | data[offset + 1],
      switchType: data[offset + 2],
    });
  }
  return records;
}
