import type { RgbColor } from '../protocol/hero68/rgb'

// Separated, saturated hues; blue/violet have enough secondary light to remain
// visible on real LEDs. Randomness picks a hue rather than noisy RGB channels.
export const CUSTOM_RGB_PALETTE: readonly RgbColor[] = [
  [255,48,48], [255,144,24], [255,224,32], [96,255,48],
  [32,255,224], [48,144,255], [176,80,255], [255,56,176],
]
const distance = (a: RgbColor, b: RgbColor) => a.reduce((sum,c,i)=>sum+(c-b[i])**2,0)
const chromatic = (color: RgbColor): RgbColor => {
  const low=Math.min(...color), span=Math.max(...color)-low
  return color.map(c=>span>0?(c-low)/span*255:0) as RgbColor
}

/** Reserve a contiguous hue range away from the entire animated backdrop. */
export function customRgbContrastPalette(backgrounds: readonly RgbColor[]): readonly RgbColor[] {
  const hues=backgrounds.filter(c=>Math.max(...c)-Math.min(...c)>16).map(chromatic)
  if(!hues.length)return CUSTOM_RGB_PALETTE
  let bestScore=-1, best:readonly RgbColor[]=CUSTOM_RGB_PALETTE
  for(let start=0;start<CUSTOM_RGB_PALETTE.length;start++){
    const palette=Array.from({length:4},(_,i)=>CUSTOM_RGB_PALETTE[(start+i)%CUSTOM_RGB_PALETTE.length])
    let score=Infinity
    // Evaluate the transitions too, so the continuous Scan cannot cross a base hue.
    for(let i=0;i<palette.length-1;i++)for(let step=0;step<=4;step++){
      const hue=chromatic(palette[i].map((v,c)=>v+(palette[i+1][c]-v)*step/4) as RgbColor)
      for(const background of hues)score=Math.min(score,distance(hue,background))
    }
    if(score>bestScore){bestScore=score;best=palette}
  }
  return best
}

/** Continuous spectrum, including the last-to-first seam; never picks random hues. */
export function sampleCustomRgbSpectrum(phase: number, palette: readonly RgbColor[]=CUSTOM_RGB_PALETTE): RgbColor {
  const loop=palette===CUSTOM_RGB_PALETTE
  // A reserved range travels back and forth rather than wrapping across blocked hues.
  const position=loop?(phase-Math.floor(phase))*palette.length:(.5-.5*Math.cos(phase*Math.PI*2))*(palette.length-1)
  const index=Math.floor(position), t=position-index, mix=t*t*(3-2*t)
  const from=palette[index], to=palette[loop?(index+1)%palette.length:Math.min(index+1,palette.length-1)]
  return from.map((v,i)=>v+(to[i]-v)*mix) as RgbColor
}

export function pickCustomRgbColor(background: RgbColor, random: number, previous?: RgbColor, palette: readonly RgbColor[]=CUSTOM_RGB_PALETTE): RgbColor {
  const options = palette.filter(c=>!previous||c.some((v,i)=>v!==previous[i]))
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
