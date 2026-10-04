import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
const b=await rolldown({input:'service/frameTelemetry.ts'})
const {output}=await b.generate({format:'esm'});await b.close()
const {FrameDelivery}=await import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))
const frame=(frames,rendered)=>({packets:4,outputFrames:frames,outputPackets:frames*4,renderedFrames:rendered})
test('coalesced telemetry counts all USB frames and unique renders, without counting duplicates',()=>{
  const counter=new FrameDelivery()
  assert.deepEqual(counter.observe(frame(1,1)),{frames:1,packets:4,rendered:1})
  assert.deepEqual(counter.observe(frame(22,2)),{frames:21,packets:84,rendered:1})
  assert.deepEqual(counter.observe(frame(22,2)),{frames:0,packets:0,rendered:0})
  assert.deepEqual(counter.observe(frame(23,3)),{frames:1,packets:4,rendered:1})
})
test('mode restart and a restarted native helper begin a fresh count',()=>{
  const counter=new FrameDelivery();counter.observe(frame(80,50))
  counter.reset();assert.deepEqual(counter.observe(frame(5,2)),{frames:5,packets:20,rendered:2})
  assert.deepEqual(counter.observe(frame(1,1)),{frames:1,packets:4,rendered:1})
})
test('legacy native events and malformed totals retain the per-event fallback',()=>{
  const counter=new FrameDelivery()
  assert.deepEqual(counter.observe({packets:4},false),{frames:1,packets:4,rendered:0})
  assert.deepEqual(counter.observe({...frame(5,2),outputFrames:NaN}),{frames:1,packets:4,rendered:1})
})
