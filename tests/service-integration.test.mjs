import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash,generateKeyPairSync,sign} from 'node:crypto'
import {rolldown} from 'rolldown'
async function bundle(path){const b=await rolldown({input:path,external:/^node:/});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {validateDeviceRequest}=await bundle('service/deviceRequests.ts')
const {buildReport,decodeReport}=await bundle('src/protocol/hero68/codec.ts')
const {latestUpdates}=await bundle('src/protocol/latestUpdates.ts')
const {Hero68DeviceManager}=await bundle('src/protocol/hero68/webhid.ts')
const {prepareFrame}=await bundle('service/frame.ts')
const {decodeHero68Input}=await bundle('service/keyInput.ts')
const {inspectManifest,verifyCore}=await bundle('service/updatePackage.ts')
const packet=(command,zone=0,data=[])=>({hex:Buffer.from(buildReport({command,zone,data})).toString('hex')})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))

test('service permits AP/RT/deadzone and matching readback, and rejects update/reset/calibration commands',()=>{
  for(const c of [0x13,0x19,0x16,0x93,0x99,0x96])assert.equal(validateDeviceRequest(packet(c,0,[0,1])).packet[1],c)
  for(const [c,z] of [[0x11,0],[0x14,0],[0x98,0],[0x98,2],[0x01,0],[0xff,0]])assert.throws(()=>validateDeviceRequest(packet(c,z)))
  assert.throws(()=>validateDeviceRequest(packet(0x98,1,[0,1])),/Unsupported/)
  assert.throws(()=>validateDeviceRequest({hex:'00'}))
  const corrupt=packet(0x93,0,[0,1]);corrupt.hex=corrupt.hex.slice(0,-2)+'00';assert.throws(()=>validateDeviceRequest(corrupt),/checksum/)
  assert.throws(()=>validateDeviceRequest({...packet(0x13,0,[0,1]),reenumerate:true}))
  assert.equal(validateDeviceRequest({...packet(4,23,[6]),reenumerate:true}).reenumerate,true)
})

test('live preset edits coalesce while keeping one in-flight request and publish the final value',async()=>{
  const sent=[],releases=[];let inflight=0,maximum=0
  const queue=latestUpdates(async value=>{sent.push(value);maximum=Math.max(maximum,++inflight);await new Promise(resolve=>releases.push(resolve));inflight--},e=>{throw e},0)
  queue.stage(1);await wait(0);queue.stage(2);queue.stage(3)
  assert.deepEqual(sent,[1]);releases.shift()();await wait(0)
  assert.deepEqual(sent,[1,3]);assert.equal(maximum,1)
  queue.stage(4);queue.close();queue.stage(5);releases.shift()();await wait(0)
  assert.deepEqual(sent,[1,3])
})

test('closed preset queue drops scheduled sends and suppresses stale failures',async()=>{
  const sent=[],errors=[];let reject
  const queue=latestUpdates(async value=>{sent.push(value);await new Promise((_,fail)=>{reject=fail})},e=>errors.push(e),40)
  queue.stage(1);await wait(0);queue.stage(2);queue.close();reject(Error('stale session'));await wait(60)
  assert.deepEqual(sent,[1]);assert.deepEqual(errors,[])
  const never=latestUpdates(async value=>sent.push(value),e=>errors.push(e),0)
  never.stage(3);never.close();await wait(0);assert.deepEqual(sent,[1])
})

test('configuration manager stays connected through service and verifies reply command, zone and predicate',async()=>{
  const oldFetch=globalThis.fetch,seen=[]
  let wrong=false
  globalThis.fetch=async(url,options)=>{
    assert.match(url,/\/device\/request$/)
    const body=JSON.parse(options.body),request=decodeReport(Buffer.from(body.hex,'hex'));seen.push(request.command)
    const reply=buildReport({command:wrong?0x99:request.command,zone:request.zone,data:[0,1,0,80,0]})
    return {ok:true,async json(){return {hex:Buffer.from(reply).toString('hex')}}}
  }
  try{
    const manager=new Hero68DeviceManager();await manager.connectViaService()
    assert.equal(manager.connected,true);assert.equal(manager.viaService,true);assert.equal(manager.getSnapshot().state,'connected')
    const report=buildReport({command:0x93,data:[0,1]})
    assert.equal((await manager.request(report,0x93,0)).data[3],80)
    await assert.rejects(()=>manager.request(report,0x93,0,800,()=>false),/Unexpected/)
    wrong=true;await assert.rejects(()=>manager.request(report,0x93,0),/Unexpected/)
    await manager.disconnect();assert.equal(manager.connected,false)
    assert.deepEqual(seen,[0x82,0x93,0x93,0x93])
  }finally{globalThis.fetch=oldFetch}
})

test('preview frame colors match the quantized color values actually encoded for all 68 keys',()=>{
  // Use real physical key IDs from an existing complete default profile.
  return bundle('src/protocol/hero68/rgb.ts').then(({defaultRgb})=>{
    const colors=Object.fromEntries(Object.keys(defaultRgb().colors).map((id,i)=>[id,'#'+[i*3%256,i*7%256,i*13%256].map(c=>c.toString(16).padStart(2,'0')).join('')]))
    const prepared=prepareFrame(colors)
    assert.equal(Object.keys(prepared.keys).length,68)
    assert.ok(new Set(Object.values(prepared.keys)).size<=32)
    const body=prepared.packets.flatMap(p=>Array.from(decodeReport(p).data)),encoded=new Set()
    for(let i=0;i<body.length;){encoded.add('#'+body.slice(i,i+3).map(c=>c.toString(16).padStart(2,'0')).join(''));i+=4+body[i+3]}
    assert.deepEqual(new Set(Object.values(prepared.keys)),encoded)
  })
})

test('native output uses emitted key identity: RT re-press and macro Z map to ordinary key events',()=>{
  assert.deepEqual(decodeHero68Input('key:011:1'),{id:'KeyW',pressed:true})
  assert.deepEqual(decodeHero68Input('key:011:0'),{id:'KeyW',pressed:false})
  assert.deepEqual(decodeHero68Input('key:02c:1'),{id:'KeyZ',pressed:true})
  assert.deepEqual(decodeHero68Input('key:148:1'),{id:'ArrowUp',pressed:true})
  assert.equal(decodeHero68Input('key:000:1'),null)
  assert.equal(decodeHero68Input('raw:ready'),null)
})

test('signed core package rejects tampering and incompatible launcher',()=>{
  const pair=generateKeyPairSync('ed25519'),key=pair.publicKey.export({format:'pem',type:'spki'}).toString(),bytes=Buffer.from('example core')
  const payload={version:'0.2.1',apiVersion:4,minLauncher:'0.2.0',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length,asset:'OpenHero68-RGB-core.cjs'}
  const manifest={payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),pair.privateKey).toString('base64')}
  assert.equal(verifyCore(manifest,bytes,key),'0.2.1')
  const newerPayload={...payload,minLauncher:'0.3.0'}
  const newerManifest={payload:newerPayload,signature:sign(null,Buffer.from(JSON.stringify(newerPayload)),pair.privateKey).toString('base64')}
  assert.equal(inspectManifest(newerManifest,key).minLauncher,'0.3.0')
  assert.throws(()=>verifyCore(newerManifest,bytes,key),/newer launcher/)
  assert.throws(()=>verifyCore(manifest,Buffer.from('tampered'),key),/checksum/)
  assert.throws(()=>verifyCore({...manifest,payload:{...payload,minLauncher:'0.3.0'}},bytes,key),/signature|compatibility/)
  assert.throws(()=>verifyCore({...manifest,signature:'AAAA'},bytes,key),/signature|compatibility/)
})
