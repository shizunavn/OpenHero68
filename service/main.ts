import { createServer, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import { CustomRgbEngine, restoreCustomRgb, CUSTOM_RGB_EFFECTS, needsRgbAnalogHall } from '../src/keyboard/customRgb'
import { defaultRgb, type RgbProfile } from '../src/protocol/hero68/rgb'
import { buildReport, decodeReport } from '../src/protocol/hero68/codec'
import { HERO68_KEY_IDS } from '../src/keyboard/hero68Layout'
import { HERO68_KEY_POSITIONS } from '../src/protocol/hero68/keyPositions'
import { RgbFrameEncoder } from './frame'
import { validateDeviceRequest } from './deviceRequests'
import { decodeHero68Input } from './keyInput'
import { serviceOrigins, isAllowedServiceRequest } from './origins'
import {LAUNCHER_VERSION,CORE_VERSION,CORE_API_VERSION} from './updatePackage'
import {createServiceUpdater} from './updater'

const port=16868
const stateDir=path.join(process.env.LOCALAPPDATA??process.cwd(),'OpenHero68','rgb-service')
const coreVersion=process.env.OPENHERO68_CORE_VERSION??CORE_VERSION
mkdirSync(stateDir,{recursive:true})
const log=(message:string)=>appendFileSync(path.join(stateDir,'service.log'),`${new Date().toISOString()} ${message}\n`)
const origins=serviceOrigins(port)
for(let i=2;i<process.argv.length;i++)if(process.argv[i]==='--allow-origin'&&process.argv[i+1])origins.add(new URL(process.argv[++i]).origin)

export function normalizeProfile(input:unknown):RgbProfile {
  if(!input||typeof input!=='object')throw Error('Expected RGB profile')
  const value=input as RgbProfile, profile=defaultRgb()
  if(value.custom?.version!==1||!value.custom.base||!Array.isArray(value.custom.layers))throw Error('Missing custom RGB configuration')
  for(const id of HERO68_KEY_IDS){
    const color=value.colors?.[id]
    if(!Array.isArray(color)||color.length!==3||color.some(c=>!Number.isInteger(c)||c<0||c>255))throw Error(`Invalid color for ${id}`)
    profile.colors[id]=[...color]
  }
  profile.custom=restoreCustomRgb(value.custom,profile)
  // Side LEDs keep their onboard effect. CMD08 only addresses the main keys.
  profile.side.mode=0
  return profile
}
let profile:RgbProfile|null=null, mode:'onboard'|'custom'='onboard', connected=false, closing=false, updating=false
try{const saved=JSON.parse(readFileSync(path.join(stateDir,'preset.json'),'utf8'));profile=normalizeProfile(saved.profile);mode=saved.mode==='custom'||(saved.mode===undefined&&saved.enabled===true)?'custom':'onboard'}catch{}
function persist(){
  const file=path.join(stateDir,'preset.json')
  try{
    const old=JSON.parse(readFileSync(file,'utf8'))
    const previous=old.profile?.custom?.layers?.map((layer:{id:string;effect:string})=>`${layer.id}:${layer.effect}`).join('|')
    const current=profile?.custom?.layers?.map(layer=>`${layer.id}:${layer.effect}`).join('|')
    if(previous!==current)writeFileSync(path.join(stateDir,`preset-layer-backup-${Date.now()}.json`),JSON.stringify(old))
  }catch{/* No previous valid preset. */}
  writeFileSync(file+'.tmp',JSON.stringify({version:2,mode,enabled:mode==='custom',profile}));renameSync(file+'.tmp',file)
}
const frameEncoder=new RgbFrameEncoder()
let engine=profile?new CustomRgbEngine(profile):null, epoch=performance.now(), reconnectAt=0
let lastError:string|null=null, frames=0, packets=0, hallSnapshots=0, timeouts=0, lastFrameAt=0, maxGapMs=0, frameMs=0
const eventLoopDelay=monitorEventLoopDelay({resolution:5});eventLoopDelay.enable()
const frameGaps:number[]=[]
let gapsOver100=0,lastLongGapAt:string|null=null
let sessionId=randomUUID(),frameSequence=0
let rawInputReady=false, inputTransitions=0
const outputHeld=new Set<string>(),inputLatencies:number[]=[]
const pendingInputs:number[]=[]
let windowStart=performance.now(), windowFrames=0, fps=0
const frameClients=new Set<ServerResponse>()
type HallRecord={keyId:string;pos:number;distanceUnits:number;adc:number;pressed:boolean}
type HallClient={keys:Set<string>;pending:Map<string,HallRecord>;lastSent:number}
const hallClients=new Map<ServerResponse,HallClient>()
const hallSamples=new Map<string,HallRecord>()
let nextPriorityAt=0,nextSecondaryAt=0,secondaryIndex=0,hallPolls=0,priorityCount=0,secondaryCount=0
const priorityHallIntervalMs=10
function needsAnalogHall(){return mode==='custom'&&needsRgbAnalogHall(profile?.custom)}
function publishHall(records:HallRecord[]){
  const now=performance.now()
  for(const [client,subscription] of hallClients){
    if(client.destroyed||client.writableLength>65536){client.destroy();hallClients.delete(client);continue}
    for(const record of records)if(subscription.keys.has(record.keyId))subscription.pending.set(record.keyId,record)
    if(!subscription.pending.size||now-subscription.lastSent<(subscription.keys.size>10?32:0))continue
    client.write(`data: ${JSON.stringify({records:[...subscription.pending.values()]})}\n\n`)
    subscription.pending.clear();subscription.lastSent=now
  }
}
async function pollHall(){
  if(closing||(!hallClients.size&&!needsAnalogHall()))return
  if(!connected)await connect()
  const requested=new Set<string>()
  for(const subscription of hallClients.values())for(const id of subscription.keys)requested.add(id)
  const analog=needsAnalogHall()
  const priority=requested.size>0&&requested.size<=10?[...requested]:[]
  const secondary=(analog?HERO68_KEY_IDS:[...requested]).filter(id=>!priority.includes(id))
  priorityCount=priority.length;secondaryCount=secondary.length
  const now=performance.now()
  let ids:string[]=[]
  if(priority.length&&now>=nextPriorityAt){ids=priority;nextPriorityAt=now+priorityHallIntervalMs}
  else if(secondary.length&&now>=nextSecondaryAt){ids=secondary.slice(secondaryIndex,secondaryIndex+9);secondaryIndex=(secondaryIndex+ids.length)%secondary.length;nextSecondaryAt=now+(priority.length?8:5)}
  if(!ids.length)return
  const records:HallRecord[]=[]
  for(let i=0;i<ids.length;i+=9){
    const batch=ids.slice(i,i+9),positions=batch.map(id=>HERO68_KEY_POSITIONS[id])
    const reply=await bridge.request(buildReport({command:0x98,zone:1,data:positions.flatMap(p=>[p>>8,p&255])}))
    if(reply.data.length!==batch.length*6)throw Error('Incomplete Hall snapshot')
    batch.forEach((keyId,j)=>{
      const d=reply.data,o=j*6,pos=d[o]*256+d[o+1]
      if(pos!==positions[j])throw Error('Hall position mismatch')
      const adcWord=d[o+4]*256+d[o+5]
      const record={keyId,pos,distanceUnits:d[o+2]*256+d[o+3],adc:adcWord&0x7fff,pressed:!!(adcWord&0x8000)}
      records.push(record);hallSamples.set(keyId,record)
    })
  }
  hallPolls++;hallSnapshots++;publishHall(records)
}
let lastPublishedFrame:unknown=null
function publishFrame(value:unknown){
  lastPublishedFrame=value
  const text=`data: ${JSON.stringify(value)}\n\n`
  for(const client of frameClients){
    if(client.destroyed||client.writableLength>65536){client.destroy();frameClients.delete(client)}
    else client.write(text)
  }
}
let tail:Promise<unknown>=Promise.resolve()
function exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work);tail=next.catch(()=>{});return next}

class Bridge {
  private process=spawn(path.join(__dirname,'hid-bridge.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true})
  private pending:{resolve:(v:string)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null
  private gone=false
  constructor(){
    createInterface({input:this.process.stdout}).on('line',line=>{
      if(line==='raw:ready'||line==='raw:unavailable'){rawInputReady=line==='raw:ready';return}
      if(line.startsWith('key:')){
        const input=decodeHero68Input(line)
        if(input&&mode==='custom'&&engine){
          if(input.pressed?outputHeld.has(input.id):!outputHeld.has(input.id))return
          if(input.pressed)outputHeld.add(input.id);else outputHeld.delete(input.id)
          const at=performance.now();pendingInputs.push(at);engine.advance(at-epoch+110);engine.event(input.id,input.pressed);inputTransitions++
        }
        return
      }
      const p=this.pending;if(p){this.pending=null;clearTimeout(p.timer);p.resolve(line)}
    })
    this.process.stderr.on('data',data=>log(`bridge: ${data}`))
    this.process.on('error',e=>this.fail(e));this.process.on('exit',()=>this.fail(Error('Native HID bridge exited')))
  }
  private fail(e:Error){this.gone=true;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(e);this.pending=null}}
  async line(value:string){
    if(this.gone)throw Error('Native HID bridge unavailable; restart service')
    if(this.pending)throw Error('Concurrent HID operation')
    return new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.fail(Error('Native HID bridge stalled'));this.process.kill()},2000)
      this.pending={resolve,reject,timer};this.process.stdin.write(value+'\n',e=>{if(e)this.fail(e)})
    })
  }
  async request(packet:Uint8Array,sendOnly=false){
    const result=await this.line((sendOnly?'send:':'')+Buffer.from(packet).toString('hex'))
    if(result.startsWith('error:'))throw Error(result.slice(6))
    if(!/^[0-9a-f]{128}$/.test(result))throw Error('Invalid bridge response')
    const reply=decodeReport(Uint8Array.from(Buffer.from(result,'hex')))
    if(reply.command!==packet[1]||reply.zone!==packet[2])throw Error('Unexpected HID response')
    packets++;return reply
  }
  async close(){await this.line('close')}
  async wait(ms:number){await this.line(`wait:${Math.max(0,Math.min(25,ms))}`)}
  end(){this.process.stdin.end()}
}
const bridge=new Bridge()
async function connect(){
  const identity=await bridge.request(buildReport({command:0x82,zone:1}))
  if(![0x11,0,0,0,0,3].every((v,i)=>identity.data[i]===v))throw Error('Device is not the supported HERO68')
  connected=true;lastError=null;hallSamples.clear();frameEncoder.reset();engine=profile?new CustomRgbEngine(profile):null;epoch=performance.now();lastFrameAt=0
  log('HERO68 connected')
}
async function stop(){
  mode='onboard'
  sessionId=randomUUID();frameSequence=0
  if(connected){try{await bridge.request(buildReport({command:8,zone:2,data:[0,0,0]}))}catch(e){lastError=String(e)}}
  engine?.releaseAll();outputHeld.clear();pendingInputs.length=0;persist();log('Onboard RGB restored')
  publishFrame({enabled:false,connected:false})
}
async function tick(){
  if(mode!=='custom'||!profile||!engine||closing)return
  if(!connected){if(performance.now()<reconnectAt)return;await connect()}
  const started=performance.now()
  engine!.advance(started-epoch+110)
  if(needsAnalogHall())engine!.setTravel(Object.fromEntries([...hallSamples].map(([id,s])=>[id,s.distanceUnits/100])))
  const frame=frameEncoder.prepare(engine!.frame().keys)
  for(const packet of frame.packets)await bridge.request(packet)
  const now=performance.now();while(pendingInputs.length&&pendingInputs[0]<=started){inputLatencies.push(now-pendingInputs.shift()!);if(inputLatencies.length>256)inputLatencies.shift()}
  if(lastFrameAt){
    const gap=now-lastFrameAt
    maxGapMs=Math.max(maxGapMs,gap);frameGaps.push(gap);if(frameGaps.length>512)frameGaps.shift()
    if(gap>100){gapsOver100++;lastLongGapAt=new Date().toISOString();log(`RGB frame gap ${gap.toFixed(1)}ms`)}
  }
  lastFrameAt=now;frameMs=now-started;frames++;windowFrames++
  if(frameClients.size)publishFrame({enabled:true,connected:true,keys:frame.keys,sequence:++frameSequence,sessionId})
  else frameSequence++
}
let timer:ReturnType<typeof setTimeout>
let nextFrame=performance.now()
async function loop(){
  const start=performance.now()
  try{await exclusive(tick)}catch(e){connected=false;publishFrame({enabled:mode==='custom',connected:false});engine?.releaseAll();outputHeld.clear();lastError=e instanceof Error?e.message:String(e);timeouts++;reconnectAt=performance.now()+1000;log(`HID error: ${lastError}`);await exclusive(()=>bridge.close()).catch(()=>{})}
  const now=performance.now();if(now-windowStart>=1000){fps=windowFrames*1000/(now-windowStart);windowFrames=0;windowStart=now}
  if(!closing){
    if(mode==='custom'){
      nextFrame=Math.max(nextFrame+25,start+25)
      if(!hallClients.size&&!needsAnalogHall()){
        await exclusive(()=>bridge.wait(nextFrame-performance.now())).catch(()=>{})
        if(!closing)setImmediate(()=>void loop())
      }else timer=setTimeout(loop,Math.max(0,nextFrame-performance.now()))
    }
    else {nextFrame=performance.now();timer=setTimeout(loop,250)}
  }
}
let hallTimer:ReturnType<typeof setTimeout>
async function hallLoop(){
  try{await exclusive(pollHall)}catch(e){
    connected=false;lastError=e instanceof Error?e.message:String(e);timeouts++;log(`Hall error: ${lastError}`)
    for(const client of hallClients.keys())client.end()
    hallClients.clear();await exclusive(()=>bridge.close()).catch(()=>{})
  }
  if(closing)return
  if(!hallClients.size&&!needsAnalogHall()){hallTimer=setTimeout(hallLoop,50);return}
  const now=performance.now()
  const due=Math.min(priorityCount?nextPriorityAt:Infinity,secondaryCount?nextSecondaryAt:Infinity)
  const delay=Math.max(0,Math.min(5,due-now))
  if(delay>0.5)await exclusive(()=>bridge.wait(delay)).catch(()=>{})
  if(!closing)setImmediate(()=>void hallLoop())
}
function status(){const values=[...inputLatencies].sort((a,b)=>a-b),gaps=[...frameGaps].sort((a,b)=>a-b);return {service:'OpenHero68 RGB',version:2,apiVersion:CORE_API_VERSION,supportedEffects:CUSTOM_RGB_EFFECTS.map(effect=>effect.id),supportedBaseEffects:["aurora"],pid:process.pid,coreVersion,launcherVersion:LAUNCHER_VERSION,mode,enabled:mode==='custom',connected,preset:!!profile,sessionId,fps,frameMs,frames,packets,hallSnapshots,hallPolls,hallClients:hallClients.size,timeouts,maxGapMs,frameGapP95Ms:gaps.length?gaps[Math.ceil(gaps.length*.95)-1]:null,frameGapP99Ms:gaps.length?gaps[Math.ceil(gaps.length*.99)-1]:null,gapsOver100,lastLongGapAt,eventLoopDelayP99Ms:eventLoopDelay.percentile(99)/1e6,eventLoopDelayMaxMs:eventLoopDelay.max/1e6,lastError,rawInputReady,inputTransitions,inputToLedP95Ms:values.length?values[Math.ceil(values.length*.95)-1]:null,targetFps:40,paletteColors:32,sideOutput:false}}
const {latestCore,downloadFullPackage,stageCoreUpdate}=createServiceUpdater({coreVersion,launcherVersion:LAUNCHER_VERSION,stateDir})
const panel=`<!doctype html><meta charset="utf-8"><title>Hero68 RGB Service</title><style>body{font:16px system-ui;background:#171a1b;color:#eee;max-width:740px;margin:60px auto;padding:20px}button,input{padding:12px;margin:8px}pre{white-space:pre-wrap}button{cursor:pointer}</style><h1>Hero68 RGB Service</h1><p>Custom RGB continues while the web editor is closed. Import a preset, or use Start service RGB in Open-Hero68.</p><input id="file" type="file" accept=".json"><button onclick="start()">Start saved preset</button><button onclick="post('/mode',{mode:'onboard'})">Use onboard RGB</button><button onclick="checkUpdate()">Check for updates</button><button onclick="post('/shutdown')">Exit service</button><pre id="update"></pre><pre id="status"></pre><script>async function post(url,data={}){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)alert(result.error);return result}catch(e){alert(e.message)}}async function start(){const f=document.getElementById('file').files[0];if(f){const p=JSON.parse(await f.text());await post('/start',p.profile||p)}else await post('/start')}async function checkUpdate(){try{const r=await fetch('/updates');const v=await r.json();document.getElementById('update').textContent=JSON.stringify(v,null,2);if(v.available&&!v.requiresFullPackage&&confirm('Install signed core update '+v.version+'?'))await post('/updates/apply')}catch(e){document.getElementById('update').textContent=e.message}}setInterval(async()=>{try{document.getElementById('status').textContent=JSON.stringify(await(await fetch('/status')).json(),null,2)}catch{document.getElementById('status').textContent='Service stopped'}},1000)</script>`
const server=createServer(async(req,res)=>{
  const origin=req.headers.origin
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin')
  if(!isAllowedServiceRequest(req.headers.host,origin,origins,port)){res.writeHead(403).end();return}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin)
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true')
  if(req.method==='OPTIONS'){res.writeHead(204).end();return}
  const json=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify(value))}
  const plain=(code:number,value:string)=>{res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'}).end(value)}
  try{
    if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(panel);return}
    if(req.method==='GET'&&req.url==='/status'){json(200,status());return}
    if(req.method==='GET'&&req.url==='/updates'){const latest=await latestCore();json(200,{coreVersion,...latest});return}
    if(req.method==='GET'&&req.url==='/frames'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'})
      res.write(': connected\n\n');frameClients.add(res)
      if(lastPublishedFrame)res.write(`data: ${JSON.stringify(lastPublishedFrame)}\n\n`)
      const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);heartbeat.unref()
      req.on('close',()=>{clearInterval(heartbeat);frameClients.delete(res)});return
    }
    if(req.method==='GET'&&req.url?.startsWith('/hall/stream?')){
      const ids=new URL(req.url,`http://127.0.0.1:${port}`).searchParams.get('keys')?.split(',')??[]
      if(ids.length<1||ids.length>HERO68_KEY_IDS.length||ids.some(id=>!HERO68_KEY_IDS.includes(id)))throw Error('Expected 1-68 valid Hall keys')
      const keys=new Set(ids)
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'})
      res.write(': connected\n\n');hallClients.set(res,{keys,pending:new Map(),lastSent:0})
      const initial=[...hallSamples.values()].filter(record=>keys.has(record.keyId))
      if(initial.length)res.write(`data: ${JSON.stringify({records:initial})}\n\n`)
      const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);heartbeat.unref()
      req.on('close',()=>{clearInterval(heartbeat);hallClients.delete(res)});return
    }
    if(req.method!=='POST'||!['/start','/stop','/mode','/preset','/shutdown','/updates/apply','/updates/tray-check','/device/request','/device/batch'].includes(req.url??'')){json(404,{error:'Unknown endpoint'});return}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(415,{error:'Expected application/json'});return}
    let body='',size=0
    for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Preset too large');body+=chunk}
    const input=JSON.parse(body||'{}')
    if(updating&&req.url!=='/shutdown')throw Error('Core update in progress')
    if(req.url==='/updates/tray-check'){
      const release=await latestCore()
      if(!release.available){plain(200,`none|${coreVersion}`);return}
      if(release.requiresFullPackage){const file=await downloadFullPackage(release);plain(200,`package|${release.version}|${file}`);return}
      updating=true
      try{const version=await stageCoreUpdate(release);plain(200,`core|${version}`);setTimeout(()=>void restartForUpdate(),250).unref();return}
      catch(e){updating=false;throw e}
    }
    if(req.url==='/updates/apply'){
      updating=true
      try{await exclusive(async()=>{});const version=await stageCoreUpdate();json(200,{staged:true,version});setImmediate(()=>void restartForUpdate());return}
      catch(e){updating=false;throw e}
    }
    if(req.url==='/device/request'||req.url==='/device/batch'){
      const batch=req.url==='/device/batch'
      const requests:ReturnType<typeof validateDeviceRequest>[]=batch?(Array.isArray(input.requests)&&input.requests.length>0&&input.requests.length<=128?input.requests.map(validateDeviceRequest):(()=>{throw Error('Expected 1-128 device requests')})()):[validateDeviceRequest(input)]
      if(batch&&requests.some(({reenumerate})=>reenumerate))throw Error('Re-enumeration requires a standalone request')
      const replies=await exclusive(async()=>{
        if(!connected)await connect()
        const replies:string[]=[]
        for(const {packet,reenumerate} of requests){
          let reply:Awaited<ReturnType<Bridge['request']>>|undefined
          const attempts=batch&&[0x19,0x16,0x15].includes(packet[1])?3:1
          for(let i=0;i<attempts;i++){
            try{reply=await bridge.request(packet,reenumerate);break}
            catch(e){if(i===attempts-1)throw e;await new Promise(resolve=>setTimeout(resolve,100))}
          }
          if(!reply)throw Error('Missing HID reply')
          replies.push(Buffer.from(reply.raw).toString('hex'))
          if(reenumerate){
            connected=false;await bridge.close()
            const deadline=performance.now()+7000;let recovered=false
            while(performance.now()<deadline){await new Promise(resolve=>setTimeout(resolve,120));try{await connect();recovered=true;break}catch{await bridge.close()}}
            if(!recovered)throw Error('HERO68 did not return after polling-rate change')
          }
        }
        return replies
      })
      json(200,batch?{hexes:replies}:{hex:replies[0]});return
    }
    await exclusive(async()=>{
      if(req.url==='/stop'||req.url==='/shutdown'||(req.url==='/mode'&&input.mode==='onboard')){await stop();return}
      if(req.url==='/mode'&&input.mode!=='custom')throw Error('Expected onboard or custom mode')
      if(req.url==='/preset'&&input.sessionId!==sessionId)throw Error('Stale RGB editor session; preset was not applied')
      if(req.url==='/preset'||(req.url==='/start'&&Object.keys(input).length)||(req.url==='/mode'&&input.profile)){profile=normalizeProfile(req.url==='/mode'||req.url==='/preset'?input.profile:input);if(engine)engine.configure(profile);else{engine=new CustomRgbEngine(profile);epoch=performance.now()}persist()}
      if(req.url==='/start'||req.url==='/mode'){if(!profile)throw Error('Send a preset first');mode='custom';frameEncoder.reset();sessionId=randomUUID();frameSequence=0;publishFrame({enabled:true,connected,sessionId,sequence:0});reconnectAt=0;frames=0;packets=0;hallSnapshots=0;timeouts=0;maxGapMs=0;gapsOver100=0;lastLongGapAt=null;frameGaps.length=0;eventLoopDelay.reset();lastFrameAt=0;persist();log('Custom RGB started')}
    })
    json(200,status())
    if(req.url==='/shutdown')void shutdown()
  }catch(e){json(400,{error:e instanceof Error?e.message:String(e)})}
})
async function shutdown(){if(closing)return;closing=true;clearTimeout(timer);clearTimeout(hallTimer);publishFrame({enabled:false,connected:false,shuttingDown:true});await exclusive(stop).catch(e=>log(String(e)));for(const client of frameClients)client.end();for(const client of hallClients.keys())client.end();await exclusive(()=>bridge.close()).catch(()=>{});bridge.end();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref()}
async function restartForUpdate(){if(closing)return;closing=true;clearTimeout(timer);clearTimeout(hallTimer);publishFrame({enabled:false,connected:false,shuttingDown:true});for(const client of frameClients)client.end();for(const client of hallClients.keys())client.end();await exclusive(()=>bridge.close()).catch(()=>{});bridge.end();server.close(()=>process.exit(73));setTimeout(()=>process.exit(73),1000).unref()}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown())
process.on('uncaughtException',e=>{log(e.stack??e.message);void shutdown()})
server.on('error',e=>{log(`Server error: ${e.message}`);bridge.end();process.exitCode=1})
server.listen(port,'127.0.0.1',()=>{log(`Service listening on 127.0.0.1:${port}`);void loop();void hallLoop()})
