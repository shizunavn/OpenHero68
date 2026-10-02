import {CustomRgbEngine} from '../src/keyboard/customRgb'
import type {RgbProfile} from '../src/protocol/hero68/rgb'

// Firmware simulation advances one 0.5 ms tick at a time. Its timeline must
// exclude time spent in Rhythm/onboard, and cannot replay hours after resume.
export class CustomPlayback {
  engine:CustomRgbEngine|null=null
  private previous=0
  private elapsed=110
  constructor(profile:RgbProfile|null,private now=()=>performance.now()) {this.start(profile)}
  start(profile:RgbProfile|null) {
    this.engine=profile?new CustomRgbEngine(profile):null
    this.previous=this.now();this.elapsed=110
    return this.engine
  }
  advance() {
    const at=this.now()
    this.elapsed+=Math.max(0,Math.min(100,at-this.previous))
    this.previous=at
    this.engine?.advance(this.elapsed)
  }
}
