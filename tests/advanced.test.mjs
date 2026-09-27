import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
async function bundle(path) { const b=await rolldown({input:path}); try {const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()} }
const a=await bundle('src/protocol/hero68/advanced.ts')
const c=await bundle('src/protocol/hero68/codec.ts')
const p=await bundle('src/protocol/hero68/keyPositions.ts')
const presets=await bundle('src/protocol/hero68/advancedPresets.ts')
const u16=n=>[n>>8,n&255]
test('presets use HERO68 actions and verified DKS hold masks',async()=>{
  assert.equal(presets.ADVANCED_PRESETS.length,6)
  for(const preset of presets.ADVANCED_PRESETS){a.validateAdvanced(preset.bindings);assert.ok(a.advancedEqual(await a.readAdvancedBindings(device(preset.bindings)),preset.bindings))}
  const running=presets.ADVANCED_PRESETS.find(p=>p.id==='dks-running-wasd')
  assert.deepEqual(running.bindings.map(b=>b.actions[0]),[26,4,22,7])
  assert.deepEqual(running.bindings[0].states,[[6,4,12,0],[0,14,0,0],[0,0,0,0],[0,0,0,0]])
  assert.equal(running.bindings[0].actions[1],0x00020000)
  const mt=presets.ADVANCED_PRESETS.find(p=>p.id==='mt-fn2-caps').bindings[0]
  assert.deepEqual(mt.actions,[0x0d010000,57])
  const arrows=presets.ADVANCED_PRESETS.find(p=>p.id==='mt-arrows').bindings
  assert.deepEqual(arrows.map(b=>b.actions[1]),[80,82,79,81])
})
test('preset conflict replacement removes whole SOCD pairs and preserves other bindings',()=>{
  const preset=presets.ADVANCED_PRESETS.find(p=>p.id==='dks-running-w')
  const pair=a.newAdvanced('SOCD',['KeyW','KeyZ']),keep=a.newAdvanced('END',['KeyX'])
  assert.deepEqual(presets.presetConflicts([pair,keep],preset),[pair])
  const merged=presets.applyAdvancedPreset([pair,keep],preset)
  assert.equal(merged.length,2);assert.ok(merged.some(b=>b.id==='KeyX'));assert.ok(!merged.some(b=>b.keys.includes('KeyZ')))
  const unknown={...a.newAdvanced('END',['KeyW']),kind:'UNKNOWN',raw:{type:9,data:[0,0]}}
  assert.throws(()=>presets.applyAdvancedPreset([unknown],preset),/unknown/)
  const clone=presets.applyAdvancedPreset([],preset);clone[0].actions[0]=123;assert.equal(preset.bindings[0].actions[0],26)
})
function device(initial=[]) {
  const bindings=new Map(initial.map(b=>{const r=c.decodeReport(a.advancedPacket(b));return [p.keyIdToPos(b.keys[0]),r]}))
  const writes=[]
  return {bindings,writes,async request(packet,command,zone){
    const r=c.decodeReport(packet);assert.equal(r.command,command);assert.equal(r.zone,zone);assert.ok(r.checksumValid)
    if(command===0x10)return r
    if(command===0x12){writes.push(r);if(r.reserved===0){const pos=(r.data[0]<<8)|r.data[1];for(const [key,b]of bindings){const keys=b.reserved===4?[(b.data[1]<<8)|b.data[2],(b.data[3]<<8)|b.data[4]]:[key];if(keys.includes(pos))bindings.delete(key)}}else{const pos=r.reserved===4?(r.data[1]<<8)|r.data[2]:(r.data[0]<<8)|r.data[1];bindings.set(pos,r)}return r}
    assert.equal(command,0x92)
    if(!r.data.length){const list=[...bindings].flatMap(([pos,b])=>b.reserved===4?Array.from(b.data.slice(1,5)):u16(pos));return c.decodeReport(c.buildReport({command,zone:0,data:list}))}
    const pos=(r.data[0]<<8)|r.data[1];const found=[...bindings].find(([key,b])=>key===pos||(b.reserved===4&&((b.data[3]<<8)|b.data[4])===pos))?.[1];assert.ok(found);return c.decodeReport(c.buildReport({command,zone:0,reserved:found.reserved,data:found.data}))
  }}
}
test('all six modes roundtrip with fw0320 action order and distance scale',async()=>{
  for(const kind of a.ADVANCED_KINDS){const b=a.newAdvanced(kind,kind==='SOCD'?['KeyZ','KeyC']:['KeyZ']);const dev=device([b]);const read=await a.readAdvancedBindings(dev);assert.ok(a.advancedEqual(read,[b]));assert.equal(read.length,1)}
  const mt=c.decodeReport(a.advancedPacket(a.newAdvanced('MT',['KeyZ'])));assert.deepEqual([...mt.data.slice(2,10)],[0,0,0,4,0,0,0,22])
  const dks=c.decodeReport(a.advancedPacket(a.newAdvanced('DKS',['KeyZ'])));assert.deepEqual([...dks.data.slice(2,10)],[0,100,1,44,1,44,0,100])
})
test('save preserves unedited bindings and verifies create/edit/delete including SOCD pair',async()=>{
  const old=a.newAdvanced('SOCD',['KeyZ','KeyC']),keep=a.newAdvanced('END',['KeyA']);const dev=device([old,keep]);const next=a.newAdvanced('MT',['KeyZ']);await a.saveAdvancedBindings(dev,2,[next,keep],[old,keep]);assert.ok(a.advancedEqual(await a.readAdvancedBindings(dev),[next,keep]));assert.ok(!dev.writes.some(r=>r.data[1]===p.keyIdToPos('KeyA')))
  await a.saveAdvancedBindings(dev,2,[keep],[next,keep]);assert.ok(a.advancedEqual(await a.readAdvancedBindings(dev),[keep]))
})
test('stale device baseline prevents any advanced write',async()=>{
  const old=a.newAdvanced('END',['KeyZ']),changed={...old,actions:[22]};const dev=device([changed]);await assert.rejects(a.saveAdvancedBindings(dev,0,[],[old]),/changed on the keyboard/);assert.equal(dev.writes.length,0)
})
test('malformed position lists and overlapping keys are rejected',async()=>{
  await assert.rejects(a.readAdvancedBindings({request:async()=>c.decodeReport(c.buildReport({command:0x92,data:[0]}))}),/position list/)
  assert.throws(()=>a.validateAdvanced([a.newAdvanced('SOCD',['KeyA','KeyA'])]),/one Advanced Key/)
  assert.throws(()=>a.validateAdvanced([{...a.newAdvanced('MPT',['KeyZ']),thresholds:[1,1,3]}]),/increase/)
})
test('unknown firmware type is preserved while another binding is added',async()=>{
  const dev=device();dev.bindings.set(p.keyIdToPos('KeyA'),c.decodeReport(c.buildReport({command:0x12,reserved:7,data:[...u16(p.keyIdToPos('KeyA')),7,8,9]})));const baseline=await a.readAdvancedBindings(dev);assert.equal(baseline[0].kind,'UNKNOWN');await a.saveAdvancedBindings(dev,1,[...baseline,a.newAdvanced('END',['KeyZ'])],baseline);assert.equal((await a.readAdvancedBindings(dev))[0].kind,'UNKNOWN')
})
