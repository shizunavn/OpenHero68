import type { RgbProfile } from './hero68/rgb'
import { decodeReport } from './hero68/codec'
export type RgbServiceStatus={apiVersion?:number;mode?:'onboard'|'custom';sessionId?:string;enabled:boolean;connected:boolean;preset:boolean;fps:number;frameMs:number;frames:number;packets:number;hallSnapshots:number;timeouts:number;maxGapMs:number;lastError:string|null}
export type RgbServiceFrame={enabled:boolean;connected:boolean;keys?:Record<string,string>;sequence?:number;sessionId?:string;shuttingDown?:boolean}
export type RgbServiceHallRecord={keyId:string;pos:number;distanceUnits:number;adc:number;pressed:boolean}
const endpoint='http://127.0.0.1:16868'
const availability=new Set<(online:boolean)=>void>()
let online:boolean|undefined
function setOnline(value:boolean){if(online===value)return;online=value;availability.forEach(listener=>listener(value))}
async function request(path:string,value?:unknown):Promise<RgbServiceStatus>{
  let response:Response
  try{response=await fetch(endpoint+path,{method:value===undefined?'GET':'POST',headers:value===undefined?undefined:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(value===undefined?1000:5000)})}
  catch(error){if(path==='/status')setOnline(false);throw Error(error instanceof DOMException&&error.name==='TimeoutError'?'RGB service phản hồi quá chậm. Hãy thử lại.':'RGB service đã tắt. Hãy chạy lại Hero68RgbService.exe. Các thay đổi chưa lưu vẫn được giữ trên web.')}
  const result=await response.json()
  if(!response.ok)throw Error(result.error??'RGB service request failed')
  if(path==='/status')setOnline(true)
  return result
}
export const rgbService={
  status:()=>request('/status'),start:(profile:RgbProfile)=>request('/start',profile),update:(profile:RgbProfile,sessionId:string)=>request('/preset',{profile,sessionId}),stop:()=>request('/stop',{}),mode:(mode:'onboard'|'custom',profile?:RgbProfile)=>request('/mode',{mode,...(profile?{profile}:{})}),
  onAvailability(listener:(online:boolean)=>void){availability.add(listener);return()=>availability.delete(listener)},
  async deviceRequest(packet:Uint8Array,reenumerate=false){
    const hex=Array.from(packet,c=>c.toString(16).padStart(2,'0')).join('')
    let response:Response
    try{response=await fetch(endpoint+'/device/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hex,reenumerate}),signal:AbortSignal.timeout(reenumerate?10000:5000)})}
    catch{throw Error('RGB service đã tắt. Hãy chạy lại Hero68RgbService.exe.')}
    const result=await response.json()
    if(!response.ok)throw Error(result.error??'Service configuration request failed')
    if(typeof result.hex!=='string'||!/^[0-9a-f]{128}$/i.test(result.hex))throw Error('Invalid service configuration reply')
    const bytes=result.hex.match(/../g) as string[]
    const reply=decodeReport(Uint8Array.from(bytes,c=>parseInt(c,16)))
    if(!reply.checksumValid)throw Error('Invalid service reply checksum')
    return reply
  },
  async deviceBatch(packets:readonly Uint8Array[]){
    if(!packets.length)return []
    const requests=packets.map(packet=>({hex:Array.from(packet,c=>c.toString(16).padStart(2,'0')).join('')}))
    let response:Response
    try{response=await fetch(endpoint+'/device/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests}),signal:AbortSignal.timeout(Math.max(5000,packets.length*900))})}
    catch{throw Error('RGB service đã tắt hoặc không phản hồi khi lưu cấu hình.')}
    const result=await response.json()
    if(!response.ok)throw Error(result.error??'Configuration batch failed')
    if(!Array.isArray(result.hexes)||result.hexes.length!==packets.length)throw Error('Incomplete service batch reply')
    return result.hexes.map((hex:unknown,i:number)=>{
      if(typeof hex!=='string'||!/^[0-9a-f]{128}$/i.test(hex))throw Error('Invalid service batch reply')
      const bytes=hex.match(/../g) as string[]
      const reply=decodeReport(Uint8Array.from(bytes,c=>parseInt(c,16)))
      if(!reply.checksumValid||reply.command!==packets[i][1]||reply.zone!==packets[i][2])throw Error('Unexpected service batch reply')
      return reply
    })
  },
  frames(onFrame:(frame:RgbServiceFrame)=>void,onError?:()=>void){
    const stream=new EventSource(endpoint+'/frames')
    stream.onmessage=event=>{try{onFrame(JSON.parse(event.data))}catch{/* Ignore malformed frames. */}}
    stream.onerror=()=>onError?.()
    return ()=>stream.close()
  },
  hallStream(keys:readonly string[],onRecords:(records:RgbServiceHallRecord[])=>void,onError:()=>void){
    const stream=new EventSource(endpoint+'/hall/stream?keys='+encodeURIComponent(keys.join(',')))
    stream.onmessage=event=>{try{const data=JSON.parse(event.data);if(Array.isArray(data.records))onRecords(data.records)}catch{/* Ignore malformed Hall frames. */}}
    stream.onerror=onError
    return ()=>stream.close()
  },
}
