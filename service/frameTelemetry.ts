export type NativeFrameTotals = {
  packets:number
  outputFrames?:number
  outputPackets?:number
  renderedFrames?:number
  outputMaxGapMs?:number
  outputLongGaps?:number
}

// Telemetry is a latest-value mailbox. Count native output, not IPC deliveries.
export class FrameDelivery {
  private previous?:{frames:number;packets:number;rendered:number}
  reset(){this.previous=undefined}
  observe(value:NativeFrameTotals,rendered=true){
    const totals={frames:value.outputFrames!,packets:value.outputPackets!,rendered:value.renderedFrames!}
    if(!Object.values(totals).every(v=>Number.isSafeInteger(v)&&v>=0))return {frames:1,packets:value.packets,rendered:rendered?1:0}
    const previous=this.previous
    const restarted=!previous||totals.frames<previous.frames||totals.packets<previous.packets||totals.rendered<previous.rendered
    this.previous=totals
    return {frames:totals.frames-(restarted?0:previous.frames),packets:totals.packets-(restarted?0:previous.packets),rendered:totals.rendered-(restarted?0:previous.rendered)}
  }
}
