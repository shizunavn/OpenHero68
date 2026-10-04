import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const gp=await bundle('src/keyboard/gamepad.ts'),{HallBroker}=await bundle('service/hallBroker.ts')
const rgb=await bundle('src/keyboard/customRgb.ts'),{defaultRgb}=await bundle('src/protocol/hero68/rgb.ts')
const bind=(keyId,action)=>({keyId,action,startMm:.1,endMm:3.4})
const sample=(distanceMm,pressed=false)=>({distanceMm,pressed})
const configuration=bindings=>({...gp.defaultGamepad(),bindings,curve:[[0,0],[1,1]]})

test('Hall union shares common keys at maximum demand and releases only the departing consumer',()=>{
  const b=new HallBroker();assert.equal(b.command(),'hall-config:')
  b.subscribe({id:'rgb',keys:['KeyW','KeyA','KeyW'],hz:100})
  b.subscribe({id:'gamepad:analog',keys:['KeyW','KeyD'],hz:200})
  b.subscribe({id:'web:one',keys:['KeyW','Space'],hz:100})
  assert.deepEqual(Object.fromEntries(b.demands),{KeyW:200,KeyA:100,KeyD:200,Space:100})
  assert.equal(b.command(),'hall-config:30,200|43,100|45,200|70,100')
  assert.equal(b.command('gamepad:'),'hall-config:30,100|43,100|70,100')
  b.update({id:'rgb',keys:['ArrowLeft'],hz:100})
  b.unsubscribe('gamepad:analog');assert.equal(b.demands.get('KeyW'),100);assert.equal(b.demands.has('KeyD'),false)
  b.unsubscribe('web:one');b.update({id:'rgb',keys:[],hz:100});assert.equal(b.command(),'hall-config:');assert.equal(b.consumers.length,0)
})
test('Hall subscription update rejects invalid inputs without mutating existing subscriptions',()=>{
  const b=new HallBroker();b.subscribe({id:'rgb',keys:['KeyW'],hz:100})
  for(const sub of [{id:'rgb',keys:['Fake'],hz:100},{id:'rgb',keys:['KeyA'],hz:201},{id:'rgb',keys:['KeyA'],hz:NaN}])assert.throws(()=>b.update(sub))
  assert.deepEqual([...b.demands], [['KeyW',100]])
})
test('RGB Hall source scopes distinguish input keys from output LEDs and skip layers with no output',()=>{
  const p=defaultRgb();p.custom=rgb.defaultCustomRgb(p)
  assert.deepEqual(rgb.rgbHallKeys(p.custom),[])
  for(const effect of ['touch','jelly','aoe','mixing','pressure-wave','aurora']){
    const l=rgb.createRgbLayer(effect,'layer');l.keys=['Digit1'];p.custom.layers=[l]
    const keys=rgb.rgbHallKeys(p.custom)
    if(['touch','jelly','aoe'].includes(effect))assert.equal(new Set(keys).size,68)
    else assert.deepEqual(keys,effect==='mixing'?['ArrowLeft','ArrowDown','ArrowRight']:effect==='pressure-wave'?['Digit1']:[])
    l.enabled=false;assert.deepEqual(rgb.rgbHallKeys(p.custom),[]);l.enabled=true
    l.opacity=0;assert.deepEqual(rgb.rgbHallKeys(p.custom),[]);l.opacity=100;l.keys=[];assert.deepEqual(rgb.rgbHallKeys(p.custom),[])
  }
})
test('Pressure Wave velocity uses fresh Hall sequence and capture time rather than repeated render ticks',()=>{
  const p=defaultRgb();p.colors=Object.fromEntries(Object.keys(p.colors).map(id=>[id,[0,0,0]]));p.custom=rgb.defaultCustomRgb(p);p.custom.layers=[rgb.createRgbLayer('pressure-wave','pw')]
  const a=new rgb.CustomRgbEngine(p),b=new rgb.CustomRgbEngine(p)
  for(const e of [a,b]){e.advance(100);e.setTravel({KeyW:0},{KeyW:{sequence:1,timestampMs:5000}})}
  a.advance(200);a.setTravel({KeyW:1.5},{KeyW:{sequence:2,timestampMs:5010}})
  b.advance(200);b.setTravel({KeyW:1.5},{KeyW:{sequence:2,timestampMs:5010}})
  a.advance(216);a.setTravel({KeyW:2},{KeyW:{sequence:2,timestampMs:5010}})
  b.advance(216)
  assert.deepEqual(a.frame(),b.frame(),'a repeated sequence must not generate a second strike')
})
test('analog precedes digital actuation; duplicates use max while digital outputs use OR',()=>{
  const c=configuration([bind('KeyW','LT'),bind('KeyA','LT'),bind('KeyQ','A'),bind('KeyE','A')])
  let r=gp.mapGamepad(c,{KeyW:sample(1.75),KeyA:sample(3.4),KeyQ:sample(0),KeyE:sample(1,true)})
  assert.equal(r.lt,255);assert.equal(r.buttons,4096)
  r=gp.mapGamepad(c,{KeyW:sample(1.75),KeyA:sample(.1),KeyQ:sample(3.4),KeyE:sample(0)})
  assert.equal(r.lt,128);assert.equal(r.buttons,0)
})
test('Snappy uses strongest direction, ties neutral, subtraction combines opposing axes',()=>{
  const c=configuration([bind('KeyW','LUp'),bind('KeyS','LDown')])
  assert.equal(gp.mapGamepad(c,{KeyW:sample(3.4),KeyS:sample(3.4)}).ly,0)
  assert.equal(gp.mapGamepad(c,{KeyW:sample(3.4),KeyS:sample(1.75)}).ly,32767)
  c.snappy=false;assert.equal(gp.mapGamepad(c,{KeyW:sample(3.4),KeyS:sample(1.75)}).ly,16384)
})

test('digital report packing uses evaluated pressed state, never the analog 0.1 mm travel',()=>{
  const c=configuration([bind('Space','A')])
  assert.equal(gp.mapGamepad(c,{Space:sample(.5,false)}).buttons,0)
  assert.equal(gp.mapGamepad(c,{Space:sample(2,true)}).buttons,4096)
  assert.equal(gp.mapGamepad(c,{Space:sample(1.8,false)}).buttons,0,'RT release may occur far above the rest position')
  assert.equal(gp.mapGamepad(c,{Space:sample(1.9,true)}).buttons,4096,'RT can re-actuate before the prior AP')
  c.bindings[0].startMm=3;c.bindings[0].endMm=3.4
  assert.equal(gp.mapGamepad(c,{Space:sample(1.9,true)}).buttons,4096,'analog travel fields are ignored for digital output')
})
test('circle clamps diagonals, square reaches full axes, angle adjustment preserves magnitude',()=>{
  const c=configuration([bind('KeyW','LUp'),bind('KeyD','LRight')]),s={KeyW:sample(3.4),KeyD:sample(3.4)}
  const circle=gp.mapGamepad(c,s);assert.ok(Math.abs(Math.hypot(circle.lx,circle.ly)-32767)<1)
  c.square=true;assert.equal(gp.mapGamepad(c,s).lx,32767);assert.equal(gp.mapGamepad(c,s).ly,32767)
  c.square=false;c.angleEnabled=true;c.angle=30;const angle=gp.mapGamepad(c,s)
  assert.ok(Math.abs(Math.atan2(angle.ly,angle.lx)*180/Math.PI-30)<.01)
})
test('configuration v1 validates monotonic curves, unique physical keys and bounds before native encoding',()=>{
  const c=gp.defaultGamepad();assert.deepEqual(gp.validateGamepad(JSON.parse(JSON.stringify(c))),c)
  gp.validateGamepad({...c,bindings:[{...c.bindings[0],startMm:.1,endMm:.11}]})
  for(const patch of [{version:2},{rate:1000},{bindings:[...c.bindings,c.bindings[0]]},{curve:[[0,0],[.5,.8],[.7,.5],[1,1]]},{curve:[[0,0],[0,.5],[1,1]]},{bindings:[{...c.bindings[0],endMm:4}]},{angle:61}])assert.throws(()=>gp.validateGamepad({...c,...patch}))
  assert.match(gp.nativeGamepadCommand(configuration([bind('KeyW','LUp')])) ,/^gamepad-config:200;1;0;0;45;0,0\|1,1;30,15,0.1,3.4$/)
  for(const curve of Object.values(gp.CURVE_PRESETS)){gp.validateGamepad({...c,curve});assert.equal(gp.curveValue(curve,-1),0);assert.equal(gp.curveValue(curve,2),1)}
})
