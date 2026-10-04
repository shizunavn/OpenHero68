import { HERO68_PROTOCOL_KEY_MAP } from './keyMap'
import type { ProfileSlot } from './hero68/types'

export type KeyDeviceSettings = {
  keyId: string
  matrixKey: number
  matrixHex: string
  actuationMm: number
  rapidTriggerEnabled: boolean
  splitSensitivity: boolean
  rapidSensitivityMm: number
  pressSensitivityMm: number
  releaseSensitivityMm: number
  deadzoneEnabled: boolean
  topDeadzoneMm: number
  bottomDeadzoneMm: number
  switchProfile: string
}

export type DeviceConfigurationSnapshot = {
  keys: KeyDeviceSettings[]
  tachyon: boolean
  /** Which onboard profile slot (0, 1, or 2) to read/write. */
  profileSlot: ProfileSlot
}

export type Hero68ProtocolEncoder = {
  /**
   * RE hook: turn the normalized device snapshot into the exact packets/HEX
   * discovered from the AULA protocol. Keep packet knowledge out of React UI.
   */
  encodeSave(snapshot: DeviceConfigurationSnapshot): string[]
}

export type Hero68Transport = {
  sendHex(hex: string): Promise<void>
  sendBatchHex?(hexes: readonly string[]): Promise<void>
}

let protocolEncoder: Hero68ProtocolEncoder | null = null
let transport: Hero68Transport | null = null

export function registerHero68Protocol(encoder: Hero68ProtocolEncoder, nextTransport: Hero68Transport) {
  protocolEncoder = encoder
  transport = nextTransport
}

export function isHero68ProtocolReady() {
  return Boolean(protocolEncoder && transport)
}

export async function saveDeviceConfiguration(snapshot: DeviceConfigurationSnapshot) {
  if (!protocolEncoder || !transport) {
    throw new Error('HERO68 protocol is not ready. Reconnect the keyboard and try again.')
  }

  const packets = protocolEncoder.encodeSave(snapshot)
  if(transport.sendBatchHex)await transport.sendBatchHex(packets)
  else for (const packet of packets) await transport.sendHex(packet)
  return { mode: 'sent' as const, packets }
}

export function makeKeyDeviceSettings(
  keyId: string,
  values: Omit<KeyDeviceSettings, 'keyId' | 'matrixKey' | 'matrixHex'>,
): KeyDeviceSettings {
  const address = HERO68_PROTOCOL_KEY_MAP[keyId]
  return {
    keyId,
    matrixKey: address?.matrixKey ?? 0,
    matrixHex: address?.matrixHex ?? '0x0000',
    ...values,
  }
}
