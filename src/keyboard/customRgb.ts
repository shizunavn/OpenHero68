import { HERO68_KEY_IDS, HERO68_LAYOUT } from './hero68Layout'
import { FirmwareRgbPreview } from './rgbPreview'
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb'
import { restoreCustomRgb, type CustomRgbConfiguration } from './customRgbModel'
export * from './customRgbModel'
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))

// Physical key centers for host FX; firmware base uses its own confirmed LED map.
export const CUSTOM_RGB_COORDINATES: Record<string, [number, number]> = {}
for (const [y, row] of HERO68_LAYOUT.entries()) {
  let x = 0
  for (const key of row) { const width = key.width ?? 1; CUSTOM_RGB_COORDINATES[key.id] = [x + width / 2, y]; x += width }
}
function rainbow(hue: number): RgbColor {
  const h = ((hue % 1) + 1) % 1 * 6, x = 255 * (1 - Math.abs(h % 2 - 1))
  return (h < 1 ? [255,x,0] : h < 2 ? [x,255,0] : h < 3 ? [0,255,x] : h < 4 ? [0,x,255] : h < 5 ? [x,0,255] : [255,0,x]).map(Math.round) as RgbColor
}
type Press = { id: string; at: number; x: number; y: number }
export class CustomRgbEngine {
  private base: FirmwareRgbPreview
  private time = 0
  private events: Press[] = []
  private held = new Set<string>()
  private releases = new Map<string, number>()
  private transitions = new Map<string, {at:number;pressed:boolean}>()
  private travel: Record<string, number> = {}
  private config: CustomRgbConfiguration
  constructor(private profile: RgbProfile) {
    this.config = restoreCustomRgb(profile.custom, profile)
    this.base = new FirmwareRgbPreview({ ...profile, keys: this.config.base })
  }
  configure(profile: RgbProfile) {
    this.profile = profile; this.config = restoreCustomRgb(profile.custom, profile)
    this.base.configure({ ...profile, keys: this.config.base })
  }
  get milliseconds() { return this.time }
  advance(milliseconds: number) {
    this.time = Math.max(this.time, milliseconds)
    this.base.advance(this.time)
    this.events = this.events.filter(e => this.time - e.at <= 4000)
    for (const [id, at] of this.releases) if (this.time - at > 4000) this.releases.delete(id)
  }
  event(id: string, pressed: boolean) {
    const point = CUSTOM_RGB_COORDINATES[id]
    if (!point) return
    if (pressed && !this.held.has(id)) {
      this.events.push({ id, at: this.time, x: point[0], y: point[1] })
      this.events = this.events.slice(-64); this.held.add(id); this.releases.delete(id)
      this.base.event(id, true)
      this.transitions.set(id,{at:this.time,pressed:true})
    } else if (!pressed && this.held.delete(id)) { this.releases.set(id, this.time); this.transitions.set(id,{at:this.time,pressed:false}); this.base.event(id, false) }
  }
  setTravel(values: Record<string, number>) { this.travel = values }
  releaseAll() { for (const id of [...this.held]) this.event(id, false); this.travel = {} }
  frame() {
    const frame = this.base.frame()
    const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t)}
    // Suppress rest noise, then ease into analog effects without a visible step.
    const depth=(id:string)=>{const mm=this.travel[id]??(this.held.has(id)?3.4:0);return clamp(mm/3.4,0,1)*smooth((mm-.08)/.08)}
    const analog=HERO68_KEY_IDS.map(id=>({id,p:depth(id),point:CUSTOM_RGB_COORDINATES[id]})).filter(k=>k.p>.025)
    const bar=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0']
    const deepest=Math.max(0,...analog.map(k=>k.p))
    for (const id of HERO68_KEY_IDS) {
      const [x, y] = CUSTOM_RGB_COORDINATES[id]
      const hex = frame.keys[id]
      let color = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16))
      for (const layer of this.config.layers) {
        if (!layer.enabled || !layer.keys.includes(id)) continue
        const axis = layer.direction === 'horizontal' ? x : y
        let strength = 0
        let tint:RgbColor = layer.multicolor ? rainbow(this.time/1000*layer.speed/30 + x/18 + y/10) : layer.color
        const seconds = this.time / 1000
        if (layer.effect === 'scan') {
          const all=Object.values(CUSTOM_RGB_COORDINATES).map(p=>p[layer.direction==='horizontal'?0:1])
          const min=Math.min(...all),length=Math.max(...all)-min
          const phase=(seconds*layer.speed)%(2*length),center=min+(phase<=length?phase:2*length-phase)
          strength = smooth(1 - Math.abs(axis-center)/layer.width)
        } else if (layer.effect === 'breath') strength = (.5-.5*Math.cos(seconds*layer.speed*Math.PI/3))
        else if (layer.effect === 'mixing') {
          const components=[depth('ArrowLeft'),depth('ArrowDown'),depth('ArrowRight')]
          strength=Math.max(...components)
          // Scale opacity with travel. A nearly released arrow must not replace
          // the entire animated base with a nearly black, fully opaque layer.
          tint=components.map(p=>strength>0?Math.round(p/strength*255):0) as RgbColor
        }
        else if (layer.effect === 'touch') {const index=bar.indexOf(id);strength=index<0?0:clamp(deepest*bar.length-index,0,1)}
        else if (layer.effect === 'rt') {const t=this.transitions.get(id);if(t){strength=this.held.has(id)?1:clamp(1-(this.time-t.at)/layer.duration,0,1);tint=t.pressed?[0,255,0]:[255,0,0]}}
        else if (layer.effect === 'jelly'||layer.effect === 'aoe') {
          for(const k of analog){const distance=Math.hypot(x-k.point[0],y-k.point[1]);const radius=layer.effect==='jelly'?.25+k.p*layer.width*3:layer.width;strength=Math.max(strength,smooth(1-distance/radius)*(layer.effect==='aoe'?k.p:1))}
        }
        else if (layer.effect === 'reaction') {
          const release = this.releases.get(id)
          strength = this.held.has(id) ? 1 : release === undefined ? 0 : clamp(1-(this.time-release)/layer.duration,0,1)
        } else {
          for (const event of this.events) {
            const age = this.time-event.at, fade = clamp(1-age/layer.duration,0,1)
            if (!fade) continue
            const radius = Math.hypot(x-event.x,y-event.y)
            let power = 0
            if (layer.effect === 'ripple') power = clamp(1-Math.abs(radius-age/1000*layer.speed)/layer.width,0,1)*fade
            if (layer.effect === 'trail') power = event.id===id?fade:0
            strength = Math.max(strength, power)
          }
        }
        const alpha = clamp(strength*layer.opacity/100,0,1)
        color = color.map((c,i) => c*(1-alpha)+tint[i]*alpha)
      }
      frame.keys[id] = '#'+color.map(c=>Math.round(clamp(c,0,255)).toString(16).padStart(2,'0')).join('')
    }
    return frame
  }
}
