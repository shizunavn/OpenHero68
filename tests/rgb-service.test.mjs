import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
const build=await rolldown({input:'service/frame.ts'})
const {output}=await build.generate({format:'esm'});await build.close()
const {framePackets,RgbFrameEncoder}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
const keys=['Escape','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal','Backspace','Insert','Tab','KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash','Delete','CapsLock','KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Enter','PageUp','ShiftLeft','KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash','ShiftRight','ArrowUp','PageDown','ControlLeft','MetaLeft','AltLeft','Space','AltRight','Fn','ControlRight','ArrowLeft','ArrowDown','ArrowRight']
function unpack(packets){const body=packets.flatMap(p=>[...p.slice(7,7+p[6])]);const groups=[];for(let i=0;i<body.length;){const color=body.slice(i,i+3),n=body[i+3];assert.ok(n>0);groups.push({color,ids:body.slice(i+4,i+4+n)});i+=4+n;assert.ok(i<=body.length)}return {body,groups}}
test('live frames cover all 68 keys exactly once with POS IDs and valid packet checksums',()=>{
  const p=framePackets(Object.fromEntries(keys.map(id=>[id,'#123456']))),{groups}=unpack(p)
  assert.equal(p.length,2);assert.equal(groups.length,1);assert.deepEqual(groups[0].color,[18,52,86]);assert.equal(groups[0].ids.length,68)
  assert.equal(groups[0].ids[keys.indexOf('KeyW')],30);assert.equal(groups[0].ids[keys.indexOf('Fn')],72)
  p.forEach((v,i)=>{assert.equal(v.length,64);assert.equal(v[4],p.length);assert.equal(v[5],i);assert.equal(v.reduce((a,b)=>a+b,0)&255,255)})
})
test('68 distinct colors cannot overflow firmware aggregate byte counter',()=>{
  const p=framePackets(Object.fromEntries(keys.map((id,i)=>[id,'#'+[i*3,(i*17)%256,(i*53)%256].map(c=>c.toString(16).padStart(2,'0')).join('')])))
  const {body,groups}=unpack(p);assert.ok(body.length<=196);assert.ok(groups.length<=32);assert.ok(p.length<=4)
  const ids=groups.flatMap(g=>g.ids);assert.equal(ids.length,68);assert.equal(new Set(ids).size,68)
})
test('up to 32 unique colors are preserved exactly',()=>{
  const frame=Object.fromEntries(keys.map((id,i)=>[id,i%2?'#ff0000':'#00ff00'])),{groups}=unpack(framePackets(frame))
  assert.equal(groups.length,2);for(const g of groups)assert.ok(['255,0,0','0,255,0'].includes(g.color.join(',')))
})
test('incomplete or invalid frame fails before HID output',()=>{assert.throws(()=>framePackets({}));assert.throws(()=>framePackets(Object.fromEntries(keys.map(id=>[id,'#zzzzzz']))))})
test('palette reduction preserves unlit keys and responds immediately to an entirely new color',()=>{
  const encoder=new RgbFrameEncoder(),frame=Object.fromEntries(keys.map((id,i)=>[id,i===0?'#000000':'#'+[i*3,(i*17)%256,(i*53)%256].map(c=>c.toString(16).padStart(2,'0')).join('')]))
  assert.equal(encoder.prepare(frame).keys.Escape,'#000000')
  const still=encoder.prepare(frame).keys
  for(let i=0;i<20;i++)assert.deepEqual(encoder.prepare({...frame}).keys,still,'unchanged colors cannot flicker')
  const red=Object.fromEntries(keys.map(id=>[id,'#ff0000']));assert.deepEqual(encoder.prepare(red).keys,red)
  const off=Object.fromEntries(keys.map(id=>[id,'#000000']));assert.deepEqual(encoder.prepare(off).keys,off)
})
test('packed Aurora gradients remain stable between ticks within the packet limit',async()=>{
  const b=await rolldown({input:'src/keyboard/customRgb.ts'}),c=await b.generate({format:'esm'});await b.close()
  const {CustomRgbEngine,defaultCustomRgb}=await import(`data:text/javascript;base64,${Buffer.from(c.output[0].code).toString('base64')}`)
  const r=await rolldown({input:'src/protocol/hero68/rgb.ts'}),d=await r.generate({format:'esm'});await r.close()
  const {defaultRgb}=await import(`data:text/javascript;base64,${Buffer.from(d.output[0].code).toString('base64')}`)
  const p=defaultRgb();p.custom=defaultCustomRgb(p);p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};p.custom.base.mix=true
  const engine=new CustomRgbEngine(p),encoder=new RgbFrameEncoder(),rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
  let previous,maxJump=0
  for(let t=110;t<5110;t+=25){
    engine.advance(t);const raw=engine.frame().keys,result=encoder.prepare(raw)
    assert.equal(Object.keys(result.keys).length,68);assert.ok(new Set(Object.values(result.keys)).size<=32);assert.ok(result.packets.length<=4)
    for(const id of keys){if(previous)maxJump=Math.max(maxJump,...rgb(result.keys[id]).map((v,i)=>Math.abs(v-rgb(previous[id])[i])))}
    previous=result.keys
  }
  assert.ok(maxJump<=16,`palette caused a ${maxJump}-level color jump`)
})
