import { defaultRhythm, validateRhythm, RHYTHM_MODES, type RhythmConfiguration } from '../src/keyboard/rhythm'
export { defaultRhythm, validateRhythm, RHYTHM_MODES }
export type { RhythmConfiguration }
export const RHYTHM_SIDE_VERIFIED = false
export function nativeRhythmCommand(input: RhythmConfiguration) {
  const c = validateRhythm(input)
  if (c.sideMode !== 500 && !RHYTHM_SIDE_VERIFIED) throw Error('Side rhythm has not been verified on HERO68 hardware. Select Leave onboard for live playback.')
  return 'rhythm:' + [c.keyMode,c.sideMode,c.brightness,c.sensitivity,c.releaseMs,
    ...[1,3,5].map(i=>parseInt(c.color.slice(i,i+2),16)),
    ['fixed','rainbow','aurora','fire'].indexOf(c.palette),c.spectrum.db,
    ['hann','hamming','blackman'].indexOf(c.spectrum.window),c.spectrum.spatialRadius,1,
    Buffer.from(c.endpoint,'utf8').toString('hex'),...(c.keyMode===430?[c.syncOffsetMs]:[])].join(';')
}
