import { defaultRemapLayers, REMAP_CATEGORIES, type RemapLayer } from '../protocol/hero68/remap'

const typingRows = [
  ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'],
  ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'],
  ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash'],
]
const symbols: Record<string,string> = {'[':'[{',']':']}', ';':';:', "'":'\' "', ',':',<','.':'.>','/':'/?','-':'-_','=':'=+'}
const basicActions = REMAP_CATEGORIES.find(category => category.id === 'basic_key')!.actions
function action(character:string) {
  const name=symbols[character]??character.toUpperCase()
  const found=basicActions.find(item=>item.name===name)
  if(!found)throw new Error(`Unknown preset key: ${character}`)
  return found.value
}
export const REMAP_PRESETS = [
  {id:'default',label:'Default',mark:'QWERTY'},
  {id:'function',label:'Function',mark:'F1–F12'},
  {id:'colemak',label:'Colemak',mark:'ARSTD'},
  {id:'dvorak',label:'Dvorak',mark:'AOEUI'},
  {id:'abc',label:'ABC',mark:'ABCDEF'},
] as const
export type RemapPresetId = typeof REMAP_PRESETS[number]['id']

/** Only mark keys that applying the hovered preset would actually change. */
export function remapPresetDifferences(id: RemapPresetId, layer: RemapLayer, current: Readonly<Record<string, number>>): Set<string> {
  return new Set(Object.entries(remapPreset(id, layer)).filter(([key, value]) => current[key] !== value).map(([key]) => key))
}

/** Typing presets change only character keys; layer access, modifiers and arrows remain intact. */
export function remapPreset(id:RemapPresetId, layer:RemapLayer):Record<string,number> {
  const factory=defaultRemapLayers()
  if(id==='default')return {...factory[layer]}
  if(id==='function')return Object.fromEntries(['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'].map((key,i)=>[key,basicActions.find(a=>a.name===`F${i+1}`)!.value]))
  const next=Object.fromEntries([...typingRows.flat(),'Minus','Equal'].map(key=>[key,factory[0][key]]))
  const rows=id==='colemak'?['qwfpgjluy;[]','arstdhneio\'','zxcvbkm,./']
    :id==='dvorak'?["',.pyfgcrl/=",'aoeuidhtns-',';qjkxbmwvz']
    :['abcdefghijkl','mnopqrstuvw','xyz,./']
  if(id==='abc') {
    // Alphabetical letters occupy the original 26 letter positions; punctuation stays QWERTY.
    typingRows.flat().filter(key=>key.startsWith('Key')).forEach((key,i)=>{next[key]=action(String.fromCharCode(97+i))})
  } else typingRows.forEach((keys,row)=>keys.forEach((key,column)=>{next[key]=action(rows[row][column])}))
  if(id==='dvorak'){next.Minus=action('[');next.Equal=action(']')}
  return next
}
