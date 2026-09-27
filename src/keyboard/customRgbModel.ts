import { HERO68_KEY_IDS } from './hero68Layout'
import type { RgbColor, RgbProfile, RgbZone } from '../protocol/hero68/rgb'

export const CUSTOM_RGB_EFFECTS = [
  { id: 'jelly', name: 'Jelly', detail: 'The illuminated area expands with analog key travel.' },
  { id: 'scan', name: 'Scan', detail: 'A moving band sweeps back and forth across the keyboard.' },
  { id: 'breath', name: 'Breath', detail: 'The layer gently fades in and out.' },
  { id: 'ripple', name: 'Ripple', detail: 'Expanding rings follow each key press.' },
  { id: 'touch', name: 'Touch', detail: 'The number row displays the deepest analog key travel as a bar.' },
  { id: 'reaction', name: 'Reaction', detail: 'Pressed keys light up and fade after release.' },
  { id: 'aoe', name: 'AOE', detail: 'Travel controls the brightness of a fixed area around each key.' },
  { id: 'mixing', name: 'Mixing', detail: 'Left, Down and Right arrow travel mix red, green and blue.' },
  { id: 'trail', name: 'Trail', detail: 'Each key press lights that key, then fades over time.' },
  { id: 'rt', name: 'RT Display', detail: 'Green/red shows the reported Hall pressed flag. Its correspondence to firmware RT output is unverified.' },
] as const
export type CustomRgbEffect = typeof CUSTOM_RGB_EFFECTS[number]['id']
export type CustomRgbLayer = {
  id: string; effect: CustomRgbEffect; enabled: boolean; color: RgbColor
  multicolor: boolean; opacity: number; width: number; speed: number
  duration: number; direction: 'horizontal' | 'vertical'; keys: string[]
}
export type CustomRgbConfiguration = { version: 1; enabled: boolean; base: RgbZone; layers: CustomRgbLayer[] }
export const MAX_RGB_LAYERS = 8
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
const finite = (v: unknown, fallback: number, low: number, high: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, low, high) : fallback
export function createRgbLayer(effect: CustomRgbEffect = 'ripple', id = crypto.randomUUID()): CustomRgbLayer {
  return { id, effect, enabled: true, color: [255, 217, 90], multicolor: false, opacity: 100,
    width: 1.5, speed: 6, duration: 900, direction: 'horizontal', keys: [...HERO68_KEY_IDS] }
}
export function defaultCustomRgb(profile: RgbProfile): CustomRgbConfiguration {
  return { version: 1, enabled: false, base: { ...profile.keys, mode: 19, mix: false }, layers: [] }
}
export function restoreCustomRgb(value: unknown, profile: RgbProfile): CustomRgbConfiguration {
  const fallback = defaultCustomRgb(profile)
  if (!value || typeof value !== 'object') return fallback
  const v = value as Partial<CustomRgbConfiguration>
  const base = v.base
  if (v.version !== 1 || !base || !Array.isArray(v.layers)) return fallback
  const ids = new Set<string>()
  return { version: 1, enabled: v.enabled === true, base: {
    mode: Math.round(finite(base.mode, 19, 0, 19)), mix: base.mix === true,
    rgb: [0, 1, 2].map(i => Math.round(finite(base.rgb?.[i], 255, 0, 255))) as RgbColor,
    brightness: Math.round(finite(base.brightness, 20, 0, 20)), speed: Math.round(finite(base.speed, 2, 0, 4)),
  }, layers: v.layers.slice(0, MAX_RGB_LAYERS).flatMap(layer => {
    if (!layer || !CUSTOM_RGB_EFFECTS.some(e => e.id === layer.effect)) return []
    const id = typeof layer.id === 'string' && layer.id && !ids.has(layer.id) ? layer.id : `layer-${ids.size}`
    if (ids.has(id)) return []
    ids.add(id)
    return [{ id, effect: layer.effect, enabled: layer.enabled !== false,
      color: [0, 1, 2].map(i => Math.round(finite(layer.color?.[i], 255, 0, 255))) as RgbColor,
      multicolor: layer.multicolor === true, opacity: finite(layer.opacity, 100, 0, 100),
      width: finite(layer.width, 1.5, .25, 12), speed: finite(layer.speed, 6, .5, 30),
      duration: finite(layer.duration, 900, 100, 4000), direction: layer.direction === 'vertical' ? 'vertical' : 'horizontal',
      keys: Array.isArray(layer.keys) ? [...new Set(layer.keys.filter(id => HERO68_KEY_IDS.includes(id)))] : [...HERO68_KEY_IDS],
    }]
  }) }
}

