import {createHash,verify} from 'node:crypto'
import {UPDATE_PUBLIC_KEY} from './updatePublicKey'

export const LAUNCHER_VERSION='0.2.1'
export const CORE_API_VERSION=4
export type CoreManifest={payload:{version:string;apiVersion:number;minLauncher:string;sha256:string;size:number;asset:string};signature:string}
export function validVersion(version:string){return /^\d+\.\d+\.\d+$/.test(version)}
export function newer(a:string,b:string){
  if(!validVersion(a)||!validVersion(b))return false
  const left=a.split('.').map(Number),right=b.split('.').map(Number)
  return left.some((value,i)=>value>right[i]&&left.slice(0,i).every((earlier,j)=>earlier===right[j]))
}
export function inspectManifest(manifest:CoreManifest,publicKey:string=UPDATE_PUBLIC_KEY){
  const payload=manifest?.payload
  if(!payload||!validVersion(payload.version)||!validVersion(payload.minLauncher)||payload.asset!=='OpenHero68-RGB-core.cjs'||
    !/^[0-9a-f]{64}$/.test(payload.sha256)||!Number.isInteger(payload.size)||payload.size<1||payload.size>8_000_000||
    typeof manifest.signature!=='string'||!verify(null,Buffer.from(JSON.stringify(payload)),publicKey,Buffer.from(manifest.signature,'base64')))
    throw Error('Core manifest signature is invalid')
  return payload
}
export function verifyManifest(manifest:CoreManifest,publicKey:string=UPDATE_PUBLIC_KEY){
  const payload=inspectManifest(manifest,publicKey)
  if(newer(payload.minLauncher,LAUNCHER_VERSION)||payload.apiVersion!==CORE_API_VERSION)
    throw Error('Core update requires a newer launcher')
  return payload
}
export function verifyCore(manifest:CoreManifest,bytes:Buffer,publicKey:string=UPDATE_PUBLIC_KEY){
  const payload=verifyManifest(manifest,publicKey)
  if(bytes.length!==payload.size||createHash('sha256').update(bytes).digest('hex')!==payload.sha256)throw Error('Core checksum mismatch')
  return payload.version
}
