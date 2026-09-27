import { hexToBytes } from './hex'
import type { Hero68Transport } from './deviceBridge'

/**
 * Adapter for the already-RE'd HID/WebHID layer.
 * Pass the existing raw-byte writer here; the UI/bridge can continue working in HEX strings.
 */
export function createHexTransport(writeBytes: (bytes: Uint8Array) => Promise<void>): Hero68Transport {
  return {
    async sendHex(hex: string) {
      await writeBytes(hexToBytes(hex))
    },
  }
}
