import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {rolldown} from 'rolldown'
const bundle=await rolldown({input:'service/updatePackage.ts',external:/^node:/})
const {output}=await bundle.generate({format:'esm',codeSplitting:false})
await bundle.close()
const {verifyCore,CORE_VERSION}=await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))
const folder='service/releases/'
const manifest=JSON.parse(await readFile(folder+'OpenHero68-RGB-core.json','utf8'))
const core=await readFile(folder+'OpenHero68-RGB-core.cjs')
assert.equal(verifyCore(manifest,core),CORE_VERSION)
const zip=await readFile(folder+'OpenHero68-RGB-Windows-x64.zip')
const checksum=(await readFile(folder+'SHA256SUMS.txt','utf8')).trim().split(/\s+/)[0]
assert.equal(createHash('sha256').update(zip).digest('hex'),checksum)
console.log(`Verified signed core ${manifest.payload.version} (${core.length} bytes), ZIP SHA-256 ${checksum}`)
