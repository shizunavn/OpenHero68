import {spawn, type ChildProcess} from 'node:child_process'
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {CORE_VERSION,CORE_API_VERSION,LAUNCHER_VERSION,validVersion,newer,verifyCore,type CoreManifest} from './updatePackage'
import {superviseCore} from './coreSupervisor'

const stateIndex=process.argv.indexOf('--state-dir')
if(stateIndex>=0&&!process.argv[stateIndex+1])throw Error('Missing --state-dir value')
const state=stateIndex>=0?path.resolve(process.argv[stateIndex+1]):path.join(process.env.LOCALAPPDATA??process.cwd(),'OpenHero68','rgb-service')
const coreDir=path.join(state,'core')
const activeFile=path.join(coreDir,'active.json'),pendingFile=path.join(coreDir,'pending.json')
const bundled=path.join(__dirname,'service.cjs'),runtime=path.join(__dirname,'runtime.exe')
mkdirSync(coreDir,{recursive:true})
function verifiedCore(manifest:CoreManifest,filename:string){return verifyCore(manifest,readFileSync(filename))}
function readManifest(filename:string){return JSON.parse(readFileSync(filename,'utf8')) as CoreManifest}
function installed(){
  if(!existsSync(activeFile))return {file:bundled,version:CORE_VERSION}
  try{
    const record=JSON.parse(readFileSync(activeFile,'utf8')) as {version:string}
    if(!validVersion(record.version))throw Error('Invalid active version')
    // A newly extracted app must not load an older downloaded core instead.
    if(!newer(record.version,CORE_VERSION))return {file:bundled,version:CORE_VERSION}
    const folder=path.join(coreDir,record.version),file=path.join(folder,'service.cjs')
    const version=verifiedCore(readManifest(path.join(folder,'manifest.json')),file)
    if(version!==record.version)throw Error('Wrong active version')
    return {file,version}
  }catch(error){process.stderr.write(`Core fallback: ${error}\n`);return {file:bundled,version:CORE_VERSION}}
}
async function healthy(pid:number|undefined,version:string){
  for(let i=0;i<35;i++){
    try{
      const response=await new Promise<{apiVersion?:number;pid?:number;coreVersion?:string}>((resolve,reject)=>{
        const request=http.get('http://127.0.0.1:16868/status',{timeout:300},result=>{
          let text='';result.on('data',chunk=>text+=chunk);result.on('end',()=>{try{resolve(JSON.parse(text))}catch(error){reject(error)}})
        });request.on('error',reject);request.on('timeout',()=>request.destroy())
      })
      if(response.apiVersion===CORE_API_VERSION&&response.pid===pid&&response.coreVersion===version)return true
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  return false
}
let child:ChildProcess|null=null,quitting=false
function launch(file:string,version:string){
  child=spawn(runtime,[file,...process.argv.slice(2)],{cwd:__dirname,stdio:'ignore',windowsHide:true,env:{...process.env,OPENHERO68_CORE_VERSION:version,OPENHERO68_LAUNCHER_VERSION:LAUNCHER_VERSION}})
  return child
}
function shutdown(){quitting=true;child?.kill();setTimeout(()=>process.exit(0),1500).unref()}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
async function run(){
  let presetBackupReady=false
  await superviseCore(installed(),{
    launch(core){
      const process=launch(core.file,core.version)
      return {pid:process.pid,exit:new Promise<number>(resolve=>{
        process.on('exit',code=>resolve(code??1));process.on('error',()=>resolve(1))
      }),kill(){if(process.exitCode===null)process.kill()}}
    },
    pending:()=>existsSync(pendingFile),
    prepare(){
      presetBackupReady=false
      const manifest=readManifest(pendingFile),folder=path.join(coreDir,manifest.payload.version)
      const file=path.join(folder,'service.cjs')
      verifiedCore(manifest,file)
      const backup=path.join(coreDir,'preset-before-update.json')
      if(existsSync(path.join(state,'preset.json'))){copyFileSync(path.join(state,'preset.json'),backup);presetBackupReady=true}
      const staged=activeFile+'.tmp';writeFileSync(staged,JSON.stringify({version:manifest.payload.version}));renameSync(staged,activeFile)
      return {file,version:manifest.payload.version}
    },
    healthy:(trial,core)=>healthy(trial.pid,core.version),
    rollback(previous){
      const staged=activeFile+'.tmp'
      if(previous.file===bundled){if(existsSync(activeFile)){writeFileSync(staged,'{}');renameSync(staged,activeFile)}}
      else{writeFileSync(staged,JSON.stringify({version:previous.version}));renameSync(staged,activeFile)}
      const backup=path.join(coreDir,'preset-before-update.json')
      if(presetBackupReady&&existsSync(backup))copyFileSync(backup,path.join(state,'preset.json'))
    },
    quitting:()=>quitting,
    error:error=>process.stderr.write(`Core update rolled back: ${error}\n`),
    wait:()=>new Promise(resolve=>setTimeout(resolve,1000))
  })
}

void run().then(()=>process.exit(0),error=>{process.stderr.write(String(error));process.exit(1)})
