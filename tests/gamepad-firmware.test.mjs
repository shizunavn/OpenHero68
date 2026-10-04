import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {GamepadFirmware,validateFirmwareJournal}=await bundle('service/gamepadFirmware.ts')
const {buildReport,decodeReport,u16be,u32be,decodeRemapRecords}=await bundle('src/protocol/hero68/codec.ts')
const {readRemap}=await bundle('src/protocol/hero68/commands.ts')
function fixture(){
  let journal=null,slot=0,identity='a'.repeat(64),fault=false,advanced=[],failAfterWrites=Infinity
  const remaps=new Map(),writes=[];for(const layer of [0,1,2])for(const pos of [30,43])remaps.set(`${slot}:${layer}:${pos}`,0x10004+layer*10+pos)
  const storage={load:()=>journal,save:j=>{journal=structuredClone(j)},clear:()=>{journal=null}}
  const request=async packet=>{
    const r=decodeReport(packet);if(fault)throw Error('USB disconnected')
    let data=[]
    if(r.command===0x90)data=[slot]
    else if(r.command===0x10)slot=r.data[0]
    else if(r.command===0x92)data=advanced.flatMap(u16be)
    else if(r.command===0x83){for(let i=0;i<r.data.length;i+=2){const pos=r.data[i]*256+r.data[i+1];data.push(...u16be(pos),...u32be(remaps.get(`${slot}:${r.zone}:${pos}`)??0))}}
    else if(r.command===0x03){assert.ok(journal,'backup must exist before any firmware write');for(const e of decodeRemapRecords(r.data)){writes.push(e);remaps.set(`${slot}:${r.zone}:${e.keyId}`,e.keycode)}if(writes.length>=failAfterWrites)fault=true}
    return decodeReport(buildReport({...r,data}))
  }
  const make=()=>new GamepadFirmware(request,async()=>identity,storage)
  return {make,request,remaps,writes,get journal(){return journal},set failAfterWrites(v){failAfterWrites=v},set fault(v){fault=v},set identity(v){identity=v},set advanced(v){advanced=v},set slot(v){slot=v},get slot(){return slot}}
}
test('firmware blocking backs up all layers before writing zero, projects original reads, and restores exact remaps',async()=>{
  const f=fixture(),original=new Map(f.remaps),m=f.make();await m.apply(0,['KeyW','KeyA','KeyW'])
  assert.equal(f.journal.entries.length,6);assert.equal(m.active,true);assert.ok([...f.remaps.values()].every(v=>v===0))
  const r=await f.request(readRemap(0,[30,43])[0]);assert.deepEqual(decodeRemapRecords(m.projectRead(r).data).map(e=>e.keycode),[original.get('0:0:30'),original.get('0:0:43')])
  await m.restore();assert.deepEqual(f.remaps,original);assert.equal(f.journal,null);assert.equal(m.active,false)
})
test('a restarted service recovers durable remaps, retains journal during disconnection, and requires the same device',async()=>{
  const f=fixture(),original=new Map(f.remaps);await f.make().apply(0,['KeyW'])
  const recovered=f.make();assert.equal(recovered.pendingRecovery,true)
  f.fault=true;await assert.rejects(recovered.restore(),/disconnected/);assert.ok(f.journal)
  f.fault=false;f.identity='b'.repeat(64);await assert.rejects(recovered.restore(),/original HERO68/);assert.ok(f.journal)
  f.identity='a'.repeat(64);await recovered.restore();assert.deepEqual(f.remaps,original);assert.equal(f.journal,null)
})
test('recovery preserves later remap edits and returns to the previously active profile',async()=>{
  const f=fixture();await f.make().apply(0,['KeyW']);f.remaps.set('0:0:30',0x12345678);f.slot=2
  const recovery=f.make();await recovery.restore();assert.equal(f.slot,2);assert.equal(f.remaps.get('0:0:30'),0x12345678);assert.match(recovery.error,/preserved/)
})
test('Advanced Keys reject firmware blocking before mutating any remap',async()=>{
  const f=fixture();f.advanced=[30];await assert.rejects(f.make().apply(0,['KeyW']),/Advanced Keys/);assert.equal(f.writes.length,0);assert.equal(f.journal,null)
})
test('a disconnect after a partial write retains the backup and restores only the successfully emptied actions',async()=>{
  const f=fixture(),original=new Map(f.remaps),m=f.make();f.failAfterWrites=1
  await assert.rejects(m.apply(0,['KeyW']),/disconnected/);assert.ok(f.journal);assert.equal(m.pendingRecovery,true)
  assert.equal(f.remaps.get('0:0:30'),0);assert.equal(f.remaps.get('0:1:30'),original.get('0:1:30'))
  f.failAfterWrites=Infinity;f.fault=false;await f.make().restore();assert.deepEqual(f.remaps,original);assert.equal(f.journal,null)
})
test('journal validation rejects foreign keys, duplicates, non-integer remaps and oversized backups',()=>{
  const valid={version:1,identity:'a'.repeat(64),slot:0,entries:[{layer:0,pos:30,value:0xffffffff}]}
  assert.equal(validateFirmwareJournal(valid),valid)
  for(const j of [{...valid,slot:3},{...valid,identity:'bad'},{...valid,entries:[{layer:0,pos:999,value:4}]},{...valid,entries:[...valid.entries,...valid.entries]},{...valid,entries:[{layer:0,pos:30,value:1.5}]}])assert.throws(()=>validateFirmwareJournal(j))
})
