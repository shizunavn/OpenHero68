import {createHash,randomUUID} from 'node:crypto'
import {copyFile,mkdir,open,rename,rm,writeFile} from 'node:fs/promises'
import {createReadStream,existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import path from 'node:path'
import {newer,validVersion} from './updatePackage'
import {inspectSetupManifest,MAX_SETUP_SIZE,SETUP_ASSET,SETUP_MANIFEST,type SetupManifest} from './setupManifest'
import {installationRoot,readUpdateStatus,saveUpdateStatus,terminal,transactionFile,type UpdateStatus} from './installState'

const repo='https://github.com/shizunavn/OpenHero68/releases/download/'
type Asset={name:string;size:number;browser_download_url:string}
type Release={tag_name:string;draft?:boolean;prerelease?:boolean;assets:Asset[]}
export function createSetupUpdater(options:{version:string;stateDir:string;directory:string;fetch?:typeof fetch;publicKey?:string;runWorker?:(folder:string)=>Promise<void>}){
  const request=options.fetch??fetch,root=installationRoot(options.directory)
  let running:Promise<void>|undefined
  let volatileFailure:UpdateStatus|undefined
  const status=()=>volatileFailure??readUpdateStatus(options.stateDir)
  function save(value:UpdateStatus){saveUpdateStatus(options.stateDir,value)}
  if(root&&!terminal(status().phase)&&!existsSync(transactionFile(root))&&!existsSync(path.join(root,'updater.lock')))
    save({...status(),phase:'failed',error:'Previous update was interrupted before installation; retry the update'})
  function assetUrl(asset:Asset,version:string){
    if(asset.browser_download_url!==repo+'v'+version+'/'+asset.name)throw Error('Unexpected update source')
    return asset.browser_download_url
  }
  async function download(asset:Asset,manifest:SetupManifest,folder:string,operationId:string){
    const p=inspectSetupManifest(manifest,options.publicKey)
    if(asset.size!==p.size)throw Error('Setup size does not match signed manifest')
    const file=path.join(folder,SETUP_ASSET),tmp=file+'.tmp'
    const response=await request(assetUrl(asset,p.version),{signal:AbortSignal.timeout(180000)})
    if(!response.ok||!response.body)throw Error(`Setup download failed (${response.status})`)
    const fd=await open(tmp,'wx'),hash=createHash('sha256');let size=0,lastProgress=0
    try{
      for await(const chunk of response.body){
        size+=chunk.length;if(size>p.size||size>MAX_SETUP_SIZE)throw Error('Setup exceeds signed size')
        hash.update(chunk);await fd.writeFile(chunk)
        if(size-lastProgress>256000){save({operationId,phase:'downloading',version:p.version,downloaded:size,total:p.size});lastProgress=size}
      }
      await fd.sync()
    }catch(error){await fd.close();await rm(tmp,{force:true});throw error}
    await fd.close();save({operationId,phase:'verifying',version:p.version})
    if(size!==p.size||hash.digest('hex')!==p.sha256){await rm(tmp,{force:true});throw Error('Setup checksum mismatch')}
    await rename(tmp,file)
    return file
  }
  async function apply(operationId:string){
    const response=await request('https://api.github.com/repos/shizunavn/OpenHero68/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'OpenHero68'},signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw Error(`GitHub release check failed (${response.status})`)
    const release=await response.json() as Release,version=release.tag_name?.replace(/^v/,'')
    if(!validVersion(version)||release.draft||release.prerelease||!Array.isArray(release.assets))throw Error('Invalid stable release')
    if(!newer(version,options.version)){save({operationId,phase:'completed',version:options.version});return}
    const json=release.assets.find(a=>a.name===SETUP_MANIFEST),exe=release.assets.find(a=>a.name===SETUP_ASSET)
    if(!json||!exe||json.size<1||json.size>8192)throw Error('Release has no signed setup')
    const manifestResponse=await request(assetUrl(json,version),{signal:AbortSignal.timeout(15000)})
    if(!manifestResponse.ok||!manifestResponse.body)throw Error('Cannot download setup manifest')
    const chunks:Buffer[]=[];let length=0
    for await(const chunk of manifestResponse.body){length+=chunk.length;if(length>8192)throw Error('Manifest exceeds size limit');chunks.push(Buffer.from(chunk))}
    const manifest=JSON.parse(Buffer.concat(chunks).toString('utf8')) as SetupManifest
    const p=inspectSetupManifest(manifest,options.publicKey)
    if(p.version!==version)throw Error('Manifest does not match release')
    const folder=path.join(options.stateDir,'updates',operationId);await mkdir(folder,{recursive:true})
    save({operationId,phase:'downloading',version,downloaded:0,total:p.size})
    await download(exe,manifest,folder,operationId)
    await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest))
    // The independent worker must keep its runtime alive while the installed app exits.
    for(const name of ['runtime.exe','update-worker.cjs','update-host.exe'])await copyFile(path.join(options.directory,name),path.join(folder,name))
    await writeFile(path.join(folder,'request.json'),JSON.stringify({root,stateDir:options.stateDir,operationId,setup:path.join(folder,SETUP_ASSET),manifest}))
    if(options.runWorker)await options.runWorker(folder)
    else await new Promise<void>((resolve,reject)=>{
      const child=spawn(path.join(folder,'update-host.exe'),['--worker',folder],{windowsHide:true,stdio:'ignore'})
      child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Cannot start update worker (${code})`)))
    })
  }
  function start(){
    if(!root)throw Error('Run the setup once to enable automatic updates')
    const current=status()
    if(running||!terminal(current.phase))return current
    const operationId=randomUUID();save({operationId,phase:'checking'})
    volatileFailure=undefined
    running=apply(operationId).catch(error=>{
      const failed:UpdateStatus={operationId,phase:'failed',error:error instanceof Error?error.message:String(error)}
      try{save(failed)}catch{volatileFailure=failed} // Disk full must not crash the running app.
    }).finally(()=>{running=undefined})
    return status()
  }
  return {supported:!!root,status,start,settled:()=>running}
}
export async function verifySetupFile(file:string,manifest:SetupManifest,key?:string){
  const p=inspectSetupManifest(manifest,key),hash=createHash('sha256');let size=0
  for await(const chunk of createReadStream(file)){size+=chunk.length;if(size>p.size)throw Error('Setup size mismatch');hash.update(chunk)}
  if(size!==p.size||hash.digest('hex')!==p.sha256)throw Error('Setup checksum mismatch')
  return p
}
