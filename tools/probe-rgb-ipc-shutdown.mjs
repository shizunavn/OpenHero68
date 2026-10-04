import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import path from 'node:path'
const executable=path.resolve(process.argv[2]??'.refactor/rgb-ipc-fix/hid-bridge.exe')
const bridge=spawn(executable,[],{stdio:['pipe','pipe','pipe'],windowsHide:true})
const lines=createInterface({input:bridge.stdout})
let started=0,stopped=0,stderr=''
bridge.stderr.on('data',value=>stderr+=value)
const exit=new Promise((resolve,reject)=>{bridge.once('exit',(code,signal)=>resolve({code,signal}));bridge.once('error',reject)})
const ready=new Promise(resolve=>lines.on('line',line=>{if(line==='custom-ready')resolve()}))
const watchdog=setTimeout(()=>bridge.kill(),5000)
try{
  bridge.stdin.write('custom-start\n');await Promise.race([ready,exit.then(result=>{throw Error(`Bridge exited before readiness: ${JSON.stringify(result)}`)})])
  bridge.stdout.pause();bridge.stdin.write('gamepad-status\n'.repeat(2000))
  await new Promise(resolve=>setTimeout(resolve,200));started=performance.now();bridge.stdin.end()
  const result=await exit;stopped=performance.now()
  assert.equal(result.code,0,stderr);assert.ok(stopped-started<1500,'shutdown must cancel an unread stdout write')
  console.log(JSON.stringify({noHidWrites:true,shutdownWhileStdoutBlockedMs:stopped-started,...result}))
}finally{clearTimeout(watchdog);bridge.kill();lines.close()}
