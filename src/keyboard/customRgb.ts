import { HERO68_KEY_IDS, HERO68_LAYOUT } from './hero68Layout'
import { FirmwareRgbPreview } from './rgbPreview'
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb'
import { restoreCustomRgb, RGB_GRADIENT_PALETTES, type CustomRgbConfiguration, type CustomRgbLayer } from './customRgbModel'
import { pickCustomRgbColor, blendCustomRgbColor, sampleCustomRgbSpectrum, customRgbContrastPalette } from './customRgbColors'
export * from './customRgbModel'
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))

// Physical key centers for host FX; firmware base uses its own confirmed LED map.
export const CUSTOM_RGB_COORDINATES: Record<string, [number, number]> = {}
for (const [y, row] of HERO68_LAYOUT.entries()) {
  let x = 0
  for (const key of row) { const width = key.width ?? 1; CUSTOM_RGB_COORDINATES[key.id] = [x + width / 2, y]; x += width }
}
type Colors = Record<string, RgbColor>
type Press = { id: string; at: number; x: number; y: number; colors: Colors }
type PressureWave = Press & { layerId: string; strength: number }
const bounds = [0,1].map(axis => {
  const values = Object.values(CUSTOM_RGB_COORDINATES).map(p=>p[axis])
  return { min: Math.min(...values), max: Math.max(...values) }
})
const gradientStops = Object.fromEntries(Object.entries(RGB_GRADIENT_PALETTES).map(([id,palette])=>
  [id,palette.colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))) ]))
function gradient(layer: CustomRgbLayer, phase: number): RgbColor {
  if (!layer.multicolor) return layer.color
  const stops = gradientStops[layer.palette ?? (layer.effect==='comet'?'ice':'aurora')]
  const position = clamp(phase,0,1)*(stops.length-1), index = Math.min(stops.length-2,Math.floor(position)), mix = position-index
  return stops[index].map((v,i)=>v+(stops[index+1][i]-v)*mix) as RgbColor
}
function aurora(layer: CustomRgbLayer, x: number, y: number, seconds: number) {
  const t=seconds*layer.speed, span=bounds[0].max-bounds[0].min+1
  const bend=Math.sin(y*.85+t*.55)*.7+y*.38
  const phase=(x-bounds[0].min+bend-t*1.8)/span*3
  // Continuous color and light curves prevent seams as a curtain wraps around.
  const palettePosition=(1-Math.cos(phase*Math.PI*2/3))/2
  const curtain=Math.pow(.5+.5*Math.cos(phase*Math.PI*2),Math.max(.35,1.4/layer.width))
  return {strength:.35+.65*curtain, tint:gradient(layer,palettePosition)}
}
export class CustomRgbEngine {
  private base: FirmwareRgbPreview
  private time = 0
  private events: Press[] = []
  private held = new Set<string>()
  private releases = new Map<string, number>()
  private transitions = new Map<string, {at:number;pressed:boolean}>()
  private travel: Record<string, number> = {}
  private hallVersions=new Map<string,{sequence:number;timestampMs:number}>()
  private keyColors = new Map<string, Colors>()
  private analogColors = new Map<string, Colors>()
  private cycleColors = new Map<string, {cycle:number;colors:Colors}>()
  private previousColors = new Map<string, RgbColor>()
  private colorPalettes = new Map<string, readonly RgbColor[]>()
  private touchColors: Colors = {}
  private touchSource: string | undefined
  private config: CustomRgbConfiguration
  private pressureWaves: PressureWave[] = []
  private emissions = new Map<string, number>()
  private analogInput = false
  private strikes = new Map<string, {mm:number;at:number;peak:number;hitAt:number}>()
  constructor(private profile: RgbProfile) {
    this.config = restoreCustomRgb(profile.custom, profile)
    this.base = new FirmwareRgbPreview(this.baseProfile())
    this.configureColorPalettes()
  }
  private configureColorPalettes() {
    const backgrounds:RgbColor[]=[]
    const addGradient=(palette:string)=>{
      const stops=gradientStops[palette]
      for(let i=0;i<stops.length-1;i++)for(let step=0;step<=8;step++)
        backgrounds.push(stops[i].map((v,c)=>v+(stops[i+1][c]-v)*step/8) as RgbColor)
    }
    if(this.config.baseEffect&&this.config.base.brightness>0){
      if(this.config.base.mix)addGradient(this.config.baseEffect.palette)
      else backgrounds.push(this.config.base.rgb)
    }
    this.colorPalettes.clear()
    for(const layer of this.config.layers){
      this.colorPalettes.set(layer.id,customRgbContrastPalette(backgrounds))
      if(layer.enabled&&layer.opacity>0&&layer.keys.length&&['aurora','comet'].includes(layer.effect)){
        if(layer.multicolor)addGradient(layer.palette??(layer.effect==='comet'?'ice':'aurora'))
        else backgrounds.push(layer.color)
      }
    }
  }
  private baseProfile(): RgbProfile {
    // Aurora replaces every main-key pixel. Keep the firmware timeline and side
    // output, but do not emulate an invisible onboard effect on each 0.5 ms tick.
    return {...this.profile,keys:this.config.baseEffect?{...this.config.base,mode:20}:this.config.base}
  }
  configure(profile: RgbProfile) {
    this.profile = profile; this.config = restoreCustomRgb(profile.custom, profile)
    this.base.configure(this.baseProfile())
    this.configureColorPalettes()
    const pressureIds = new Set(this.config.layers.filter(l=>l.enabled&&l.effect==='pressure-wave').map(l=>l.id))
    this.pressureWaves = this.pressureWaves.filter(w=>pressureIds.has(w.layerId))
    for (const key of this.emissions.keys()) if (!pressureIds.has(key.slice(0,key.lastIndexOf(':')))) this.emissions.delete(key)
    const ids = new Set(this.config.layers.map(l=>l.id))
    for (const key of this.cycleColors.keys()) if (!ids.has(key)) this.cycleColors.delete(key)
    for (const key of this.previousColors.keys()) if (!ids.has(key)) this.previousColors.delete(key)
  }
  get milliseconds() { return this.time }
  get activeWaveCount() { return this.pressureWaves.length }
  advance(milliseconds: number) {
    this.time = Math.max(this.time, milliseconds)
    this.base.advance(this.time)
    this.events = this.events.filter(e => this.time - e.at <= 4000)
    this.pressureWaves = this.pressureWaves.filter(e => this.time - e.at <= 4000)
    for (const [id, at] of this.releases) if (this.time - at > 4000) {this.releases.delete(id);this.keyColors.delete(id)}
  }
  event(id: string, pressed: boolean) {
    const point = CUSTOM_RGB_COORDINATES[id]
    if (!point) return
    if (pressed && !this.held.has(id)) {
      const colors:Colors={}; this.keyColors.set(id,colors)
      this.events.push({ id, at: this.time, x: point[0], y: point[1], colors })
      this.events = this.events.slice(-64); this.held.add(id); this.releases.delete(id)
      this.base.event(id, true)
      this.transitions.set(id,{at:this.time,pressed:true})
      // Browser clicks/typing simulate a firm strike; Hall playback measures motion.
      if(!this.analogInput)this.strikes.set(id,{mm:3.4,at:this.time,peak:1,hitAt:this.time})
    } else if (!pressed && this.held.delete(id)) { this.releases.set(id, this.time); this.transitions.set(id,{at:this.time,pressed:false}); this.base.event(id, false) }
  }
  setTravel(values: Record<string, number>, samples?:Record<string,{sequence:number;timestampMs:number}>) {
    if(!this.analogInput){this.analogInput=true;this.strikes.clear()}
    this.travel = values
    for(const [id,value] of Object.entries(values)) {
      if(!CUSTOM_RGB_COORDINATES[id]||!Number.isFinite(value))continue
      const sample=samples?.[id],previousSample=this.hallVersions.get(id)
      if(sample&&previousSample&&sample.sequence<=previousSample.sequence)continue
      if(sample)this.hallVersions.set(id,sample)
      const mm=clamp(value,0,3.4)
      if(mm<=.08){this.strikes.set(id,{mm:0,at:this.time,peak:0,hitAt:this.time});continue}
      const previous=this.strikes.get(id)??{mm:0,at:this.time-25,peak:0,hitAt:this.time}
      const delta=mm-previous.mm,dt=sample&&previousSample?clamp(sample.timestampMs-previousSample.timestampMs,1,80):clamp(this.time-previous.at,8,80)
      let peak=previous.peak,hitAt=previous.hitAt
      if(delta>.04){
        // Hall measures position, not force. Velocity is a strike-strength proxy.
        const velocity=delta/dt*1000, strength=.12+.88*clamp((velocity-3)/117,0,1)
        if(strength>peak){peak=strength;hitAt=this.time}
      }
      this.strikes.set(id,{mm,at:this.time,peak,hitAt})
    }
    for(const id of this.strikes.keys())if(values[id]===undefined)this.strikes.delete(id)
    for(const id of this.hallVersions.keys())if(values[id]===undefined)this.hallVersions.delete(id)
  }
  private strikeBrightness(id:string) {
    const strike=this.strikes.get(id)
    return strike?strike.peak*(.25+.75*Math.exp(-Math.max(0,this.time-strike.hitAt)/600)):0
  }
  releaseAll() { for (const id of [...this.held]) this.event(id, false); this.travel = {}; this.strikes.clear();this.hallVersions.clear() }
  private randomColor(colors:Colors, layerId:string, background:RgbColor):RgbColor {
    if (!colors[layerId]) {
      colors[layerId]=pickCustomRgbColor(background,Math.random(),this.previousColors.get(layerId),this.colorPalettes.get(layerId))
      this.previousColors.set(layerId,colors[layerId])
    }
    return colors[layerId]
  }
  frame() {
    const frame = this.base.frame()
    if (this.config.baseEffect?.effect==='aurora') {
      const settings=this.config.baseEffect
      const layer={...settings,effect:'aurora',multicolor:this.config.base.mix,color:this.config.base.rgb} as CustomRgbLayer
      for(const id of HERO68_KEY_IDS) {
        const [x,y]=CUSTOM_RGB_COORDINATES[id], {strength,tint}=aurora(layer,x,y,this.time/1000)
        frame.keys[id]='#'+tint.map(c=>Math.round(c*strength*this.config.base.brightness/20).toString(16).padStart(2,'0')).join('')
      }
    }
    const baseColors=Object.fromEntries(Object.entries(frame.keys).map(([id,hex])=>[id,[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as RgbColor]))
    const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t)}
    // Suppress rest noise, then ease into analog effects without a visible step.
    const depth=(id:string)=>{const mm=this.travel[id]??(this.held.has(id)?3.4:0);return clamp(mm/3.4,0,1)*smooth((mm-.08)/.08)}
    const analog=HERO68_KEY_IDS.map(id=>({id,p:depth(id),point:CUSTOM_RGB_COORDINATES[id]})).filter(k=>k.p>.025)
    const activeAnalog=new Set(analog.map(k=>k.id))
    for(const id of this.analogColors.keys())if(!activeAnalog.has(id))this.analogColors.delete(id)
    for(const k of analog)if(!this.analogColors.has(k.id))this.analogColors.set(k.id,{})
    const emitting = new Set<string>()
    for (const layer of this.config.layers) {
      if (!layer.enabled || layer.effect!=='pressure-wave') continue
      for (const key of analog) {
        if (!layer.keys.includes(key.id)) continue
        const token = `${layer.id}:${key.id}`; emitting.add(token)
        const strength=this.strikeBrightness(key.id)
        if(strength<=0)continue
        const last = this.emissions.get(token)
        if (last!==undefined && this.time-last<500) continue
        this.emissions.set(token,this.time)
        const colors = this.analogColors.get(key.id)!
        if(layer.multicolor)this.randomColor(colors,layer.id,baseColors[key.id])
        this.pressureWaves.push({id:key.id,at:this.time,x:key.point[0],y:key.point[1],colors:{...colors},layerId:layer.id,strength})
      }
    }
    for (const token of this.emissions.keys()) if(!emitting.has(token))this.emissions.delete(token)
    this.pressureWaves = this.pressureWaves.filter(w=>this.time-w.at<(this.config.layers.find(l=>l.id===w.layerId)?.duration??0)).slice(-64)
    const bar=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0']
    const deepest=Math.max(0,...analog.map(k=>k.p))
    const deepestKey=analog.reduce<typeof analog[number]|undefined>((best,k)=>!best||k.p>best.p?k:best,undefined)
    // The bar is one effect: do not recolor it when two held keys trade the
    // deepest position by a few ADC counts.
    if(!deepestKey){this.touchColors={};this.touchSource=undefined}
    else if(!this.touchSource)this.touchSource=deepestKey.id
    const cycleTints=new Map<string,RgbColor>()
    const scanBands=new Map<string,{center:number;colorPhase:number}>()
    for(const layer of this.config.layers){
      if(!layer.enabled||!layer.multicolor)continue
      if(layer.effect==='scan'){
        const {min,max}=bounds[layer.direction==='horizontal'?0:1], length=max-min
        // Keep the same average keys/s and round-trip time, but ease both turns.
        const phase=(this.time/1000*layer.speed/length)%2
        scanBands.set(layer.id,{
          center:min+length*(.5-.5*Math.cos(phase*Math.PI)),
          // Color drifts independently of travel speed so fast scans cannot flash.
          colorPhase:(this.time/1000/20)%1,
        })
        continue
      }
      if(layer.effect!=='breath')continue
      const period=6/layer.speed
      const cycle=Math.floor(this.time/1000/period)
      let entry=this.cycleColors.get(layer.id)
      if(!entry||entry.cycle!==cycle){entry={cycle,colors:{}};this.cycleColors.set(layer.id,entry)}
      const keys=layer.keys.filter(id=>baseColors[id])
      const background=[0,1,2].map(i=>keys.reduce((sum,id)=>sum+baseColors[id][i],0)/Math.max(1,keys.length)) as RgbColor
      cycleTints.set(layer.id,this.randomColor(entry.colors,layer.id,background))
    }
    for (const id of HERO68_KEY_IDS) {
      const [x, y] = CUSTOM_RGB_COORDINATES[id]
      const hex = frame.keys[id]
      let color = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16))
      for (const layer of this.config.layers) {
        if (!layer.enabled || !layer.keys.includes(id)) continue
        const axis = layer.direction === 'horizontal' ? x : y
        let strength = 0
        let tint:RgbColor = cycleTints.get(layer.id)??layer.color
        const randomTint=(colors:Colors,source:string)=>this.randomColor(colors,layer.id,baseColors[source])
        const seconds = this.time / 1000
        if (layer.effect === 'aurora') {
          ;({strength,tint}=aurora(layer,x,y,seconds))
        } else if (layer.effect === 'comet') {
          const primary=layer.direction==='horizontal'?0:1, secondary=1-primary
          const span=bounds[primary].max-bounds[primary].min
          const tail=Math.max(.25,layer.speed*layer.duration/1000), path=span+tail+2
          const point=[x,y]
          for(let i=0;i<2;i++){
            const distance=(seconds*layer.speed+i*path*.5)%path
            const cycle=Math.floor((seconds*layer.speed+i*path*.5)/path)
            const lane=bounds[secondary].min+((cycle*2+i*3)%(Math.round(bounds[secondary].max-bounds[secondary].min)+1))
            const behind=bounds[primary].min-1+distance-point[primary]
            const cross=Math.exp(-Math.pow((point[secondary]-lane)/Math.max(.25,layer.width*.4),2))
            const head=Math.exp(-Math.pow(behind/.35,2))
            const trail=behind>=0&&behind<=tail?Math.pow(1-behind/tail,2)*.7:0
            const power=Math.max(head,trail)*cross
            if(power>strength){strength=power;tint=gradient(layer,clamp(1-behind/tail,0,1))}
          }
        } else if (layer.effect === 'pressure-wave') {
          for(const k of analog)if(k.id===id&&layer.keys.includes(k.id)){
            strength=this.strikeBrightness(k.id)*.55
            if(layer.multicolor)tint=randomTint(this.analogColors.get(k.id)!,k.id)
          }
          for(const wave of this.pressureWaves){
            if(wave.layerId!==layer.id)continue
            const age=this.time-wave.at, radius=age/1000*layer.speed
            const power=smooth(1-Math.abs(Math.hypot(x-wave.x,y-wave.y)-radius)/layer.width)*wave.strength*clamp(1-age/layer.duration,0,1)
            if(power>strength){strength=power;if(layer.multicolor)tint=randomTint(wave.colors,wave.id)}
          }
        } else if (layer.effect === 'scan') {
          const band=scanBands.get(layer.id)
          if(band){
            const offset=(axis-band.center)/layer.width
            // A soft envelope and a spectrum attached to the band remain continuous
            // through reversals. Adjacent palette stops avoid muddy complementary mixes.
            strength=Math.exp(-2*offset*offset)
            tint=sampleCustomRgbSpectrum(band.colorPhase+offset/8,this.colorPalettes.get(layer.id))
          }else{
            const {min,max}=bounds[layer.direction==='horizontal'?0:1],length=max-min
            const phase=(seconds*layer.speed)%(2*length),center=min+(phase<=length?phase:2*length-phase)
            strength = smooth(1 - Math.abs(axis-center)/layer.width)
          }
        } else if (layer.effect === 'breath') strength = (.5-.5*Math.cos(seconds*layer.speed*Math.PI/3))
        else if (layer.effect === 'mixing') {
          const components=[depth('ArrowLeft'),depth('ArrowDown'),depth('ArrowRight')]
          strength=Math.max(...components)
          // Scale opacity with travel. A nearly released arrow must not replace
          // the entire animated base with a nearly black, fully opaque layer.
          tint=components.map(p=>strength>0?Math.round(p/strength*255):0) as RgbColor
        }
        else if (layer.effect === 'touch') {const index=bar.indexOf(id);strength=index<0?0:clamp(deepest*bar.length-index,0,1);if(layer.multicolor&&this.touchSource)tint=randomTint(this.touchColors,this.touchSource)}
        else if (layer.effect === 'rt') {const t=this.transitions.get(id);if(t){strength=this.held.has(id)?1:clamp(1-(this.time-t.at)/layer.duration,0,1);tint=t.pressed?[0,255,0]:[255,0,0]}}
        else if (layer.effect === 'jelly'||layer.effect === 'aoe') {
          for(const k of analog){const distance=Math.hypot(x-k.point[0],y-k.point[1]);const radius=layer.effect==='jelly'?.25+k.p*layer.width*3:layer.width;const power=smooth(1-distance/radius)*(layer.effect==='aoe'?k.p:1);if(power>strength){strength=power;if(layer.multicolor)tint=randomTint(this.analogColors.get(k.id)!,k.id)}}
        }
        else if (layer.effect === 'reaction') {
          const release = this.releases.get(id)
          strength = this.held.has(id) ? 1 : release === undefined ? 0 : clamp(1-(this.time-release)/layer.duration,0,1)
          if(layer.multicolor&&strength>0){const colors=this.keyColors.get(id);if(colors)tint=randomTint(colors,id)}
        } else {
          for (const event of this.events) {
            const age = this.time-event.at, fade = clamp(1-age/layer.duration,0,1)
            if (!fade) continue
            const radius = Math.hypot(x-event.x,y-event.y)
            let power = 0
            if (layer.effect === 'ripple') power = clamp(1-Math.abs(radius-age/1000*layer.speed)/layer.width,0,1)*fade
            if (layer.effect === 'trail') power = event.id===id?fade:0
            if(power>strength){strength=power;if(layer.multicolor)tint=randomTint(event.colors,event.id)}
          }
        }
        const alpha = clamp(strength*layer.opacity/100,0,1)
        const colorful=layer.multicolor&&!['mixing','rt'].includes(layer.effect)
        color = blendCustomRgbColor(color,tint,alpha,colorful)
      }
      frame.keys[id] = '#'+color.map(c=>Math.round(clamp(c,0,255)).toString(16).padStart(2,'0')).join('')
    }
    return frame
  }
}
