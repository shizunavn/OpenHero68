import { decodeReport } from '../src/protocol/hero68/codec'

// Only commands used by the configuration UI, never firmware/update/reset or
// calibration commands. The native helper also checks this set independently.
export function validateDeviceRequest(input:unknown):{packet:Uint8Array;reenumerate:boolean} {
  const value=input as {hex?:unknown;reenumerate?:unknown}
  if(!value||typeof value.hex!=='string'||!/^[0-9a-fA-F]{128}$/.test(value.hex))throw Error('Expected a 64-byte configuration report')
  const packet=Uint8Array.from(Buffer.from(value.hex,'hex')),report=decodeReport(packet)
  if(!report.checksumValid)throw Error('Invalid configuration checksum')
  const {command:c,zone:z,dataLength:n,data:d}=report
  const allowed =
    ([0x03,0x83,0x12,0x92].includes(c)&&z<=2)||
    ([0x13,0x15,0x16,0x19,0x93,0x95,0x96,0x99].includes(c)&&z===0&&n>0)||
    (c===0x10&&z===0&&n===1&&d[0]<=2)||
    ([0x90,0x87].includes(c)&&z===0)||
    ([0x1a,0x9a].includes(c)&&z<=2)||
    (c===0x05&&z===0)||
    ([0x04,0x84].includes(c)&&[1,6,17,19,21,23,24,25,29,30].includes(z))||
    ([0x06,0x86].includes(c)&&z===0)||
    (c===0x82&&[1,2,3,4,6,8,9].includes(z))
  if(!allowed)throw Error('Unsupported configuration command')
  const reenumerate=value.reenumerate===true
  if(reenumerate&&!(c===4&&z===23&&n===1&&d[0]<=6))throw Error('Only polling-rate changes may re-enumerate')
  return {packet,reenumerate}
}
