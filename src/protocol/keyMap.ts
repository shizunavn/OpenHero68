import { HERO68_LAYOUT } from '../keyboard/hero68Layout'

export type ProtocolKeyAddress = {
  id: string
  label: string
  matrixKey: number
  matrixHex: string
  row: number
  column: number
}

export const HERO68_PROTOCOL_KEY_MAP: Record<string, ProtocolKeyAddress> = Object.fromEntries(
  HERO68_LAYOUT.flat().map((key) => {
    const matrixKey = key.matrixKey ?? 0
    return [key.id, {
      id: key.id,
      label: key.label,
      matrixKey,
      matrixHex: `0x${matrixKey.toString(16).padStart(4, '0').toUpperCase()}`,
      row: (matrixKey >>> 8) & 0xff,
      column: matrixKey & 0xff,
    }]
  }),
)
