import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
async function load(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {defaultRgb}=await load('src/protocol/hero68/rgb.ts'),{defaultCustomRgb}=await load('src/keyboard/customRgbModel.ts'),{defaultRhythm}=await load('src/keyboard/rhythm.ts')
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
  const stop=await post('/mode',{mode:'onboard'});assert.equal(stop.code,200);assert.equal(stop.value.mode,'onboard')
  assert.equal(stop.value.customConfiguration.custom.base.brightness,8)
  const shutdown=await post('/shutdown');assert.equal(shutdown.code,200);await new Promise(r=>service.once('exit',r))
 })
})
