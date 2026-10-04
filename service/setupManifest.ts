import {createHash,verify} from 'node:crypto'
import {UPDATE_PUBLIC_KEY} from './updatePublicKey'
import {validVersion} from './updatePackage'

export const SETUP_ASSET='OpenHero68-Setup-Windows-x64.exe'
export const SETUP_MANIFEST='OpenHero68-update.json'
export const MAX_SETUP_SIZE=250_000_000
export type SetupManifest={payload:{schemaVersion:1;version:string;apiVersion:number;platform:'windows-x64';asset:string;size:number;sha256:string};signature:string}
export function inspectSetupManifest(manifest:SetupManifest,key=UPDATE_PUBLIC_KEY){
  const p=manifest?.payload
  if(!p||p.schemaVersion!==1||!validVersion(p.version)||!Number.isInteger(p.apiVersion)||p.apiVersion<1||
    p.platform!=='windows-x64'||p.asset!==SETUP_ASSET||!Number.isInteger(p.size)||p.size<1||p.size>MAX_SETUP_SIZE||
    !/^[a-f0-9]{64}$/.test(p.sha256)||typeof manifest.signature!=='string'||
    !verify(null,Buffer.from(JSON.stringify(p)),key,Buffer.from(manifest.signature,'base64')))
    throw Error('Invalid setup manifest signature or payload')
  return p
}
export function verifySetup(manifest:SetupManifest,bytes:Buffer,key=UPDATE_PUBLIC_KEY){
  const p=inspectSetupManifest(manifest,key)
  if(bytes.length!==p.size||createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw Error('Setup checksum mismatch')
  return p
}
