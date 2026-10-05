import { HERO68_KEY_IDS } from './hero68Layout'
import type { RgbColor, RgbProfile, RgbZone } from '../protocol/hero68/rgb'

export const CUSTOM_RGB_EFFECTS = [
  { id: 'aurora', name: 'Aurora', detail: 'Soft ribbons of light drift across the keyboard.' },
  { id: 'comet', name: 'Comet', detail: 'Bright shooting stars leave gently fading tails.' },
  { id: 'pressure-wave', name: 'Pressure Wave', detail: 'Faster strikes emit brighter waves, then settle while held. Strike strength is estimated from Hall motion.' },
  { id: 'jelly', name: 'Jelly', detail: 'The illuminated area expands with analog key travel.' },
  { id: 'scan', name: 'Scan', detail: 'A moving band sweeps back and forth. Multicolor flows through a spectrum with smooth turns.' },
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
export const RGB_GRADIENT_PALETTES = {
  aurora: { name: 'Aurora', colors: ['#22d3ee', '#8b5cf6', '#ec4899'] },
  sunset: { name: 'Sunset', colors: ['#ff6b35', '#f43f5e', '#8b5cf6'] },
  ice: { name: 'Ice', colors: ['#0ea5e9', '#67e8f9', '#ffffff'] },
} as const
export type RgbGradientPalette = keyof typeof RGB_GRADIENT_PALETTES
export const LEGACY_RGB_EFFECTS = CUSTOM_RGB_EFFECTS.filter(e => !['aurora', 'comet', 'pressure-wave'].includes(e.id)).map(e => e.id)
type EffectMetadata = { width?: string; speed?: string; duration?: string; scanPause?: string; direction?: boolean; hall?: boolean; gradient?: boolean; semanticColor?: boolean; defaults?: Partial<CustomRgbLayer> }
export const RGB_EFFECT_METADATA: Record<CustomRgbEffect, EffectMetadata> = {
  aurora: { width: 'Ribbon width', speed: '×', gradient: true, defaults: { color: [34,211,238], multicolor: true, palette: 'aurora', opacity: 75, width: 2.5, speed: .5 } },
  comet: { width: 'Width', speed: 'keys/s', duration: 'Tail duration', direction: true, gradient: true, defaults: { color: [103,232,249], multicolor: true, palette: 'ice', opacity: 85 } },
  'pressure-wave': { width: 'Width', speed: 'keys/s', duration: 'Fade duration', hall: true, defaults: { color: [34,211,238], opacity: 80, duration: 1200 } },
  jelly: { width: 'Width', hall: true }, scan: { width: 'Width', speed: 'keys/s', direction: true, scanPause: 'Pause at each end', defaults: { scanPauseMs: 0 } },
  breath: { speed: '×' }, ripple: { width: 'Width', speed: 'keys/s', duration: 'Fade duration' },
  touch: { hall: true }, reaction: { duration: 'Fade duration' }, aoe: { width: 'Radius', hall: true },
  mixing: { hall: true, semanticColor: true }, trail: { duration: 'Fade duration' }, rt: { duration: 'Fade duration', semanticColor: true },
}
export function needsRgbAnalogHall(config?: CustomRgbConfiguration) {
  return rgbHallKeys(config).length>0
}
/** Input sources differ from the LEDs affected by a layer. */
export function rgbHallKeys(config?:CustomRgbConfiguration):string[] {
  const keys=new Set<string>()
  for(const layer of config?.layers??[]){
    if(!layer.enabled||layer.opacity<=0||!layer.keys.length||!RGB_EFFECT_METADATA[layer.effect]?.hall)continue
    const sources=layer.effect==='pressure-wave'?layer.keys:layer.effect==='mixing'?['ArrowLeft','ArrowDown','ArrowRight']:HERO68_KEY_IDS
    for(const id of sources)if(HERO68_KEY_IDS.includes(id))keys.add(id)
  }
  return [...keys]
}
export type CustomRgbLayer = {
  id: string; effect: CustomRgbEffect; enabled: boolean; color: RgbColor
  multicolor: boolean; opacity: number; width: number; speed: number
  duration: number; direction: 'horizontal' | 'vertical'; keys: string[]
  palette?: RgbGradientPalette
  scanPauseMs?: number
}
export type CustomRgbBaseEffect = { effect: 'aurora'; palette: RgbGradientPalette; width: number; speed: number }
export type CustomRgbConfiguration = { version: 1; enabled: boolean; base: RgbZone; baseEffect?: CustomRgbBaseEffect; layers: CustomRgbLayer[] }
export const MAX_RGB_LAYERS = 8
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
const finite = (v: unknown, fallback: number, low: number, high: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, low, high) : fallback
export function createRgbLayer(effect: CustomRgbEffect = 'ripple', id: string = crypto.randomUUID()): CustomRgbLayer {
  return { id, effect, enabled: true, color: [255, 217, 90], multicolor: false, opacity: 100,
    width: 1.5, speed: 6, duration: 900, direction: 'horizontal', keys: [...HERO68_KEY_IDS], ...RGB_EFFECT_METADATA[effect].defaults }
}
export function defaultCustomRgb(profile: RgbProfile): CustomRgbConfiguration {
  const base: RgbZone = { ...profile.keys, mode: 19, mix: true, rgb: profile.keys.rgb.some(channel=>channel>0)?[...profile.keys.rgb]:[255,255,255] }
  delete base.mixValue
  return { version: 1, enabled: false, base, layers: [] }
}
export function restoreCustomRgb(value: unknown, profile: RgbProfile): CustomRgbConfiguration {
  const fallback = defaultCustomRgb(profile)
  if (!value || typeof value !== 'object') return fallback
  const v = value as Partial<CustomRgbConfiguration>
  const base = v.base
  if (v.version !== 1 || !base || !Array.isArray(v.layers)) return fallback
  const ids = new Set<string>()
  return { version: 1, enabled: v.enabled === true, base: {
    mode: Math.round(finite(base.mode, 19, 0, 19)), mix: typeof base.mix==='boolean'?base.mix:fallback.base.mix,
    rgb: [0, 1, 2].map(i => Math.round(finite(base.rgb?.[i], 255, 0, 255))) as RgbColor,
    brightness: Math.round(finite(base.brightness, 20, 0, 20)), speed: Math.round(finite(base.speed, 2, 0, 4)),
  }, ...(v.baseEffect?.effect === 'aurora' ? { baseEffect: {
    effect: 'aurora' as const,
    palette: Object.hasOwn(RGB_GRADIENT_PALETTES, v.baseEffect.palette) ? v.baseEffect.palette : 'aurora' as const,
    width: finite(v.baseEffect.width, 2.5, .25, 12), speed: finite(v.baseEffect.speed, .5, .5, 30),
  }} : {}), layers: v.layers.slice(0, MAX_RGB_LAYERS).flatMap(layer => {
    if (!layer || !CUSTOM_RGB_EFFECTS.some(e => e.id === layer.effect)) return []
    const id = typeof layer.id === 'string' && layer.id && !ids.has(layer.id) ? layer.id : `layer-${ids.size}`
    if (ids.has(id)) return []
    ids.add(id)
    const defaults = createRgbLayer(layer.effect, id)
    return [{ id, effect: layer.effect, enabled: layer.enabled !== false,
      color: [0, 1, 2].map(i => Math.round(finite(layer.color?.[i], defaults.color[i], 0, 255))) as RgbColor,
      multicolor: layer.multicolor === undefined ? defaults.multicolor : layer.multicolor === true, opacity: finite(layer.opacity, defaults.opacity, 0, 100),
      width: finite(layer.width, defaults.width, .25, 12), speed: finite(layer.speed, defaults.speed, .5, 30),
      duration: finite(layer.duration, defaults.duration, 100, 4000), direction: layer.direction === 'vertical' ? 'vertical' : 'horizontal',
      ...(layer.effect==='scan' ? {scanPauseMs: finite(layer.scanPauseMs, 0, 0, 5000)} : {}),
      ...(RGB_EFFECT_METADATA[layer.effect].gradient ? {palette: layer.palette && Object.hasOwn(RGB_GRADIENT_PALETTES, layer.palette) ? layer.palette : defaults.palette} : {}),
      keys: Array.isArray(layer.keys) ? [...new Set(layer.keys.filter(id => HERO68_KEY_IDS.includes(id)))] : [...HERO68_KEY_IDS],
    }]
  }) }
}
