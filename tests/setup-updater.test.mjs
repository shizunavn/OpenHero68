import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash,generateKeyPairSync,sign} from 'node:crypto'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input,external:/^node:/});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {createSetupUpdater}=await bundle('service/setupUpdater.ts')
const {inspectSetupManifest,verifySetup}=await bundle('service/setupManifest.ts')
const {executeTransaction}=await bundle('service/installTransaction.ts')
const {readInstall,readUpdateStatus,saveUpdateStatus,commitInstall}=await bundle('service/installState.ts')
const keys=generateKeyPairSync('ed25519'),key=keys.publicKey.export({format:'pem',type:'spki'}).toString()
const bytes=Buffer.from('MZ verified setup fixture'),asset='OpenHero68-Setup-Windows-x64.exe'
function signed(version='0.5.1',mutate=()=>{}){
  const payload={schemaVersion:1,version,apiVersion:6,platform:'windows-x64',asset,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};mutate(payload)
  return {payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),keys.privateKey).toString('base64')}
}
async function fixture(run){
  const folder=await mkdtemp(path.join(os.tmpdir(),'hero-setup-')),root=path.join(folder,'installed'),directory=path.join(root,'versions','0.5.0'),stateDir=path.join(folder,'state')
  await mkdir(directory,{recursive:true});await mkdir(stateDir)
  commitInstall(root,{schemaVersion:1,active:'0.5.0',desktop:true,autostart:false})
  for(const name of ['runtime.exe','update-worker.cjs','update-host.exe'])await writeFile(path.join(directory,name),'fixture')
  try{await run({folder,root,directory,stateDir})}finally{await rm(folder,{recursive:true,force:true})}
}
test('setup manifest verifies signature, size, platform and digest',()=>{
  assert.equal(verifySetup(signed(),bytes,key).version,'0.5.1')
  for(const mutate of [p=>p.platform='linux',p=>p.asset='../bad.exe',p=>p.size=250000001,p=>p.apiVersion=0,p=>p.version='../../bad'])assert.throws(()=>inspectSetupManifest(signed('0.5.1',mutate),key))
  const tampered=signed();tampered.payload.version='0.6.0';assert.throws(()=>inspectSetupManifest(tampered,key))
  assert.throws(()=>verifySetup(signed(),Buffer.from('corrupt'),key),/checksum/)
})
function network(manifest,{badUrl=false,corrupt=false,status=200,prerelease=false,releaseVersion=manifest.payload.version}={}){
  const calls=[],version=manifest.payload.version,manifestBytes=Buffer.from(JSON.stringify(manifest)),names=['OpenHero68-update.json',asset]
  const release={tag_name:'v'+releaseVersion,prerelease,assets:names.map((name,i)=>({name,size:i?bytes.length:manifestBytes.length,browser_download_url:(badUrl?'https://evil.test/':'https://github.com/shizunavn/OpenHero68/releases/download/v'+version+'/')+name}))}
  const fetch=async url=>{calls.push(url);if(url.endsWith('/latest'))return Response.json(release,{status});return new Response(url.endsWith('.json')?manifestBytes:corrupt?Buffer.from('invalid'):bytes)}
  return {fetch,calls}
}
test('one request starts one operation; setup is streamed, verified and handed to worker',async()=>fixture(async f=>{
  const net=network(signed());let workers=0
  const updater=createSetupUpdater({...f,version:'0.5.0',fetch:net.fetch,publicKey:key,runWorker:async folder=>{workers++;assert.deepEqual(await readFile(path.join(folder,asset)),bytes);saveUpdateStatus(f.stateDir,{phase:'completed'})}})
  const first=updater.start(),second=updater.start();assert.equal(first.operationId,second.operationId)
  await updater.settled();assert.equal(workers,1);assert.equal(net.calls.length,3);assert.equal(updater.status().phase,'completed')
}))
test('up-to-date and older releases do not download or launch setup',async()=>{
  for(const v of ['0.5.0','0.4.6'])await fixture(async f=>{
    const net=network(signed(v));const u=createSetupUpdater({...f,version:'0.5.0',fetch:net.fetch,publicKey:key,runWorker:async()=>assert.fail('worker must not run')})
    u.start();await u.settled();assert.equal(net.calls.length,1);assert.equal(u.status().version,'0.5.0');assert.equal(u.status().phase,'completed')
  })
})
test('bad source, checksum, manifest identity, API response and prerelease fail before worker',async()=>{
  for(const config of [{badUrl:true},{corrupt:true},{status:503},{prerelease:true},{releaseVersion:'0.5.2'}])await fixture(async f=>{
    const net=network(signed(),config);const u=createSetupUpdater({...f,version:'0.5.0',fetch:net.fetch,publicKey:key,runWorker:async()=>assert.fail('unsafe worker')})
    u.start();await u.settled();assert.equal(u.status().phase,'failed');assert.ok(u.status().error)
  })
})
test('failed update can be retried and stale pre-install progress is recovered',async()=>fixture(async f=>{
  saveUpdateStatus(f.stateDir,{operationId:'old',phase:'downloading'})
  let fail=true;const net=network(signed());const u=createSetupUpdater({...f,version:'0.5.0',publicKey:key,fetch:(...args)=>fail?Promise.resolve(new Response('',{status:503})):net.fetch(...args),runWorker:async()=>saveUpdateStatus(f.stateDir,{phase:'completed'})})
  assert.equal(u.status().phase,'failed');u.start();await u.settled();fail=false;u.start();await u.settled();assert.equal(u.status().phase,'completed')
}))
test('portable install requires setup once',async()=>fixture(async f=>{
  const u=createSetupUpdater({...f,directory:f.folder,version:'0.5.0'});assert.equal(u.supported,false);assert.throws(()=>u.start(),/setup once/)
}))
test('failure to persist an error does not reject the background update promise',async()=>fixture(async f=>{
  const u=createSetupUpdater({...f,version:'0.5.0',fetch:async()=>{
    // A directory at the status destination simulates an unwritable/full state store.
    await rm(path.join(f.stateDir,'updates/status.json'));await mkdir(path.join(f.stateDir,'updates/status.json'))
    return new Response('',{status:503})
  }})
  u.start();await u.settled();assert.equal(u.status().phase,'failed');assert.match(u.status().error,/503/)
}))
test('multi-chunk setup is written sequentially and verified before handoff',async()=>fixture(async f=>{
  const net=network(signed()),parts=[bytes.subarray(0,3),bytes.subarray(3,8),bytes.subarray(8)]
  const u=createSetupUpdater({...f,version:'0.5.0',publicKey:key,fetch:async url=>{
    if(!url.endsWith('.exe'))return net.fetch(url)
    return new Response(new ReadableStream({start(controller){for(const part of parts)controller.enqueue(part);controller.close()}}))
  },runWorker:async folder=>{assert.deepEqual(await readFile(path.join(folder,asset)),bytes);saveUpdateStatus(f.stateDir,{phase:'completed'})}})
  u.start();await u.settled();assert.equal(u.status().phase,'completed')
}))
test('transaction commits only after matching health check, preserving choices',async()=>fixture(async f=>{
  const order=[],tx={operationId:'test',root:f.root,stateDir:f.stateDir,previous:readInstall(f.root),target:'0.5.1',apiVersion:6,setup:'setup',phase:'stopping',backupReady:false,hadInstallation:true}
  await executeTransaction(tx,{stop:async()=>order.push('stop'),backup:async()=>order.push('backup'),install:async()=>order.push('install'),launch:async v=>order.push(v),healthy:async()=>{assert.equal(readInstall(f.root).active,'0.5.0');return true},restore:async()=>assert.fail('no rollback'),phase:()=>{}})
  assert.deepEqual(order,['stop','backup','install','0.5.1']);assert.deepEqual(readInstall(f.root),{schemaVersion:1,active:'0.5.1',previous:'0.5.0',desktop:true,autostart:false})
}))
test('installer failure and unhealthy new app restore old version and data',async()=>{
  for(const failure of ['install','healthy'])await fixture(async f=>{
    const order=[],tx={operationId:'test',root:f.root,stateDir:f.stateDir,previous:readInstall(f.root),target:'0.5.1',apiVersion:6,setup:'setup',phase:'stopping',backupReady:false,hadInstallation:true}
    await executeTransaction(tx,{stop:async()=>order.push('stop'),backup:async()=>{},install:async()=>{if(failure==='install')throw Error('file locked')},launch:async v=>order.push(v),healthy:async()=>false,restore:async()=>order.push('restore'),phase:p=>order.push(p)})
    assert.equal(readInstall(f.root).active,'0.5.0');assert.ok(order.includes('restore'));assert.ok(order.includes('0.5.0'));assert.equal(order.at(-1),'failed')
  })
})
test('failed rollback retains recoverable journal rather than marking it committed',async()=>fixture(async f=>{
  const tx={operationId:'test',root:f.root,stateDir:f.stateDir,previous:readInstall(f.root),target:'0.5.1',apiVersion:6,setup:'setup',phase:'stopping',backupReady:false,hadInstallation:true}
  await assert.rejects(executeTransaction(tx,{stop:async()=>{},backup:async()=>{},install:async()=>{throw Error('setup')},launch:async()=>{},healthy:async()=>false,restore:async()=>{throw Error('locked')},phase:()=>{}}),/locked/)
  const journal=JSON.parse(await readFile(path.join(f.root,'update-transaction.json')));assert.equal(journal.phase,'rolling-back')
}))
