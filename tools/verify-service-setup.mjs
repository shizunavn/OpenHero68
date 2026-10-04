import {readFile} from 'node:fs/promises'
import {createHash,verify} from 'node:crypto'
import path from 'node:path'
const folder=path.resolve(process.argv[2]??'service/releases'),version=JSON.parse(await readFile('service/version.json','utf8'))
const source=await readFile('service/updatePublicKey.ts','utf8'),key=JSON.parse(source.match(/UPDATE_PUBLIC_KEY=(".*")/)[1])
const manifest=JSON.parse(await readFile(path.join(folder,'OpenHero68-update.json'),'utf8')),p=manifest.payload
if(!verify(null,Buffer.from(JSON.stringify(p)),key,Buffer.from(manifest.signature,'base64')))throw Error('Invalid release signature')
const exe=await readFile(path.join(folder,p.asset)),digest=createHash('sha256').update(exe).digest('hex')
if(p.version!==version.version||p.apiVersion!==version.apiVersion||p.platform!=='windows-x64'||p.asset!=='OpenHero68-Setup-Windows-x64.exe'||exe.length!==p.size||digest!==p.sha256)throw Error('Release identity/checksum mismatch')
if(await readFile(path.join(folder,'SHA256SUMS.txt'),'utf8')!==digest+'  '+p.asset+'\n')throw Error('SHA256SUMS mismatch')
console.log('Verified setup signature, release identity, size and SHA-256.')
