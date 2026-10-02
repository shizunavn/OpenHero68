import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(path){const b=await rolldown({input:path});try{const {output}=await b.generate({format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {rgbPreviewDarkReason}=await bundle('src/keyboard/rgbPreviewDefaults.ts')
const {FirmwareRgbPreview}=await bundle('src/keyboard/rgbPreview.ts')
const {defaultRgb}=await bundle('src/protocol/hero68/rgb.ts')
const {restoreCustomRgb,defaultCustomRgb}=await bundle('src/keyboard/customRgbModel.ts')
for(const [mode,name] of [[6,'Ripple'],[7,'Key Ripples'],[10,'Continuous Flow'],[12,'Follow Shadow']])test(`${name}: a new Custom base defaults to a visible palette despite black device readback`,()=>{
  const profile=defaultRgb();profile.keys={...profile.keys,mode:7,rgb:[0,0,0],mix:false,brightness:12,speed:1}
  const inherited=structuredClone(profile.keys)
  assert.match(rgbPreviewDarkReason(profile.keys),/black/)
  profile.keys={...defaultCustomRgb(profile).base,mode}
  assert.equal(profile.keys.mix,true)
  assert.deepEqual(inherited.rgb,[0,0,0]);assert.equal(profile.keys.brightness,12)
  const engine=new FirmwareRgbPreview(profile);engine.advance(110);engine.event('KeyW',true);engine.advance(400)
  assert.ok(Object.values(engine.frame().keys).some(color=>color!=='#000000'))
  assert.equal(rgbPreviewDarkReason(profile.keys),null)
})
test('saved intentional black, Single color and zero brightness remain unchanged when restored',()=>{
  const profile=defaultRgb();const black={...profile.keys,rgb:[0,0,0],brightness:0}
  const saved={...defaultCustomRgb(profile),base:{...black,mode:7,mix:false}}
  assert.deepEqual(restoreCustomRgb(saved,profile).base,saved.base)
  assert.equal(restoreCustomRgb(saved,profile).base.mix,false)
  assert.deepEqual(restoreCustomRgb(saved,profile).base.rgb,[0,0,0])
})
test('palette modes and Multicolor do not falsely report a black single color as the reason for darkness',()=>{
  const black={...defaultRgb().keys,rgb:[0,0,0]}
  for(const mode of [3,15,16])assert.equal(rgbPreviewDarkReason({...black,mode}),null)
  assert.equal(rgbPreviewDarkReason({...black,mode:7,mix:true}),null)
  assert.equal(rgbPreviewDarkReason({...black,mode:7,mixValue:7}),null)
  assert.match(rgbPreviewDarkReason({...black,mode:3,brightness:0}),/Brightness/)
})
test('new Custom bases default to Multicolor even when device playback left a black single color',()=>{
  const profile=defaultRgb();profile.keys.rgb=[0,0,0];profile.keys.mix=false;profile.keys.mixValue=0
  const base=defaultCustomRgb(profile).base
  assert.equal(base.mix,true);assert.equal(base.mixValue,undefined);assert.deepEqual(base.rgb,[255,255,255])
  const saved={version:1,enabled:false,base:{mode:10,rgb:[0,0,0]},layers:[]}
  assert.equal(restoreCustomRgb(saved,profile).base.mix,true)
  saved.base.mix=false
  assert.equal(restoreCustomRgb(saved,profile).base.mix,false)
})
