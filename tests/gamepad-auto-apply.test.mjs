import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
const b=await rolldown({input:'src/protocol/gamepadAutoApply.ts'})
const {output}=await b.generate({format:'esm',codeSplitting:false});await b.close()
const {GamepadAutoApply}=await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))
const draft=rate=>({version:1,rate,bindings:[]})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}

test('rapid edits coalesce and a matching remote configuration does not write on page entry',async()=>{
  const writes=[],q=new GamepadAutoApply(async configuration=>{writes.push(configuration);return {configuration}},()=>{},()=>{},10)
  q.setAvailable(true);q.update(draft(200),draft(200));await wait(30);assert.equal(writes.length,0)
  q.update(draft(50));q.update(draft(100));q.update(draft(200));await wait(30);assert.equal(writes.length,0)
  q.update(draft(100));q.update(draft(50));await wait(30);assert.deepEqual(writes.map(v=>v.rate),[50]);q.dispose()
})
test('an old response cannot drop a newer draft; writes never overlap',async()=>{
  const first=deferred(),writes=[],results=[]
  const q=new GamepadAutoApply(async configuration=>{writes.push(configuration.rate);if(writes.length===1)await first.promise;return {configuration}},v=>results.push(v.configuration.rate),()=>{},5)
  q.setAvailable(true);q.update(draft(50));await wait(20)
  q.update(draft(100));q.update(draft(200));await wait(20);assert.deepEqual(writes,[50])
  first.resolve();await wait(30);assert.deepEqual(writes,[50,200]);assert.deepEqual(results,[50,200]);q.dispose()
})
test('Stop waits for an in-flight write, then saves the latest draft without reordering commands',async()=>{
  const first=deferred(),events=[],q=new GamepadAutoApply(async configuration=>{events.push('write:'+configuration.rate);if(configuration.rate===50)await first.promise;return {configuration}},()=>{},()=>{},5)
  q.setAvailable(true);q.update(draft(50));await wait(20);q.update(draft(100))
  const stop=q.run(async()=>{events.push('stop');return {configuration:draft(50)}})
  await wait(20);assert.deepEqual(events,['write:50'])
  first.resolve();await stop;await wait(25);assert.deepEqual(events,['write:50','stop','write:100']);q.dispose()
})
test('Start includes the current draft and does not send a redundant config afterward',async()=>{
  const writes=[],q=new GamepadAutoApply(async configuration=>{writes.push(configuration);return {configuration}},()=>{},()=>{},15)
  q.setAvailable(true);q.update(draft(100));await q.run(async()=>({configuration:draft(100)}));await wait(35);assert.equal(writes.length,0);q.dispose()
})
test('offline edits wait for reconnect; failures do not spin retries and newer edits recover',async()=>{
  let fail=true;const writes=[],states=[]
  const q=new GamepadAutoApply(async configuration=>{writes.push(configuration.rate);if(fail)throw Error('offline');return {configuration}},()=>{},s=>states.push(s),5)
  q.update(draft(50));await wait(20);assert.equal(writes.length,0)
  q.setAvailable(true);await wait(30);assert.deepEqual(writes,[50]);assert.equal(states.at(-1),'error')
  await wait(30);assert.equal(writes.length,1)
  fail=false;q.update(draft(100));await wait(30);assert.deepEqual(writes,[50,100]);assert.equal(states.at(-1),'saved');q.dispose()
})
test('disposing a profile cancels pending writes and ignores late callbacks',async()=>{
  const first=deferred(),writes=[],results=[]
  const q=new GamepadAutoApply(async configuration=>{writes.push(configuration.rate);await first.promise;return {configuration}},v=>results.push(v),()=>{},5)
  q.setAvailable(true);q.update(draft(50));await wait(20);q.update(draft(100));q.dispose();first.resolve();await wait(30)
  assert.deepEqual(writes,[50]);assert.equal(results.length,0)
})

test('a held curve gesture emits zero writes, even with long pauses, and release sends its final value once',async()=>{
  const writes=[],q=new GamepadAutoApply(async configuration=>{writes.push(configuration);return {configuration}},()=>{},()=>{},5)
  q.setAvailable(true);q.update(draft(200),draft(200))
  q.setAvailable(false)
  for(const curve of [[[0,0],[.3,.5],[1,1]],[[0,0],[.4,.6],[1,1]],[[0,0],[.5,.7],[1,1]]]){
    q.update({...draft(200),curve});await wait(25)
    assert.equal(writes.length,0)
  }
  q.setAvailable(true);await wait(25)
  assert.equal(writes.length,1);assert.deepEqual(writes[0].curve,[[0,0],[.5,.7],[1,1]]);q.dispose()
})
