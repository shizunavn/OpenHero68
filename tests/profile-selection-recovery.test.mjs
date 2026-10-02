import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {profileRequest}=await bundle('service/profileSelection.ts'),{buildReport,decodeReport}=await bundle('src/protocol/hero68/codec.ts')
test('service batch confirms a missing select ACK through active-slot readback',async()=>{
  const sent=[],packet=buildReport({command:0x10,data:[2]})
  const result=await profileRequest(packet,async request=>{sent.push(request[1]);if(request[1]===0x10)throw Error('timeout');return decodeReport(buildReport({command:0x90,data:[2]}))})
  assert.deepEqual(sent,[0x10,0x90]);assert.equal(result.command,0x10);assert.equal(result.data[0],2)
})
test('service selection retries wrong slots and never substitutes a corrupt readback',async()=>{
  const sent=[],packet=buildReport({command:0x10,data:[1]})
  await assert.rejects(()=>profileRequest(packet,async request=>{sent.push(request[1]);if(request[1]===0x10)throw Error('timeout');const reply=decodeReport(buildReport({command:0x90,data:[1]}));reply.checksumValid=false;return reply}),/timeout/)
  assert.deepEqual(sent,[0x10,0x90,0x10,0x90,0x10,0x90])
})
test('service recovery never retries an unrelated write',async()=>{
  let count=0
  await assert.rejects(()=>profileRequest(buildReport({command:0x13,data:[0,1]}),async()=>{count++;throw Error('timeout')}),/timeout/)
  assert.equal(count,1)
})
