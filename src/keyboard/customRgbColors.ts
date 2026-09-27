import type { RgbColor } from '../protocol/hero68/rgb'

// Separated, saturated hues; blue/violet have enough secondary light to remain
// visible on real LEDs. Randomness picks a hue rather than noisy RGB channels.
export const CUSTOM_RGB_PALETTE: readonly RgbColor[] = [
  [255,48,48], [255,144,24], [255,224,32], [96,255,48],
  [32,255,224], [48,144,255], [176,80,255], [255,56,176],
]
const distance = (a: RgbColor, b: RgbColor) => a.reduce((sum,c,i)=>sum+(c-b[i])**2,0)

export function pickCustomRgbColor(background: RgbColor, random: number, previous?: RgbColor): RgbColor {
  const options = CUSTOM_RGB_PALETTE.filter(c=>!previous||c.some((v,i)=>v!==previous[i]))
  const best = Math.max(...options.map(c=>distance(c,background)))
  // Random among contrasting hues, with no consecutive repeated choice.
  const candidates = options.filter(c=>distance(c,background)>=best*.5)
  const index = Math.min(candidates.length-1,Math.floor(Math.max(0,Math.min(1,random))*candidates.length))
  return [...candidates[index]] as RgbColor
}

export function blendCustomRgbColor(background: number[], tint: RgbColor, alpha: number, multicolor: boolean): number[] {
  // Reduce the underlying layer only within active Multicolor FX. This preserves
  // the silhouette over busy backgrounds and returns smoothly to base on fade.
  const remaining = (1-alpha)*(multicolor ? 1-.5*alpha : 1)
  return background.map((c,i)=>c*remaining+tint[i]*alpha)
}
