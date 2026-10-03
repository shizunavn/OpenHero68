// An isolated service process owns the device for this run. Restore the prior
// service mode in finally, including when validation fails or Ctrl+C is pressed.
import {spawn} from 'node:child_process'
import {mkdir,writeFile,appendFile} from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import {rolldown} from 'rolldown'
const arg=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback
const duration=Number(arg('--seconds','30')),port=Number(arg('--port','16869'))
const stressSeconds=Number(arg('--stress-seconds','0'))
if(!Number.isFinite(duration)||duration<5||duration>9000)throw Error('Expected 5-9000 seconds')
if(!Number.isFinite(stressSeconds)||stressSeconds<0||stressSeconds>9000)throw Error('Expected 0-9000 stress seconds')
const distribution=path.resolve(arg('--distribution','.refactor/gamepad-service'))
const folder=path.resolve(arg('--output',`.refactor/gamepad-benchmark-${Date.now()}`))
await mkdir(folder,{recursive:true})
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {defaultGamepad}=await bundle('src/keyboard/gamepad.ts')
const {defaultRgb}=await bundle('src/protocol/hero68/rgb.ts')
const {createRgbLayer,defaultCustomRgb}=await bundle('src/keyboard/customRgb.ts')
const {HERO68_KEY_IDS}=await bundle('src/keyboard/hero68Layout.ts')
const oldBase='http://127.0.0.1:16868',base=`http://127.0.0.1:${port}`
async function request(root,url,value){const r=await fetch(root+url,{method:value===undefined?'GET':'POST',headers:value===undefined?undefined:{'Content-Type':'application/json'},body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(10000)});const data=await r.json();if(!r.ok)throw Error(`${url}: ${data.error}`);return data}
const get=url=>request(base,url),post=(url,value={})=>request(base,url,value)
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function monitor(keys){const controller=new AbortController();const stream=await fetch(base+'/hall/stream?keys='+keys.join(','),{signal:controller.signal});assert.equal(stream.status,200);void stream.body.pipeTo(new WritableStream({write(){}})).catch(()=>{});return controller}
let prior=null,child,abort,interrupted=false
process.on('SIGINT',()=>{interrupted=true;abort?.abort()})
const results=[]
try{
  try{prior=await request(oldBase,'/status');if(prior.gamepad?.enabled)throw Error('Stop the existing gamepad before benchmarking');if(prior.enabled)await request(oldBase,'/stop',{})}catch(e){if(prior)throw e}
  await writeFile(path.join(folder,'prior-service.json'),JSON.stringify(prior,null,2))
  child=spawn(path.join(distribution,'runtime.exe'),[path.join(distribution,'service.cjs'),'--port',String(port),'--state-dir',path.join(folder,'state')],{cwd:distribution,windowsHide:true,stdio:['ignore','pipe','pipe']})
  child.stdout.on('data',v=>void appendFile(path.join(folder,'process.log'),v));child.stderr.on('data',v=>void appendFile(path.join(folder,'process.log'),v))
  for(let i=0;i<60;i++){try{await get('/status');break}catch{await wait(100)}}
  let state=await get('/gamepad/status');assert.equal(state.enabled,false)
  const initialRequests=state.hall.requests;await wait(500);assert.equal((await get('/gamepad/status')).hall.requests,initialRequests,'idle must not send Hall')
  const configs=[['KeyW','LUp'],['KeyA','LLeft'],['KeyS','LDown'],['KeyD','LRight'],['KeyQ','LT'],['KeyE','RT'],['ArrowUp','RUp'],['ArrowDown','RDown'],['ArrowLeft','RLeft'],['ArrowRight','RRight']]
  const profile=defaultRgb();profile.custom=defaultCustomRgb(profile);profile.custom.enabled=true
  // Verify an RGB effect which requires no Hall, then every supported Hall scope.
  profile.custom.layers=[createRgbLayer('aurora','benchmark')]
  await post('/mode',{mode:'custom',profile});const noHall=(await get('/gamepad/status')).hall.requests;await wait(500);assert.equal((await get('/gamepad/status')).hall.requests,noHall,'ordinary RGB must not send Hall')
  // Exercise browser-only ownership, two tabs, persistent RGB and gamepad independently.
  const a=await monitor(['KeyW']),b=await monitor(['KeyA']);await wait(500)
  assert.equal((await get('/gamepad/status')).hall.keys.length,2)
  a.abort();await wait(500);assert.deepEqual((await get('/gamepad/status')).hall.keys.map(k=>k.keyId),['KeyA'])
  b.abort();await wait(500);assert.equal((await get('/gamepad/status')).hall.consumers.length,0)
  profile.custom.layers=[createRgbLayer('pressure-wave','lifecycle')];profile.custom.layers[0].keys=['KeyW','KeyA']
  await post('/preset',{sessionId:(await get('/status')).sessionId,profile});await post('/gamepad/start',{slot:0,configuration:defaultGamepad()});await wait(500)
  let stopped=await post('/gamepad/stop');assert.equal(stopped.enabled,false);assert.equal(stopped.report.ly,0);await wait(500)
  assert.deepEqual((await get('/gamepad/status')).hall.consumers.map(c=>c.id),['rgb'])
  await post('/gamepad/start',{slot:0,configuration:defaultGamepad()});await post('/stop');await wait(500)
  assert.ok((await get('/gamepad/status')).hall.consumers.every(c=>c.id.startsWith('gamepad:')))
  // Read-only device configuration serializes against Hall, then re-arms from rest.
  const {buildReport}=await bundle('src/protocol/hero68/codec.ts')
  const hex=Buffer.from(buildReport({command:0x87,zone:0})).toString('hex')
  await post('/device/batch',{requests:[{hex},{hex},{hex}]});await wait(500);assert.equal((await get('/gamepad/status')).enabled,true)
  await post('/gamepad/profile',{slot:1,configuration:{...defaultGamepad(),rate:100}});await wait(500);assert.equal((await get('/gamepad/status')).slot,1)
  await post('/gamepad/stop');await wait(500);assert.equal((await get('/gamepad/status')).hall.consumers.length,0)
  await post('/mode',{mode:'custom',profile})
  const scenarios=[{name:'6-gamepad-pressure',count:6,effect:'pressure-wave'},{name:'10-gamepad-pressure',count:10,effect:'pressure-wave'},{name:'10-gamepad-touch',count:10,effect:'touch'},{name:'10-gamepad-jelly',count:10,effect:'jelly'},{name:'10-gamepad-aoe',count:10,effect:'aoe'},{name:'10-gamepad-mixing-monitor68',count:10,effect:'mixing',monitor:true}]
  if(stressSeconds)scenarios.push({name:'stress-10-gamepad-pressure-monitor68',count:10,effect:'pressure-wave',monitor:true,seconds:stressSeconds})
  for(const scenario of scenarios){
    if(interrupted)break
    const config={...defaultGamepad(),bindings:configs.slice(0,scenario.count).map(([keyId,action])=>({keyId,action,startMm:.1,endMm:3.4}))}
    profile.custom.layers=[createRgbLayer(scenario.effect,'benchmark')];profile.custom.layers[0].keys=scenario.effect==='pressure-wave'?config.bindings.map(b=>b.keyId):['Digit1','Digit2','Digit3']
    const session=await get('/status');await post('/preset',{sessionId:session.sessionId,profile})
    state=await post('/gamepad/start',{slot:0,configuration:config})
    if(scenario.monitor)abort=await monitor(HERO68_KEY_IDS)
    await wait(1500)
    const before=await get('/gamepad/status');const started=performance.now(),cpuBefore=(await get('/status')).cpuPercent
    let records=0,cpuSum=0,maxCpu=0,maxRam=0,maxPending=0,minHz=Infinity,maxP99=0,unverified=0
    while(!interrupted&&performance.now()-started<(scenario.seconds??duration)*1000){await wait(1000);const gp=await get('/gamepad/status'),rgb=await get('/status');records++;const cpu=rgb.cpuPercent+(gp.hall.nativeCpuPercent??0),ram=rgb.rssMB+(gp.hall.nativeRssMB??0);cpuSum+=cpu;maxCpu=Math.max(maxCpu,cpu);maxRam=Math.max(maxRam,ram);maxPending=Math.max(maxPending,rgb.pendingRequests);if(!gp.xinputVerified)unverified++;const keys=gp.hall.keys.filter(k=>config.bindings.some(b=>b.keyId===k.keyId));minHz=Math.min(minHz,...keys.map(k=>k.hz));maxP99=Math.max(maxP99,...keys.map(k=>k.intervalP99Ms));await appendFile(path.join(folder,scenario.name+'.jsonl'),JSON.stringify({at:Date.now(),gamepad:gp,rgb})+'\n');if(records%30===0)console.log(scenario.name,records+'s',gp.outputHz?.toFixed(1)+' output Hz',Math.min(...keys.map(k=>k.hz)).toFixed(1)+' Hall Hz')}
    const gp=await get('/gamepad/status'),rgb=await get('/status'),keys=gp.hall.keys.filter(k=>config.bindings.some(b=>b.keyId===k.keyId))
    const result={...scenario,seconds:(performance.now()-started)/1000,gamepadHz:Math.min(...keys.map(k=>k.hz)),gamepadP99Ms:Math.max(...keys.map(k=>k.intervalP99Ms)),minObservedHz:minHz,maxObservedP99Ms:maxP99,outputHz:gp.outputHz,outputP99Ms:gp.outputP99Ms,xinputVerified:gp.xinputVerified,unverifiedSamples:unverified,hallKeys:gp.hall.keys.length,hallRates:gp.hall.keys,requests:gp.hall.requests-before.hall.requests,timeouts:gp.hall.timeouts-before.hall.timeouts,ledFps:rgb.fps,ledP99Ms:rgb.frameGapP99Ms,cpuPercent:rgb.cpuPercent+(gp.hall.nativeCpuPercent??0),cpuMean:cpuSum/records,cpuMax:maxCpu,cpuBefore,ramMB:rgb.rssMB+(gp.hall.nativeRssMB??0),ramMaxMB:maxRam,pendingRequests:rgb.pendingRequests,maxPendingRequests:maxPending}
    result.passed=result.gamepadHz>=190&&result.gamepadP99Ms<=10&&result.xinputVerified&&result.timeouts===0&&maxPending<32
    results.push(result);await writeFile(path.join(folder,'summary.json'),JSON.stringify({completedAt:new Date().toISOString(),duration,stressSeconds,results},null,2));console.log(JSON.stringify(result))
    abort?.abort();abort=null;await post('/gamepad/stop');await wait(100)
    assert.equal((await get('/gamepad/status')).enabled,false)
  }
  await post('/stop');await wait(350);const idle=await get('/gamepad/status');assert.equal(idle.hall.consumers.length,0);await wait(500);assert.equal((await get('/gamepad/status')).hall.requests,idle.hall.requests,'final consumer leaving must stop Hall')
  console.log('Benchmark saved:',folder)
  if(interrupted||results.some(r=>!r.passed))process.exitCode=1
}finally{
  abort?.abort();if(child){try{await post('/shutdown')}catch{};await wait(300);if(child.exitCode===null)child.kill()}
  if(prior?.enabled)await request(oldBase,prior.mode==='rhythm'?'/rhythm/start':'/start',prior.mode==='rhythm'?{configuration:prior.rhythmConfiguration}:{})
}
