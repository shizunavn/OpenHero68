import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
async function load(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {defaultRgb}=await load('src/protocol/hero68/rgb.ts'),{defaultCustomRgb}=await load('src/keyboard/customRgbModel.ts'),{defaultRhythm}=await load('src/keyboard/rhythm.ts')
await mkdir('.refactor',{recursive:true})
const dir=await mkdtemp(path.resolve('.refactor/service-custom-test-')),state=path.join(dir,'state');await mkdir(state)
const b=await rolldown({input:'service/main.ts',external:/^node:/});try{await b.write({format:'cjs',file:path.join(dir,'service.cjs')})}finally{await b.close()}
const base='http://127.0.0.1:16915';let service,output=''
const readStatus=async()=>(await fetch(base+'/status')).json()
const post=async(url,input={})=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return{code:r.status,value:await r.json()}}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
test('Custom service revisions, persistence and unchanged onboard restoration use the existing pipeline',async t=>{
 service=spawn(process.execPath,['--require',path.resolve('tests/fixtures/gamepad-service-bridge.cjs'),path.join(dir,'service.cjs'),'--state-dir',state,'--port','16915'],{windowsHide:true})
 service.stdout.on('data',d=>output+=d);service.stderr.on('data',d=>output+=d);t.after(()=>{if(service.exitCode===null)service.kill()})
 let ready=false;for(let i=0;i<80;i++){if(service.exitCode!==null)throw Error(output);try{await readStatus();ready=true;break}catch{}await wait(50)}assert.ok(ready,output)
 const profile=defaultRgb();profile.keys.mode=3;profile.custom=defaultCustomRgb(profile);profile.custom.base.mode=19;profile.custom.enabled=true
 let active
 await t.test('Start exposes configuration; polling status adds zero Hall demand',async()=>{
  const r=await post('/mode',{mode:'custom',profile});assert.equal(r.code,200,r.value.error);active=r.value
  assert.equal(active.customRevision,1);assert.equal(active.customConfiguration.custom.base.mode,19)
  for(let i=0;i<3;i++)assert.equal((await readStatus()).sharedHall,true)
  assert.equal((await readStatus()).gamepad.hall.consumers.length,0)
 })
 await t.test('intermittent native frame stalls retain their timestamp and log bounded diagnostics',async()=>{
  const event=gapMs=>'custom-frame:'+JSON.stringify({submission:0,packets:4,frameMs:7,gapMs,droppedFrames:2,reusedFrames:1})
  await writeFile(path.join(state,'fixture-events.json'),JSON.stringify([event(160),event(180)]))
  let status
  for(let i=0;i<30;i++){status=await readStatus();if(status.gapsOver100===2)break;await wait(50)}
  assert.equal(status.gapsOver100,2);assert.equal(status.maxGapMs,180)
  assert.ok(Number.isFinite(Date.parse(status.lastLongGapAt)))
  await wait(50)
  const log=await readFile(path.join(state,'service.log'),'utf8')
  assert.match(log,/RGB frame gap 160\.0ms mode=custom .*hallTimeouts=0 eventLoopP99=/)
  assert.equal(log.match(/RGB frame gap/g).length,1,'repeated stalls must not cause synchronous log spam')
 })
 await t.test('coalesced frame telemetry retains native output totals, hidden gaps and IPC statistics',async()=>{
  const before=await readStatus()
  const events=[
   'bridge-stats:'+JSON.stringify({customTicks:73,queuedReplies:0,queuedKeys:0,queuedTelemetry:2,coalescedTelemetry:24}),
   'custom-frame:'+JSON.stringify({submission:0,packets:4,frameMs:1,gapMs:17,droppedFrames:2,reusedFrames:19,outputFrames:20,outputPackets:80,renderedFrames:1,outputMaxGapMs:180,outputLongGaps:2}),
   'custom-frame:'+JSON.stringify({submission:0,packets:4,frameMs:1,gapMs:17,droppedFrames:2,reusedFrames:19,outputFrames:20,outputPackets:80,renderedFrames:1,outputMaxGapMs:180,outputLongGaps:2}),
  ]
  await writeFile(path.join(state,'fixture-events.json'),JSON.stringify(events))
  let status
  for(let i=0;i<30;i++){status=await readStatus();if(status.ipc?.coalescedTelemetry===24&&status.frames===before.frames+20)break;await wait(50)}
  assert.equal(status.frames,before.frames+20);assert.equal(status.packets,before.packets+80)
  assert.equal(status.gapsOver100,2);assert.equal(status.maxGapMs,180);assert.equal(status.writeMs,1)
  assert.equal(status.ipc.coalescedTelemetry,24)
  // A long gap can disappear from the latest frame while its native total remains.
  await writeFile(path.join(state,'fixture-events.json'),JSON.stringify([
   'custom-frame:'+JSON.stringify({submission:0,packets:4,frameMs:1,gapMs:17,droppedFrames:3,reusedFrames:20,outputFrames:21,outputPackets:84,renderedFrames:1,outputMaxGapMs:220,outputLongGaps:3}),
  ]))
  for(let i=0;i<30;i++){status=await readStatus();if(status.gapsOver100===3)break;await wait(50)}
  assert.equal(status.frames,before.frames+21);assert.equal(status.gapsOver100,3);assert.equal(status.maxGapMs,220)
 })
 await t.test('live edits retain session/target and defer disk persistence',async()=>{
  const stored=await readFile(path.join(state,'preset.json'),'utf8')
  for(const brightness of [10,11,12]){
   const p=structuredClone(profile);p.custom.base.brightness=brightness;p.colors.KeyW=[0,0,0]
   const r=await post('/preset',{profile:p,sessionId:active.sessionId,expectedRevision:active.customRevision});assert.equal(r.code,200,r.value.error);assert.equal(r.value.sessionId,active.sessionId);active=r.value
  }
  assert.equal(await readFile(path.join(state,'preset.json'),'utf8'),stored)
  assert.equal(JSON.parse(await readFile(path.join(state,'fixture-hid.json'),'utf8')).customStarts,1)
  await wait(350);const saved=JSON.parse(await readFile(path.join(state,'preset.json'),'utf8'));assert.equal(saved.profile.custom.base.brightness,12);assert.deepEqual(saved.profile.colors.KeyW,[0,0,0])
 })
 await t.test('stale revisions return 409 without changing configuration; legacy requests remain valid',async()=>{
  const before=active.customRevision,r=await post('/preset',{profile,sessionId:active.sessionId,expectedRevision:before-1});assert.equal(r.code,409)
  assert.equal((await readStatus()).customRevision,before)
  const old=await post('/preset',{profile,sessionId:active.sessionId});assert.equal(old.code,200);active=old.value
 })
 await t.test('Stop flushes final colors and returns to the same onboard mode with no dirty workaround',async()=>{
  const p=structuredClone(profile);p.custom.base.brightness=8
  const r=await post('/preset',{profile:p,sessionId:active.sessionId,expectedRevision:active.customRevision});assert.equal(r.code,200);active=r.value
  const stop=await post('/mode',{mode:'onboard'});assert.equal(stop.code,200);assert.equal(stop.value.mode,'onboard');assert.equal(stop.value.enabled,false)
  const saved=JSON.parse(await readFile(path.join(state,'preset.json'),'utf8'));assert.equal(saved.profile.custom.base.brightness,8);assert.equal(saved.mode,'onboard')
  const late=await post('/preset',{profile,sessionId:active.sessionId,expectedRevision:active.customRevision});assert.equal(late.code,400)
 })
 await t.test('Rhythm to unchanged onboard and shutdown retain saved Custom draft',async()=>{
  const start=await post('/rhythm/start',{configuration:defaultRhythm()});assert.equal(start.code,200,start.value.error)
  const before=await readStatus()
  await writeFile(path.join(state,'fixture-events.json'),JSON.stringify([
   'rhythm-frame:'+JSON.stringify({colors:Array(68).fill('#123456'),packets:4,frameMs:1,gapMs:17,droppedFrames:0,audioLevel:0,audioState:'stopped',audioError:'',audioEndpoint:'',sampleRate:48000,audioToWriteMs:-1,captureToWriteMs:-1,audioTimestampInvalid:false,renderMs:.2,encodeMs:.3,writeMs:.5,outputFrames:1,outputPackets:4,renderedFrames:0,outputMaxGapMs:150,outputLongGaps:1}),
  ]))
  let status
  for(let i=0;i<30;i++){status=await readStatus();if(status.frames===1)break;await wait(50)}
  assert.equal(status.frames,1);assert.equal(status.gapsOver100,before.gapsOver100+1)
  assert.equal(status.maxGapMs,150,'a fresh Rhythm counter must preserve its first coalesced long gap')
  const stop=await post('/mode',{mode:'onboard'});assert.equal(stop.code,200);assert.equal(stop.value.mode,'onboard')
  assert.equal(stop.value.customConfiguration.custom.base.brightness,8)
  const shutdown=await post('/shutdown');assert.equal(shutdown.code,200);await new Promise(r=>service.once('exit',r))
 })
})
