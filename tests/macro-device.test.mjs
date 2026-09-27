import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const bundle=await rolldown({input:'src/protocol/hero68/macroDevice.ts'})
const {output}=await bundle.generate({format:'esm'})
const m=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
await bundle.close()

function macro(overrides={}) {
  return {
    id:'hello',
    name:'hello',
    playback:'once',
    repeatCount:2,
    events:[
      {key:'KeyZ',type:'down',delayMs:0},
      {key:'KeyZ',type:'up',delayMs:42},
      {key:'MouseKey0',type:'down',delayMs:0x12345},
      {key:'MouseKey0',type:'up',delayMs:20},
    ],
    ...overrides,
  }
}

test('encodes the official v3 macro table and 4-byte action records',()=>{
  const blob=m.encodeHero68MacroBlob([macro()])
  assert.deepEqual([...blob],[
    0x04,0x00, 0x16,0x00,
    0x05,0x68,0x65,0x6c,0x6c,0x6f,
    0x00,0x00,0x00,0x1d,
    0x80,0x00,0x2a,0x1d,
    0x21,0x23,0x45,0x01,
    0xa0,0x00,0x14,0x01,
  ])
})

test('macro reports use CMD 0x05, 56-byte chunks and valid sequence metadata',()=>{
  const manyEvents=[]
  for(let i=0;i<20;i++)manyEvents.push({key:'KeyA',type:i%2?'up':'down',delayMs:i})
  const reports=m.buildHero68MacroReports([macro({name:'long',events:manyEvents})])
  assert.equal(reports.length,2)
  assert.equal(reports[0][0],0x09)
  assert.equal(reports[0][1],0x05)
  assert.equal(reports[0][2],0)
  assert.equal(reports[0][4],2)
  assert.equal(reports[0][5],0)
  assert.equal(reports[0][6],56)
  assert.equal(reports[1][4],2)
  assert.equal(reports[1][5],1)
  assert.ok(reports[1][6]>0&&reports[1][6]<=56)
})

test('sync requires exact echoed ACK and retries the current packet',async()=>{
  const calls=[]
  let first=true
  const requester={request:async(report,command,zone,timeout,predicate)=>{
    calls.push({report:[...report],command,zone,timeout})
    const raw=report.slice()
    if(first){first=false;raw[7]^=1}
    const reply={raw,total:raw[4],sequence:raw[5]}
    if(!predicate(reply))throw new Error('bad echo')
    return reply
  }}
  const count=await m.syncHero68MacroLibrary(requester,[macro()])
  assert.equal(count,1)
  assert.equal(calls.length,2)
  assert.equal(calls[0].command,0x05)
  assert.equal(calls[0].zone,0)
  assert.equal(calls[0].timeout,1000)
})

test('empty library mirrors official behavior and sends no CMD 0x05 packet',async()=>{
  const requester={request:async()=>{throw new Error('must not send')}}
  assert.deepEqual([...m.encodeHero68MacroBlob([])],[])
  assert.deepEqual(m.buildHero68MacroReports([]),[])
  assert.equal(await m.syncHero68MacroLibrary(requester,[]),0)
})
