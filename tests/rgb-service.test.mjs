import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
const build=await rolldown({input:'service/frame.ts'})
const {output}=await build.generate({format:'esm'});await build.close()
const {framePackets}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
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
