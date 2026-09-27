import type { RgbProfile } from './hero68/rgb'
export type RgbServiceStatus={enabled:boolean;connected:boolean;preset:boolean;fps:number;frameMs:number;frames:number;packets:number;hallSnapshots:number;timeouts:number;maxGapMs:number;lastError:string|null}
const endpoint='http://127.0.0.1:16868'
async function request(path:string,value?:unknown):Promise<RgbServiceStatus>{
  const response=await fetch(endpoint+path,{method:value===undefined?'GET':'POST',headers:value===undefined?undefined:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(value===undefined?1000:5000)})
  const result=await response.json()
  if(!response.ok)throw Error(result.error??'RGB service request failed')
  return result
}
export const rgbService={status:()=>request('/status'),start:(profile:RgbProfile)=>request('/start',profile),update:(profile:RgbProfile)=>request('/preset',profile),stop:()=>request('/stop',{})}
