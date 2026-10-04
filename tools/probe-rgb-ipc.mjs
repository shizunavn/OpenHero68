import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
import path from 'node:path'

// No frame packets, Hall demand or gamepad start: this probe never opens HID.
// Exercise the production bridge's tick scheduler while its stdout is blocked.
const executable=path.resolve(process.argv[2]??'.refactor/rgb-lag-fix/hid-bridge.exe')
async function probe(pauseMs){
  const bridge=spawn(executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true})
  let ticks=0,statuses=0,started=0,stderr='',release,pauseTimer,finishTimer,resumeTimer
  const done=new Promise(resolve=>{release=resolve})
  const watchdog=setTimeout(()=>release({error:'Bridge probe timed out'}),5000)
  bridge.stderr.on('data',d=>stderr+=d)
  const lines=createInterface({input:bridge.stdout})
  lines.on('line',line=>{
    if(line==='custom-ready'){
      started=performance.now()
      pauseTimer=setTimeout(()=>{
        if(pauseMs)bridge.stdout.pause()
        // Fill the pipe with read-only status replies; every loop must still
        // service the native frame timer while stdout remains drainable.
        bridge.stdin.write('gamepad-status\n'.repeat(2000))
        if(pauseMs)resumeTimer=setTimeout(()=>bridge.stdout.resume(),pauseMs)
      },200)
      finishTimer=setTimeout(()=>bridge.stdin.write('ipc-status\n'),1200)
    }
    if(line==='custom-tick:')ticks++
    if(line.startsWith('gamepad-state:'))statuses++
    if(line.startsWith('ipc-state:')||line==='error:request')release({pauseMs,seconds:(performance.now()-started)/1000,deliveredTicks:ticks,statuses,...(line.startsWith('ipc-state:')?JSON.parse(line.slice(10)): {})})
  })
  bridge.once('error',e=>release({error:String(e)}))
  bridge.once('exit',code=>{if(!finishTimer)release({error:`Bridge exited ${code}: ${stderr}`})})
  bridge.stdin.write('custom-start\n')
  const result=await done
  clearTimeout(pauseTimer);clearTimeout(finishTimer);clearTimeout(resumeTimer);clearTimeout(watchdog)
  bridge.kill();lines.close()
  return result
}
const result={executable,noHidWrites:true,baseline:await probe(0),blockedReader:await probe(350)}
await mkdir('reports',{recursive:true})
await writeFile(process.argv[3]??'reports/rgb-ipc-probe.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
if(process.argv.includes('--check')){
  assert.ok(!result.baseline.error&&!result.blockedReader.error)
  assert.equal(result.blockedReader.statuses,2000,'all command replies must survive the blocked reader')
  assert.ok(result.blockedReader.customTicks>=result.baseline.customTicks-3,'IPC backpressure must not stop the native timer')
  assert.ok(result.blockedReader.customTickMaxGapMs<100,'native tick intervals must not contain the 350 ms blocked reader')
  assert.ok(result.blockedReader.coalescedTelemetry>0,'stale telemetry must coalesce while replies stay intact')
  assert.ok(result.blockedReader.queuedReplies<=256&&result.blockedReader.queuedKeys<=1024&&result.blockedReader.queuedTelemetry<=12)
}
