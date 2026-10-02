import { KEY_RGB_MODES, SIDE_RGB_MODES } from './rgbCatalog'
import type { RgbZone } from '../protocol/hero68/rgb'

export function rgbPreviewDarkReason(zone: RgbZone, side = false): string | null {
  if (zone.mode === 0) return null
  if (zone.brightness === 0) return 'Brightness is 0%.'
  const effect = (side ? SIDE_RGB_MODES : KEY_RGB_MODES).find(effect => effect.id === zone.mode)
  if (effect?.color && !(zone.mixValue === 7 || zone.mixValue === undefined && zone.mix) && zone.rgb.every(channel => channel === 0)) return 'Single color is black (#000000).'
  return null
}
