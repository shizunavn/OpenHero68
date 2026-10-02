import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
const b=await rolldown({input:'src/protocol/rgbFrameGuard.ts'}),{output}=await b.generate({format:'esm'})
const {rgbFrameGuard}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);await b.close()
test('preview rejects stale sessions, duplicate/reordered frames and invalid sequence numbers',()=>{
  const accept=rgbFrameGuard('new'),frame=sequence=>({enabled:true,sessionId:'new',sequence})
  assert.equal(accept({...frame(100),sessionId:'old'}),false)
  assert.equal(accept(frame(0)),true);assert.equal(accept(frame(2)),true)
  for(const sequence of [2,1,undefined,NaN,Infinity,-1,2.5])assert.equal(accept(frame(sequence)),false)
  assert.equal(accept(frame(3)),true)
  assert.equal(accept({enabled:false,sessionId:'old'}),false)
  assert.equal(accept({enabled:false,sessionId:'new'}),true)
  assert.equal(rgbFrameGuard(undefined)(frame(4)),false)
})
