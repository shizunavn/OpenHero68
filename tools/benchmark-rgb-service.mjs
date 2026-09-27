import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
const seconds=Number(process.argv[2]??60)
if(!Number.isInteger(seconds)||seconds<1||seconds>600)throw Error('Duration must be 1..600 seconds')
const url='http://127.0.0.1:16868',read=async()=>await(await fetch(url+'/status')).json()
const first=await read();assert.ok(first.enabled&&first.connected,'Start service RGB first')
const origin=await fetch(url+'/stop',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})
assert.equal(origin.status,403)
const bad=await fetch(url+'/preset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"custom":{}}'})
assert.equal(bad.status,400)
const started=performance.now(),samples=[]
console.log(`Observing native RGB output and Hall transport for ${seconds}s`)
while(performance.now()-started<seconds*1000){await new Promise(r=>setTimeout(r,1000));samples.push(await read())}
const last=await read(),elapsed=(performance.now()-started)/1000
const result={seconds:elapsed,frames:last.frames-first.frames,fps:(last.frames-first.frames)/elapsed,
  hidPackets:last.packets-first.packets,hallSnapshots:last.hallSnapshots-first.hallSnapshots,
  timeouts:last.timeouts-first.timeouts,maxGapMs:last.maxGapMs,
  allConnected:samples.every(s=>s.enabled&&s.connected),rejectedUntrustedOrigin:true,rejectedInvalidPreset:true,samples}
await mkdir('reports',{recursive:true});await writeFile('reports/rgb-service-benchmark.json',JSON.stringify(result,null,2))
console.log(JSON.stringify({...result,samples:undefined},null,2))
assert.ok(result.allConnected);assert.equal(result.timeouts,0);assert.ok(result.fps>=38)
