import { buildReport, checksum } from './codec'
import type { RgbTransport } from './rgb'

export type TachyonLightingSnapshot = { keys: number[]; side: number[] }

export function validTachyonSnapshot(value: unknown): value is TachyonLightingSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as TachyonLightingSnapshot
  return [snapshot.keys, snapshot.side].every(fields => Array.isArray(fields) && fields.length === 7
    && fields.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255))
}

/** Store the device's palette/mode before turning off both physical LED zones. */
export class TachyonLighting {
  constructor(public snapshot: TachyonLightingSnapshot | null, private persist: (value: TachyonLightingSnapshot | null) => void) {}

  private async read(device: RgbTransport, zone: 1 | 6) {
    const reply = await device.request(buildReport({ command: 0x84, zone }), 0x84, zone, 1500)
    const fields = Array.from(reply.raw.slice(7, 14))
    if (fields.length !== 7) throw Error('Invalid RGB configuration read')
    return fields
  }

  private async write(device: RgbTransport, zone: 1 | 6, fields: number[]) {
    const packet = buildReport({ command: 4, zone, data: fields })
    if (zone === 6 && fields[1] === 7) {
      packet[6] = 4
      packet[63] = checksum(packet.subarray(1, 63))
    }
    await device.request(packet, 4, zone, 1500)
    const actual = await this.read(device, zone)
    if (actual.some((byte, index) => !(fields[1] === 7 && index >= 2 && index <= 4) && byte !== fields[index])) {
      throw Error('Tachyon RGB readback mismatch')
    }
  }

  async disable(device: RgbTransport) {
    if (!this.snapshot) {
      this.snapshot = { keys: await this.read(device, 1), side: await this.read(device, 6) }
      this.persist(this.snapshot)
    }
    for (const [name, zone] of [['keys', 1], ['side', 6]] as const) {
      const fields = [...this.snapshot[name]]
      fields[0] = 0
      fields[5] = 0
      await this.write(device, zone, fields)
    }
  }

  async restore(device: RgbTransport) {
    if (!this.snapshot) return
    for (const [name, zone] of [['keys', 1], ['side', 6]] as const) await this.write(device, zone, this.snapshot[name])
    this.persist(null)
    this.snapshot = null
  }
}

export function isTachyonLightingWrite(packet: Uint8Array) {
  return packet[1] === 8 || packet[1] === 6 || packet[1] === 4 && [1, 6].includes(packet[2])
}
