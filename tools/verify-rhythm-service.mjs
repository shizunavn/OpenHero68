import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdir,writeFile,access} from 'node:fs/promises'
import path from 'node:path'
import {rolldown} from 'rolldown'
const seconds=Number(process.argv[2]??600)
if(!Number.isInteger(seconds)||seconds<8||seconds>1800)throw Error('Duration must be 8..1800 seconds')
const distribution=path.resolve(process.argv[3]??'.refactor/rhythm-service-check'),state=path.resolve('.refactor/rhythm-hardware-state')
const endpoint='http://127.0.0.1:16869'
const reportOption=process.argv.indexOf('--report'),reportPath=reportOption<0?'reports/rhythm-hardware-benchmark.json':process.argv[reportOption+1]
if(!reportPath)throw Error('--report requires a path')
await mkdir(state,{recursive:true})
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {defaultRgb}=await bundle('src/protocol/hero68/rgb.ts'),{defaultCustomRgb,createRgbLayer}=await bundle('src/keyboard/customRgb.ts'),{defaultRhythm}=await bundle('src/keyboard/rhythm.ts')
const child=spawn(process.execPath,[path.join(distribution,'service.cjs'),'--port','16869','--state-dir',state],{cwd:distribution,windowsHide:true,stdio:['ignore','pipe','pipe']})
let processError='';child.stderr.on('data',bytes=>{processError+=bytes.toString()});child.on('error',error=>{processError+=error.message})
const read=async route=>{const response=await fetch(endpoint+route,{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error(await response.text());return response.json()}
const post=async(route,input)=>{const response=await fetch(endpoint+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(10000)});return {status:response.status,body:await response.json()}}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const phases=[],report={seconds,sideOutputVerified:false,physicalLatencyMeasured:false,phases,passed:false}
let hallReader,streamAbort,audioTest
async function openHall(){streamAbort=new AbortController();const response=await fetch(endpoint+'/hall/stream?keys='+encodeURIComponent('Escape,Digit1,Digit2,Digit3,Digit4,Digit5,Digit6,Digit7,Digit8,Digit9'),{signal:streamAbort.signal});hallReader=response.body.getReader();void (async()=>{try{while(!(await hallReader.read()).done){}}catch{}})()}
async function closeHall(){streamAbort?.abort();await hallReader?.cancel().catch(()=>{});hallReader=undefined}
try{
  let ready=false;for(let i=0;i<100;i++){try{const status=await read('/status');assert.equal(status.apiVersion,5);ready=true;break}catch{if(child.exitCode!==null)break;await wait(100)}}
  assert.ok(ready,'Test service failed to start: '+processError)
  const devices=await read('/audio/devices');assert.ok(Array.isArray(devices.devices))
  const invalid=await post('/rhythm/start',{configuration:{...defaultRhythm(),keyMode:168}});assert.equal(invalid.status,400)
  const side=await post('/rhythm/start',{configuration:{...defaultRhythm(),sideMode:501}});assert.equal(side.status,400)
  const profile=defaultRgb();profile.custom=defaultCustomRgb(profile);profile.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};profile.custom.base.mix=true
  profile.custom.layers=[createRgbLayer('scan','benchmark-scan')]
  for(const [mode,hall] of [['custom',false],['custom',true],['rhythm',false],['rhythm',true]]){
    await closeHall()
    const started=await post(mode==='custom'?'/mode':'/rhythm/start',mode==='custom'?{mode,profile}:{configuration:defaultRhythm()});assert.equal(started.status,200,JSON.stringify(started.body))
    if(mode==='rhythm'){
      const stale=await post('/rhythm/config',{configuration:defaultRhythm(),sessionId:'stale-session'});assert.equal(stale.status,400)
      const edited=await post('/rhythm/config',{configuration:{...defaultRhythm(),releaseMs:60},sessionId:started.body.sessionId});assert.equal(edited.status,200)
    }
    if(hall)await openHall()
    if(mode==='rhythm'&&process.argv.includes('--audio')){
      const executable=path.resolve('.refactor/rhythm-service-check/audio-test.exe');await access(executable)
      audioTest=spawn(executable,[String(Math.ceil(seconds/4)+3)],{windowsHide:true,stdio:['ignore','pipe','pipe']})
      audioTest.stdout.on('data',bytes=>console.log('Loopback probe: '+bytes.toString().trim()))
    }
    await wait(1000)
    const first=await read('/status'),at=performance.now(),samples=[]
    console.log(`Benchmark ${mode}${hall?' + ten-key Hall':''}: ${seconds/4}s`)
    while(performance.now()-at<seconds*250){await wait(Math.min(1000,seconds*250));samples.push(await read('/status'))}
    const last=await read('/status'),elapsed=(performance.now()-at)/1000
    const result={mode,hall,seconds:elapsed,fps:(last.frames-first.frames)/elapsed,frameGapP95Ms:last.frameGapP95Ms,frameGapP99Ms:last.frameGapP99Ms,frameMs:last.frameMs,
      timeouts:last.timeouts-first.timeouts,droppedFrames:last.droppedFrames,connected:samples.every(s=>s.connected),audioState:last.audioState,audioError:last.audioError,
      audioToWriteP95Ms:last.audioToWriteP95Ms,captureToWriteP95Ms:last.captureToWriteP95Ms,audioTimestampInvalid:last.audioTimestampInvalid,audioLatencySamples:last.audioLatencySamples,
      renderFps:last.renderFps,reusedFrames:last.reusedFrames,hallPolls:last.hallPolls-first.hallPolls,metFpsTarget:false,samples}
    result.metFpsTarget=result.fps>=58&&result.fps<=61&&result.timeouts===0&&result.connected
    phases.push(result);console.log(JSON.stringify({...result,samples:undefined}))
    await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath.replace(/\.json$/,'-progress.json'),JSON.stringify(report,null,2))
    if(audioTest?.exitCode===null)audioTest.kill();audioTest=undefined
  }
  report.passed=phases.every(p=>p.metFpsTarget&&(p.hall||p.frameGapP95Ms<=20))
  report.transportPassed=report.passed
  const rhythmPhases=phases.filter(p=>p.mode==='rhythm')
  report.sampleLatencyVerified=rhythmPhases.length===2&&rhythmPhases.every(p=>p.audioTimestampInvalid===0&&p.audioLatencySamples>=50&&p.audioToWriteP95Ms<=35)
}catch(error){report.error=String(error);console.error(report.error)}
finally{
  await closeHall()
  if(audioTest?.exitCode===null)audioTest.kill()
  await post('/shutdown',{}).catch(()=>{})
  await wait(500);if(child.exitCode===null)child.kill()
  await mkdir(path.dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2));console.log('Saved '+reportPath)
}
if(!report.passed)process.exitCode=1
