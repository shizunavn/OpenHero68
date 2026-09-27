import { newAdvanced, validateAdvanced, type AdvancedBinding, type AdvancedKind } from './advanced'
import { REMAP_CATEGORIES } from './remap'

export type AdvancedPreset = {id:string;kind:AdvancedKind;title:string;description:string;badges:string[];bindings:AdvancedBinding[]}
const action=(name:string)=>{
  const found=REMAP_CATEGORIES.flatMap(c=>c.actions).find(a=>a.name===name)
  if(!found)throw new Error(`Missing preset action: ${name}`)
  return found.value
}
function running(key:string,name:string):AdvancedBinding {
  return {...newAdvanced('DKS',[key]),actions:[action(name),action('L_Shift'),0,0],thresholds:[.1,3.4,3.4,.1],
    // Keep movement held through the press; add Shift only at the deep point.
    states:[[6,4,12,0],[0,14,0,0],[0,0,0,0],[0,0,0,0]]}
}
const modTap=(key:string,hold:string,tap:string)=>({...newAdvanced('MT',[key]),actions:[action(hold),action(tap)]})
const toggle=(key:string,fn:string)=>({...newAdvanced('TGL',[key]),actions:[action(fn)]})
export const ADVANCED_PRESETS:AdvancedPreset[] = [
  {id:'dks-running-wasd',kind:'DKS',title:'Key Response for Running in Games',description:'Keep WASD held and add Shift at full press for running.',badges:['W','A','S','D'],bindings:[running('KeyW','W'),running('KeyA','A'),running('KeyS','S'),running('KeyD','D')]},
  {id:'dks-running-w',kind:'DKS',title:'Key Response for Running in Games',description:'Keep W held and add Shift at full press for running.',badges:['W'],bindings:[running('KeyW','W')]},
  {id:'mt-arrows',kind:'MT',title:'Mod Tap Arrow Keys',description:'Tap R-Alt / R-Shift / R-Ctrl / Fn for ← / ↑ / → / ↓. Hold for their normal actions.',badges:['←','↑','→','↓'],bindings:[modTap('AltRight','R_Alt','Left'),modTap('ShiftRight','R_Shift','Up'),modTap('ControlRight','R_Ctrl','Right'),modTap('Fn','Fn','Down')]},
  {id:'mt-fn2-caps',kind:'MT',title:'Mod Tap Fn 2 on Caps Lock',description:'Hold Caps Lock for Fn Layer 2; tap for Caps Lock.',badges:['Fn 2'],bindings:[modTap('CapsLock','Fn1','Caps')]},
  {id:'tgl-fn1',kind:'TGL',title:'Toggle Function Layer 1',description:'Tap the Fn key to toggle Fn Layer 1; hold for normal Fn behavior.',badges:['Fn 1'],bindings:[toggle('Fn','Fn')]},
  {id:'tgl-fn2-caps',kind:'TGL',title:'Toggle Function Layer 2 on Caps Lock',description:'Use Caps Lock to toggle Fn Layer 2 on and off.',badges:['Fn 2'],bindings:[toggle('CapsLock','Fn1')]},
]
export function presetConflicts(bindings:AdvancedBinding[],preset:AdvancedPreset) {
  const keys=new Set(preset.bindings.flatMap(b=>b.keys))
  return bindings.filter(b=>b.keys.some(k=>keys.has(k)))
}
export function applyAdvancedPreset(bindings:AdvancedBinding[],preset:AdvancedPreset):AdvancedBinding[] {
  const conflicts=presetConflicts(bindings,preset)
  if(conflicts.some(b=>b.kind==='UNKNOWN'))throw new Error('This preset overlaps an unknown firmware binding, which must be preserved.')
  const ids=new Set(conflicts.map(b=>b.id))
  const result=[...bindings.filter(b=>!ids.has(b.id)),...structuredClone(preset.bindings)]
  validateAdvanced(result)
  return result
}
