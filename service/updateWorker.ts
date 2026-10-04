import {spawn,execFileSync} from 'node:child_process'
import {copyFileSync,cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,unlinkSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {CORE_VERSION,validVersion,newer} from './updatePackage'
import {readInstall,readJson,commitInstall,readUpdateStatus,saveUpdateStatus,transactionFile,writeJson,type InstallRecord,type UpdateTransaction} from './installState'
import {executeTransaction,rollbackTransaction,type TransactionActions} from './installTransaction'
import {verifySetupFile} from './setupUpdater'
import type {SetupManifest} from './setupManifest'

const testMode=!!process.env.OPENHERO68_SETUP_TEST
const stateDefault=()=>testMode?process.env.OPENHERO68_TEST_STATE!:path.join(process.env.LOCALAPPDATA!,'OpenHero68','rgb-service')
const endpoint=`http://127.0.0.1:${testMode?17868:16868}`
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
const uninstallKey='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+(testMode?'OpenHero68SetupTest':'OpenHero68')+'_is1'
const runKey='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const runName=testMode?'OpenHero68SetupTestRgbService':'OpenHero68RgbService'
// Never delete the directory this process is standing in; retry briefly for a launcher that is still exiting.
const removeDir=(dir:string,fallbackCwd:string)=>{
  const inside=path.relative(path.resolve(dir),process.cwd());if(!inside||(!inside.startsWith('..')&&!path.isAbsolute(inside)))process.chdir(fallbackCwd)
  rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:250})
}
async function waitForExit(pid:number,timeout=15000){
  if(!Number.isInteger(pid)||pid<=0||pid===process.pid)return
  const deadline=Date.now()+timeout
  while(Date.now()<deadline){try{process.kill(pid,0)}catch{return}await delay(100)}
}
const ownedInstallFile=(name:string)=>['OpenHero68.exe','installation.json','active-version.txt'].includes(name)||/^unins\d+\.(exe|dat|msg)$/.test(name)
async function run(file:string,args:string[],timeout=240000){
  return new Promise<number>((resolve,reject)=>{
    const child=spawn(file,args,{windowsHide:true,stdio:'ignore'})
    const timer=setTimeout(()=>{child.kill();reject(Error('Installer/process timeout'))},timeout)
    child.once('error',e=>{clearTimeout(timer);reject(e)})
    child.once('exit',code=>{clearTimeout(timer);resolve(code??1)})
  })
}
function reg(args:string[]){return execFileSync('reg.exe',args,{stdio:'pipe',windowsHide:true,encoding:'utf8'})}
async function stop(host:string,stateDir:string,operationId?:string){
  try{
    if(operationId){
      const r=await fetch(endpoint+'/updates/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId}),signal:AbortSignal.timeout(15000)})
      if(!r.ok)throw Error('Cannot prepare the app for update')
    }
    await fetch(endpoint+'/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)})
  }catch(error){
    // A refused connection means no app is running; a listening app must stop safely.
    try{await fetch(endpoint+'/status',{signal:AbortSignal.timeout(1000)});throw error}catch(probe){if(probe===error)throw error}
  }
  if(await run(host,['--wait-stop'],45000)!==0)throw Error('The app is still running; update cancelled')
  for(let i=0;i<50;i++){
    try{await fetch(endpoint+'/status',{signal:AbortSignal.timeout(500)})}catch{return}
    await delay(200)
  }
  throw Error('Service port is still occupied')
}
async function launch(root:string,version:string,stateDir:string,operationId?:string){
  if(!validVersion(version))throw Error('Invalid launch version')
  const exe=path.join(root,'versions',version,'Hero68RgbService.exe')
  const child=spawn(exe,['--state-dir',stateDir,...(operationId?['--update-operation',operationId]:[])],{
    cwd:path.dirname(exe),windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,OPENHERO68_INSTALLED:'1'}
  })
  await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)})
  child.unref()
}
function actions(tx:UpdateTransaction,folder:string,host:string):TransactionActions{
  const snapshot=path.join(folder,'snapshot'),rootSnapshot=path.join(snapshot,'installation'),stateSnapshot=path.join(snapshot,'state')
  return {
    stop:()=>stop(host,tx.stateDir,tx.phase==='stopping'?tx.operationId:undefined),
    async backup(){
      mkdirSync(rootSnapshot,{recursive:true});mkdirSync(stateSnapshot,{recursive:true})
      for(const entry of readdirSync(tx.root,{withFileTypes:true}))if(entry.isFile()&&ownedInstallFile(entry.name))copyFileSync(path.join(tx.root,entry.name),path.join(rootSnapshot,entry.name))
      for(const entry of readdirSync(tx.stateDir,{withFileTypes:true}))if(entry.name!=='updates'&&!entry.name.endsWith('.log'))cpSync(path.join(tx.stateDir,entry.name),path.join(stateSnapshot,entry.name),{recursive:true})
      try{reg(['export',uninstallKey,path.join(snapshot,'uninstall.reg'),'/y'])}catch{}
      let startup:string|null=null
      try{startup=reg(['query',runKey,'/v',runName]).match(/REG_SZ\s+([^\r\n]+)/)?.[1]??null}catch{}
      writeJson(path.join(snapshot,'startup.json'),{startup})
    },
    async install(){
      const tasks=[...(tx.previous.desktop?['desktopicon']:[]),...(tx.previous.autostart?['autostart']:[])].join(',')
      const code=await run(host,['--run-installer',tx.setup,'/VERYSILENT','/SUPPRESSMSGBOXES','/SP-','/NORESTART','/NORESTARTAPPLICATIONS','/NOCLOSEAPPLICATIONS','/UPDATE=1',`/TASKS=${tasks}`,`/DIR=${tx.root}`,`/LOG=${path.join(folder,'setup.log')}`],260000)
      if(code!==0)throw Error(`Setup failed (${code}); Windows was not restarted`)
    },
    launch:(version,op)=>launch(tx.root,version,tx.stateDir,op),
    async healthy(){
      const deadline=Date.now()+30000
      while(Date.now()<deadline){
        try{
          const r=await fetch(endpoint+'/status',{signal:AbortSignal.timeout(500)}),s=await r.json() as {coreVersion:string;launcherVersion:string;apiVersion:number;updateOperation?:string;pid:number;supportsFullUpdate?:boolean}
          if(r.ok&&s.coreVersion===tx.target&&s.launcherVersion===tx.target&&s.apiVersion===tx.apiVersion&&s.updateOperation===tx.operationId&&s.pid>0&&s.supportsFullUpdate)return true
        }catch{}
        await delay(200)
      }
      return false
    },
    async restore(){
      for(const entry of readdirSync(tx.stateDir,{withFileTypes:true}))if(entry.name!=='updates'&&!entry.name.endsWith('.log'))rmSync(path.join(tx.stateDir,entry.name),{recursive:true,force:true})
      for(const entry of readdirSync(stateSnapshot))cpSync(path.join(stateSnapshot,entry),path.join(tx.stateDir,entry),{recursive:true})
      // Remove only files owned by this installation; never touch portable folders.
      for(const entry of readdirSync(tx.root,{withFileTypes:true}))if(entry.isFile()&&ownedInstallFile(entry.name))unlinkSync(path.join(tx.root,entry.name))
      for(const entry of readdirSync(rootSnapshot))copyFileSync(path.join(rootSnapshot,entry),path.join(tx.root,entry))
      removeDir(path.join(tx.root,'versions',tx.target),tx.stateDir)
      if(existsSync(path.join(snapshot,'uninstall.reg')))reg(['import',path.join(snapshot,'uninstall.reg')])
      const {startup}=readJson<{startup:string|null}>(path.join(snapshot,'startup.json'))
      if(startup!==null)reg(['add',runKey,'/v',runName,'/t','REG_SZ','/d',startup,'/f'])
      else try{reg(['delete',runKey,'/v',runName,'/f'])}catch{}
    },
    phase:(phase,error)=>saveUpdateStatus(tx.stateDir,{operationId:tx.operationId,version:tx.target,phase,...(error?{error}:{})})
  }
}
function acquire(root:string){
  const file=path.join(root,'updater.lock')
  try{
    const pid=Number(readFileSync(file,'utf8'))
    try{process.kill(pid,0);return undefined}catch{unlinkSync(file)}
  }catch{}
  writeFileSync(file,String(process.pid),{flag:'wx'})
  return ()=>{try{unlinkSync(file)}catch{}}
}
async function recover(root:string){
  const file=transactionFile(root)
  if(!existsSync(file))return false
  const tx=readJson<UpdateTransaction>(file)
  if(path.resolve(tx.root)!==root||!validVersion(tx.target)||!validVersion(tx.previous.active)||!/^[-a-f0-9]{36}$/.test(tx.operationId))throw Error('Invalid recovery journal')
  if(tx.phase==='completed'||tx.phase==='failed'){unlinkSync(file);return false}
  const folder=path.join(tx.stateDir,'updates',tx.operationId)
  await rollbackTransaction(tx,actions(tx,folder,path.join(folder,'update-host.exe')))
  saveUpdateStatus(tx.stateDir,{operationId:tx.operationId,version:tx.target,phase:'failed',error:'Interrupted update was rolled back'})
  unlinkSync(file)
  return true
}
async function main(){
  const mode=process.argv[2],root=path.resolve(process.argv[3]??'')
  if(mode==='--stop'){await stop(path.join(__dirname,'update-host.exe'),stateDefault());return}
  if(mode==='--worker'){
    const folder=root,request=readJson<{root:string;stateDir:string;operationId:string;setup:string;manifest:SetupManifest}>(path.join(folder,'request.json'))
    const installRoot=path.resolve(request.root),unlock=acquire(installRoot)
    if(!unlock)throw Error('Another updater is running')
    try{
      await recover(installRoot)
      const p=await verifySetupFile(request.setup,request.manifest),previous=readInstall(installRoot)
      try{previous.autostart=reg(['query',runKey,'/v',runName]).includes(path.join(installRoot,'OpenHero68.exe'))}catch{previous.autostart=false}
      if(!newer(p.version,previous.active))throw Error('Version is already installed or would downgrade the app')
      const tx:UpdateTransaction={operationId:request.operationId,root:installRoot,stateDir:request.stateDir,previous,target:p.version,apiVersion:p.apiVersion,setup:request.setup,phase:'stopping',backupReady:false,hadInstallation:true}
      await executeTransaction(tx,actions(tx,folder,path.join(folder,'update-host.exe')))
      if(['completed','failed'].includes(readUpdateStatus(request.stateDir).phase))rmSync(transactionFile(installRoot),{force:true})
      if(readUpdateStatus(request.stateDir).phase==='completed'){
        try{
          for(const entry of readdirSync(path.join(installRoot,'versions')))if(validVersion(entry)&&entry!==p.version&&entry!==previous.active)rmSync(path.join(installRoot,'versions',entry),{recursive:true,force:true})
          for(const entry of readdirSync(path.join(request.stateDir,'updates')))if(/^[-a-f0-9]{36}$/.test(entry)&&entry!==request.operationId)rmSync(path.join(request.stateDir,'updates',entry),{recursive:true,force:true})
        }catch{/* Locked old caches can be cleaned after the next successful update. */}
      }
    }finally{unlock()}
  }else if(mode==='--launch'){
    // Recover from the copied runtime, not a version directory that rollback may delete.
    if(existsSync(transactionFile(root))){
      const tx=readJson<UpdateTransaction>(transactionFile(root))
      if(path.resolve(tx.root)!==root||!/^[-a-f0-9]{36}$/.test(tx.operationId))throw Error('Invalid recovery journal')
      const folder=path.join(tx.stateDir,'updates',tx.operationId)
      if(!['completed','failed'].includes(tx.phase)&&path.resolve(__dirname)!==path.resolve(folder)){
        // cwd must be the update folder: an inherited cwd inside versions/<target> makes rollback's rmdir fail with EBUSY forever.
        const child=spawn(path.join(folder,'runtime.exe'),[path.join(folder,'update-worker.cjs'),'--launch',root,String(process.pid)],{cwd:folder,windowsHide:true,detached:true,stdio:'ignore'})
        await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref();return
      }
    }
    await waitForExit(Number(process.argv[4]))
    const unlock=acquire(root);if(!unlock)return
    try{if(!await recover(root))await launch(root,readInstall(root).active,stateDefault())}finally{unlock()}
  }else if(mode==='--activate'){
    // Used by an interactive setup after it has safely stopped the old app.
    const version=process.argv[4]??CORE_VERSION
    if(!validVersion(version))throw Error('Invalid setup version')
    let previous:InstallRecord|undefined;try{previous=readInstall(root)}catch{}
    commitInstall(root,{schemaVersion:1,active:version,previous:previous?.active,desktop:process.argv.includes('--desktop'),autostart:process.argv.includes('--autostart')})
  }else throw Error('Unknown updater command')
}
void main().catch(error=>{
  try{
    if(process.argv[2]==='--worker'){
      const request=readJson<{stateDir:string;operationId:string}>(path.join(path.resolve(process.argv[3]),'request.json'))
      saveUpdateStatus(request.stateDir,{operationId:request.operationId,phase:'failed',error:String(error)})
    }
  }catch{}
  try{
    if(process.argv[2]==='--launch'){
      const root=path.resolve(process.argv[3]),tx=readJson<UpdateTransaction>(transactionFile(root))
      saveUpdateStatus(tx.stateDir,{operationId:tx.operationId,phase:'failed',error:'Recovery failed: '+String(error)})
    }
  }catch{}
  process.stderr.write(String(error));process.exitCode=1
})
