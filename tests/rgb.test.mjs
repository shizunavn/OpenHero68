import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { rolldown } from 'rolldown'
async function bundle(path) { const build=await rolldown({input:path}); try { const {output}=await build.generate({format:'esm'}); return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`) } finally {await build.close()} }
const {FirmwareRgbPreview}=await bundle('src/keyboard/rgbPreview.ts')
const rgb=await bundle('src/protocol/hero68/rgb.ts')
const {decodeReport,buildReport}=await bundle('src/protocol/hero68/codec.ts')
const fixture=JSON.parse(await readFile('tests/fixtures/rgb0320.json'))
const {HERO68_KEY_POSITIONS}=await bundle('src/protocol/hero68/keyPositions.ts')
const {RgbArm}=await bundle('src/keyboard/rgbArm.ts')
test('fresh stored RGB fallback previews Multicolor without a device',()=>{
  const config=rgb.restoreStoredRgb()
  assert.equal(config.keys.mix,true)
  const engine=new FirmwareRgbPreview(config);engine.advance(110)
  const colors=Object.values(engine.frame().keys)
  assert.ok(colors.some(hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return r!==g||g!==b}))
})
test('Scan Multicolor reaches the palette branch instead of Single white',()=>{
  const config=rgb.defaultRgb();config.keys={...config.keys,mode:14,mix:true,speed:4}
  const engine=new FirmwareRgbPreview(config);engine.advance(110)
  assert.equal(engine.cpu.read(0x20000068),7)
  const colors=Object.values(engine.frame().keys).map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)))
  assert.ok(colors.some(([r,g,b])=>r!==g||g!==b),'Multicolor must produce chromatic key colors')
})
for(let mode=1;mode<19;mode++)test(`mode ${mode}: Multicolor with white Single color produces chromatic frames`,()=>{
  const config=rgb.defaultRgb();config.keys={...config.keys,mode,mix:true,speed:4}
  const engine=new FirmwareRgbPreview(config);let chromatic=false
  for(const time of [110,250,500,1000]){
    engine.advance(time-30);engine.event('KeyW',true);engine.event('KeyE',true);engine.event('KeyR',true);engine.advance(time)
    chromatic ||= Object.values(engine.frame().keys).some(hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return r!==g||g!==b})
    engine.event('KeyW',false);engine.event('KeyE',false);engine.event('KeyR',false)
  }
  assert.ok(chromatic,`mode ${mode} must use its colored palette, not white Single RGB`)
})
for(const item of fixture.cases) test(`mode ${item.mode}/${item.speed}/${item.mix}, side ${item.side}/${item.sideSpeed}/${item.sideMix}: ARM frame`,()=>{
  const config=rgb.defaultRgb();config.keys={mode:item.mode,mix:item.mix,rgb:[240,80,30],brightness:20,speed:item.speed}
  config.side={mode:item.side,mix:item.sideMix,rgb:[240,80,30],brightness:4,speed:item.sideSpeed}
  for(const [id,pos] of Object.entries(HERO68_KEY_POSITIONS)) config.colors[id]=[0,1,2].map(i=>(pos*13+i*71)%256)
  let engine
  try { engine=new FirmwareRgbPreview(config) } catch(e) { e.stack=e.message;throw e }
  for(const frame of item.frames) {
    const events={20:['KeyW',true],40:['KeyE',true],60:['KeyR',true],100:['KeyW',false],140:['KeyE',false],180:['KeyR',false]}
    if(events[frame.tick]) {engine.advance((frame.tick-1)*0.5);engine.event(...events[frame.tick])}
    if(item.long&&[1000,1050].includes(frame.tick)) { engine.advance((frame.tick-1)*0.5);engine.configure({...config,keys:{...config.keys,mode:frame.tick===1000?1:item.mode}}) }
    try { engine.advance(frame.tick*0.5) } catch(e) { e.stack=e.message;throw e }
    assert.equal(frame.raw.findIndex((v,i)=>engine.cpu.ram[0xdbc+i]!==v),-1,`Key frame at tick ${frame.tick}`)
    assert.equal(frame.sideRaw.findIndex((v,i)=>engine.cpu.ram[0xf36+i]!==v),-1,`Side frame at tick ${frame.tick}`)
  }
})
test('custom RGB chunks and side MIX wire quirk',()=>{
  const config=rgb.defaultRgb(),packets=rgb.rgbColorPackets(config.colors)
  assert.equal(packets.length,7)
  packets.forEach((packet,i)=>{const d=decodeReport(packet);assert.equal(d.total,7);assert.equal(d.sequence,i);assert.equal(d.checksumValid,true);assert.ok(d.data.length<=55)})
  const p=rgb.rgbModePacket(6,{...config.side,mix:true});assert.equal(p[6],4);assert.equal(p[13],2);assert.equal(decodeReport(p).checksumValid,true)
})
test('unknown mode preserved and legacy hydration merges only edits',()=>{
  const fresh=rgb.defaultRgb();fresh.keys.mode=231
  assert.equal(rgb.mergeRgb(fresh).keys.mode,231)
  const draft=rgb.defaultRgb();draft.colors.KeyW=[0,0,0]
  const merged=rgb.mergeRgb(fresh,draft,{colors:['KeyW']})
  assert.equal(merged.keys.mode,231);assert.deepEqual(merged.colors.KeyW,[0,0,0])
})
function deviceFixture(initial=rgb.defaultRgb(), failZone) {
  const state=structuredClone(initial), reports=[]
  const byPos=new Map(Object.entries(HERO68_KEY_POSITIONS).map(([id,pos])=>[pos,id]))
  return {state,reports,async request(packet,command,zone){
    const d=decodeReport(packet);reports.push(d)
    assert.equal(d.checksumValid,true)
    if(command===4) {
      if(zone===failZone)throw Error('simulated disconnect')
      const data=packet.slice(7,14)
      state[zone===1?'keys':'side']={mode:data[0],mix:!!data[1],rgb:Array.from(data.slice(2,5)),brightness:data[5],speed:data[6]}
    } else if(command===6) for(let i=0;i<d.data.length;i+=5)state.colors[byPos.get(d.data[i]*256+d.data[i+1])]=Array.from(d.data.slice(i+2,i+5))
    let data=[]
    if(command===0x84) {const v=state[zone===1?'keys':'side'];data=[v.mode,v.mix?7:0,...v.rgb,v.brightness,v.speed]}
    if(command===0x86)for(let i=0;i<d.data.length;i+=2){const pos=d.data[i]*256+d.data[i+1];data.push(d.data[i],d.data[i+1],...state.colors[byPos.get(pos)])}
    const reply=buildReport({command,zone,data})
    return decodeReport(reply)
  }}
}
test('Save changed table before mode 19, readback, then no-op Save',async()=>{
  const baseline=rgb.defaultRgb(),draft=structuredClone(baseline),device=deviceFixture(baseline)
  draft.keys.mode=19;draft.colors.KeyW=[0,0,0]
  let verified
  await rgb.saveRgbProfile(device,draft,baseline,v=>verified=v)
  assert.deepEqual(device.reports.map(r=>r.command),[6,0x86,4,0x84])
  assert.deepEqual(verified,draft)
  const length=device.reports.length
  await rgb.saveRgbProfile(device,draft,verified,()=>{})
  assert.equal(device.reports.length,length)
  assert.deepEqual(await rgb.readRgbProfile(device),draft)
})
test('partial Save failure keeps remaining draft changes and verified table',async()=>{
  const baseline=rgb.defaultRgb(),draft=structuredClone(baseline),device=deviceFixture(baseline,6)
  draft.keys.mode=19;draft.side.mode=3;draft.side.mix=true;draft.colors.KeyW=[12,34,56]
  let verified=baseline
  await assert.rejects(rgb.saveRgbProfile(device,draft,baseline,v=>verified=v),/disconnect/)
  assert.deepEqual(rgb.rgbChanges(draft,verified),{keys:undefined,side:true,colors:[]})
  assert.deepEqual(draft.colors.KeyW,[12,34,56])
})
test('preview brightness scales in linear light instead of multiplying encoded sRGB',()=>{
  const config=rgb.defaultRgb();config.keys.mode=19;config.keys.brightness=10
  for(const id of Object.keys(config.colors))config.colors[id]=[255,0,0]
  const engine=new FirmwareRgbPreview(config);engine.advance(110)
  const sample=Object.values(engine.frame().keys)[0]
  // 50% physical light from full red is about sRGB 188, not encoded-channel 127.
  assert.equal(sample,'#bc0000')
})

test('68 physical nodes, custom color identity and brightness bounds',()=>{
  const config=rgb.defaultRgb();config.keys.mode=19
  for(const [id,pos] of Object.entries(HERO68_KEY_POSITIONS))config.colors[id]=[pos,255-pos,42]
  const engine=new FirmwareRgbPreview(config);engine.advance(110)
  const frame=engine.frame().keys
  assert.equal(Object.keys(frame).length,68)
  for(const [id,color] of Object.entries(config.colors))assert.equal(frame[id],'#'+color.map(v=>v.toString(16).padStart(2,'0')).join(''))
  config.keys.brightness=0
  assert.ok(Object.values(engine.frame().keys).every(v=>v==='#000000'))
  const staticConfig=rgb.defaultRgb(),staticEngine=new FirmwareRgbPreview(staticConfig);staticEngine.advance(110)
  // Firmware 0x080145F0 limits the sum of estimated channel current: white
  // 255/255/255 becomes 127/127/127 before global brightness is applied.
  assert.ok(Object.values(staticEngine.frame().keys).every(v=>v==='#7f7f7f'))
})
test('side MIX dedicated simulated round trip',async()=>{
  const baseline=rgb.defaultRgb(), draft=structuredClone(baseline),device=deviceFixture(baseline)
  draft.side={mode:4,mix:true,rgb:[11,22,33],brightness:3,speed:4}
  let verified=baseline
  await rgb.saveRgbProfile(device,draft,baseline,v=>verified=v)
  assert.deepEqual(verified.side,draft.side)
  assert.equal(device.reports[0].dataLength,4)
  assert.equal(device.reports[0].raw[12],3)
})
test('firmware retaining Single RGB under Multicolor does not block Side Light Save',async()=>{
  const baseline=rgb.defaultRgb(),draft=structuredClone(baseline),device=deviceFixture(baseline)
  baseline.keys.rgb=[24,48,96];device.state.keys.rgb=[24,48,96]
  draft.keys={...draft.keys,mode:14,mix:true,rgb:[255,255,255]}
  draft.side={...draft.side,mode:4,mix:true,rgb:[255,0,0],brightness:3,speed:4}
  const request=device.request.bind(device)
  device.request=async(packet,...args)=>{
    const zone=packet[2]===1?'keys':'side',previous=[...device.state[zone].rgb]
    const result=await request(packet,...args)
    if(packet[1]===4&&packet[8]===7)device.state[zone].rgb=previous
    return result
  }
  let verified=baseline
  await rgb.saveRgbProfile(device,draft,baseline,v=>verified=v)
  assert.equal(device.state.side.mode,4)
  assert.equal(device.state.side.brightness,3)
  assert.equal(rgb.rgbDirtyCount(rgb.rgbChanges(draft,verified)),0)
  assert.deepEqual(verified.keys.rgb,[24,48,96])
})
test('zone readback still rejects real mode, brightness, speed and Single color mismatches',()=>{
  const a=rgb.defaultRgb().keys,b={speed:a.speed,brightness:a.brightness,rgb:[...a.rgb],mix:a.mix,mode:a.mode}
  assert.ok(rgb.sameRgbZone(a,b),'field ordering is not protocol state')
  for(const patch of [{mode:2},{brightness:19},{speed:4},{rgb:[1,2,3]},{mix:true}])assert.equal(rgb.sameRgbZone(a,{...b,...patch}),false)
  assert.equal(rgb.sameRgbZone({...a,mix:true},{...b,mix:true,rgb:[1,2,3]}),true)
})
test('firmware PRNG preserves uint32 overflow for fixed seeds',()=>{
  for(const seed of [0,1,0xffffffff,0x80000000]) {
    const cpu=new RgbArm();cpu.write(0x20000444,seed,4)
    let expected=BigInt(seed)
    for(let i=0;i<12;i++) {
      expected=(expected*0x41c64e6dn+12345n)&0xffffffffn
      cpu.call(0x080101cc)
      assert.equal(cpu.read(0x20000444,4),Number(expected))
      assert.equal(cpu.regs[0],Number(expected>>1n))
    }
  }
})
test('table failure stops before mode switch and leaves full draft dirty',async()=>{
  const baseline=rgb.defaultRgb(),draft=structuredClone(baseline),device=deviceFixture(baseline)
  draft.keys.mode=19;for(const id of Object.keys(draft.colors))draft.colors[id]=[0,0,0]
  const request=device.request.bind(device)
  device.request=async(packet,...args)=>{if(packet[1]===6&&packet[5]===1)throw Error('table chunk failed');return request(packet,...args)}
  let verified=baseline
  await assert.rejects(rgb.saveRgbProfile(device,draft,baseline,v=>verified=v),/chunk failed/)
  assert.equal(verified,baseline);assert.equal(rgb.rgbChanges(draft,verified).colors.length,68)
  assert.ok(device.reports.every(r=>r.command!==4))
})
