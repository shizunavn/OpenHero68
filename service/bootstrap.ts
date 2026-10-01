import {spawn, type ChildProcess} from 'node:child_process'
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,renameSync} from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import {CORE_VERSION,CORE_API_VERSION,validVersion,newer,verifyCore,type CoreManifest} from './updatePackage'

const state=path.join(process.env.LOCALAPPDATA??process.cwd(),'OpenHero68','rgb-service')
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
    if(newer(CORE_VERSION,record.version))return {file:bundled,version:CORE_VERSION}
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
  child=spawn(runtime,[file,...process.argv.slice(2)],{cwd:__dirname,stdio:'ignore',windowsHide:true,env:{...process.env,OPENHERO68_CORE_VERSION:version}})
  return child
}
function shutdown(){quitting=true;child?.kill();setTimeout(()=>process.exit(0),1500).unref()}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown)
async function run(){
  let current=installed(),crashes=0
  while(!quitting){
    const next=launch(current.file,current.version)
    const exit=await new Promise<number>(resolve=>{next.on('exit',code=>resolve(code??1));next.on('error',()=>resolve(1))})
    child=null
    if(quitting)break
    if(exit===73&&existsSync(pendingFile)){
      const previous=current
      try{
        const manifest=readManifest(pendingFile),folder=path.join(coreDir,manifest.payload.version)
        const file=path.join(folder,'service.cjs')
        verifiedCore(manifest,file)
        const backup=path.join(coreDir,'preset-before-update.json')
        if(existsSync(path.join(state,'preset.json')))copyFileSync(path.join(state,'preset.json'),backup)
        const staged=activeFile+'.tmp';writeFileSync(staged,JSON.stringify({version:manifest.payload.version}));renameSync(staged,activeFile)
        current={file,version:manifest.payload.version}
        const trial=launch(current.file,current.version)
        const trialExit=new Promise<number>(resolve=>{trial.on('exit',code=>resolve(code??1));trial.on('error',()=>resolve(1))})
        if(await healthy(trial.pid,current.version)){
          // A verified and healthy core remains the active child.
          const result=await trialExit
          child=null
          if(result===0)break
          if(result===73)continue
          throw Error(`Updated core exited: ${result}`)
        }
        if(trial.exitCode===null)trial.kill()
        await trialExit
        throw Error('Updated core did not become healthy')
      }catch(error){
        process.stderr.write(`Core update rolled back: ${error}\n`)
        current=previous
        const staged=activeFile+'.tmp'
        if(previous.file===bundled){if(existsSync(activeFile)){writeFileSync(staged,'{}');renameSync(staged,activeFile)}}
        else{writeFileSync(staged,JSON.stringify({version:previous.version}));renameSync(staged,activeFile)}
        const backup=path.join(coreDir,'preset-before-update.json')
        if(existsSync(backup))copyFileSync(backup,path.join(state,'preset.json'))
      }
      continue
    }
    if(exit===0)break
    if(++crashes>=3)break
    await new Promise(resolve=>setTimeout(resolve,1000))
  }
}
void run().then(()=>process.exit(0),error=>{process.stderr.write(String(error));process.exit(1)})
