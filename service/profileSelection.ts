import {buildReport,decodeReport} from '../src/protocol/hero68/codec'
import type {DecodedReport} from '../src/protocol/hero68/types'

/** Also cover profile selection inside an atomic service configuration batch. */
export async function profileRequest(packet:Uint8Array,request:(packet:Uint8Array)=>Promise<DecodedReport>) {
  const selecting=packet[1]===0x10&&packet[2]===0&&packet[6]===1&&packet[7]<=2
  for(let attempt=0;;attempt++){
    try{return await request(packet)}
    catch(error){
      if(!selecting||!/(?:timed out|timeout)/i.test(error instanceof Error?error.message:String(error)))throw error
      try{
        const active=await request(buildReport({command:0x90,data:[0]}))
        if(active.command===0x90&&active.zone===0&&active.checksumValid&&active.data[0]===packet[7])return decodeReport(packet)
      }catch{/* Retry the same idempotent slot; do not retry other writes. */}
      if(attempt>=2)throw error
    }
  }
}
