import type { RgbProfile } from './hero68/rgb'
import { decodeReport } from './hero68/codec'
export type RgbServiceStatus={apiVersion?:number;enabled:boolean;connected:boolean;preset:boolean;fps:number;frameMs:number;frames:number;packets:number;hallSnapshots:number;timeouts:number;maxGapMs:number;lastError:string|null}
export type RgbServiceFrame={enabled:boolean;connected:boolean;keys?:Record<string,string>;sequence?:number}
const endpoint='http://127.0.0.1:16868'
async function request(path:string,value?:unknown):Promise<RgbServiceStatus>{
  const response=await fetch(endpoint+path,{method:value===undefined?'GET':'POST',headers:value===undefined?undefined:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(value===undefined?1000:5000)})
  const result=await response.json()
  if(!response.ok)throw Error(result.error??'RGB service request failed')
  return result
}
export const rgbService={
  status:()=>request('/status'),start:(profile:RgbProfile)=>request('/start',profile),update:(profile:RgbProfile)=>request('/preset',profile),stop:()=>request('/stop',{}),
  async deviceRequest(packet:Uint8Array,reenumerate=false){
    const hex=Array.from(packet,c=>c.toString(16).padStart(2,'0')).join('')
    const response=await fetch(endpoint+'/device/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hex,reenumerate}),signal:AbortSignal.timeout(reenumerate?10000:5000)})
    const result=await response.json()
    if(!response.ok)throw Error(result.error??'Service configuration request failed')
    if(typeof result.hex!=='string'||!/^[0-9a-f]{128}$/i.test(result.hex))throw Error('Invalid service configuration reply')
    const bytes=result.hex.match(/../g) as string[]
    const reply=decodeReport(Uint8Array.from(bytes,c=>parseInt(c,16)))
    if(!reply.checksumValid)throw Error('Invalid service reply checksum')
    return reply
  },
  frames(onFrame:(frame:RgbServiceFrame)=>void,onError?:()=>void){
    const stream=new EventSource(endpoint+'/frames')
    stream.onmessage=event=>{try{onFrame(JSON.parse(event.data))}catch{/* Ignore malformed frames. */}}
    stream.onerror=()=>onError?.()
    return ()=>stream.close()
  },
}
