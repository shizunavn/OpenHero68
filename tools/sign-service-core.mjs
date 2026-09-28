import {createHash,sign} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const root=process.cwd(),version=process.argv[2]??'0.2.0'
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Expected semver core version')
const privateKey=await readFile(path.join(process.env.LOCALAPPDATA??root,'OpenHero68','release-signing-key.pem'),'utf8')
const core=await readFile(path.join(root,'service','dist','service.cjs'))
const output=path.join(root,'service','releases')
await mkdir(output,{recursive:true})
const payload={version,apiVersion:4,minLauncher:'0.2.0',sha256:createHash('sha256').update(core).digest('hex'),size:core.length,asset:'OpenHero68-RGB-core.cjs'}
const manifest={payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')}
await writeFile(path.join(output,'OpenHero68-RGB-core.cjs'),core)
await writeFile(path.join(output,'OpenHero68-RGB-core.json'),JSON.stringify(manifest))
console.log(`Signed service core ${version}: ${core.length} bytes`)
