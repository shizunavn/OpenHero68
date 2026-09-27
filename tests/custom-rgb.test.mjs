import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
async function bundle(path) {const b=await rolldown({input:path});try{const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const custom=await bundle('src/keyboard/customRgb.ts')
const rgb=await bundle('src/protocol/hero68/rgb.ts')
const {FirmwareRgbPreview}=await bundle('src/keyboard/rgbPreview.ts')
function profile(effect='reaction') {
  const p=rgb.defaultRgb();p.colors=Object.fromEntries(Object.keys(p.colors).map(id=>[id,[0,0,0]]))
  p.custom=custom.defaultCustomRgb(p);p.custom.enabled=true;p.custom.layers=[custom.createRgbLayer(effect,'one')]
  return p
}
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
for(const effect of custom.CUSTOM_RGB_EFFECTS)test(`${effect.name}: outputs valid full-keyboard colors`,()=>{
  const p=profile(effect.id);const e=new custom.CustomRgbEngine(p);e.advance(110);e.event('KeyW',true);e.advance(250)
  assert.equal(Object.keys(e.frame().keys).length,68);assert.ok(Object.values(e.frame().keys).every(c=>/^#[0-9a-f]{6}$/.test(c)))
})
