import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
const b=await rolldown({input:'src/protocol/gamepadLive.ts'});let live;try{const {output}=await b.generate({format:'esm',codeSplitting:false});live=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}
const {validInputFrame,browserXboxReport,coherentBrowserReport,NEUTRAL_GAMEPAD}=live
test('fast stream rejects malformed/out of range reports before rendering',()=>{
  const f={enabled:true,armed:true,stale:false,xinputVerified:true,sequence:1,report:{...NEUTRAL_GAMEPAD},samples:[]}
  assert.ok(validInputFrame(f));for(const bad of [null,{...f,sequence:0},{...f,samples:{}},{...f,report:{...f.report,lx:NaN}},{...f,report:{...f.report,rt:256}},{...f,enabled:'true'}])assert.equal(validInputFrame(bad),false)
})
test('standard browser Xbox axes and buttons match XInput including Y inversion',()=>{
  const pad={connected:true,mapping:'standard',id:'Xbox 360 Controller (045e-028e)',axes:[1,-1,-.5,.5],buttons:Array.from({length:17},(_,i)=>({pressed:i===0||i===12,value:i===6?.5:i===7?1:0}))}
  assert.deepEqual(browserXboxReport([pad]),{lx:32767,ly:32767,rx:-16383,ry:-16383,lt:128,rt:255,buttons:4097})
  assert.equal(browserXboxReport([pad,{...pad,id:'Other Xbox 360 Controller'}]),null,'never guess which pad belongs to our service')
  assert.equal(browserXboxReport([{...pad,connected:false}]),null);assert.equal(browserXboxReport([{...pad,id:'Other controller'}]),null)
  assert.equal(coherentBrowserReport({...NEUTRAL_GAMEPAD,buttons:4096},NEUTRAL_GAMEPAD),null)
  assert.equal(coherentBrowserReport({...NEUTRAL_GAMEPAD,ly:20000},NEUTRAL_GAMEPAD),null)
})
