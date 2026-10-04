import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
const version=JSON.parse(await readFile('service/version.json','utf8')).version,tag='v'+version,repo='shizunavn/OpenHero68',folder=path.resolve('service/releases')
const token=process.env.GH_TOKEN??process.env.GITHUB_TOKEN
if(!token)throw Error('GitHub token is required')
if(process.env.GITHUB_REPOSITORY&&process.env.GITHUB_REPOSITORY!==repo)throw Error('Unexpected publication repository')
if(process.env.GITHUB_REF!==`refs/tags/${tag}`)throw Error('Release tag must match service/version.json')
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
const tagged=execFileSync('git',['rev-parse',tag+'^{commit}'],{encoding:'utf8'}).trim()
if(commit!==tagged)throw Error('Checkout does not match release tag')
execFileSync(process.execPath,['tools/verify-service-setup.mjs',folder],{stdio:'inherit'})
const body=await readFile(`docs/releases/${tag}.md`,'utf8')
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'OpenHero68-release'}
async function api(url,init={}){
 const r=await fetch(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(180000)})
 if(init.allow404&&r.status===404)return null
 if(!r.ok)throw Error(`GitHub release API failed (${r.status})`)
 return r.status===204?null:r.json()
}
const base='https://api.github.com/repos/'+repo
let release=await api(base+'/releases/tags/'+tag,{allow404:true})
if(release&&!release.draft)throw Error('Release is already public; published assets are immutable')
if(!release)release=await api(base+'/releases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:commit,name:'OpenHero68 '+tag,body,draft:true,prerelease:false})})
for(const name of ['OpenHero68-Setup-Windows-x64.exe','OpenHero68-update.json','SHA256SUMS.txt']){
 const bytes=await readFile(path.join(folder,name)),digest='sha256:'+createHash('sha256').update(bytes).digest('hex')
 let asset=release.assets.find(a=>a.name===name)
 if(asset&&(asset.size!==bytes.length||asset.digest!==digest))throw Error('Existing draft asset differs: '+name)
 if(!asset)asset=await api(release.upload_url.split('{')[0]+'?name='+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes})
 if(asset.size!==bytes.length||asset.digest!==digest)throw Error('Uploaded checksum mismatch: '+name)
 // Fetch published bytes too; do not expose a partially uploaded release.
 const response=await fetch(asset.url,{headers:{...headers,Accept:'application/octet-stream'},signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error('Cannot download draft asset for verification: '+name);
 const downloaded=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(downloaded).digest('hex')!==digest.slice(7))throw Error('Asset round-trip verification failed: '+name)
}
await api(base+'/releases/'+release.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,prerelease:false,make_latest:'true',body})})
const latest=await api(base+'/releases/latest')
if(latest.tag_name!==tag||latest.draft)throw Error('Latest release verification failed')
console.log(latest.html_url)
