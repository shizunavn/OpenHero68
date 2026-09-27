import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'
const bundle=await rolldown({input:'src/state/macros.ts'})
const {output}=await bundle.generate({format:'esm'})
const m=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
await bundle.close()
const shortcut=()=>({id:'copy',name:'Copy',playback:'once',repeatCount:2,events:[{key:'ControlLeft',type:'down',delayMs:0},{key:'KeyC',type:'down',delayMs:50},{key:'KeyC',type:'up',delayMs:50},{key:'ControlLeft',type:'up',delayMs:0}]})
test('shortcut validation follows overlapping press/release ordering',()=>{
  assert.doesNotThrow(()=>m.validateMacro(shortcut()))
  assert.deepEqual(m.heldMacroKeys(shortcut().events.slice(0,2)),['ControlLeft','KeyC'])
  assert.deepEqual(m.heldMacroKeys(shortcut().events),[])
  assert.throws(()=>m.validateMacro({...shortcut(),events:[{key:'KeyC',type:'up',delayMs:0}]}),/needs a press/)
  assert.throws(()=>m.validateMacro({...shortcut(),events:[{key:'KeyC',type:'down',delayMs:0},{key:'KeyC',type:'down',delayMs:0}]}),/already held/)
  assert.throws(()=>m.validateMacro({...shortcut(),events:shortcut().events.slice(0,2)}),/Release L-Ctrl, C/)
})
test('partial drafts retain held keys; completed saves require balanced events',()=>{
  const partial={...shortcut(),events:[{key:'KeyA',type:'down',delayMs:0}]}
  assert.doesNotThrow(()=>m.validateMacro(partial,false))
  assert.throws(()=>m.validateMacro(partial),/Release A/)
  assert.throws(()=>m.validateMacro({...shortcut(),events:[]}),/Record a sequence/)
})
test('macro export/import preserves actions, timing and playback; rejects malformed files',()=>{
  const macro={...shortcut(),playback:'repeat',repeatCount:3}
  assert.deepEqual(m.parseMacroImport(m.macroExport([macro])),[macro])
  assert.throws(()=>m.parseMacroImport('{}'),/macro export/)
  assert.throws(()=>m.parseMacroImport(m.macroExport([macro,macro])),/duplicate/)
  for(const patch of [{repeatCount:0},{repeatCount:256},{playback:'invalid'},{name:''},{events:[{key:'FnNotSupported',type:'down',delayMs:0}]},{events:[{key:'KeyA',type:'down',delayMs:-1}]},{events:[{key:'KeyA',type:'down',delayMs:NaN}]}])assert.throws(()=>m.validateMacro({...macro,...patch}))
})
test('recovered catalog includes keyboard modifiers and mouse actions',()=>{
  assert.equal(m.MACRO_ACTIONS.length,108)
  assert.equal(m.macroKeyLabel('ControlLeft'),'L-Ctrl')
  const action=m.MACRO_ACTIONS.find(a=>a.name==='MouseKey0')
  assert.deepEqual({value:action.value,down:action.down,up:action.up},{value:1,down:32,up:160})
})
