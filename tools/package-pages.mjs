import {readFile,stat,writeFile,rm} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import path from 'node:path'

const distribution=path.resolve('dist')
const archive=path.resolve(process.argv[2]??'open-hero68-pages.zip')
await rm(archive,{force:true})
await stat(path.join(distribution,'index.html'))
// Dashboard ZIP uploads need an advanced-mode Worker instead of /functions.
const regionSource=await readFile(path.resolve('functions/api/region.js'),'utf8')
const workerSource=`${regionSource}\nexport default {\n  async fetch(request, env) {\n    const pathname = new URL(request.url).pathname\n    if (pathname === '/api/region' || pathname === '/api/region/') {\n      return onRequest({ request })\n    }\n    return env.ASSETS.fetch(request)\n  },\n}\n`
await writeFile(path.join(distribution,'_worker.js'),workerSource)
await writeFile(path.join(distribution,'_routes.json'),JSON.stringify({version:1,include:['/api/region','/api/region/'],exclude:[]},null,2)+'\n')
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64'))
for(const [country,region,language] of [['VN','VN','vi'],['vn','VN','vi'],['US','OTHER','en'],[undefined,'OTHER','en']]){
  const request=new Request('https://example.pages.dev/api/region?test=1')
  if(country!==undefined)Object.defineProperty(request,'cf',{value:{country}})
  const response=await worker.fetch(request,{})
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0')
  assert.deepEqual(await response.json(),{region,country:country?.toUpperCase()??null,suggestedLanguage:language})
}
const staticRequest=new Request('https://example.pages.dev/assets/app.js')
const staticResponse=new Response('static asset')
assert.equal(await worker.fetch(staticRequest,{ASSETS:{fetch:request=>{assert.equal(request,staticRequest);return staticResponse}}}),staticResponse)
const quote=value=>"'"+value.replaceAll("'","''")+"'"
const command=`Add-Type -AssemblyName System.IO.Compression.FileSystem; Add-Type -AssemblyName System.IO.Compression; $pagesDist=${quote(distribution)}; $pagesZip=[System.IO.Compression.ZipFile]::Open(${quote(archive)},[System.IO.Compression.ZipArchiveMode]::Create); try { foreach($pagesFile in [System.IO.Directory]::EnumerateFiles($pagesDist,'*',[System.IO.SearchOption]::AllDirectories)){ $pagesName=$pagesFile.Substring($pagesDist.Length+1).Replace('\\','/'); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($pagesZip,$pagesFile,$pagesName,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally {$pagesZip.Dispose()}`
execFileSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,stdio:'inherit'})
const inspect=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $pagesZip=[System.IO.Compression.ZipFile]::OpenRead(${quote(archive)}); try { $pagesRecords=@(foreach($pagesEntry in $pagesZip.Entries){$pagesStream=$pagesEntry.Open();$pagesSha=[System.Security.Cryptography.SHA256]::Create();try {[pscustomobject]@{name=$pagesEntry.FullName;sha256=[System.BitConverter]::ToString($pagesSha.ComputeHash($pagesStream)).Replace('-','').ToLowerInvariant()}} finally {$pagesStream.Dispose();$pagesSha.Dispose()}}); ConvertTo-Json -Compress -InputObject $pagesRecords } finally {$pagesZip.Dispose()}`
const entries=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',inspect],{windowsHide:true,encoding:'utf8'}))
assert.ok(entries.some(entry=>entry.name==='index.html'),'index.html must be at ZIP root')
assert.ok(entries.some(entry=>entry.name==='_worker.js'),'Region Worker must be at ZIP root')
assert.ok(entries.some(entry=>entry.name==='_routes.json'),'Worker routes must be at ZIP root')
assert.ok(entries.every(entry=>['index.html','_worker.js','_routes.json'].includes(entry.name)||entry.name.startsWith('assets/')),'Only web assets and Pages Worker configuration are expected')
for(const entry of entries){
  const bytes=await readFile(path.join(distribution,entry.name))
  assert.equal(entry.sha256,createHash('sha256').update(bytes).digest('hex'))
}
const index=await readFile(path.join(distribution,'index.html'),'utf8')
for(const match of index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))assert.ok(entries.some(entry=>entry.name===match[1].slice(1)))
const bytes=await readFile(archive),sha256=createHash('sha256').update(bytes).digest('hex')
await writeFile(archive+'.sha256',`${sha256}  ${path.basename(archive)}\n`)
console.log(JSON.stringify({archive,bytes:bytes.length,files:entries.length,sha256,verified:true}))
