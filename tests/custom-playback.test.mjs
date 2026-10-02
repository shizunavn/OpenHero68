import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function load(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {CustomPlayback}=await load('service/customPlayback.ts')
const {defaultRgb}=await load('src/protocol/hero68/rgb.ts')
const {defaultCustomRgb}=await load('src/keyboard/customRgb.ts')
function profile(){const p=defaultRgb();p.side.mode=0;p.custom=defaultCustomRgb(p);p.custom.base.mode=4;return p}

test('Custom starts from a fresh timeline after hours of Rhythm, including repeated transitions',()=>{
  let now=0;const p=profile(),playback=new CustomPlayback(p,()=>now)
  playback.advance();const expected=playback.engine.frame().keys
  for(let i=0;i<3;i++){
    now+=3*60*60*1000;const old=playback.engine
    playback.start(p);playback.advance()
    assert.notEqual(playback.engine,old)
    assert.equal(playback.engine.milliseconds,110)
    assert.deepEqual(playback.engine.frame().keys,expected)
  }
})
test('normal 60 FPS cadence retains real elapsed time and live configuration does not restart playback',()=>{
  let now=0;const p=profile(),playback=new CustomPlayback(p,()=>now)
  for(let i=0;i<=120;i++){now=i*1000/60;playback.advance()}
  assert.ok(Math.abs(playback.engine.milliseconds-2110)<.001)
  p.custom.base.brightness=10;const engine=playback.engine;engine.configure(p)
  now+=1000/60;playback.advance()
  assert.equal(playback.engine,engine)
  assert.ok(Math.abs(engine.milliseconds-(2110+1000/60))<.001)
})
test('resume and a delayed input callback cannot replay an unbounded firmware backlog',()=>{
  let now=0;const playback=new CustomPlayback(profile(),()=>now)
  playback.advance();playback.engine.event('KeyW',true)
  now+=8*60*60*1000;playback.advance()
  assert.equal(playback.engine.milliseconds,210)
  playback.engine.event('KeyW',false)
  playback.advance();assert.equal(playback.engine.milliseconds,210)
  now+=1000/60;playback.advance()
  assert.ok(Math.abs(playback.engine.milliseconds-(210+1000/60))<.001)
})
