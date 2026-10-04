import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function bundle(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {hookConfiguration}=await bundle('service/gamepadKeyboard.ts'),{defaultGamepad,nativeGamepadCommand}=await bundle('src/keyboard/gamepad.ts'),{buildReport,decodeReport,u16be,u32be}=await bundle('src/protocol/hero68/codec.ts')
test('hook fallback follows actual remapped keyboard output and ignores empty action',async()=>{
 const config={...defaultGamepad(),suppressMappedKeys:true,keyboardSuppressionMode:'hook',bindings:defaultGamepad().bindings.slice(0,2)}
 const request=async p=>decodeReport(buildReport({command:p[1],zone:p[2],data:p[1]===0x92?[]:Array.from({length:p[6]/2},(_,i)=>[...u16be(p[7+i*2]*256+p[8+i*2]),...u32be(i===0?4:0)]).flat()}))
 const actual=await hookConfiguration(config,request);assert.deepEqual(actual.bindings.map(b=>b.keyboardKeyId),['KeyA','None']);assert.equal(config.bindings[0].keyboardKeyId,undefined)
 assert.match(nativeGamepadCommand(actual),/;1;30$/)
 const advanced=async p=>decodeReport(buildReport({command:p[1],zone:p[2],data:u16be(30)}));await assert.rejects(hookConfiguration(config,advanced),/Advanced Key/)
})
