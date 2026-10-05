import { HERO68_LAYOUT } from './hero68Layout'

export const RHYTHM_MODES = [
  { id: 169, name: 'Dazzling Rock', description: 'Rings burst outward with every beat.', shape: 'rings' },
  { id: 170, name: 'Clouds', description: 'Moving light and shadows across the rows.', shape: 'clouds' },
  { id: 171, name: 'Light Field', description: 'The whole keyboard changes with the music.', shape: 'field' },
  { id: 172, name: 'Gurgling Stream', description: 'A wave of sound travels across the keys.', shape: 'stream' },
  { id: 173, name: 'Blooming Passion', description: 'Flowers of light bloom from changing centers.', shape: 'bloom' },
  { id: 428, name: 'Dynamic Spectrum', description: 'Frequency detail, from bass to treble.', shape: 'spectrum' },
  { id: 430, name: 'Beat Pulse', description: 'Shockwaves, slashes and a beat clock locked to the music.', shape: 'pulse' },
  { id: 180, name: 'Off', description: 'Clear the key LEDs while side rhythm continues.', shape: 'off' },
] as const
export const RHYTHM_SIDE_MODES = [
  { id: 500, name: 'Leave onboard' }, { id: 501, name: 'One-end meter' },
  { id: 502, name: 'Center-out meter' }, { id: 503, name: 'Light field' },
] as const
export type RhythmMode = typeof RHYTHM_MODES[number]['id']
export type RhythmSideMode = typeof RHYTHM_SIDE_MODES[number]['id']
export type RhythmConfiguration = {
  version: 1; keyMode: RhythmMode; sideMode: RhythmSideMode; endpoint: string
  brightness: number; sensitivity: number; releaseMs: number; color: string
  /** Beat Pulse only: positive delays the light, negative pulls it earlier (-100..150 ms). */
  syncOffsetMs: number
  palette: 'fixed' | 'rainbow' | 'aurora' | 'fire'
  spectrum: { db: number; window: 'hann' | 'hamming' | 'blackman'; spatialRadius: number }
}
export function defaultRhythm(): RhythmConfiguration {
  return { version: 1, keyMode: 428, sideMode: 500, endpoint: 'default', brightness: 80,
    sensitivity: 4, releaseMs: 80, syncOffsetMs: 0, color: '#f611a5', palette: 'rainbow',
    spectrum: { db: 35, window: 'hann', spatialRadius: 8 } }
}
export function validateRhythm(input: unknown): RhythmConfiguration {
  if (!input || typeof input !== 'object') throw Error('Expected rhythm configuration')
  const v = { syncOffsetMs: 0, ...(input as object) } as RhythmConfiguration
  const range = (n: number, low: number, high: number) => Number.isFinite(n) && n >= low && n <= high
  if (v.version !== 1 || !RHYTHM_MODES.some(m => m.id === v.keyMode) || !RHYTHM_SIDE_MODES.some(m => m.id === v.sideMode) ||
    typeof v.endpoint !== 'string' || !v.endpoint.length || v.endpoint.length > 512 || /[\r\n\0]/.test(v.endpoint) ||
    !range(v.brightness, 0, 100) || !range(v.syncOffsetMs, -100, 150) || !range(v.sensitivity, .1, 10) || !range(v.releaseMs, 0, 200) ||
    !/^#[0-9a-f]{6}$/i.test(v.color) || !['fixed', 'rainbow', 'aurora', 'fire'].includes(v.palette) ||
    !v.spectrum || !range(v.spectrum.db, 0, 100) || !['hann', 'hamming', 'blackman'].includes(v.spectrum.window) ||
    !Number.isInteger(v.spectrum.spatialRadius) || !range(v.spectrum.spatialRadius, 0, 16)) throw Error('Invalid rhythm configuration')
  return { version: 1, keyMode: v.keyMode, sideMode: v.sideMode, endpoint: v.endpoint,
    brightness: v.brightness, sensitivity: v.keyMode===430?Math.max(1,v.sensitivity):v.sensitivity, releaseMs: v.releaseMs, syncOffsetMs: v.syncOffsetMs,
    color: v.color.toLowerCase(), palette: v.palette, spectrum: { ...v.spectrum } }
}

/** Illustrative demo only. Hardware playback uses the native DSP and encoded output. */
export function rhythmDemo(config: RhythmConfiguration, timeMs: number) {
  const t = timeMs / 1000, phase = (t * 2) % 1
  const level = Math.exp(-phase * 7) * (.75 + .25 * Math.sin(t * .7))
  const keys: Record<string, string> = {}
  HERO68_LAYOUT.forEach((row, y) => row.forEach((key, x) => {
    const nx = x / Math.max(1, row.length - 1), ny = y / 4
    let value = 0
    switch (config.keyMode) {
      case 169: value = Math.hypot((nx - .5) * 1.6, ny - .5) < level ? 1 : 0; break
      case 170: value = Math.max(0, Math.sin(nx * 5 + t * 2 + ny) * level); break
      case 171: value = level; break
      case 172: value = ny > 1 - Math.exp(-((phase + nx * .7) % 1) * 7) ? 1 : 0; break
      case 173: value = Math.hypot(nx - (.5 + .3 * Math.sin(Math.floor(t * 3) * 2)), ny - .5) < level * .7 ? 1 : 0; break
      case 428: value = ny > 1 - Math.max(0, Math.sin(nx * 9 + t * 3) * .4 + level * .6) ? 1 : .02; break
      case 430: {
        // Illustrative: kick ring from the space bar on every beat, a snare slash on the off-beats, a beat sweep on the number row.
        const ring = Math.hypot((nx - .5) * 1.7, ny - 1) - phase * 1.5
        value = .04 + Math.exp(-ring * ring / .03) * Math.exp(-phase * 2.2)
        if (y === 0) value += .8 * Math.exp(-((nx - phase) ** 2) / .012)
        value = Math.min(1, value)
        break
      }
    }
    const beat = Math.floor(t * 2) * 32, hue = config.keyMode === 430
      ? (config.palette === 'fire' ? (beat * .4 + nx * 12) % 45 : config.palette === 'aurora' ? 160 + (beat * .5 + nx * 20) % 120 : (beat + nx * 25) % 360)
      : config.palette === 'fire' ? nx * 45 : config.palette === 'aurora' ? 160 + nx * 120 : (nx * 300 + t * 25) % 360
    keys[key.id] = config.palette === 'fixed'
      ? '#' + [1, 3, 5].map(i => Math.round(parseInt(config.color.slice(i, i + 2), 16) * value * config.brightness / 100).toString(16).padStart(2, '0')).join('')
      : `hsl(${hue} 90% ${value * config.brightness * .5}%)`
  }))
  const side = Array.from({ length: 18 }, (_, i) => {
    const lit = config.sideMode === 501 ? i < level * 18 : config.sideMode === 502 ? Math.abs(i - 8) < level * 9 : config.sideMode === 503
    return lit ? `hsl(${(t * 60 + i * 15) % 360} 85% ${level * config.brightness * .5}%)` : '#181c20'
  })
  return { keys, side, level }
}
