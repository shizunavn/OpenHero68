import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const bundle = await rolldown({input:'src/protocol/hero68/tachyonLighting.ts'})
const {output} = await bundle.generate({format:'esm'})
const {TachyonLighting,isTachyonLightingWrite,validTachyonSnapshot} = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
await bundle.close()
const codecBundle = await rolldown({input:'src/protocol/hero68/codec.ts'})
const codecOutput = await codecBundle.generate({format:'esm'})
const {buildReport,decodeReport} = await import(`data:text/javascript;base64,${Buffer.from(codecOutput.output[0].code).toString('base64')}`)
await codecBundle.close()
function device() {
  const original={keys:[7,7,9,8,7,20,4],side:[2,7,8,9,10,4,2]}
  const fields=new Map([[1,[...original.keys]],[6,[...original.side]]]),packets=[]
  return {original,fields,packets,async request(packet) {
    const decoded=decodeReport(packet);packets.push(decoded)
    if(decoded.command===4)fields.set(decoded.zone,Array.from(packet.slice(7,14)))
    return decodeReport(buildReport({command:decoded.command,zone:decoded.zone,data:fields.get(decoded.zone)}))
  }}
}
test('Tachyon zeros mode and brightness in both physical LED zones and restores their exact settings',async()=>{
  const hid=device(),saved=[]
  const lighting=new TachyonLighting(null,value=>saved.push(structuredClone(value)))
  await lighting.disable(hid)
  assert.equal(hid.fields.get(1)[0],0);assert.equal(hid.fields.get(1)[5],0)
  assert.equal(hid.fields.get(6)[0],0);assert.equal(hid.fields.get(6)[5],0)
  assert.deepEqual(saved[0],hid.original)
  assert.equal(hid.packets.find(p=>p.command===4&&p.zone===6).raw[6],4)
  await lighting.restore(hid)
  assert.deepEqual(hid.fields.get(1),hid.original.keys)
  assert.deepEqual(hid.fields.get(6),hid.original.side)
  assert.equal(saved.at(-1),null)
})
test('repeated enable and a restarted process keep the original lighting snapshot',async()=>{
  const hid=device();let saved
  const lighting=new TachyonLighting(null,value=>{saved=structuredClone(value)})
  await lighting.disable(hid);await lighting.disable(hid)
  const restarted=new TachyonLighting(saved,value=>{saved=value})
  await restarted.disable(hid);await restarted.restore(hid)
  assert.deepEqual(hid.fields.get(1),hid.original.keys)
  assert.deepEqual(hid.fields.get(6),hid.original.side)
})
test('failed LED write keeps a persisted snapshot for retry and restoration',async()=>{
  const hid=device(),originalRequest=hid.request.bind(hid);let saved
  hid.request=async packet=>{if(packet[1]===4&&packet[2]===6)throw Error('timeout');return originalRequest(packet)}
  const lighting=new TachyonLighting(null,value=>{saved=structuredClone(value)})
  await assert.rejects(()=>lighting.disable(hid),/timeout/)
  assert.deepEqual(saved,hid.original)
  hid.request=originalRequest
  await lighting.disable(hid);await lighting.restore(hid)
  assert.deepEqual(hid.fields.get(1),hid.original.keys)
})
test('failed readback prevents a successful toggle and retains the recovery snapshot',async()=>{
  const hid=device(),request=hid.request.bind(hid);let saved
  hid.request=async packet=>{const reply=await request(packet);if(packet[1]===0x84&&saved){reply.raw[12]=20}return reply}
  const lighting=new TachyonLighting(null,value=>{saved=value})
  await assert.rejects(()=>lighting.disable(hid),/readback mismatch/)
  assert.deepEqual(saved,hid.original)
})
test('Tachyon guards lighting writes but permits Hall and unrelated device settings',()=>{
  for(const [command,zone] of [[4,1],[4,6],[6,0],[8,2]])assert.equal(isTachyonLightingWrite(buildReport({command,zone})),true)
  for(const [command,zone] of [[0x98,1],[0x84,1],[4,23],[0x19,0],[0x10,0]])assert.equal(isTachyonLightingWrite(buildReport({command,zone})),false)
  assert.equal(validTachyonSnapshot({keys:[0],side:[0]}),false)
  assert.equal(validTachyonSnapshot(device().original),true)
})
