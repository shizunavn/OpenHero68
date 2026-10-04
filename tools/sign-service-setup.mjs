import {createHash,createPrivateKey,createPublicKey,sign} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const version=JSON.parse(await readFile('service/version.json','utf8')),folder=path.resolve(process.argv[2]??'service/releases')
const privateKey=createPrivateKey(process.env.RELEASE_SIGNING_KEY??await readFile(path.join(process.env.LOCALAPPDATA??'.','OpenHero68/release-signing-key.pem'),'utf8'))
const source=await readFile('service/updatePublicKey.ts','utf8'),publicKey=JSON.parse(source.match(/UPDATE_PUBLIC_KEY=(".*")/)[1])
if(createPublicKey(privateKey).export({format:'pem',type:'spki'}).toString()!==publicKey)throw Error('Release signing key does not match pinned public key')
const asset='OpenHero68-Setup-Windows-x64.exe',bytes=await readFile(path.join(folder,asset)),sha256=createHash('sha256').update(bytes).digest('hex')
const payload={schemaVersion:1,version:version.version,apiVersion:version.apiVersion,platform:'windows-x64',asset,size:bytes.length,sha256}
await writeFile(path.join(folder,'OpenHero68-update.json'),JSON.stringify({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')}))
await writeFile(path.join(folder,'SHA256SUMS.txt'),sha256+'  '+asset+'\n')
console.log('Signed setup '+version.version+'; pinned public key verified.')
