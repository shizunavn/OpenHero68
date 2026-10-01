import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const build=await rolldown({input});try{const {output}=await build.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await build.close()}}
const {createLocalServiceAccess,LocalServicePermissionError}=await bundle('src/protocol/localServiceAccess.ts')
const {serviceOrigins,isAllowedServiceRequest}=await bundle('service/origins.ts')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
class Permission extends EventTarget {
  constructor(state){super();this.state=state}
  change(state){this.state=state;this.dispatchEvent(new Event('change'))}
}
function pendingFetch(_,options){return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))}

test('public Pages origin is allowed exactly, while other sites and non-loopback hosts stay blocked',()=>{
  const origins=serviceOrigins(16868)
  assert.equal(isAllowedServiceRequest('127.0.0.1:16868','https://open-hero68.pages.dev',origins,16868),true)
  assert.equal(isAllowedServiceRequest('localhost:16868',undefined,origins,16868),true)
  for(const origin of ['http://open-hero68.pages.dev','https://other.pages.dev','https://preview.open-hero68.pages.dev','https://open-hero68.pages.dev.evil.test','null'])assert.equal(isAllowedServiceRequest('127.0.0.1:16868',origin,origins,16868),false)
  for(const host of ['evil.test:16868','192.168.1.10:16868','127.0.0.1:1234',undefined])assert.equal(isAllowedServiceRequest(host,'https://open-hero68.pages.dev',origins,16868),false)
})

test('permission prompt outlives the normal service timeout; granting starts that timeout and hides guidance',async()=>{
  const permission=new Permission('prompt'),access=createLocalServiceAccess(async()=>permission,pendingFetch,500)
  let completed=false
  const request=access.request('http://localhost/status',{},15).catch(error=>{completed=true;return error})
  await wait(40)
  assert.equal(completed,false)
  assert.equal(access.getSnapshot().prompted,true)
  permission.change('granted')
  assert.equal(access.getSnapshot().prompted,false)
  assert.equal((await request).name,'TimeoutError')
  assert.equal(access.getSnapshot().requesting,false)
})

test('blocking aborts the pending request, avoids repeated network probes, and permission recovery allows retry',async()=>{
  const permission=new Permission('prompt');let probes=0,respond=false
  const access=createLocalServiceAccess(async()=>permission,(...args)=>{probes++;return respond?Promise.resolve({ok:true}):pendingFetch(...args)})
  const first=access.request('http://localhost/status').catch(error=>error)
  await wait(0);permission.change('denied')
  assert.ok(await first instanceof LocalServicePermissionError)
  await assert.rejects(access.request('http://localhost/status'),LocalServicePermissionError)
  assert.equal(probes,1)
  permission.change('granted');respond=true
  assert.equal((await access.request('http://localhost/status')).ok,true)
  assert.equal(access.getSnapshot().prompted,false)
})

test('a dismissed or ignored browser prompt is bounded rather than leaving Checking forever',async()=>{
  const access=createLocalServiceAccess(async()=>new Permission('prompt'),pendingFetch,25)
  await assert.rejects(access.request('http://localhost/status',{},5),{name:'TimeoutError'})
  assert.equal(access.getSnapshot().requesting,false)
  assert.equal(access.getSnapshot().prompted,true)
})

test('unsupported permission API keeps the ordinary offline timeout without inventing a blocked permission',async()=>{
  const access=createLocalServiceAccess(async()=>{throw Error('Unsupported permission')},pendingFetch)
  await assert.rejects(access.request('http://localhost/status',{},10),{name:'TimeoutError'})
  assert.equal(access.getSnapshot().permission,'unknown')
  assert.equal(access.getSnapshot().prompted,false)
})

test('a browser reporting prompt with LNA disabled does not leave an Allow hint after a service reply',async()=>{
  let reply=true
  const access=createLocalServiceAccess(async()=>new Permission('prompt'),(...args)=>reply?Promise.resolve({ok:true}):pendingFetch(...args),500)
  await access.request('http://localhost/status')
  assert.equal(access.getSnapshot().prompted,false)
  reply=false
  await assert.rejects(access.request('http://localhost/status',{},10),{name:'TimeoutError'})
  assert.equal(access.getSnapshot().prompted,false)
})

test('concurrent requests share one permission query; finishing one cannot hide another or extend its timeout',async()=>{
  let queries=0,finish
  const access=createLocalServiceAccess(async()=>{queries++;return new Permission('granted')},(url,options)=>url.endsWith('/fast')?new Promise(resolve=>{finish=resolve}):pendingFetch(url,options))
  const slow=access.request('http://localhost/slow',{},50).catch(error=>error)
  const fast=access.request('http://localhost/fast',{},100)
  await wait(0);finish({ok:true});await fast
  assert.equal(queries,1)
  assert.equal(access.getSnapshot().requesting,true)
  assert.equal((await slow).name,'TimeoutError')
  assert.equal(access.getSnapshot().requesting,false)
})
