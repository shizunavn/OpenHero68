import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'

// Run after signed package verification. Never replace a published release.
const root=process.cwd(),version=process.argv[2],sourceRepo=path.resolve(process.argv[3]??root),assetFolder=path.resolve(process.argv[4]??'service/releases')
if(!/^\d+\.\d+\.\d+$/.test(version??''))throw Error('Usage: node tools/publish-service-release.mjs VERSION [SOURCE_REPO] [ASSET_FOLDER]')
const repositories=['https://github.com/shizunavn/OpenHero68-RGB-Service.git','https://github.com/shizunavn/OpenHero68.git']
const git=(...args)=>execFileSync('git',args,{cwd:sourceRepo,encoding:'utf8',windowsHide:true}).trim()
if(!repositories.includes(git('remote','get-url','origin')))throw Error('Unexpected publication repository')
if(git('status','--porcelain'))throw Error('Publication source must be committed and clean')
const commit=git('rev-parse','HEAD'),remote=git('ls-remote','origin','refs/heads/main').split(/\s+/)[0]
if(commit!==remote)throw Error('Push the release commit to main before publishing')
const body=await readFile(path.join(sourceRepo,'docs','releases',`v${version}.md`),'utf8')
const extraNames=process.argv.slice(5)
if(extraNames.some(name=>path.basename(name)!==name||!/^[-\w.]+\.(zip|sha256)$/.test(name)))throw Error('Expected extra ZIP/checksum asset filenames')
const names=['OpenHero68-RGB-Windows-x64.zip','SHA256SUMS.txt','OpenHero68-RGB-core.cjs','OpenHero68-RGB-core.json',...extraNames]
const payloads=new Map(await Promise.all(names.map(async name=>[name,await readFile(path.join(assetFolder,name))])))
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const manifest=JSON.parse(payloads.get('OpenHero68-RGB-core.json').toString())
if(manifest.payload.version!==version||manifest.payload.apiVersion!==6||manifest.payload.minLauncher!=='0.4.0')throw Error('Manifest release identity mismatch')
if(digest(payloads.get('OpenHero68-RGB-core.cjs'))!=='sha256:'+manifest.payload.sha256)throw Error('Core digest mismatch')
if(!payloads.get('SHA256SUMS.txt').toString().startsWith(digest(payloads.get(names[0])).slice(7)+'  '+names[0]))throw Error('ZIP checksum mismatch')
const credentials=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']})
const token=credentials.split(/\r?\n/).find(line=>line.startsWith('password='))?.slice(9)
if(!token)throw Error('No GitHub credential available')
let api='https://api.github.com/repos/shizunavn/OpenHero68-RGB-Service'
const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'OpenHero68-release','X-GitHub-Api-Version':'2022-11-28'}
async function request(url,{data,method,content='application/json',allow404=false}={}){
  const response=await fetch(url,{method:method??(data?'POST':'GET'),headers:{...headers,...(data?{'Content-Type':content}:{})},body:data,signal:AbortSignal.timeout(60000)})
  if(allow404&&response.status===404)return null
  if(!response.ok)throw Error(`GitHub request failed (${response.status})`)
  return response.status===204?null:response.json()
}
// Resolve GitHub's repository rename before POST; redirecting POST can become GET.
const repositoryInfo=await request(api)
if(!['shizunavn/OpenHero68-RGB-Service','shizunavn/OpenHero68'].includes(repositoryInfo.full_name))throw Error('Unexpected GitHub repository identity')
api=repositoryInfo.url
let release=await request(api+'/releases/tags/v'+version,{allow404:true})
if(!release)release=await request(api+'/releases',{data:JSON.stringify({tag_name:'v'+version,target_commitish:commit,name:'OpenHero68 RGB Service v'+version,body,draft:true,prerelease:false})})
if(release.tag_name!=='v'+version)throw Error('Unexpected release tag')
const assets=new Map(release.assets.map(asset=>[asset.name,asset]))
for(const [name,payload] of payloads){
  let asset=assets.get(name)
  if(!asset){
    if(!release.draft)throw Error('Published release is missing '+name)
    asset=await request(release.upload_url.split('{')[0]+'?name='+encodeURIComponent(name),{data:payload,content:name.endsWith('.zip')?'application/zip':name.endsWith('.json')?'application/json':'application/octet-stream'})
  }
  if(asset.size!==payload.length||asset.digest!==digest(payload))throw Error('Asset digest mismatch: '+name)
  console.log(`Verified ${name} (${asset.size} bytes)`)
}
if(release.draft)release=await request(api+'/releases/'+release.id,{method:'PATCH',data:JSON.stringify({draft:false,prerelease:false,make_latest:'true',body})})
const latest=await request(api+'/releases/latest')
if(latest.tag_name!=='v'+version||latest.draft)throw Error('Latest release verification failed')
const tag=git('ls-remote','origin','refs/tags/v'+version).split(/\s+/)[0]
if(tag!==commit)throw Error('Release tag does not match verified source commit')
console.log(release.html_url)
