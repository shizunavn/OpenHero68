import {HERO68_KEY_IDS} from '../src/keyboard/hero68Layout'

// Windows Raw Input set-1 make codes. E0 uses bit 8; firmware output (including
// RT and onboard macros) is mapped to the key it actually emits.
const rows:readonly [string,string][]=[
  ['Escape','001'],['Digit1','002'],['Digit2','003'],['Digit3','004'],['Digit4','005'],
  ['Digit5','006'],['Digit6','007'],['Digit7','008'],['Digit8','009'],['Digit9','00a'],
  ['Digit0','00b'],['Minus','00c'],['Equal','00d'],['Backspace','00e'],['Tab','00f'],
  ['KeyQ','010'],['KeyW','011'],['KeyE','012'],['KeyR','013'],['KeyT','014'],
  ['KeyY','015'],['KeyU','016'],['KeyI','017'],['KeyO','018'],['KeyP','019'],
  ['BracketLeft','01a'],['BracketRight','01b'],['Enter','01c'],['ControlLeft','01d'],
  ['KeyA','01e'],['KeyS','01f'],['KeyD','020'],['KeyF','021'],['KeyG','022'],
  ['KeyH','023'],['KeyJ','024'],['KeyK','025'],['KeyL','026'],['Semicolon','027'],
  ['Quote','028'],['ShiftLeft','02a'],['Backslash','02b'],['KeyZ','02c'],
  ['KeyX','02d'],['KeyC','02e'],['KeyV','02f'],['KeyB','030'],['KeyN','031'],
  ['KeyM','032'],['Comma','033'],['Period','034'],['Slash','035'],['ShiftRight','036'],
  ['AltLeft','038'],['Space','039'],['CapsLock','03a'],['ControlRight','11d'],
  ['AltRight','138'],['ArrowUp','148'],['ArrowLeft','14b'],['ArrowRight','14d'],
  ['ArrowDown','150'],['Insert','152'],['Delete','153'],['PageUp','149'],
  ['PageDown','151'],['MetaLeft','15b'],
]
const supported=new Set(HERO68_KEY_IDS)
export const HERO68_INPUT_SCAN_CODES=new Map(rows.filter(([id])=>supported.has(id)).map(([id,code])=>[code,id]))
export function decodeHero68Input(line:string){
  const match=/^key:([0-9a-f]{3}):([01])$/.exec(line)
  if(!match)return null
  const id=HERO68_INPUT_SCAN_CODES.get(match[1])
  return id?{id,pressed:match[2]==='1'}:null
}
