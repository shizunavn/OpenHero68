import assert from 'node:assert/strict'
import {test} from 'node:test'
import {rolldown} from 'rolldown'
async function load(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {CustomRgbSession,customSignature}=await load('src/protocol/customRgbSession.ts')
const {defaultRgb}=await load('src/protocol/hero68/rgb.ts'),{defaultCustomRgb}=await load('src/keyboard/customRgbModel.ts')
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
function profile(brightness=20){const p=defaultRgb();p.custom=defaultCustomRgb(p);p.custom.base.brightness=brightness;return p}
const status=(p,revision=0,session='one')=>({enabled:true,mode:'custom',sessionId:session,customRevision:revision,customConfiguration:p})
function fixture(draft=profile(),send){let current=draft;const writes=[],backups=[],states=[];let refreshed=0,remote=status(profile())
 const q=new CustomRgbSession({draft:()=>current,adopt:p=>current=p,backup:p=>backups.push(p),write:async(p,s,r)=>{writes.push({p,s,r});if(send)return send(p,s,r);remote=status(p,r+1,s);return remote},status:v=>{remote=v;q.observe(v)},state:v=>states.push(v),refresh:()=>refreshed++,interval:5})
 return{q,writes,backups,states,get current(){return current},get refreshed(){return refreshed},set(p){current=p;q.stage(p)}}
}
test('joining matching or different running Custom never writes; onboard fields survive and drafts are recoverable',async()=>{
 const draft=profile(10);draft.keys.mode=3;draft.side.mode=4
 const f=fixture(draft);f.q.observe(status(profile(15),4));await wait(20)
 assert.equal(f.writes.length,0);assert.equal(f.current.custom.base.brightness,15);assert.equal(f.current.keys.mode,3);assert.equal(f.current.side.mode,4);assert.equal(f.backups.length,1)
 f.q.stage(f.current);await wait(20);assert.equal(f.writes.length,0)
 f.q.observe(status(profile(15),4));assert.equal(f.backups.length,1);f.q.dispose()
})
test('continuous edits keep one flight and latest draft; old ACK cannot change the editor or lose paint',async()=>{
 const first=deferred();let inFlight=0,max=0
 const f=fixture(profile(),async(p,s,r)=>{inFlight++;max=Math.max(max,inFlight);if(r===0)await first.promise;inFlight--;return status(p,r+1,s)})
 f.q.observe(status(profile()));f.set(profile(10));await wait(10)
 const painted=profile(12);painted.colors.KeyW=[0,0,0];f.set(profile(11));f.set(painted)
 await wait(15);assert.equal(f.writes.length,1);first.resolve();await wait(25)
 assert.deepEqual(f.writes.map(v=>v.r),[0,1]);assert.deepEqual(f.current.colors.KeyW,[0,0,0]);assert.equal(max,1);f.q.dispose()
})
test('external revision is adopted only when idle; stale polls cannot roll back an ACK',async()=>{
 const f=fixture();f.q.observe(status(profile()));f.set(profile(10));await wait(20)
 f.q.observe(status(profile(),0));assert.equal(f.current.custom.base.brightness,10)
 f.q.observe(status(profile(7),2));assert.equal(f.current.custom.base.brightness,7);assert.equal(f.writes.length,1);f.q.dispose()
})
test('reentering Custom preserves the onboard paint draft and rejoins an unchanged revision without writing',async()=>{
 const f=fixture();const remote=status(profile(),4);f.q.observe(remote)
 f.current.colors.KeyW=[0,0,0]
 f.q.join(remote);await wait(15)
 assert.equal(f.writes.length,0);assert.deepEqual(f.current.colors.KeyW,remote.customConfiguration.colors.KeyW)
 assert.deepEqual(f.backups.at(-1).colors.KeyW,[0,0,0]);f.q.dispose()
})
test('a conflict preserves the latest draft and stops writes until explicit recovery',async()=>{
 let fail=true;const f=fixture(profile(),async(p,s,r)=>{if(fail)throw Object.assign(Error('conflict'),{status:409});return status(p,r+1,s)})
 f.q.observe(status(profile()));f.set(profile(9));await wait(20)
 assert.equal(f.states.at(-1).conflict,true);assert.equal(f.backups.at(-1).custom.base.brightness,9);assert.equal(f.refreshed,1)
 f.q.observe(status(profile(6),2));f.set(profile(8));await wait(15);assert.equal(f.writes.length,1)
 fail=false;f.q.resolve(f.backups.at(-1));await wait(20);assert.equal(f.writes[1].r,2);assert.equal(f.states.at(-1).conflict,false);f.q.dispose()
})
test('new sessions discard queued old writes; demo and disposal never write',async()=>{
 const f=fixture();f.q.observe(status(profile()));f.q.setSuspended(true);f.set(profile(8));await wait(20);assert.equal(f.writes.length,0)
 f.q.setSuspended(false);f.q.observe(status(profile(12),0,'two'));assert.equal(f.current.custom.base.brightness,12)
 f.q.stage(profile(12));f.q.dispose();await wait(20);assert.equal(f.writes.length,0)
})
test('Stop drains in-flight edits and cancels unsent drafts before switching mode',async()=>{
 const d=deferred(),f=fixture(profile(),async(p,s,r)=>{await d.promise;return status(p,r+1,s)})
 f.q.observe(status(profile()));f.set(profile(8));await wait(10);f.set(profile(9));let stopped=false
 const stop=f.q.pause().then(()=>stopped=true);await wait(10);assert.equal(stopped,false)
 d.resolve();await stop;assert.equal(f.writes.length,1);assert.equal(f.states.at(-1).session,null);f.q.dispose()
})
test('enabled flags and object property order in colors do not make a matching preset dirty',()=>{
 const a=profile(),b=structuredClone(a);b.custom.enabled=true;b.colors=Object.fromEntries(Object.entries(b.colors).reverse());assert.equal(customSignature(a),customSignature(b))
})
const {deferredSave}=await load('service/deferredSave.ts')
test('persistence coalesces, Stop flushes once, canceled timers cannot write later',async()=>{
 let n=0,errors=0;const d=deferredSave(()=>n++,()=>errors++,15)
 for(let i=0;i<5;i++){d.schedule();await wait(3)}assert.equal(n,0);await wait(25);assert.equal(n,1)
 d.schedule();d.flush();await wait(25);assert.equal(n,2);d.schedule();d.cancel();await wait(25);assert.equal(n,2);assert.equal(errors,0)
})
