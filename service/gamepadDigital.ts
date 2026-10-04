import {isAnalogAction,type GamepadConfiguration} from '../src/keyboard/gamepad'
import {HERO68_KEY_POSITIONS} from '../src/protocol/hero68/keyPositions'
import {readActuation,readRapidTrigger,readDeadZone} from '../src/protocol/hero68/commands'
import {decodeActuationRecords,decodeRapidTriggerRecords,decodeDeadZoneRecords} from '../src/protocol/hero68/codec'
import type {DecodedReport} from '../src/protocol/hero68/types'
type Setting={ap:number;rt:number;release:number;press:number;dz:number;top:number;bottom:number}

/** Read the selected firmware profile, rather than a browser draft or the Hall
 * diagnostic pressed flag. Require complete readback before enabling output. */
export async function digitalSettingsCommand(config:GamepadConfiguration,request:(packet:Uint8Array)=>Promise<DecodedReport>){
  const keys=config.bindings.filter(b=>!isAnalogAction(b.action)).map(b=>HERO68_KEY_POSITIONS[b.keyId])
  const settings=new Map<number,Setting>(keys.map(pos=>[pos,{ap:0,rt:0,release:0,press:0,dz:0,top:0,bottom:0}]))
  const readers=[
    {size:11,bytes:5,command:0x93,packet:readActuation,decode:(data:Uint8Array)=>decodeActuationRecords(data).map(r=>({keyId:r.keyId,values:{ap:r.distanceUnits}}))},
    {size:6,bytes:8,command:0x99,packet:readRapidTrigger,decode:(data:Uint8Array)=>decodeRapidTriggerRecords(data).map(r=>({keyId:r.keyId,values:{rt:Number(r.enabled!==0),release:r.releaseUnits,press:r.pressUnits}}))},
    {size:6,bytes:8,command:0x96,packet:readDeadZone,decode:(data:Uint8Array)=>decodeDeadZoneRecords(data).map(r=>({keyId:r.keyId,values:{dz:Number(r.enabled!==0),top:r.topUnits,bottom:r.bottomUnits}}))},
  ]
  for(const reader of readers)for(let offset=0;offset<keys.length;offset+=reader.size){
    const batch=keys.slice(offset,offset+reader.size),pending=new Set(batch),reply=await request(reader.packet(batch))
    if(reply.command!==reader.command||reply.zone!==0||reply.reserved!==0||reply.data.length!==batch.length*reader.bytes)throw Error('Incomplete Gamepad AP/RT readback')
    for(const record of reader.decode(reply.data)){
      if(!pending.delete(record.keyId))throw Error('Unexpected Gamepad AP/RT key')
      Object.assign(settings.get(record.keyId)!,record.values)
    }
    if(pending.size)throw Error('Missing Gamepad AP/RT key')
  }
  return 'gamepad-digital:'+keys.map(pos=>{const s=settings.get(pos)!;return [pos,s.ap,s.rt,s.release,s.press,s.dz,s.top,s.bottom].join(',')}).join('|')
}
