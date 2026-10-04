import {readRemap,readAdvancedKeyPositions} from '../src/protocol/hero68/commands'
import {decodeRemapRecords} from '../src/protocol/hero68/codec'
import {defaultRemapLayers} from '../src/protocol/hero68/remap'
import {HERO68_KEY_POSITIONS} from '../src/protocol/hero68/keyPositions'
import {WINDOWS_SCANS} from '../src/keyboard/windowsScans'
import type {GamepadConfiguration} from '../src/keyboard/gamepad'
import type {DecodedReport} from '../src/protocol/hero68/types'
/** Hook the logical main-layer key, rather than the physical key's factory code.
 * Unsupported actions never silently become a guessed keyboard scan code. */
export async function hookConfiguration(config:GamepadConfiguration,request:(packet:Uint8Array)=>Promise<DecodedReport>){
  const keys=config.bindings.map(b=>HERO68_KEY_POSITIONS[b.keyId]),values=new Map<number,number>()
  const advanced=await request(readAdvancedKeyPositions(0))
  if(advanced.reserved!==0||advanced.data.length%2)throw Error('Cannot verify Advanced Keys for Windows hooking')
  for(let i=0;i<advanced.data.length;i+=2)if(keys.includes(advanced.data[i]*256+advanced.data[i+1]))throw Error('Windows fallback cannot block Advanced Key actions; remove them from Gamepad bindings')
  const logical=new Map<number,string>(Object.entries(defaultRemapLayers()[0]).filter(([id])=>WINDOWS_SCANS[id]!==undefined).map(([id,v])=>[v,id]))
  for(const packet of readRemap(0,keys)){
    const expected=new Set<number>();for(let i=7;i<7+packet[6];i+=2)expected.add(packet[i]*256+packet[i+1])
    for(const e of decodeRemapRecords((await request(packet)).data)){if(!expected.delete(e.keyId))throw Error('Unexpected hook remap readback');values.set(e.keyId,e.keycode)}
    if(expected.size)throw Error('Incomplete hook remap readback')
  }
  return {...config,bindings:config.bindings.map(b=>{
    if(b.keyboardKeyId!==undefined)return b
    const v=values.get(HERO68_KEY_POSITIONS[b.keyId]),id=v===0?'None':logical.get(v!)
    if(!id)throw Error('Windows fallback supports standard main-layer keyboard actions only; use firmware blocking for this remap')
    return {...b,keyboardKeyId:id}
  })}
}
