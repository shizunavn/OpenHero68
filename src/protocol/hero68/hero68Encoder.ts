import type { DeviceConfigurationSnapshot, Hero68ProtocolEncoder } from '../deviceBridge'
import { HERO68_KEY_IDS } from '../../keyboard/hero68Layout'
import { bytesToHex } from '../hex'
import {
  readActuation,
  readDeadZone,
  readRapidTrigger,
  readSwitchType,
  selectProfile,
  writeActuationBatch,
  writeDeadZoneBatch,
  writeRapidTriggerBatch,
  writeSwitchTypeBatch,
} from './commands'
import {
  decodeActuationRecords,
  decodeDeadZoneRecords,
  decodeRapidTriggerRecords,
  decodeSwitchTypeRecords,
} from './codec'
import { keyIdToPos, posToKeyId } from './keyPositions'
import type { DecodedReport, ProfileSlot } from './types'
import { HERO68_DISTANCE_UNIT_MM } from './precision'
import { switchFirmwareId, switchProfileId } from './switchProfiles'

export type HydratedKeySettings = {
  actuationMm?: number
  rapidTriggerEnabled?: boolean
  splitSensitivity?: boolean
  rapidSensitivityMm?: number
  pressSensitivityMm?: number
  releaseSensitivityMm?: number
  deadzoneEnabled?: boolean
  topDeadzoneMm?: number
  bottomDeadzoneMm?: number
  switchProfile?: string
}

export interface Hero68Requester {
  request(report: Uint8Array, expectedCommand: number, expectedZone?: number, timeoutMs?: number): Promise<DecodedReport>
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) chunks.push(values.slice(offset, offset + size))
  return chunks
}

function reportHex(report: Uint8Array): string {
  return bytesToHex(report, '')
}

export const hero68ProtocolEncoder: Hero68ProtocolEncoder = {
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[] {
    const packets: Uint8Array[] = [selectProfile(snapshot.profileSlot)]

    // Mirror the official AULA sync functions instead of sending one HID
    // transaction per key. This cuts a full 68-key save from ~273 writes to
    // 36 independent reports and, importantly, uses the exact RT 6-record
    // packet shape recovered from sync_rt().
    // Hardware capture from the official AULA web driver shows that a key sync
    // writes the switch type BEFORE AP / RT / dead-zone.  Keep that ordering:
    // 0x15 -> 0x13 -> 0x19 -> 0x16.  Writing 0x15 last can cause the firmware
    // to reload switch-dependent state after sensitivity values were applied.
    const switchRecords = snapshot.keys.map((key) =>
      [keyIdToPos(key.keyId), switchFirmwareId(key.switchProfile)] as const,
    )
    packets.push(...writeSwitchTypeBatch(switchRecords))

    const actuationConfigs = snapshot.keys.map((key) => ({
      profile: snapshot.profileSlot,
      layer: 0 as const,
      keyId: keyIdToPos(key.keyId),
      distanceMm: key.actuationMm,
      precisionMm: HERO68_DISTANCE_UNIT_MM,
      global: true,
    }))
    packets.push(...writeActuationBatch(actuationConfigs))

    const rapidTriggerConfigs = snapshot.keys.map((key) => {
      const releaseMm = key.rapidTriggerEnabled
        ? (key.splitSensitivity ? key.releaseSensitivityMm : key.rapidSensitivityMm)
        : 0
      const pressMm = key.rapidTriggerEnabled
        ? (key.splitSensitivity ? key.pressSensitivityMm : key.rapidSensitivityMm)
        : 0
      return {
        profile: snapshot.profileSlot,
        layer: 0 as const,
        keyId: keyIdToPos(key.keyId),
        enabled: key.rapidTriggerEnabled,
        releaseMm,
        pressMm,
        precisionMm: HERO68_DISTANCE_UNIT_MM,
        global: true,
      }
    })
    packets.push(...writeRapidTriggerBatch(rapidTriggerConfigs))

    packets.push(...writeDeadZoneBatch(snapshot.keys.map((key) => ({
      layer: 0 as const,
      keyId: keyIdToPos(key.keyId),
      topMm: key.topDeadzoneMm,
      bottomMm: key.bottomDeadzoneMm,
      precisionMm: HERO68_DISTANCE_UNIT_MM,
      global: true,
      enabled: key.deadzoneEnabled,
    }))))

    // Tachyon is intentionally not part of profile packets: OpenHero68 implements
    // it as a runtime composite (8 kHz polling + stopping diagnostic/live streams).
    return packets.map(reportHex)
  }
}

export async function hydrateFromDevice(
  requester: Hero68Requester,
  profileSlot: ProfileSlot,
  keyIds: readonly string[] = HERO68_KEY_IDS,
): Promise<Map<string, HydratedKeySettings>> {
  // Profile is session state: select it first, then read layer 0.
  await requester.request(selectProfile(profileSlot), 0x10, 0)

  // Preserve the physical order from the frontend layout while translating to real POS IDs.
  // keyIdToPos validates that all 68 keys are mapped.
  const positions = keyIds.map(keyIdToPos)

  const hydrated = new Map<string, HydratedKeySettings>()
  const settingsForPos = (pos: number) => {
    const keyId = posToKeyId(pos)
    if (!keyId) return undefined
    const current = hydrated.get(keyId) ?? {}
    hydrated.set(keyId, current)
    return current
  }

  // Batch sizes match the RE runner and ensure one reply fits into the 56-byte data area.
  for (const keys of chunk(positions, 11)) {
    const reply = await requester.request(readActuation(keys), 0x93, 0)
    for (const record of decodeActuationRecords(reply.data)) {
      const target = settingsForPos(record.keyId)
      if (target) target.actuationMm = record.distanceUnits * HERO68_DISTANCE_UNIT_MM
    }
  }

  for (const keys of chunk(positions, 6)) {
    const reply = await requester.request(readRapidTrigger(keys), 0x99, 0)
    for (const record of decodeRapidTriggerRecords(reply.data)) {
      const target = settingsForPos(record.keyId)
      if (!target) continue
      const releaseMm = record.releaseUnits * HERO68_DISTANCE_UNIT_MM
      const pressMm = record.pressUnits * HERO68_DISTANCE_UNIT_MM
      target.rapidTriggerEnabled = record.enabled !== 0
      target.releaseSensitivityMm = releaseMm
      target.pressSensitivityMm = pressMm
      target.splitSensitivity = record.enabled !== 0 && releaseMm !== pressMm
      target.rapidSensitivityMm = releaseMm === pressMm ? releaseMm : Math.max(releaseMm, pressMm)
    }
  }

  for (const keys of chunk(positions, 6)) {
    const reply = await requester.request(readDeadZone(keys), 0x96, 0)
    for (const record of decodeDeadZoneRecords(reply.data)) {
      const target = settingsForPos(record.keyId)
      if (!target) continue
      target.deadzoneEnabled = record.enabled !== 0
      target.topDeadzoneMm = record.topUnits * HERO68_DISTANCE_UNIT_MM
      target.bottomDeadzoneMm = record.bottomUnits * HERO68_DISTANCE_UNIT_MM
    }
  }

  for (const keys of chunk(positions, 18)) {
    const reply = await requester.request(readSwitchType(keys), 0x95, 0)
    for (const record of decodeSwitchTypeRecords(reply.data)) {
      const target = settingsForPos(record.keyId)
      if (target) target.switchProfile = switchProfileId(record.switchType)
    }
  }

  return hydrated
}
