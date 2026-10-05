import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import path from 'node:path'
import {CORE_API_VERSION,newer,validVersion,inspectManifest,verifyCore,type CoreManifest} from './updatePackage'

const releaseApi='https://api.github.com/repos/shizunavn/OpenHero68/releases/latest'
// Keep the original repository alias for older releases, and the canonical name
// returned by GitHub after the rename. Do not trust arbitrary URLs from metadata.
const assetPrefixes=[
  'https://github.com/shizunavn/OpenHero68/releases/download/',
  'https://github.com/shizunavn/OpenHero68-RGB-Service/releases/download/',
]
type ReleaseAsset={name:string;browser_download_url:string;size:number;digest?:string}
export type UpdateOptions={coreVersion:string;launcherVersion:string;stateDir:string;fetch?:typeof fetch;publicKey?:string}

/** One network check/download at a time; status checks do not stop RGB playback. */
export function createServiceUpdater(options:UpdateOptions){
  const request=options.fetch??fetch
  async function downloadAsset(url:string,limit:number){
    if(!assetPrefixes.some(prefix=>url.startsWith(prefix)))throw Error('Unexpected update source')
    const response=await request(url,{signal:AbortSignal.timeout(limit>8_000_000?120000:30000)})
    if(!response.ok||!response.body)throw Error(`Update download failed (${response.status})`)
    const chunks:Buffer[]=[];let size=0
    for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Update asset exceeds the size limit');chunks.push(Buffer.from(chunk))}
    return Buffer.concat(chunks,size)
  }
  async function check(){
    const response=await request(releaseApi,{headers:{'User-Agent':'OpenHero68-RGB-Service','Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw Error(`GitHub release check failed (${response.status})`)
    const release=await response.json() as {tag_name:string;assets:ReleaseAsset[]}
    const version=release.tag_name?.replace(/^v/,'')
    if(!validVersion(version)||!Array.isArray(release.assets))throw Error('Invalid release version or assets')
    const manifest=release.assets.find(asset=>asset.name==='OpenHero68-RGB-core.json')
    const core=release.assets.find(asset=>asset.name==='OpenHero68-RGB-core.cjs')
    const fullPackage=release.assets.find(asset=>asset.name==='OpenHero68-RGB-Windows-x64.zip')
    // Even an equal core version can require a newer native launcher.
    const notDowngrade=!newer(options.coreVersion,version)
    let signed:CoreManifest|undefined
    let requiresFullPackage=notDowngrade&&(!manifest||!core)
    if(notDowngrade&&manifest&&core){
      if(manifest.size<1||manifest.size>8192||core.size<1||core.size>8_000_000)throw Error('Core asset exceeds the size limit')
      signed=JSON.parse((await downloadAsset(manifest.browser_download_url,8192)).toString('utf8')) as CoreManifest
      const payload=inspectManifest(signed,options.publicKey)
      if(payload.version!==version||payload.size!==core.size)throw Error('Core manifest does not match release')
      requiresFullPackage=newer(payload.minLauncher,options.launcherVersion)||payload.apiVersion!==CORE_API_VERSION
    }
    const available=newer(version,options.coreVersion)||requiresFullPackage
    return {version,available,requiresFullPackage,manifest,core,fullPackage,signed}
  }
  let checking:ReturnType<typeof check>|undefined
  function latestCore(){
    if(!checking)checking=check().finally(()=>{checking=undefined})
    return checking
  }
  type Release=Awaited<ReturnType<typeof check>>
  async function downloadFullPackage(release:Release){
    const asset=release.fullPackage
    if(!asset||asset.size<1||asset.size>100_000_000||!/^sha256:[0-9a-f]{64}$/.test(asset.digest??''))throw Error('Release has no verifiable Windows package')
    const folder=path.join(options.stateDir,'downloads'),file=path.join(folder,`OpenHero68-RGB-Windows-x64-v${release.version}.zip`)
    const valid=(bytes:Buffer)=>bytes.length===asset.size&&`sha256:${createHash('sha256').update(bytes).digest('hex')}`===asset.digest
    await mkdir(folder,{recursive:true})
    try{if(valid(await readFile(file)))return file}catch{/* Download missing. */}
    const bytes=await downloadAsset(asset.browser_download_url,100_000_000)
    if(!valid(bytes))throw Error('Windows package checksum mismatch')
    await writeFile(file+'.tmp',bytes);await rename(file+'.tmp',file)
    return file
  }
  let downloading:Promise<string>|undefined
  function downloadPackage(release:Release){
    if(!downloading)downloading=downloadFullPackage(release).finally(()=>{downloading=undefined})
    return downloading
  }
  async function stageCoreUpdate(release?:Release){
    release??=await latestCore()
    if(!release.available||release.requiresFullPackage||!release.signed||!release.core)throw Error(release.requiresFullPackage?'This release requires a new EXE package':'No compatible core update available')
    // Reuse the already authenticated manifest instead of downloading it twice.
    const manifest=release.signed
    const bytes=await downloadAsset(release.core.browser_download_url,8_000_000)
    verifyCore(manifest,bytes,options.publicKey,options.launcherVersion)
    const folder=path.join(options.stateDir,'core',release.version)
    await mkdir(folder,{recursive:true})
    await writeFile(path.join(folder,'service.cjs.tmp'),bytes);await rename(path.join(folder,'service.cjs.tmp'),path.join(folder,'service.cjs'))
    await writeFile(path.join(folder,'manifest.json.tmp'),JSON.stringify(manifest));await rename(path.join(folder,'manifest.json.tmp'),path.join(folder,'manifest.json'))
    await writeFile(path.join(options.stateDir,'core','pending.json.tmp'),JSON.stringify(manifest));await rename(path.join(options.stateDir,'core','pending.json.tmp'),path.join(options.stateDir,'core','pending.json'))
    return release.version
  }
  return {latestCore,downloadFullPackage:downloadPackage,stageCoreUpdate}
}
