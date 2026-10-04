import type { RgbProfile } from './hero68/rgb'
import { decodeReport } from './hero68/codec'
import { fetchLocalService, LocalServicePermissionError } from './localServiceAccess'
import type { RhythmConfiguration } from '../keyboard/rhythm'
import { serviceHealth } from './serviceHealth'
export type RgbServiceStatus={
  supportsFullUpdate?:boolean;coreVersion?:string;launcherVersion?:string;driverInstalled?:boolean
  tachyon?:boolean;supportsTachyon?:boolean;apiVersion?:number;supportedEffects?:string[];supportedBaseEffects?:string[];mode?:'onboard'|'custom'|'rhythm';sessionId?:string
  enabled:boolean;connected:boolean;preset:boolean;fps:number;frameMs:number;frames:number;packets:number
  customConfiguration?:RgbProfile;customRevision?:number
  hallSnapshots:number;timeouts:number;maxGapMs:number;lastError:string|null;targetFps?:number;renderFps?:number;reusedFrames?:number
  sideOutput?:boolean;supportedModes?:string[];supportedRhythmModes?:number[];supportedRhythmSideModes?:number[];rhythmConfiguration?:RhythmConfiguration
  audioState?:string;audioError?:string;audioLevel?:number;sampleRate?:number;audioEndpoint?:string;droppedFrames?:number
  audioToWriteP95Ms?:number|null;audioTimestampInvalid?:number;audioLatencySamples?:number;captureToWriteP95Ms?:number|null
  frameGapP95Ms?:number|null;configurationBusy?:boolean
  renderMs?:number;encodeMs?:number;writeMs?:number
}
export type RgbServiceFrame={enabled:boolean;connected:boolean;keys?:Record<string,string>;side?:string[];audioLevel?:number;mode?:'onboard'|'custom'|'rhythm';sideOutput?:boolean;sequence?:number;sessionId?:string;shuttingDown?:boolean}
export type AudioEndpoint={id:string;name:string;default:boolean}
export type RgbServiceHallRecord={keyId:string;pos:number;distanceUnits:number;adc:number;pressed:boolean}
const endpoint='http://127.0.0.1:16868'
const availability=new Set<(online:boolean)=>void>()
let online:boolean|undefined
const health=serviceHealth()
export const isRgbServiceAvailable=()=>health.online
export function confirmRgbServiceAvailable(){setOnline(health.success())}
function setOnline(value:boolean){if(online===value)return;online=value;availability.forEach(listener=>listener(value))}
async function request(path:string,value?:unknown):Promise<RgbServiceStatus>{
  let response:Response
  try{response=await fetchLocalService(endpoint+path,{method:value===undefined?'GET':'POST',headers:value===undefined?undefined:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)},value===undefined?1000:5000)}
  catch(error){if(path==='/status')setOnline(health.failure(error instanceof LocalServicePermissionError));if(error instanceof LocalServicePermissionError)throw error;throw Error(error instanceof DOMException&&error.name==='TimeoutError'?'RGB service phản hồi quá chậm. Hãy thử lại.':'RGB service đã tắt. Hãy chạy lại Hero68RgbService.exe. Các thay đổi chưa lưu vẫn được giữ trên web.')}
  if(response.status===403){if(path==='/status')setOnline(health.failure(true));throw Error('The background app does not allow this website. Update the app, then check again.')}
  const result=await response.json()
  if(!response.ok){if(path==='/status')setOnline(health.failure());throw Object.assign(Error(result.error??'RGB service request failed'),{status:response.status})}
  if(path==='/status')confirmRgbServiceAvailable()
  return result
}
export const rgbService={
  tachyon:(enabled:boolean)=>request('/tachyon',{enabled}),
  rhythmStart:(configuration:RhythmConfiguration)=>request('/rhythm/start',{configuration}),
  rhythmUpdate:(configuration:RhythmConfiguration,sessionId:string)=>request('/rhythm/config',{configuration,sessionId}),
  async audioDevices():Promise<AudioEndpoint[]>{const response=await fetchLocalService(endpoint+'/audio/devices',{},5000);const result=await response.json();if(!response.ok)throw Error(result.error??'Cannot list playback devices');return result.devices},
  status:()=>request('/status'),start:(profile:RgbProfile)=>request('/start',profile),update:(profile:RgbProfile,sessionId:string,expectedRevision?:number)=>request('/preset',{profile,sessionId,...(expectedRevision!==undefined?{expectedRevision}:{})}),stop:()=>request('/stop',{}),mode:(mode:'onboard'|'custom',profile?:RgbProfile)=>request('/mode',{mode,...(profile?{profile}:{})}),
  onAvailability(listener:(online:boolean)=>void){availability.add(listener);return()=>availability.delete(listener)},
  async deviceRequest(packet:Uint8Array,reenumerate=false){
    const hex=Array.from(packet,c=>c.toString(16).padStart(2,'0')).join('')
    let response:Response
    try{response=await fetchLocalService(endpoint+'/device/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hex,reenumerate})},reenumerate?10000:5000)}
    catch(error){if(error instanceof LocalServicePermissionError)throw error;throw Error('RGB service đã tắt. Hãy chạy lại Hero68RgbService.exe.')}
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
    try{response=await fetchLocalService(endpoint+'/device/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests})},Math.max(5000,packets.length*900))}
    catch(error){if(error instanceof LocalServicePermissionError)throw error;throw Error('RGB service đã tắt hoặc không phản hồi khi lưu cấu hình.')}
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
