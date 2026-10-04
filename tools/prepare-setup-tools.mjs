import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
const config=JSON.parse(await readFile('tools/setup-toolchain.json','utf8'))
const version=JSON.parse(await readFile('service/version.json','utf8'))
if(version.innoVersion!==config.inno.version)throw Error('Inno toolchain pins do not match')
const folder=path.resolve('.refactor/setup-tools');await mkdir(folder,{recursive:true})
for(const [name,asset] of Object.entries(config)){
  const file=path.join(folder,path.basename(new URL(asset.url).pathname))
  let bytes;try{bytes=await readFile(file)}catch{}
  const valid=bytes=>bytes&&createHash('sha256').update(bytes).digest('hex')===asset.sha256
  if(!valid(bytes)){
    const response=await fetch(asset.url,{signal:AbortSignal.timeout(180000)})
    if(!response.ok)throw Error(`Cannot download ${name}: ${response.status}`)
    bytes=Buffer.from(await response.arrayBuffer())
    if(!valid(bytes))throw Error(`Pinned ${name} SHA-256 mismatch`)
    await writeFile(file,bytes)
  }
  if(name==='inno'){
    const directory=path.join(folder,'inno')
    try{await stat(path.join(directory,'ISCC.exe'))}catch{
      execFileSync(file,['/VERYSILENT','/SUPPRESSMSGBOXES','/SP-','/NORESTART','/CURRENTUSER',`/DIR=${directory}`],{windowsHide:true,stdio:'inherit'})
    }
  }
}
console.log('Pinned Inno Setup compiler and driver installer are ready.')
