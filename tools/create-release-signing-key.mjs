import {generateKeyPairSync} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const directory=path.join(process.env.LOCALAPPDATA??process.cwd(),'OpenHero68')
const privateFile=path.join(directory,'release-signing-key.pem')
const publicFile=path.join(process.cwd(),'service','updatePublicKey.ts')
await mkdir(directory,{recursive:true})
let privateKey
try{privateKey=await readFile(privateFile,'utf8')}catch{
  const pair=generateKeyPairSync('ed25519')
  privateKey=pair.privateKey.export({format:'pem',type:'pkcs8'}).toString()
  await writeFile(privateFile,privateKey,{flag:'wx',mode:0o600})
}
const {createPrivateKey,createPublicKey}=await import('node:crypto')
const publicKey=createPublicKey(createPrivateKey(privateKey)).export({format:'pem',type:'spki'}).toString()
await writeFile(publicFile,`// Public verification key. The signing key stays outside the repository.\nexport const UPDATE_PUBLIC_KEY=${JSON.stringify(publicKey)}\n`)
console.log('Release verification key ready; private signing key remains in the local user profile.')
