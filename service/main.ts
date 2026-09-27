import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { CustomRgbEngine, restoreCustomRgb } from '../src/keyboard/customRgb'
import { defaultRgb, type RgbProfile } from '../src/protocol/hero68/rgb'
import { buildReport, decodeReport } from '../src/protocol/hero68/codec'
import { HERO68_KEY_IDS } from '../src/keyboard/hero68Layout'
import { HERO68_KEY_POSITIONS } from '../src/protocol/hero68/keyPositions'
import { framePackets } from './frame'

const port=16868
const stateDir=path.join(process.env.LOCALAPPDATA??process.cwd(),'OpenHero68','rgb-service')
mkdirSync(stateDir,{recursive:true})
const log=(message:string)=>appendFileSync(path.join(stateDir,'service.log'),`${new Date().toISOString()} ${message}\n`)
const origins=new Set(['https://shizuna.ddns.net:5173','http://localhost:5173','https://localhost:5173','http://127.0.0.1:5173','https://127.0.0.1:5173',`http://127.0.0.1:${port}`,`http://localhost:${port}`])
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
let profile:RgbProfile|null=null, enabled=false, connected=false, closing=false
try{const saved=JSON.parse(readFileSync(path.join(stateDir,'preset.json'),'utf8'));profile=normalizeProfile(saved.profile);enabled=saved.enabled===true}catch{}
function persist(){const file=path.join(stateDir,'preset.json');writeFileSync(file+'.tmp',JSON.stringify({version:1,enabled,profile}));renameSync(file+'.tmp',file)}
let engine=profile?new CustomRgbEngine(profile):null, epoch=performance.now(), reconnectAt=0
let lastError:string|null=null, frames=0, packets=0, hallSnapshots=0, timeouts=0, lastFrameAt=0, maxGapMs=0, frameMs=0
let windowStart=performance.now(), windowFrames=0, fps=0
let tail:Promise<unknown>=Promise.resolve()
function exclusive<T>(work:()=>Promise<T>):Promise<T>{const next=tail.then(work);tail=next.catch(()=>{});return next}

class Bridge {
  private process=spawn(path.join(__dirname,'hid-bridge.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true})
  private pending:{resolve:(v:string)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null
  private gone=false
  constructor(){
    createInterface({input:this.process.stdout}).on('line',line=>{const p=this.pending;if(p){this.pending=null;clearTimeout(p.timer);p.resolve(line)}})
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
  async request(packet:Uint8Array){
    const result=await this.line(Buffer.from(packet).toString('hex'))
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
  connected=true;lastError=null;engine=profile?new CustomRgbEngine(profile):null;epoch=performance.now();lastFrameAt=0
  log('HERO68 connected')
}
async function stop(){
  enabled=false
  if(connected){try{await bridge.request(buildReport({command:8,zone:2,data:[0,0,0]}))}catch(e){lastError=String(e)}}
  engine?.releaseAll();connected=false;await bridge.close();persist();log('RGB stopped')
}
async function tick(){
  if(!enabled||!profile||!engine||closing)return
  if(!connected){if(performance.now()<reconnectAt)return;await connect()}
  const started=performance.now()
  engine!.advance(started-epoch+110)
  const reactive=profile.custom!.layers.some(l=>l.enabled&&!['scan','breath'].includes(l.effect))||[4,7,9,12].includes(profile.custom!.base.mode)
  if(reactive){
    const travel:Record<string,number>={}
    for(let i=0;i<HERO68_KEY_IDS.length;i+=9){
      const ids=HERO68_KEY_IDS.slice(i,i+9), positions=ids.map(id=>HERO68_KEY_POSITIONS[id])
      const reply=await bridge.request(buildReport({command:0x98,zone:1,data:positions.flatMap(p=>[p>>8,p&255])}))
      if(reply.data.length!==ids.length*6)throw Error('Incomplete Hall snapshot')
      ids.forEach((id,j)=>{const d=reply.data,o=j*6;if(d[o]*256+d[o+1]!==positions[j])throw Error('Hall position mismatch');travel[id]=(d[o+2]*256+d[o+3])/100;engine!.event(id,(d[o+4]&128)!==0)})
    }
    engine!.setTravel(travel);hallSnapshots++
  }
  for(const packet of framePackets(engine!.frame().keys))await bridge.request(packet)
  const now=performance.now();if(lastFrameAt)maxGapMs=Math.max(maxGapMs,now-lastFrameAt)
  lastFrameAt=now;frameMs=now-started;frames++;windowFrames++
}
let timer:ReturnType<typeof setTimeout>
let nextFrame=performance.now()
async function loop(){
  const start=performance.now()
  try{await exclusive(tick)}catch(e){connected=false;engine?.releaseAll();lastError=e instanceof Error?e.message:String(e);timeouts++;reconnectAt=performance.now()+1000;log(`HID error: ${lastError}`);await exclusive(()=>bridge.close()).catch(()=>{})}
  const now=performance.now();if(now-windowStart>=1000){fps=windowFrames*1000/(now-windowStart);windowFrames=0;windowStart=now}
  if(!closing){
    if(enabled){nextFrame=Math.max(nextFrame+25,start+25);await exclusive(()=>bridge.wait(nextFrame-performance.now())).catch(()=>{});if(!closing)setImmediate(()=>void loop())}
    else {nextFrame=performance.now();timer=setTimeout(loop,250)}
  }
}
function status(){return {service:'OpenHero68 RGB',version:1,enabled,connected,preset:!!profile,fps,frameMs,frames,packets,hallSnapshots,timeouts,maxGapMs,lastError,targetFps:40,paletteColors:32,sideOutput:false}}
const panel=`<!doctype html><meta charset="utf-8"><title>Hero68 RGB Service</title><style>body{font:16px system-ui;background:#171a1b;color:#eee;max-width:740px;margin:60px auto;padding:20px}button,input{padding:12px;margin:8px}pre{white-space:pre-wrap}button{cursor:pointer}</style><h1>Hero68 RGB Service</h1><p>Custom RGB continues while the web editor is closed. Import a preset, or use Start service RGB in Open-Hero68.</p><input id="file" type="file" accept=".json"><button onclick="start()">Start saved preset</button><button onclick="post('/stop')">Stop RGB</button><button onclick="post('/shutdown')">Exit service</button><pre id="status"></pre><script>async function post(url,data={}){try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!r.ok)alert((await r.json()).error)}catch(e){alert(e.message)}}async function start(){const f=document.getElementById('file').files[0];if(f){const p=JSON.parse(await f.text());await post('/start',p.profile||p)}else await post('/start')}setInterval(async()=>{try{document.getElementById('status').textContent=JSON.stringify(await(await fetch('/status')).json(),null,2)}catch{document.getElementById('status').textContent='Service stopped'}},1000)</script>`
const server=createServer(async(req,res)=>{
  const origin=req.headers.origin
  res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin')
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host??'')||(origin&&!origins.has(origin))){res.writeHead(403).end();return}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin)
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true')
  if(req.method==='OPTIONS'){res.writeHead(204).end();return}
  const json=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify(value))}
  try{
    if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(panel);return}
    if(req.method==='GET'&&req.url==='/status'){json(200,status());return}
    if(req.method!=='POST'||!['/start','/stop','/preset','/shutdown'].includes(req.url??'')){json(404,{error:'Unknown endpoint'});return}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(415,{error:'Expected application/json'});return}
    let body='',size=0
    for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Preset too large');body+=chunk}
    const input=JSON.parse(body||'{}')
    await exclusive(async()=>{
      if(req.url==='/stop'||req.url==='/shutdown'){await stop();return}
      if(req.url==='/preset'||Object.keys(input).length){profile=normalizeProfile(input);engine?.releaseAll();engine=new CustomRgbEngine(profile);epoch=performance.now();persist()}
      if(req.url==='/start'){if(!profile)throw Error('Send a preset first');enabled=true;reconnectAt=0;frames=0;packets=0;hallSnapshots=0;timeouts=0;maxGapMs=0;lastFrameAt=0;persist();log('RGB started')}
    })
    json(200,status())
    if(req.url==='/shutdown')void shutdown()
  }catch(e){json(400,{error:e instanceof Error?e.message:String(e)})}
})
async function shutdown(){if(closing)return;closing=true;clearTimeout(timer);await exclusive(stop).catch(e=>log(String(e)));bridge.end();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref()}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown())
process.on('uncaughtException',e=>{log(e.stack??e.message);void shutdown()})
server.on('error',e=>{log(`Server error: ${e.message}`);bridge.end();process.exitCode=1})
server.listen(port,'127.0.0.1',()=>{log(`Service listening on 127.0.0.1:${port}`);void loop()})
