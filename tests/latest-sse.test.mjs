import assert from 'node:assert/strict'
import {test} from 'node:test'
import {EventEmitter} from 'node:events'
import {rolldown} from 'rolldown'
const b=await rolldown({input:'service/latestSse.ts'}),{output}=await b.generate({format:'esm'})
const {latestSse}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);await b.close()
test('slow preview keeps only the newest unsent frame and resumes on drain',()=>{
  const client=new EventEmitter(),writes=[];client.destroyed=false;client.write=value=>{writes.push(value);return false}
  const send=latestSse(client);send('frame1');for(let i=2;i<=1000;i++)send('frame'+i)
  assert.deepEqual(writes,['frame1']);client.emit('drain');assert.deepEqual(writes,['frame1','frame1000'])
  client.destroyed=true;send('closed');client.emit('close');client.emit('drain');assert.equal(writes.length,2)
})
