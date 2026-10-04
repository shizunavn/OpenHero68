import {readActiveProfile,selectProfile,readRemap,writeRemap,readAdvancedKeyPositions} from '../src/protocol/hero68/commands'
import {decodeRemapRecords,buildReport,u16be,u32be} from '../src/protocol/hero68/codec'
import {HERO68_KEY_POSITIONS} from '../src/protocol/hero68/keyPositions'
import type {DecodedReport,ProfileSlot} from '../src/protocol/hero68/types'
type Entry={layer:0|1|2;pos:number;value:number}
export type FirmwareJournal={version:1;identity:string;slot:ProfileSlot;entries:Entry[]}
type Storage={load:()=>unknown;save:(journal:FirmwareJournal)=>void;clear:()=>void}
const positions=new Set(Object.values(HERO68_KEY_POSITIONS))
export function validateFirmwareJournal(value:unknown):FirmwareJournal {
  const j=value as FirmwareJournal
  if(!j||j.version!==1||!/^[a-f0-9]{64}$/.test(j.identity)||![0,1,2].includes(j.slot)||!Array.isArray(j.entries)||j.entries.length>204)throw Error('Invalid Gamepad remap recovery journal')
  const seen=new Set<string>()
  for(const e of j.entries){const id=`${e.layer}:${e.pos}`;if(![0,1,2].includes(e.layer)||!positions.has(e.pos)||!Number.isInteger(e.value)||e.value<0||e.value>0xffffffff||seen.has(id))throw Error('Invalid Gamepad remap recovery entry');seen.add(id)}
  return j
}
/** Called only inside the service's serialized device transaction. Back up every
 * original remap before the first write, verify all writes and keep the journal
 * on any failure. Recovery never substitutes factory defaults or another device. */
export class GamepadFirmware {
  private journal:FirmwareJournal|null=null
  active=false
  error=''
  constructor(private request:(packet:Uint8Array)=>Promise<DecodedReport>,private identity:()=>Promise<string>,private storage:Storage){
    const saved=storage.load();if(saved!==null&&saved!==undefined)this.journal=validateFirmwareJournal(saved)
  }
  get pendingRecovery(){return this.journal!==null&&!this.active}
  projectRead(reply:DecodedReport):DecodedReport {
    if(!this.active||!this.journal||reply.command!==0x83)return reply
    const original=new Map(this.journal.entries.filter(e=>e.layer===reply.zone).map(e=>[e.pos,e.value]))
    const records=decodeRemapRecords(reply.data)
    const raw=buildReport({...reply,data:records.flatMap(e=>[...u16be(e.keyId),...u32be(e.keycode===0?(original.get(e.keyId)??0):e.keycode)])})
    return {...reply,raw,data:raw.slice(7,7+raw[6]),checksum:raw[63]}
  }
  private async slot(){const r=await this.request(readActiveProfile());const s=r.data[0];if(![0,1,2].includes(s))throw Error('Invalid active HERO68 profile');return s as ProfileSlot}
  private async read(layer:0|1|2,keys:number[]){
    const values=new Map<number,number>()
    for(const packet of readRemap(layer,keys)){
      const expected=new Set<number>();for(let i=7;i<7+packet[6];i+=2)expected.add(packet[i]*256+packet[i+1])
      const r=await this.request(packet)
      for(const e of decodeRemapRecords(r.data)){if(!expected.delete(e.keyId))throw Error('Unexpected Gamepad remap readback');values.set(e.keyId,e.keycode)}
      if(expected.size)throw Error('Incomplete Gamepad remap readback')
    }
    return values
  }
  private async write(layer:0|1|2,entries:Entry[],empty:boolean){
    for(const packet of writeRemap(layer,entries.map(e=>[e.pos,empty?0:e.value] as const)))await this.request(packet)
    const actual=await this.read(layer,entries.map(e=>e.pos))
    for(const e of entries)if(actual.get(e.pos)!==(empty?0:e.value))throw Error('Gamepad remap verification failed; recovery backup retained')
  }
  async restore(){
    this.active=false;if(!this.journal)return
    const j=this.journal;this.error=''
    try{
      if(await this.identity()!==j.identity)throw Error('Reconnect the original HERO68 to its original USB port to restore Gamepad remaps')
      const previous=await this.slot()
      if(previous!==j.slot)await this.request(selectProfile(j.slot))
      try{
        for(const layer of [0,1,2] as const){
          const entries=j.entries.filter(e=>e.layer===layer),actual=await this.read(layer,entries.map(e=>e.pos))
          // Preserve deliberate remap edits made outside the Gamepad transaction.
          const owned=entries.filter(e=>actual.get(e.pos)===0&&e.value!==0)
          if(owned.length)await this.write(layer,owned,false)
          if(entries.some(e=>actual.get(e.pos)!==0&&actual.get(e.pos)!==e.value))this.error='Remaps changed outside Gamepad were preserved'
        }
      }finally{if(previous!==j.slot)await this.request(selectProfile(previous))}
      this.storage.clear();this.journal=null
    }catch(e){this.error=e instanceof Error?e.message:String(e);throw e}
  }
  async apply(slot:ProfileSlot,keyIds:string[]){
    await this.restore();if(!keyIds.length)return
    const keys=[...new Set(keyIds.map(id=>{const pos=HERO68_KEY_POSITIONS[id];if(!pos)throw Error('Invalid Gamepad key');return pos}))]
    const identity=await this.identity(),entries:Entry[]=[]
    if(await this.slot()!==slot)await this.request(selectProfile(slot))
    for(const layer of [0,1,2] as const){
      const advanced=await this.request(readAdvancedKeyPositions(layer))
      if(advanced.reserved!==0||advanced.data.length%2)throw Error('Cannot verify Advanced Keys before blocking keyboard input')
      for(let i=0;i<advanced.data.length;i+=2)if(keys.includes(advanced.data[i]*256+advanced.data[i+1]))throw Error('Remove Advanced Keys from Gamepad bindings before using firmware blocking')
      for(const [pos,value] of await this.read(layer,keys))entries.push({layer,pos,value})
    }
    const j:FirmwareJournal={version:1,identity,slot,entries}
    this.storage.save(j);this.journal=j
    try{
      for(const layer of [0,1,2] as const)await this.write(layer,entries.filter(e=>e.layer===layer),true)
      this.active=true;this.error=''
    }catch(e){this.error=e instanceof Error?e.message:String(e);await this.restore().catch(()=>{});throw e}
  }
}
