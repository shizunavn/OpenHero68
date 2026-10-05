import {createHash,verify} from 'node:crypto'
import {UPDATE_PUBLIC_KEY} from './updatePublicKey'
import releaseVersion from './version.json'

export const BUNDLED_LAUNCHER_VERSION=releaseVersion.version
// The native launcher keeps its identity when a newer JS core is installed.
export const LAUNCHER_VERSION=validVersion(process.env.OPENHERO68_LAUNCHER_VERSION??'')?process.env.OPENHERO68_LAUNCHER_VERSION!:BUNDLED_LAUNCHER_VERSION
export const CORE_VERSION=releaseVersion.version
export const CORE_API_VERSION=releaseVersion.apiVersion
export type CoreManifest={payload:{version:string;apiVersion:number;minLauncher:string;sha256:string;size:number;asset:string};signature:string}
export function validVersion(version:string){return /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)}
export function newer(a:string,b:string){
  if(!validVersion(a)||!validVersion(b))return false
  const left=a.split('.').map(Number),right=b.split('.').map(Number)
  for(let i=0;i<4;i++){
    const delta=(left[i]??0)-(right[i]??0)
    if(delta!==0)return delta>0
  }
  return false
}
export function inspectManifest(manifest:CoreManifest,publicKey:string=UPDATE_PUBLIC_KEY){
  const payload=manifest?.payload
  if(!payload||!validVersion(payload.version)||!validVersion(payload.minLauncher)||payload.asset!=='OpenHero68-RGB-core.cjs'||
    !/^[0-9a-f]{64}$/.test(payload.sha256)||!Number.isInteger(payload.size)||payload.size<1||payload.size>8_000_000||
    typeof manifest.signature!=='string'||!verify(null,Buffer.from(JSON.stringify(payload)),publicKey,Buffer.from(manifest.signature,'base64')))
    throw Error('Core manifest signature is invalid')
  return payload
}
export function verifyManifest(manifest:CoreManifest,publicKey:string=UPDATE_PUBLIC_KEY,launcherVersion:string=LAUNCHER_VERSION){
  const payload=inspectManifest(manifest,publicKey)
  if(newer(payload.minLauncher,launcherVersion)||payload.apiVersion!==CORE_API_VERSION)
    throw Error('Core update requires a newer launcher')
  return payload
}
export function verifyCore(manifest:CoreManifest,bytes:Buffer,publicKey:string=UPDATE_PUBLIC_KEY,launcherVersion:string=LAUNCHER_VERSION){
  const payload=verifyManifest(manifest,publicKey,launcherVersion)
  if(bytes.length!==payload.size||createHash('sha256').update(bytes).digest('hex')!==payload.sha256)throw Error('Core checksum mismatch')
  return payload.version
}
