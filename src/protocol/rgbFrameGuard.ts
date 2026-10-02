import type {RgbServiceFrame} from './rgbService'

/** A slow or reconnected SSE stream must not repaint an old playback session. */
export function rgbFrameGuard(sessionId:string|undefined) {
  let sequence=-1
  return (frame:RgbServiceFrame)=>{
    if(!sessionId||frame.sessionId!==sessionId)return false
    if(!frame.enabled)return true
    const next=frame.sequence
    if(typeof next!=='number'||!Number.isInteger(next)||next<=sequence||next<0)return false
    sequence=next
    return true
  }
}
