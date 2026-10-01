import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
const build=await rolldown({input:'src/protocol/rgbServiceState.ts'})
const {output}=await build.generate({format:'esm'});await build.close()
const {unsupportedRgbEffects}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
test('legacy services cannot silently accept new effects; modern capabilities permit them',()=>{
  const config={layers:[{effect:'ripple'},{effect:'aurora'},{effect:'comet'},{effect:'pressure-wave'},{effect:'aurora'}]}
  assert.deepEqual(unsupportedRgbEffects(config,{}),['aurora','comet','pressure-wave'])
  assert.deepEqual(unsupportedRgbEffects(config,{supportedEffects:['ripple','aurora','comet','pressure-wave']}),[])
  assert.deepEqual(unsupportedRgbEffects(config,{supportedEffects:['ripple','aurora']}),['comet','pressure-wave'])
})
test('Aurora base requires explicit base capability, even from an app supporting Aurora FX',()=>{
  const config={baseEffect:{effect:'aurora'},layers:[]}
  assert.deepEqual(unsupportedRgbEffects(config,{supportedEffects:['aurora']}),['aurora (base)'])
  assert.deepEqual(unsupportedRgbEffects(config,{supportedEffects:['aurora'],supportedBaseEffects:['aurora']}),[])
})
