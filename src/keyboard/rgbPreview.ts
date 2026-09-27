import { RgbArm } from './rgbArm'
import { HERO68_KEY_POSITIONS } from '../protocol/hero68/keyPositions'
import { HERO68_LAYOUT } from './hero68Layout'
import type { RgbProfile } from '../protocol/hero68/rgb'
import type { LightingFrame } from './lightingPreviewBus'

export const RGB_TICK_MS = 0.5
// Visible lanes serialize rows 1..5, with 15/15/14/14/10 nodes.
// Firmware event/table indices are NOT configuration protocol POS values.
export const RGB_LED_COORDINATES = Object.fromEntries(HERO68_LAYOUT.flatMap((row,y)=>row.map((key,x)=>[key.id,[x,y+1]]))) as Record<string,[number,number]>
export class FirmwareRgbPreview {
  cpu = new RgbArm()
  ticks = 0
  constructor(public config: RgbProfile, seed=1) {
    this.cpu.write(0x20000444,seed,4)
    this.configure(config,true)
  }
  configure(config:RgbProfile, initial=false) {
    const keysChanged=initial||JSON.stringify(config.keys)!==JSON.stringify(this.config.keys)||JSON.stringify(config.colors)!==JSON.stringify(this.config.colors)
    const sideChanged=initial||JSON.stringify(config.side)!==JSON.stringify(this.config.side)
    this.config=config
    const c=this.cpu, k=config.keys,s=config.side
    c.write(0x200016d1,k.mode)
    c.write(0x20000068,k.mixValue??(k.mix?7:0))
    k.rgb.forEach((v,i)=>c.write(0x2000005e+i,v))
    c.write(0x20000069,k.brightness); c.write(0x2000006a,k.speed)
    c.write(0x20000065,25+10*(5-k.speed))
    c.write(0x2000006b,s.mode); c.write(0x2000006c,s.mixValue??(s.mix?7:0))
    s.rgb.forEach((v,i)=>c.write(0x20000061+i,v))
    c.write(0x2000006d,s.brightness); c.write(0x2000006e,s.speed)
    for(const id of Object.keys(HERO68_KEY_POSITIONS)) {
      const pos=this.effectPosition(id)
      const color=config.colors[id]??[0,0,0]
      color.forEach((v,i)=>c.write(0x20006b77+pos+i*126,v))
    }
    // Match the command handler's deferred initialization through the dispatcher.
    if(keysChanged&&k.mode<20) c.write(0x20000050,c.read(0x20000050,4)|2,4)
    if(sideChanged) c.write(0x20000050,c.read(0x20000050,4)|0x04000000,4)
  }
  effectPosition(id:string) {
    const [col,row]=RGB_LED_COORDINATES[id]
    for(let index=0;index<126;index++) if(this.cpu.read(0x08022153+index)===(col*8+row)) return index
    throw Error(`Unmapped RGB key ${id}`)
  }
  event(keyId:string,pressed:boolean) {
    if(RGB_LED_COORDINATES[keyId]) this.cpu.call(pressed?0x080200b8:0x0802009c,this.effectPosition(keyId))
  }
  advance(milliseconds:number) {
    const target=Math.floor(milliseconds/RGB_TICK_MS)
    for(;this.ticks<target;this.ticks++) {
      for(const addr of [0x20000080,0x20000086,0x20000088]) this.cpu.write(addr,this.cpu.read(addr,2)+1,2)
      if(this.config.keys.mode<20) this.cpu.call(0x080208b8)
      if(this.config.side.mode<6) this.cpu.call(0x0801bd94)
    }
  }
  frame(): {keys:LightingFrame;side:string[]} {
    // The firmware brightness value represents LED output/PWM, while CSS colors are
    // encoded in sRGB. Multiplying sRGB channels directly makes mid brightness look
    // much darker and flatter than the physical LEDs. Scale in linear light and
    // encode back to sRGB so the preview tracks perceived LED brightness better.
    const applyBrightness=(value:number,brightness:number)=>{
      if(brightness<=0||value<=0)return 0
      if(brightness>=20)return Math.max(0,Math.min(255,Math.round(value)))
      const srgb=Math.max(0,Math.min(1,value/255))
      const linear=srgb<=0.04045?srgb/12.92:Math.pow((srgb+0.055)/1.055,2.4)
      const scaled=linear*Math.max(0,Math.min(1,brightness/20))
      const encoded=scaled<=0.0031308?scaled*12.92:1.055*Math.pow(scaled,1/2.4)-0.055
      return Math.max(0,Math.min(255,Math.round(encoded*255)))
    }
    const hex=(values:number[],brightness:number)=>'#'+values.map(x=>applyBrightness(x,brightness).toString(16).padStart(2,'0')).join('')
    const keys:LightingFrame={}
    for(const [id,[col,row]] of Object.entries(RGB_LED_COORDINATES)) {
      const p=0x20000dbc+col*18+row*3
      keys[id]=this.config.keys.mode>=20?'#35393b':hex([0,1,2].map(i=>this.cpu.read(p+i)),this.config.keys.brightness)
    }
    const sideBrightness=Math.min(20,this.cpu.read(0x08029b98+this.config.side.brightness))
    return {keys,side:Array.from({length:18},(_,i)=>hex([0,1,2].map(j=>this.cpu.read(0x20000f36+i*3+j)),sideBrightness))}
  }
}
