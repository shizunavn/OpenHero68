import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input,external:/^node:/});try{const {output}=await b.generate({format:'esm'});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {defaultRhythm,validateRhythm,rhythmDemo,RHYTHM_MODES}=await bundle('src/keyboard/rhythm.ts')
const {nativeRhythmCommand}=await bundle('service/rhythm.ts')
const {HERO68_KEY_POSITIONS}=await bundle('src/protocol/hero68/keyPositions.ts')
test('rhythm defaults use low-latency controls and reject invalid persisted/API configuration',()=>{
  const c=defaultRhythm();assert.deepEqual(validateRhythm(c),c);assert.equal(c.releaseMs,80);assert.equal(c.spectrum.window,'hann');assert.equal(c.spectrum.db,35)
  for(const patch of [{version:2},{keyMode:168},{sideMode:504},{brightness:101},{sensitivity:0},{releaseMs:201},{color:'#xyzxyz'},{endpoint:'x\nstop'},{palette:'unknown'},{spectrum:{...c.spectrum,spatialRadius:1.5}},{spectrum:{...c.spectrum,window:'unknown'}},{brightness:NaN}])assert.throws(()=>validateRhythm({...c,...patch}))
})
test('native command preserves endpoint UTF-8 and all control fields, gates unverified side output',()=>{
  const c={...defaultRhythm(),endpoint:'Thiết bị âm thanh;test'};const fields=nativeRhythmCommand(c).slice(7).split(';');assert.equal(fields.length,14);assert.equal(Buffer.from(fields[13],'hex').toString('utf8'),c.endpoint);assert.equal(+fields[4],80)
  for(const sideMode of [501,502,503])assert.throws(()=>nativeRhythmCommand({...c,sideMode}),/not been verified/)
})
test('native color order exactly matches all web key IDs and real POS, including AltRight',()=>{
  const header=readFileSync('service/native/rhythm_core.h','utf8'),body=header.match(/positions\s*=\s*\{([^}]+)\}/)[1]
  const positions=body.split(',').map(Number).filter(Number.isFinite)
  assert.deepEqual(positions,Object.values(HERO68_KEY_POSITIONS));assert.equal(positions.length,68);assert.equal(new Set(positions).size,68)
})
test('illustrative demo covers every mode and all keys without hardware or hidden 168',()=>{
  assert.equal(RHYTHM_MODES.length,7);assert.ok(!RHYTHM_MODES.some(m=>m.id===168))
  for(const mode of RHYTHM_MODES){const f=rhythmDemo({...defaultRhythm(),keyMode:mode.id},250);assert.deepEqual(Object.keys(f.keys),Object.keys(HERO68_KEY_POSITIONS));assert.equal(f.side.length,18);assert.ok(f.level>=0&&f.level<=1)}
  assert.ok(Object.values(rhythmDemo({...defaultRhythm(),keyMode:180,palette:'fixed'},0).keys).every(c=>c==='#000000'))
})
