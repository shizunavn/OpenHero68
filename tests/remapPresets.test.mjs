import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
const bundle=await rolldown({input:'src/state/remapPresets.ts'})
const {output}=await bundle.generate({format:'esm'})
const m=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
await bundle.close()

test('hover differences follow the current layout and disappear after applying a preset',()=>{
  const current=m.remapPreset('default',0)
  assert.equal(m.remapPresetDifferences('default',0,current).size,0)
  const changes=m.remapPresetDifferences('colemak',0,current)
  assert.equal(changes.size,17)
  assert.ok(changes.has('KeyE'))
  assert.ok(!changes.has('KeyQ'))
  Object.assign(current,m.remapPreset('colemak',0))
  assert.equal(m.remapPresetDifferences('colemak',0,current).size,0)
  assert.equal(m.remapPresetDifferences('default',0,current).size,17)
  current.KeyE=0x04
  assert.deepEqual([...m.remapPresetDifferences('colemak',0,current)],['KeyE'])
  assert.equal(m.remapPresetDifferences('default',1,m.remapPreset('default',1)).size,0)
})
test('typing presets contain all letters once and preserve access keys',()=>{
  for(const id of ['colemak','dvorak','abc']){
    const keys=m.remapPreset(id,0)
    const values=Object.values(keys)
    for(let usage=4;usage<=29;usage++)assert.equal(values.filter(value=>value===usage).length,1,`${id}: ${usage}`)
    for(const key of ['Fn','CapsLock','ControlLeft','Space','ArrowLeft'])assert.equal(keys[key],undefined)
    assert.equal(Object.keys(keys).length,35)
  }
})
test('presets map punctuation and functions to the correct HID actions',()=>{
  const d=m.remapPreset('dvorak',0)
  assert.equal(d.KeyQ,0x34);assert.equal(d.BracketLeft,0x38);assert.equal(d.Minus,0x2f);assert.equal(d.Equal,0x30)
  const c=m.remapPreset('colemak',0)
  assert.equal(c.KeyE,0x09);assert.equal(c.KeyP,0x33);assert.equal(c.Semicolon,0x12)
  const f=m.remapPreset('function',2)
  assert.equal(f.Digit1,0x3a);assert.equal(f.Equal,0x45);assert.equal(Object.keys(f).length,12)
})
test('default restores the chosen firmware layer and returns independent copies',()=>{
  const main=m.remapPreset('default',0),fn=m.remapPreset('default',1)
  assert.equal(Object.keys(main).length,68);assert.equal(Object.keys(fn).length,68)
  assert.notEqual(main.Digit1,fn.Digit1)
  main.KeyA=0
  assert.equal(m.remapPreset('default',0).KeyA,4)
})
