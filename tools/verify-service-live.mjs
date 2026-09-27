import assert from 'node:assert/strict'
import {rolldown} from 'rolldown'
const b=await rolldown({input:'src/protocol/hero68/codec.ts'})
const {output}=await b.generate({format:'esm',codeSplitting:false});await b.close()
const {buildReport,decodeReport}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
const base='http://127.0.0.1:16868'
async function request(command,data){
  const r=await fetch(base+'/device/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hex:Buffer.from(buildReport({command,data})).toString('hex')})})
  const value=await r.json();assert.equal(r.ok,true,JSON.stringify(value))
  return decodeReport(Buffer.from(value.hex,'hex'))
}
for(const [name,read,write,length] of [['AP',0x93,0x13,5],['RT',0x99,0x19,8],['Deadzone',0x96,0x16,8]]){
  const before=await request(read,[0,30]);assert.equal(before.data.length,length)
  await request(write,Array.from(before.data))
  const after=await request(read,[0,30]);assert.deepEqual(after.data,before.data)
  console.log(name+': same-value write/readback passed with RGB enabled')
}
const controller=new AbortController(),response=await fetch(base+'/frames',{signal:controller.signal})
const reader=response.body.getReader();let buffer='',count=0,last=0
while(count<80){
  const {value,done}=await reader.read();assert.equal(done,false);buffer+=new TextDecoder().decode(value)
  let split
  while((split=buffer.indexOf('\n\n'))>=0){
    const block=buffer.slice(0,split);buffer=buffer.slice(split+2)
    if(!block.startsWith('data: '))continue
    const frame=JSON.parse(block.slice(6));if(!frame.keys)continue
    assert.equal(frame.connected,true);assert.equal(Object.keys(frame.keys).length,68)
    assert.ok(Object.values(frame.keys).every(color=>/^#[0-9a-f]{6}$/.test(color)))
    assert.ok(frame.sequence>last);last=frame.sequence;count++
  }
}
controller.abort();console.log('SSE: '+count+' ordered output frames with 68 key colors')
console.log(await(await fetch(base+'/status')).json())
