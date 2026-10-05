import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
async function bundle(path) {const b=await rolldown({input:path});try{const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const custom=await bundle('src/keyboard/customRgb.ts')
const rgb=await bundle('src/protocol/hero68/rgb.ts')
const {FirmwareRgbPreview}=await bundle('src/keyboard/rgbPreview.ts')
const {pickCustomRgbColor,CUSTOM_RGB_PALETTE,blendCustomRgbColor,customRgbContrastPalette,sampleCustomRgbSpectrum}=await bundle('src/keyboard/customRgbColors.ts')
function profile(effect='reaction') {
  const p=rgb.defaultRgb();p.colors=Object.fromEntries(Object.keys(p.colors).map(id=>[id,[0,0,0]]))
  p.custom=custom.defaultCustomRgb(p);p.custom.enabled=true;p.custom.layers=[custom.createRgbLayer(effect,'one')]
  return p
}
const energy=hex=>[1,3,5].reduce((sum,i)=>sum+parseInt(hex.slice(i,i+2),16),0)
test('Follow Shadow retains a quick preview press after release when processed before the next RAF',()=>{
  const p=profile();p.custom.layers=[];p.custom.base.mode=12
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true)
  e.advance(111);assert.ok(energy(e.frame().keys.KeyW)>0)
  e.event('KeyW',false);e.advance(140)
  assert.ok(energy(e.frame().keys.KeyW)>0,'the release must fade the press rather than lose it')
  e.advance(1000);assert.equal(energy(e.frame().keys.KeyW),0)
})
test('Aurora base restores, dims monotonically to off and keeps FX independent of base brightness',()=>{
  const p=profile();p.custom.layers=[];p.custom.baseEffect={effect:'aurora',palette:'sunset',width:2.5,speed:.5};p.custom.base.mix=true
  assert.deepEqual(custom.restoreCustomRgb(JSON.parse(JSON.stringify(p.custom)),p),p.custom)
  const e=new custom.CustomRgbEngine(p);e.advance(600)
  let previous=e.frame().keys
  for(let brightness=19;brightness>=0;brightness--){
    p.custom.base.brightness=brightness;e.configure(p)
    const frame=e.frame().keys
    for(const id of Object.keys(frame))assert.ok(energy(frame[id])<=energy(previous[id]))
    previous=frame
  }
  assert.ok(Object.values(previous).every(c=>c==='#000000'));assert.equal(e.milliseconds,600)
  p.custom.layers=[custom.createRgbLayer('reaction','fx')];e.configure(p);e.event('KeyW',true)
  assert.equal(e.frame().keys.KeyW,'#ffd95a');assert.equal(e.frame().keys.KeyA,'#000000')
  const malformed=structuredClone(p.custom);malformed.baseEffect.palette='bad';malformed.baseEffect.width=Infinity
  assert.equal(custom.restoreCustomRgb(malformed,p).baseEffect.palette,'aurora');assert.equal(custom.restoreCustomRgb(malformed,p).baseEffect.width,2.5)
})

test('Aurora skips the hidden firmware key effect, retains side output and can return to an onboard base',()=>{
  const p=profile();p.custom.layers=[];p.custom.base.mode=10;p.side.mode=2
  p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};p.custom.base.mix=true
  const e=new custom.CustomRgbEngine(p),side=new FirmwareRgbPreview({...p,keys:{...p.custom.base,mode:20}})
  let keyTicks=0
  const call=e.base.cpu.call.bind(e.base.cpu)
  e.base.cpu.call=(address,...args)=>{if(address===0x080208b8)keyTicks++;return call(address,...args)}
  e.advance(1000);side.advance(1000)
  assert.equal(keyTicks,0,'Aurora must not spend render time emulating a replaced key effect')
  assert.deepEqual(e.frame().side,side.frame().side)
  const aurora=e.frame().keys
  delete p.custom.baseEffect;p.custom.base.mode=1;p.custom.base.rgb=[255,0,0];p.custom.base.brightness=20;p.custom.base.mix=false
  e.configure(p);e.advance(1030)
  assert.ok(keyTicks>0,'switching away from Aurora resumes the firmware key effect')
  assert.notDeepEqual(e.frame().keys,aurora)
  assert.ok(Object.values(e.frame().keys).every(hex=>hex==='#ff0000'))
})

test('Aurora, Scan and Pressure Wave keep advancing during repeated strikes of one key',()=>{
  const p=profile('pressure-wave');p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:1.5};p.custom.base.mix=true
  p.custom.layers.push(custom.createRgbLayer('scan','scan'))
  const e=new custom.CustomRgbEngine(p);let previous,changed=0,maxWaves=0
  for(let i=0;i<600;i++){
    const time=110+i*1000/60,down=i%6<3
    e.advance(time);e.event('KeyW',down);e.setTravel({KeyW:down?3.4:0},{KeyW:{sequence:i+1,timestampMs:time}})
    const frame=e.frame().keys
    assert.ok(Object.values(frame).every(c=>/^#[0-9a-f]{6}$/.test(c)))
    if(previous&&Object.keys(frame).some(id=>frame[id]!==previous[id]))changed++
    previous=frame;maxWaves=Math.max(maxWaves,e.activeWaveCount)
  }
  assert.ok(changed>590,'the animation clock cannot stall under repeated input')
  assert.ok(maxWaves>1&&maxWaves<=64)
  e.setTravel({KeyW:0});e.advance(12000);e.frame();assert.equal(e.activeWaveCount,0)
})
test('Aurora and Comet animate deterministically with palettes, direction and a fading tail',()=>{
  for(const effect of ['aurora','comet']){
    const p=profile(effect),a=new custom.CustomRgbEngine(p),b=new custom.CustomRgbEngine(p)
    a.advance(600);b.advance(600);const first=a.frame().keys
    assert.deepEqual(first,b.frame().keys)
    assert.ok(Object.values(first).filter(color=>energy(color)>0).length>1)
    a.advance(1300);assert.notDeepEqual(a.frame().keys,first)
    const layer=p.custom.layers[0];layer.keys=['KeyW'];layer.opacity=100
    a.configure(p);const scoped=a.frame().keys
    for(const [id,color] of Object.entries(scoped))if(id!=='KeyW')assert.equal(color,'#000000')
    layer.enabled=false;a.configure(p);assert.ok(Object.values(a.frame().keys).every(color=>color==='#000000'))
    layer.enabled=true;layer.opacity=0;a.configure(p);assert.ok(Object.values(a.frame().keys).every(color=>color==='#000000'))
  }
  const horizontal=profile('comet'),vertical=structuredClone(horizontal);vertical.custom.layers[0].direction='vertical'
  const a=new custom.CustomRgbEngine(horizontal),b=new custom.CustomRgbEngine(vertical);a.advance(600);b.advance(600)
  assert.notDeepEqual(a.frame().keys,b.frame().keys)
  const active=Object.values(a.frame().keys).map(energy).filter(v=>v>0)
  assert.ok(new Set(active).size>1,'head and tail have different brightness')
})
test('Pressure Wave uses strike speed rather than depth, settles while held and fades after release',()=>{
  const p=profile('pressure-wave'),slow=new custom.CustomRgbEngine(p),fast=new custom.CustomRgbEngine(p)
  for(const e of [slow,fast]){e.advance(110);e.setTravel({KeyW:.08});assert.equal(e.frame().keys.KeyW,'#000000');assert.equal(e.activeWaveCount,0)}
  fast.advance(130);fast.setTravel({KeyW:1.2})
  slow.advance(190);slow.setTravel({KeyW:1.2})
  const peak=energy(fast.frame().keys.KeyW)
  assert.ok(peak>energy(slow.frame().keys.KeyW),'same held depth, faster stroke is brighter')
  fast.advance(430);slow.advance(490)
  assert.ok(energy(fast.frame().keys.KeyR)>energy(slow.frame().keys.KeyR),'same wave age, faster stroke is brighter')
  fast.advance(630);fast.frame();assert.equal(fast.activeWaveCount,2)
  const settled=energy(fast.frame().keys.KeyW);assert.ok(settled<peak)
  fast.setTravel({});fast.advance(700);assert.ok(Object.values(fast.frame().keys).some(color=>energy(color)>0))
  fast.advance(2100);assert.ok(Object.values(fast.frame().keys).every(color=>color==='#000000'));assert.equal(fast.activeWaveCount,0)
})
test('Pressure Wave does not brighten just because a held key slowly travels deeper',()=>{
  const p=profile('pressure-wave'),e=new custom.CustomRgbEngine(p)
  e.advance(110);e.setTravel({KeyW:0});e.advance(130);e.setTravel({KeyW:1.5});const peak=energy(e.frame().keys.KeyW)
  for(let t=230;t<=1230;t+=100){e.advance(t);e.setTravel({KeyW:Math.min(3.4,1.5+(t-130)*.001)});e.frame()}
  assert.ok(energy(e.frame().keys.KeyW)<peak)
  e.setTravel({KeyW:0});e.frame();e.advance(1250);e.setTravel({KeyW:1.5});assert.ok(energy(e.frame().keys.KeyW)>peak*.7,'a fresh fast strike brightens again')
})
test('Pressure Wave bounds live state and clears it when changing or disabling the layer',()=>{
  const p=profile('pressure-wave'),e=new custom.CustomRgbEngine(p)
  e.setTravel(Object.fromEntries(Object.keys(p.colors).map(id=>[id,3.4])))
  for(let t=110;t<2200;t+=500){e.advance(t);e.frame();assert.ok(e.activeWaveCount<=64)}
  assert.equal(e.activeWaveCount,64)
  p.custom.layers[0].effect='aurora';e.configure(p);assert.equal(e.activeWaveCount,0)
  p.custom.layers[0].effect='pressure-wave';e.configure(p);e.frame();assert.equal(e.activeWaveCount,64)
  p.custom.layers[0].enabled=false;e.configure(p);assert.equal(e.activeWaveCount,0)
})
test('new effects and palette survive preset restoration while malformed palettes use defaults',()=>{
  for(const effect of ['aurora','comet','pressure-wave']){
    const p=profile(effect);assert.deepEqual(custom.restoreCustomRgb(JSON.parse(JSON.stringify(p.custom)),p),p.custom)
  }
  const p=profile('comet');p.custom.layers[0].palette='unknown'
  assert.equal(custom.restoreCustomRgb(p.custom,p).layers[0].palette,'ice')
  assert.equal(custom.needsRgbAnalogHall(profile('pressure-wave').custom),true)
  assert.equal(custom.needsRgbAnalogHall(profile('aurora').custom),false)
  const disabled=profile('pressure-wave');disabled.custom.layers[0].enabled=false;assert.equal(custom.needsRgbAnalogHall(disabled.custom),false)
})
test('custom base without FX matches existing firmware color engine for all 68 keys',()=>{
  const p=profile();p.custom.layers=[];p.custom.base.mode=3
  const a=new custom.CustomRgbEngine(p),b=new FirmwareRgbPreview({...p,keys:p.custom.base})
  a.advance(110);b.advance(110);assert.deepEqual(a.frame(),b.frame());assert.equal(Object.keys(a.frame().keys).length,68)
})
test('reaction respects layer selection and expires after release',()=>{
  const p=profile();p.custom.layers[0].keys=['KeyW'];const e=new custom.CustomRgbEngine(p)
  e.advance(110);e.event('KeyW',true);e.event('KeyA',true)
  assert.equal(e.frame().keys.KeyW,'#ffd95a');assert.equal(e.frame().keys.KeyA,'#000000')
  e.event('KeyW',false);e.advance(110+p.custom.layers[0].duration+1);assert.equal(e.frame().keys.KeyW,'#000000')
})
test('ripple propagates to neighboring keys and fades out',()=>{
  const p=profile('ripple'),e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true)
  e.advance(110+1000/6);assert.notEqual(e.frame().keys.KeyE,'#000000')
  e.advance(5000);assert.equal(e.frame().keys.KeyE,'#000000')
})
test('layer ordering, opacity and enabled state control compositing',()=>{
  const p=profile();p.custom.layers[0].color=[255,0,0]
  const second=custom.createRgbLayer('reaction','two');second.color=[0,0,255];p.custom.layers.push(second)
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true)
  assert.equal(e.frame().keys.KeyW,'#0000ff')
  second.opacity=50;e.configure(p);assert.equal(e.frame().keys.KeyW,'#800080')
  second.enabled=false;e.configure(p);assert.equal(e.frame().keys.KeyW,'#ff0000')
})

test('Jelly expands with analog travel and disappears on release before actuation',()=>{
  const p=profile('jelly'),e=new custom.CustomRgbEngine(p);e.advance(110)
  e.setTravel({KeyW:.4});assert.equal(e.frame().keys.KeyR,'#000000')
  e.setTravel({KeyW:3.4});assert.notEqual(e.frame().keys.KeyR,'#000000')
  e.setTravel({KeyW:0});assert.equal(e.frame().keys.KeyW,'#000000')
})
test('AOE scales fixed-area brightness with travel without a release tail',()=>{
  const p=profile('aoe'),e=new custom.CustomRgbEngine(p);e.advance(110)
  e.setTravel({KeyW:1.7});assert.equal(e.frame().keys.KeyW,'#806d2d');assert.equal(e.frame().keys.KeyR,'#000000')
  e.setTravel({KeyW:0});assert.equal(e.frame().keys.KeyW,'#000000')
})
test('Touch displays deepest key travel across the ten number keys',()=>{
  const p=profile('touch'),e=new custom.CustomRgbEngine(p);e.advance(110);e.setTravel({KeyW:1.7})
  assert.equal(e.frame().keys.Digit5,'#ffd95a');assert.equal(e.frame().keys.Digit6,'#000000');assert.equal(e.frame().keys.KeyW,'#000000')
})
test('Mixing derives RGB components from arrow analog values',()=>{
  const p=profile('mixing'),e=new custom.CustomRgbEngine(p);e.advance(110);e.setTravel({ArrowLeft:1.7,ArrowDown:.85,ArrowRight:3.4})
  assert.equal(e.frame().keys.KeyW,'#8040ff')
})
test('Mixing ignores Hall rest noise instead of blinking between base and black',()=>{
  const p=profile('mixing');p.colors=Object.fromEntries(Object.keys(p.colors).map(id=>[id,[40,100,180]]))
  const e=new custom.CustomRgbEngine(p);e.advance(110);const baseline=e.frame().keys
  for(const mm of [0,.01,.02,.05,.08,0]){
    e.setTravel({ArrowLeft:mm,ArrowDown:.03,ArrowRight:.02});assert.deepEqual(e.frame().keys,baseline)
  }
})
test('Mixing smoothly blends shallow travel over a non-black base',()=>{
  const p=profile('mixing');p.colors=Object.fromEntries(Object.keys(p.colors).map(id=>[id,[40,100,180]]))
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.setTravel({ArrowLeft:.09})
  const color=e.frame().keys.KeyW;assert.ok(['#2864b4','#2964b4'].includes(color))
  e.setTravel({ArrowLeft:1.7});assert.equal(e.frame().keys.KeyW,'#94325a')
  e.setTravel({ArrowLeft:0});assert.equal(e.frame().keys.KeyW,'#2864b4')
})
test('Trail fades the pressed key without illuminating neighbors',()=>{
  const p=profile('trail'),e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true)
  assert.equal(e.frame().keys.KeyW,'#ffd95a');assert.equal(e.frame().keys.KeyE,'#000000')
  e.advance(560);assert.notEqual(e.frame().keys.KeyW,'#ffd95a');e.advance(1100);assert.equal(e.frame().keys.KeyW,'#000000')
})
test('Scan reverses at its boundary instead of wrapping',()=>{
  const p=profile('scan');p.custom.layers[0].direction='vertical';p.custom.layers[0].speed=1
  const a=new custom.CustomRgbEngine(p),b=new custom.CustomRgbEngine(p);a.advance(3500);b.advance(4500)
  assert.deepEqual(a.frame().keys,b.frame().keys)
})
const channels=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))
const frameDelta=(a,b)=>Math.max(...Object.keys(a).flatMap(id=>channels(a[id]).map((v,i)=>Math.abs(v-channels(b[id])[i]))))

test('Scan pause holds both endpoints, then resumes at the configured speed in both directions',()=>{
  for(const direction of ['horizontal','vertical'])for(const multicolor of [false,true]){
    const p=profile('scan'),layer=p.custom.layers[0];Object.assign(layer,{direction,multicolor,scanPauseMs:800,width:.25})
    const axis=direction==='horizontal'?0:1,entries=Object.entries(custom.CUSTOM_RGB_COORDINATES)
    const min=Math.min(...entries.map(([,point])=>point[axis])),max=Math.max(...entries.map(([,point])=>point[axis]))
    const left=entries.find(([,point])=>point[axis]===min)[0],right=entries.find(([,point])=>point[axis]===max)[0]
    const travel=(max-min)/layer.speed*1000,e=new custom.CustomRgbEngine(p)
    let first
    for(const offset of [0,200,700,800]){
      e.advance(travel+offset);const frame=e.frame().keys
      assert.ok(energy(frame[right])>200,'arrival and the entire pause keep the far edge lit')
      assert.equal(frame[left],'#000000')
      if(!multicolor&&first)assert.deepEqual(frame,first,'single color is stationary throughout the dwell')
      if(multicolor&&offset===700)assert.notEqual(frame[right],first[right],'the spectrum keeps drifting during a pause')
      first??=frame
    }
    e.advance(travel+800+travel/2)
    assert.equal(e.frame().keys[right],'#000000','return travel begins after the pause')
    for(const offset of [0,200,700,800]){
      e.advance(2*travel+800+offset);const frame=e.frame().keys
      assert.ok(energy(frame[left])>200,'the near edge also pauses before starting the next sweep')
      assert.equal(frame[right],'#000000')
    }
    e.advance(2*travel+1600+travel/2);assert.equal(e.frame().keys[left],'#000000','the next sweep resumes')
  }
})

test('Scan pause survives preset restoration, defaults to zero and validates stored values',()=>{
  const p=profile('scan'),layer=p.custom.layers[0]
  assert.equal(layer.scanPauseMs,0)
  delete layer.scanPauseMs;assert.equal(custom.restoreCustomRgb(p.custom,p).layers[0].scanPauseMs,0)
  for(const [input,expected] of [[750,750],[-100,0],[9000,5000],[NaN,0],[Infinity,0],['500',0]]){
    layer.scanPauseMs=input;assert.equal(custom.restoreCustomRgb(p.custom,p).layers[0].scanPauseMs,expected)
  }
  layer.scanPauseMs=1250;assert.deepEqual(custom.restoreCustomRgb(JSON.parse(JSON.stringify(p.custom)),p),p.custom)
  const zero=profile('scan'),legacy=structuredClone(zero);delete legacy.custom.layers[0].scanPauseMs
  for(const multicolor of [false,true]){
    zero.custom.layers[0].multicolor=multicolor;legacy.custom.layers[0].multicolor=multicolor
    const a=new custom.CustomRgbEngine(zero),b=new custom.CustomRgbEngine(legacy)
    for(const time of [110,700,2500,5000]){a.advance(time);b.advance(time);assert.deepEqual(a.frame(),b.frame())}
  }
})

test('Multicolor Scan has no frame-sized color jump at either turn or the spectrum seam',()=>{
  for(const direction of ['horizontal','vertical']){
    const p=profile('scan'),layer=p.custom.layers[0];layer.multicolor=true;layer.direction=direction
    const coordinates=Object.values(custom.CUSTOM_RGB_COORDINATES).map(point=>point[direction==='horizontal'?0:1])
    const halfCycle=(Math.max(...coordinates)-Math.min(...coordinates))/layer.speed*1000
    const e=new custom.CustomRgbEngine(p)
    for(const turn of [halfCycle,2*halfCycle,3*halfCycle,4*halfCycle]){
      e.advance(turn-1000/120);const before=e.frame().keys
      e.advance(turn+1000/120);const after=e.frame().keys
      assert.ok(frameDelta(before,after)<=3,`${direction}: abrupt recolor or reversal at ${turn}ms`)
      assert.ok(Object.values(after).some(hex=>energy(hex)>200),'the band stays lit through a turn')
    }
    // A broad band isolates color continuity from the fastest spatial changes.
    layer.width=12;e.configure(p)
    e.advance(20000-1000/120);const before=e.frame().keys
    e.advance(20000+1000/120);assert.ok(frameDelta(before,e.frame().keys)<=12,'spectrum wraps smoothly')
  }
})

test('Multicolor Scan is independent of random choices, render cadence and repeated frame reads',()=>{
  const p=profile('scan');p.custom.layers[0].multicolor=true
  const regular=new custom.CustomRgbEngine(p),skipped=new custom.CustomRgbEngine(p)
  for(let time=110;time<2300;time+=1000/60){regular.advance(time);regular.frame()}
  regular.advance(2300);skipped.advance(2300)
  const frame=regular.frame()
  assert.deepEqual(frame,skipped.frame(),'a skipped preview frame must not change the scan colors')
  assert.deepEqual(frame,regular.frame(),'reading a frame must not recolor the band')
  regular.configure(structuredClone(p));assert.deepEqual(frame,regular.frame(),'resaving the layer keeps the current scan')
  regular.advance(2400);assert.notDeepEqual(frame.keys,regular.frame().keys)
})

test('Multicolor Scan carries multiple hues in one band and respects selection, opacity and direction',()=>{
  const p=profile('scan'),layer=p.custom.layers[0];layer.multicolor=true;layer.width=4
  const e=new custom.CustomRgbEngine(p);e.advance(1000)
  const horizontal=e.frame().keys
  const hues=new Set(Object.values(horizontal).filter(hex=>energy(hex)>150).map(hex=>{
    const rgb=channels(hex),peak=Math.max(...rgb)
    return rgb.map(v=>Math.round(v/peak*10)).join(',')
  }))
  assert.ok(hues.size>=3,'multicolor must be a spectrum within the illuminated band')
  layer.direction='vertical';e.configure(p);assert.notDeepEqual(e.frame().keys,horizontal)
  layer.keys=['KeyW'];e.configure(p)
  assert.ok(energy(e.frame().keys.KeyW)>0)
  assert.ok(Object.entries(e.frame().keys).every(([id,hex])=>id==='KeyW'||hex==='#000000'))
  const full=energy(e.frame().keys.KeyW);layer.opacity=50;e.configure(p)
  assert.ok(Math.abs(energy(e.frame().keys.KeyW)-full/2)<=2)
  p.custom.base={...p.custom.base,mode:1,rgb:[40,100,180],mix:false,brightness:20}
  for(const patch of [{opacity:0},{opacity:100,enabled:false}]){
    Object.assign(layer,patch);e.configure(p);e.advance(e.milliseconds+110)
    assert.ok(Object.values(e.frame().keys).every(hex=>hex==='#2864b4'),'inactive Scan preserves the base')
  }
})

test('RT display shows reported press/release transitions, not analog pressure',()=>{
  const p=profile('rt'),e=new custom.CustomRgbEngine(p)
  e.advance(110);e.setTravel({KeyW:1.7});assert.equal(e.frame().keys.KeyW,'#000000')
  e.event('KeyW',true);assert.equal(e.frame().keys.KeyW,'#00ff00');e.event('KeyW',false);assert.equal(e.frame().keys.KeyW,'#ff0000')
  e.advance(2000);assert.equal(e.frame().keys.KeyW,'#000000')
})
test('device refresh preserves local custom layers; device save does not encode them',()=>{
  const p=profile();const baseline=rgb.defaultRgb();p.colors=structuredClone(baseline.colors)
  assert.equal(rgb.rgbDirtyCount(rgb.rgbChanges(p,baseline)),0)
  assert.deepEqual(rgb.mergeRgb(baseline,p,{colors:[]}).custom,p.custom)
})
test('stored custom layer validation caps counts, filters keys and clamps malformed values',()=>{
  const p=profile();p.custom.layers[0].keys=['KeyW','invalid','KeyW'];p.custom.layers[0].opacity=300;p.custom.layers[0].color=[NaN,-1,900]
  const c=custom.restoreCustomRgb(p.custom,p)
  assert.deepEqual(c.layers[0].keys,['KeyW']);assert.equal(c.layers[0].opacity,100);assert.deepEqual(c.layers[0].color,[255,0,255])
})
test('Multicolor picks contrasting saturated hues with variety and no immediate repeat',()=>{
  const background=[255,48,48],previous=[32,255,224]
  const options=CUSTOM_RGB_PALETTE.filter(c=>c.some((v,i)=>v!==previous[i]))
  const score=c=>c.reduce((sum,v,i)=>sum+(v-background[i])**2,0)
  const best=Math.max(...options.map(score)),seen=new Set()
  for(let i=0;i<=100;i++){
    const tint=pickCustomRgbColor(background,i/100,previous)
    assert.notDeepEqual(tint,previous);assert.ok(score(tint)>=best*.5)
    assert.ok(tint.every(Number.isInteger));seen.add(tint.join(','))
  }
  assert.ok(seen.size>=3)
})

test('Scan and triggered Multicolor reserve hues outside the entire Aurora color range',()=>{
  const stops=[[34,211,238],[139,92,246],[236,72,153]]
  const backgrounds=stops.slice(0,-1).flatMap((stop,i)=>Array.from({length:17},(_,s)=>stop.map((v,c)=>v+(stops[i+1][c]-v)*s/16)))
  const palette=customRgbContrastPalette(backgrounds)
  const chromatic=c=>{const low=Math.min(...c),span=Math.max(...c)-low;return c.map(v=>(v-low)/span*255)}
  const separation=c=>Math.min(...backgrounds.map(bg=>Math.hypot(...chromatic(c).map((v,i)=>v-chromatic(bg)[i]))))
  assert.equal(palette.length,4)
  for(const direction of ['horizontal','vertical']){
    const p=profile('scan');p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};p.custom.base.mix=true
    const layer=p.custom.layers[0];layer.multicolor=true;layer.direction=direction
    const axis=direction==='horizontal'?0:1
    const entries=Object.entries(custom.CUSTOM_RGB_COORDINATES)
    const min=Math.min(...entries.map(([,point])=>point[axis])),max=Math.max(...entries.map(([,point])=>point[axis]))
    const e=new custom.CustomRgbEngine(p)
    for(let turn=1;turn<=6;turn++){
      e.advance(turn*(max-min)/layer.speed*1000)
      const edge=entries.find(([,point])=>point[axis]===(turn%2?max:min))[0]
      assert.ok(separation(channels(e.frame().keys[edge]))>120,`${direction}: actual Scan output must stand out on Aurora`)
    }
  }
  for(let i=0;i<=200;i++){
    assert.ok(separation(sampleCustomRgbSpectrum(i/200,palette))>120,'the continuous band must avoid every Aurora hue')
    assert.ok(separation(pickCustomRgbColor(backgrounds[i%backgrounds.length],i/200,undefined,palette))>120)
  }
  for(const effect of ['breath','ripple','reaction','trail','jelly','aoe','touch','pressure-wave']){
    const p=profile(effect);p.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:.5};p.custom.base.mix=true
    const layer=p.custom.layers[0];layer.multicolor=true
    const e=new custom.CustomRgbEngine(p);e.advance(110);e.setTravel({KeyW:0});e.advance(130);e.setTravel({KeyW:3.4});e.event('KeyW',true);e.frame()
    const tint=e.previousColors.get(layer.id)
    assert.ok(tint&&separation(tint)>120,`${effect}: hue must contrast with the full animated palette`)
    // The same rule applies to legacy Aurora FX under this effect.
    delete p.custom.baseEffect;p.custom.base.mode=0;p.custom.layers.unshift(custom.createRgbLayer('aurora','underlay'))
    const legacy=new custom.CustomRgbEngine(p);legacy.advance(110);legacy.event('KeyW',true);legacy.frame()
    assert.ok(separation(legacy.previousColors.get(layer.id))>120,`${effect}: legacy Aurora layer must also be considered`)
  }
})

test('Multicolor held reaction keeps its hue through animated base changes and long holds',()=>{
  const p=profile();p.custom.layers[0].multicolor=true;p.custom.base.mode=3
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true)
  const first=e.frame().keys.KeyW
  for(const time of [200,550,1000,5500]){e.advance(time);assert.equal(e.frame().keys.KeyW,first)}
  e.event('KeyW',false);e.event('KeyW',true);assert.notEqual(e.frame().keys.KeyW,first)
})

test('Multicolor ripple uses one hue across its ring and leaves unrelated base keys intact',()=>{
  const p=profile('ripple');p.custom.layers[0].multicolor=true
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true)
  const center=e.frame().keys.KeyW;e.advance(110+1000/6)
  const frame=e.frame().keys
  assert.equal(frame.KeyQ,frame.KeyE);assert.notEqual(frame.KeyQ,'#000000')
  assert.equal(frame.ArrowRight,'#000000')
  const tint=[1,3,5].map(i=>parseInt(center.slice(i,i+2),16))
  const faded=tint.map(c=>Math.round(c*(1-(1000/6)/900)))
  assert.equal(frame.KeyE,'#'+faded.map(c=>c.toString(16).padStart(2,'0')).join(''))
})

test('Multicolor analog hue persists through depth changes and actuation',()=>{
  const p=profile('jelly');p.custom.layers[0].multicolor=true
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.setTravel({KeyW:.4})
  const tint=e.frame().keys.KeyW
  e.setTravel({KeyW:2});e.event('KeyW',true);e.advance(900);assert.equal(e.frame().keys.KeyW,tint)
  e.setTravel({KeyW:0});e.event('KeyW',false);assert.equal(e.frame().keys.KeyW,'#000000')
  e.setTravel({KeyW:.4});assert.notEqual(e.frame().keys.KeyW,tint)
})

test('Multicolor Touch stays one color when deepest keys trade places due to Hall noise',()=>{
  const p=profile('touch');p.custom.layers[0].multicolor=true
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.setTravel({KeyW:1.7,KeyA:1.69})
  const first=e.frame().keys.Digit1
  for(const travel of [{KeyW:1.69,KeyA:1.7},{KeyW:1.7,KeyA:1.69}]){
    e.setTravel(travel);assert.equal(e.frame().keys.Digit1,first);assert.equal(e.frame().keys.Digit4,first)
  }
  e.setTravel({});e.frame();e.setTravel({KeyW:1.7});assert.notEqual(e.frame().keys.Digit1,first)
})

test('Multicolor Breath holds a uniform hue for a cycle and changes at its dark boundary',()=>{
  const p=profile('breath');p.custom.layers[0].multicolor=true
  const e=new custom.CustomRgbEngine(p);e.advance(500)
  const first=e.frame().keys;assert.equal(first.KeyW,first.ArrowRight)
  e.advance(1000);assert.equal(e.frame().keys.KeyW,'#000000')
  e.advance(1500);assert.notEqual(e.frame().keys.KeyW,first.KeyW)
})

test('Multicolor blending dims underlying rainbow only inside the effect and respects opacity endpoints',()=>{
  const background=[120,180,200],tint=[255,48,48]
  assert.deepEqual(blendCustomRgbColor(background,tint,0,true),background)
  assert.deepEqual(blendCustomRgbColor(background,tint,1,true),tint)
  const normal=blendCustomRgbColor(background,tint,.5,false),clear=blendCustomRgbColor(background,tint,.5,true)
  assert.ok(clear.every((c,i)=>c<normal[i]))
  for(const effect of ['mixing','rt']){
    const p=profile(effect),a=new custom.CustomRgbEngine(p);a.advance(110);a.setTravel({ArrowRight:3.4});a.event('KeyW',true)
    const baseline=a.frame();p.custom.layers[0].multicolor=true;a.configure(p);assert.deepEqual(a.frame(),baseline)
  }
})

for(const effect of custom.CUSTOM_RGB_EFFECTS)test(`${effect.name}: outputs valid full-keyboard colors`,()=>{
  const p=profile(effect.id);const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true);e.advance(250)
  assert.equal(Object.keys(e.frame().keys).length,68);assert.ok(Object.values(e.frame().keys).every(c=>/^#[0-9a-f]{6}$/.test(c)))
})

test('Ember, Starlight and Tempo Pulse (BPM) animate by themselves and are deterministic in time',()=>{
  for(const effect of ['ember','starlight','pulse']){
    const run=()=>{const e=new custom.CustomRgbEngine(profile(effect));e.advance(110);const seen=new Set(),frames=[];let lit=0
      for(let t=110;t<6000;t+=250){e.advance(t);const keys=e.frame().keys;const frame=JSON.stringify(keys);frames.push(frame);seen.add(frame);lit+=Object.values(keys).filter(c=>energy(c)>0).length}
      return {seen:seen.size,lit,frames}}
    const a=run(),b=run()
    assert.ok(a.seen>10,`${effect} must keep changing without input`);assert.ok(a.lit>0,`${effect} must light keys`)
    assert.deepEqual(a,b,`${effect} must not depend on randomness or wall-clock time`)
  }
})

test('Afterglow release and re-press preserve the actual heat of a fast tap',()=>{
  const p=profile('afterglow'),e=new custom.CustomRgbEngine(p)
  e.advance(110);e.event('KeyG',true);e.advance(115)
  const pressed=e.frame().keys;assert.ok(energy(pressed.KeyG)>0)
  e.event('KeyG',false);assert.deepEqual(e.frame().keys,pressed,'release must not jump to full heat')
  e.advance(200);const fading=e.frame().keys
  e.event('KeyG',true);assert.deepEqual(e.frame().keys,fading,'re-press must continue from the remaining glow')
  e.advance(300);assert.ok(energy(e.frame().keys.KeyG)>energy(fading.KeyG))
  e.event('KeyG',false);e.advance(1700);assert.equal(e.frame().keys.KeyG,'#000000')
})

test('Afterglow layers preserve separate cool-downs and do not change RT release colors',()=>{
  const p=profile('afterglow'),fast=p.custom.layers[0],slow=custom.createRgbLayer('afterglow','slow')
  Object.assign(fast,{keys:['KeyG'],duration:200});Object.assign(slow,{keys:['KeyH'],duration:2000})
  p.custom.layers.push(slow)
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyG',true);e.advance(400);e.event('KeyG',false);e.advance(700)
  const before=e.frame().keys;assert.equal(before.KeyG,'#000000');assert.ok(energy(before.KeyH)>0)
  e.event('KeyG',true);assert.deepEqual(e.frame().keys,before)
  const rt=profile('rt'),display=new custom.CustomRgbEngine(rt);display.advance(110);display.event('KeyG',true)
  assert.equal(display.frame().keys.KeyG,'#00ff00');display.event('KeyG',false);assert.equal(display.frame().keys.KeyG,'#ff0000')
})

test('Ember height controls the flame reach while detached sparks remain independent',()=>{
  const totals=[]
  for(const width of [.75,5]){const p=profile('ember');p.custom.layers[0].width=width;const e=new custom.CustomRgbEngine(p);let top=0
    for(let t=110;t<8110;t+=200){e.advance(t);top+=energy(e.frame().keys.Digit5)}totals.push(top)}
  assert.ok(totals[1]>totals[0]+200,'a tall flame must illuminate the upper row more than a low flame')
})

test('Starlight density restores inside its effective range and increases lit coverage',()=>{
  const p=profile('starlight')
  for(const [width,expected] of [[12,9.5],[0,.3]])assert.equal(custom.restoreCustomRgb({...p.custom,layers:[{...p.custom.layers[0],width}]},p).layers[0].width,expected)
  const totals=[]
  for(const width of [.3,9.5]){p.custom.layers[0].width=width;const e=new custom.CustomRgbEngine(p);let lit=0
    for(let t=110;t<5110;t+=250){e.advance(t);lit+=Object.values(e.frame().keys).filter(c=>energy(c)>20).length}totals.push(lit)}
  assert.ok(totals[1]>totals[0]*5)
})

test('Tempo Pulse retains a visible outer ring across a beat boundary at 200 BPM',()=>{
  const p=profile('pulse');p.custom.layers[0].speed=200;const e=new custom.CustomRgbEngine(p)
  e.advance(899.99);const before=e.frame().keys.Escape;e.advance(900.01);const after=e.frame().keys.Escape
  assert.ok(energy(after)>20,'the previous accent still reaches the board edge')
  assert.ok(Math.abs(energy(before)-energy(after))<=3,'an outer tail must not disappear when the next beat starts')
})

test('new gradient underlays participate in Scan and random-effect contrast palettes',()=>{
  const stops=Object.fromEntries(Object.entries(custom.RGB_GRADIENT_PALETTES).map(([id,p])=>[id,p.colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)))]))
  for(const effect of ['ember','starlight','afterglow','pulse']){
    const p=profile('scan'),underlay=custom.createRgbLayer(effect,'underlay');p.custom.layers.unshift(underlay)
    const backgrounds=[];const colors=stops[underlay.palette]
    for(let i=0;i<colors.length-1;i++)for(let step=0;step<=8;step++)backgrounds.push(colors[i].map((v,c)=>v+(colors[i+1][c]-v)*step/8))
    const e=new custom.CustomRgbEngine(p)
    assert.deepEqual(e.colorPalettes.get('one'),customRgbContrastPalette(backgrounds),`${effect} palette must be included`)
    underlay.enabled=false;const without=new custom.CustomRgbEngine(p)
    assert.deepEqual(without.colorPalettes.get('one'),customRgbContrastPalette([]),'disabled underlays must not restrict colors')
  }
})
test('Ember is hottest on the bottom row and Starlight keeps most keys dark',()=>{
  const e=new custom.CustomRgbEngine(profile('ember'));let top=0,bottom=0
  for(let t=110;t<8000;t+=100){e.advance(t);const keys=e.frame().keys;top+=energy(keys.KeyQ)+energy(keys.Digit5);bottom+=energy(keys.KeyZ)+energy(keys.KeyN)+energy(keys.KeyV)}
  assert.ok(bottom>top*1.5,'fire should burn stronger near the bottom edge')
  const s=new custom.CustomRgbEngine(profile('starlight'));s.advance(110);let max=0
  for(let t=110;t<8000;t+=500){s.advance(t);max=Math.max(max,Object.values(s.frame().keys).filter(c=>energy(c)>20).length)}
  assert.ok(max>0&&max<34,'stars are sparse: some keys lit, never most of the board')
})
test('Afterglow stays white-hot while held, then cools to zero after the cool-down',()=>{
  const p=profile('afterglow');p.custom.layers[0].duration=1000
  const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyG',true);e.advance(400)
  const held=e.frame().keys;e.advance(800);assert.equal(e.frame().keys.KeyG,held.KeyG,'held key keeps constant heat')
  assert.ok(energy(held.KeyG)>energy(held.KeyH),'neighbors are cooler than the pressed key')
  e.event('KeyG',false);let previous=Infinity
  for(let t=900;t<=1800;t+=150){e.advance(t);const now=energy(e.frame().keys.KeyG);assert.ok(now<=previous);previous=now}
  e.advance(2000);assert.equal(e.frame().keys.KeyG,'#000000');assert.equal(e.frame().keys.KeyH,'#000000')
})
test('Tempo Pulse (BPM) accents the first beat of each bar and honors tempo',()=>{
  const p=profile('pulse');p.custom.layers[0].speed=120;p.custom.layers[0].multicolor=false
  const peak=(at)=>{const e=new custom.CustomRgbEngine(p);e.advance(at);return Math.max(...Object.values(e.frame().keys).map(energy))}
  assert.ok(peak(30)>peak(30+500),'beat 0 is an accent; beat 1 (500 ms at 120 BPM) is softer')
  assert.equal(custom.restoreCustomRgb({...p.custom,layers:[{...p.custom.layers[0],speed:9999}]},p).layers[0].speed,200,'tempo is clamped to 200 BPM')
  assert.equal(custom.restoreCustomRgb({...p.custom,layers:[{...p.custom.layers[0],speed:1}]},p).layers[0].speed,40,'tempo is clamped to 40 BPM')
})
test('new palettes restore and old services are told to update for the new effects',()=>{
  const p=profile('ember');p.custom.baseEffect={effect:'aurora',palette:'synthwave',width:2.5,speed:.5}
  assert.equal(custom.restoreCustomRgb(JSON.parse(JSON.stringify(p.custom)),p).baseEffect.palette,'synthwave')
  for(const id of ['ember','starlight','afterglow','pulse'])assert.ok(!custom.LEGACY_RGB_EFFECTS.includes(id))
  for(const id of ['ember','starlight','afterglow','pulse']){const layer=custom.createRgbLayer(id,'x');assert.equal(layer.multicolor,true);assert.ok(layer.palette)}
})
