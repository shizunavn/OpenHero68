export type SwitchProfileId = 'white' | 'black' | 'blue' | 'clear' | `switch-${number}`

// Names from the official English catalog, IDs confirmed by the user's
// 2026-09-26 individual-key USB capture. Legacy IDs remain stable in storage.
export const HERO68_SWITCH_PROFILES = [
  { id: 'switch-4', firmwareId: 4, name: 'Wing Chun', color: '#c535f8', travelMm: 3.4 },
  { id: 'white', firmwareId: 13, name: 'Meteor Magnetic', color: '#8f18ff', travelMm: 3.4 },
  { id: 'switch-1', firmwareId: 1, name: 'Jade Pro', color: '#07fd56', travelMm: 3.4 },
  { id: 'switch-3', firmwareId: 3, name: 'Uranus Gaming', color: '#6363ff', travelMm: 3.4 },
  { id: 'switch-5', firmwareId: 5, name: 'Magneto King', color: '#01c341', travelMm: 3.4 },
  { id: 'switch-14', firmwareId: 14, name: 'Jade King', color: '#ffb500', travelMm: 3.4 },
  { id: 'blue', firmwareId: 15, name: 'Dragon King', color: '#0004ff', travelMm: 3.4 },
  { id: 'clear', firmwareId: 16, name: 'Jade', color: '#6569f8', travelMm: 3.4 },
  { id: 'switch-22', firmwareId: 22, name: 'Pink King Scroll', color: '#ff0ed6', travelMm: 3.4 },
  { id: 'switch-24', firmwareId: 24, name: 'Jade Emperor Scroll', color: '#00ff76', travelMm: 3.4 },
  { id: 'switch-27', firmwareId: 27, name: 'Ice King Axle', color: '#5887ff', travelMm: 3.3 },
  { id: 'black', firmwareId: 8, name: 'Black King', color: '#b1f835', travelMm: 3.4 },
] as const satisfies readonly { id: SwitchProfileId; firmwareId: number; name: string; color: string; travelMm: number }[]

export function switchFirmwareId(profile: string): number {
  const known = HERO68_SWITCH_PROFILES.find(option => option.id === profile)
  if (known) return known.firmwareId
  const match = /^switch-(\d+)$/.exec(profile)
  const value = match ? Number(match[1]) : NaN
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError(`Unknown switch profile: ${profile}`)
  return value
}

export function switchProfileId(firmwareId: number): SwitchProfileId {
  if (!Number.isInteger(firmwareId) || firmwareId < 0 || firmwareId > 255) throw new RangeError('Switch ID must fit in one byte')
  return HERO68_SWITCH_PROFILES.find(option => option.firmwareId === firmwareId)?.id ?? `switch-${firmwareId}`
}

export function isSwitchProfileId(value: unknown): value is SwitchProfileId {
  if (typeof value !== 'string') return false
  try { switchFirmwareId(value); return true } catch { return false }
}

export function switchProfileLabel(profile: string): string {
  return HERO68_SWITCH_PROFILES.find(option => option.id === profile)?.name ?? `Switch ID ${switchFirmwareId(profile)}`
}
