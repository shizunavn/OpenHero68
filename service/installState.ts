import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,renameSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {validVersion} from './updatePackage'

export type UpdatePhase='idle'|'checking'|'downloading'|'verifying'|'stopping'|'installing'|'restarting'|'completed'|'rolling-back'|'failed'
export type UpdateStatus={operationId?:string;phase:UpdatePhase;version?:string;downloaded?:number;total?:number;error?:string;updatedAt?:string}
export type InstallRecord={schemaVersion:1;active:string;previous?:string;desktop:boolean;autostart:boolean}
export type UpdateTransaction={operationId:string;root:string;stateDir:string;previous:InstallRecord;target:string;apiVersion:number;setup:string;phase:UpdatePhase;backupReady:boolean;hadInstallation:boolean}
export const terminal=(phase:UpdatePhase)=>['idle','completed','failed'].includes(phase)
export function writeAtomic(file:string,value:string){
  mkdirSync(path.dirname(file),{recursive:true})
  const tmp=file+'.tmp',fd=openSync(tmp,'w')
  try{writeFileSync(fd,value);fsyncSync(fd)}finally{closeSync(fd)}
  renameSync(tmp,file)
}
export function writeJson(file:string,value:unknown){writeAtomic(file,JSON.stringify(value))}
export function readJson<T>(file:string):T{return JSON.parse(readFileSync(file,'utf8')) as T}
export function readInstall(root:string):InstallRecord{
  const record=readJson<InstallRecord>(path.join(root,'installation.json'))
  if(record.schemaVersion!==1||!validVersion(record.active)||(record.previous&&!validVersion(record.previous))||typeof record.desktop!=='boolean'||typeof record.autostart!=='boolean')throw Error('Invalid installation record')
  return record
}
export function commitInstall(root:string,record:InstallRecord){
  writeJson(path.join(root,'installation.json'),record)
  writeAtomic(path.join(root,'active-version.txt'),record.active)
}
export function updateStatusFile(stateDir:string){return path.join(stateDir,'updates','status.json')}
export function readUpdateStatus(stateDir:string):UpdateStatus{
  try{return readJson<UpdateStatus>(updateStatusFile(stateDir))}catch{return {phase:'idle'}}
}
export function saveUpdateStatus(stateDir:string,status:UpdateStatus){writeJson(updateStatusFile(stateDir),{...status,updatedAt:new Date().toISOString()})}
export function transactionFile(root:string){return path.join(root,'update-transaction.json')}
export function installationRoot(directory:string){
  const root=path.resolve(directory,'..','..')
  return path.basename(path.dirname(directory))==='versions'&&existsSync(path.join(root,'installation.json'))?root:undefined
}
