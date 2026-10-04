import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
import {spawn} from 'node:child_process'
import {mkdtemp,readFile,mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
const dir=await mkdtemp(path.resolve('.refactor/service-gamepad-test-')),state=path.join(dir,'state');await mkdir(state)
const b=await rolldown({input:'service/main.ts',external:/^node:/});try{await b.write({format:'cjs',file:path.join(dir,'service.cjs')})}finally{await b.close()}
const port=16914,base=`http://127.0.0.1:${port}`
let service,output='';
const start=async()=>{
 service=spawn(process.execPath,['--require',path.resolve('tests/fixtures/gamepad-service-bridge.cjs'),path.join(dir,'service.cjs'),'--state-dir',state,'--port',String(port)],{windowsHide:true});service.stdout.on('data',d=>output+=d);service.stderr.on('data',d=>output+=d)
 for(let i=0;i<80;i++){if(service.exitCode!==null)throw Error(output);try{const r=await fetch(base+'/gamepad/status');if(r.ok){await new Promise(r=>setTimeout(r,300));return}}catch{}await new Promise(r=>setTimeout(r,50))}throw Error('Fixture service did not start: '+output)
};
const post=async(url,input={})=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const v=await r.json();assert.equal(r.status,200,v.error);return v}
const read=async()=>JSON.parse(await readFile(path.join(state,'fixture-hid.json'),'utf8'))
test('service atomically blocks/restores firmware; fast tester streams add no Hall consumers and startup recovers persisted remaps',async t=>{
 await start();t.after(()=>{if(service?.exitCode===null)service.kill()})
 let status=await(await fetch(base+'/gamepad/status')).json();const config={...status.configuration,bindings:status.configuration.bindings.slice(0,2),suppressMappedKeys:true}
 status=await post('/gamepad/start',{slot:0,configuration:config});assert.ok(status.enabled&&status.keyboardSuppressionActive)
 let actual=await read();assert.equal(Object.keys(actual.remaps).length,6);assert.ok(Object.values(actual.remaps).every(v=>v===0))
 const journal=JSON.parse(await readFile(path.join(state,'gamepad-remap-recovery.json'),'utf8'));assert.equal(journal.entries.length,6)
 const abort=new AbortController(),response=await fetch(base+'/gamepad/input/events',{signal:abort.signal}),reader=response.body.getReader();let frames=0,text='';const started=performance.now()
 while(performance.now()-started<300){text+=new TextDecoder().decode((await reader.read()).value);frames=text.split('data: ').length-1}assert.ok(frames>=10,`fast stream ${frames} frames in 300ms`);abort.abort()
 status=await(await fetch(base+'/gamepad/status')).json();assert.equal(status.hall.consumers.length,1);assert.equal(status.hall.consumers[0].id,'gamepad:analog')
 // A settings read returns original actions while firmware still holds zero.
 const packet=Buffer.alloc(64);packet[0]=9;packet[1]=0x83;packet[4]=1;packet[6]=2;packet[8]=30;packet[63]=(255-[...packet.subarray(0,63)].reduce((a,b)=>a+b,0))&255
 const reply=await post('/device/request',{hex:packet.toString('hex')});assert.equal(Buffer.from(reply.hex,'hex').readUInt32BE(9),0x10000+30)
 assert.ok(Object.values((await read()).remaps).every(v=>v===0))
 // A keyboard settings edit replaces the backed-up action, then reapplies zero.
 const write=Buffer.from(packet);write[1]=3;write[6]=6;write.writeUInt32BE(4,9);write[63]=(255-[...write.subarray(0,63)].reduce((a,b)=>a+b,0))&255
 await post('/device/request',{hex:write.toString('hex')});assert.equal((await read()).remaps['0:0:30'],0)
 const updatedJournal=JSON.parse(await readFile(path.join(state,'gamepad-remap-recovery.json'),'utf8'));assert.equal(updatedJournal.entries.find(e=>e.layer===0&&e.pos===30).value,4)
 journal.entries.find(e=>e.layer===0&&e.pos===30).value=4
 await post('/gamepad/stop');actual=await read();for(const e of journal.entries)assert.equal(actual.remaps[`0:${e.layer}:${e.pos}`],e.value)
 await post('/gamepad/start',{slot:0,configuration:config});service.kill();await new Promise(r=>service.once('exit',r))
 await start();status=await(await fetch(base+'/gamepad/status')).json();assert.equal(status.enabled,false);assert.equal(status.firmwareRecoveryPending,false)
 actual=await read();for(const e of journal.entries)assert.equal(actual.remaps[`0:${e.layer}:${e.pos}`],e.value)
 console.log(`Fast stream: ${frames} frames; service stayed at ${status.hall.consumers.length} Hall consumers after recovery`)
 await post('/shutdown');await new Promise(r=>service.once('exit',r))
})
