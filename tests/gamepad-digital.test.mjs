import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
const build=await rolldown({input:'service/gamepadDigital.ts'}),{output}=await build.generate({format:'esm'});await build.close()
const {digitalSettingsCommand}=await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
const config={bindings:[{keyId:'Space',action:'A'},{keyId:'KeyW',action:'LUp'},{keyId:'KeyA',action:'B'}]}
const reply=(packet)=>{
 const data=[]
 for(let i=7;i<7+packet[6];i+=2){const pos=packet[i]*256+packet[i+1],values=packet[1]===0x93?[1,24,1]:packet[1]===0x99?[1,0,30,0,15,1]:[0,5,0,10,1,1];data.push(pos>>8,pos&255,...values)}
 return {command:packet[1],zone:0,reserved:0,data:Uint8Array.from(data)}
}
test('digital settings use firmware AP, split RT and deadzones; analog keys cause no reads',async()=>{
 const requests=[];assert.equal(await digitalSettingsCommand(config,async p=>{requests.push(p);return reply(p)}),'gamepad-digital:70,280,1,30,15,1,5,10|43,280,1,30,15,1,5,10')
 assert.deepEqual(requests.map(p=>p[1]),[0x93,0x99,0x96]);assert.ok(requests.every(p=>p[6]===4))
 assert.equal(await digitalSettingsCommand({bindings:[config.bindings[1]]},()=>{throw Error('No analog reads')}),'gamepad-digital:')
})
test('incomplete, duplicate, wrong-layer and failed AP/RT readback prevents enabling digital output',async()=>{
 for(const corrupt of [r=>({...r,data:r.data.slice(0,-1)}),r=>({...r,zone:1}),r=>({...r,reserved:1}),r=>{r.data.set(r.data.slice(0,2),5);return r}]){
   await assert.rejects(digitalSettingsCommand(config,async p=>corrupt(reply(p))),/Gamepad AP\/RT/)
 }
 await assert.rejects(digitalSettingsCommand(config,async()=>{throw Error('HID disconnected')}),/HID disconnected/)
})
