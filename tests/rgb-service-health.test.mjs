import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {serviceHealth}=await bundle('src/protocol/serviceHealth.ts')
const state=await bundle('src/protocol/rgbServiceState.ts')
test('a short status interruption preserves availability; sustained failure and denied permission do not',()=>{
  let clock=0;const health=serviceHealth(()=>clock)
  assert.equal(health.failure(),false)
  health.success();assert.equal(health.failure(),true)
  clock=250;assert.equal(health.failure(),true)
  health.success();clock=500;assert.equal(health.failure(),true)
  clock=2501;assert.equal(health.failure(),false)
  health.success();assert.equal(health.failure(true),false)
})
test('status keeps the active session through a transient failure, then clears a real outage',async()=>{
  const originalFetch=globalThis.fetch,originalPerformance=globalThis.performance
  let clock=0
  Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}})
  try{
    state.publishRgbServiceStatus({mode:'rhythm',sessionId:'live',enabled:true,connected:true})
    globalThis.fetch=async()=>{throw Error('temporary transport failure')}
    assert.equal(await state.refreshRgbService(),null)
    assert.equal(state.getRgbServiceState().status.sessionId,'live')
    assert.equal(state.getRgbServiceState().reconnecting,true)
    clock=2100;await state.refreshRgbService()
    assert.equal(state.getRgbServiceState().status,null)
    globalThis.fetch=async()=>new Response(JSON.stringify({mode:'rhythm',sessionId:'restarted',enabled:true}),{status:200})
    await state.refreshRgbService()
    assert.equal(state.getRgbServiceState().status.sessionId,'restarted')
    assert.equal(state.getRgbServiceState().reconnecting,false)
  }finally{globalThis.fetch=originalFetch;Object.defineProperty(globalThis,'performance',{configurable:true,value:originalPerformance})}
})
test('an old status poll cannot replace a newer action session',async()=>{
  const original=globalThis.fetch;let resolve
  globalThis.fetch=()=>new Promise(done=>{resolve=done})
  try{
    const pending=state.refreshRgbService()
    // Local permission initialization is asynchronous.
    while(!resolve)await new Promise(done=>setImmediate(done))
    state.publishRgbServiceStatus({mode:'rhythm',sessionId:'new-session',enabled:true})
    resolve(new Response(JSON.stringify({mode:'rhythm',sessionId:'old-session',enabled:true}),{status:200}))
    await pending;assert.equal(state.getRgbServiceState().status.sessionId,'new-session')
  }finally{globalThis.fetch=original}
})
