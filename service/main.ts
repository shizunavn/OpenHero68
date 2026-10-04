import { createServer, type ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, existsSync,unlinkSync,openSync,fsyncSync,closeSync } from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import path from 'node:path'
import { performance, monitorEventLoopDelay } from 'node:perf_hooks'
import { restoreCustomRgb, CUSTOM_RGB_EFFECTS, needsRgbAnalogHall, rgbHallKeys } from '../src/keyboard/customRgb'
import {HallBroker} from './hallBroker'
import {defaultGamepad,validateGamepad,nativeGamepadCommand,isAnalogAction,type GamepadConfiguration} from '../src/keyboard/gamepad'
import type {GamepadStatus,SharedHallSample,HallKeyMetric} from '../src/protocol/gamepadService'
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
import {defaultRhythm,validateRhythm,nativeRhythmCommand,RHYTHM_MODES,RHYTHM_SIDE_VERIFIED,type RhythmConfiguration} from './rhythm'
import {latestSse} from './latestSse'
import {profileRequest} from './profileSelection'
import {CustomPlayback} from './customPlayback'
import {GamepadFirmware} from './gamepadFirmware'
import {hookConfiguration} from './gamepadKeyboard'
import {selectProfile} from '../src/protocol/hero68/commands'
import {TachyonLighting,validTachyonSnapshot,isTachyonLightingWrite} from '../src/protocol/hero68/tachyonLighting'

function option(name:string){const index=process.argv.indexOf(name);if(index>=0&&!process.argv[index+1])throw Error(`Missing ${name} value`);return index>=0?process.argv[index+1]:undefined}
const port=Number(option('--port')??16868)
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local service port')
const stateDir=option('--state-dir')?path.resolve(option('--state-dir')!):path.join(process.env.LOCALAPPDATA??process.cwd(),'OpenHero68','rgb-service')
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
let tachyon=false
const tachyonFile=path.join(stateDir,'tachyon.json')
let tachyonSnapshot:import('../src/protocol/hero68/tachyonLighting').TachyonLightingSnapshot|null=null
let tachyonPreviousMode:'onboard'|'custom'|'rhythm'='onboard'
try{
  const saved=JSON.parse(readFileSync(tachyonFile,'utf8'))
  tachyon=saved.enabled===true
  if(validTachyonSnapshot(saved.snapshot))tachyonSnapshot=saved.snapshot
  if(['onboard','custom','rhythm'].includes(saved.previousMode))tachyonPreviousMode=saved.previousMode
}catch{}
function persistTachyon(){
  writeFileSync(tachyonFile+'.tmp',JSON.stringify({enabled:tachyon,snapshot:tachyonLighting.snapshot,previousMode:tachyonPreviousMode}))
  renameSync(tachyonFile+'.tmp',tachyonFile)
}
const tachyonLighting=new TachyonLighting(tachyonSnapshot, snapshot=>{tachyonLighting.snapshot=snapshot;persistTachyon()})
let profile:RgbProfile|null=null, mode:'onboard'|'custom'|'rhythm'='onboard', connected=false, closing=false, updating=false
let rhythmConfig:RhythmConfiguration=defaultRhythm(),savedMode:'onboard'|'custom'|'rhythm'='onboard',configurationBusy=false
try{rhythmConfig=validateRhythm(JSON.parse(readFileSync(path.join(stateDir,'rhythm-preset.json'),'utf8')))}catch{}
function persistRhythm(){const file=path.join(stateDir,'rhythm-preset.json');writeFileSync(file+'.tmp',JSON.stringify(rhythmConfig));renameSync(file+'.tmp',file)}
try{const saved=JSON.parse(readFileSync(path.join(stateDir,'preset.json'),'utf8'));if(saved.profile)profile=normalizeProfile(saved.profile);savedMode=saved.savedMode??saved.mode??(saved.enabled?'custom':'onboard');mode=saved.mode==='rhythm'?'rhythm':saved.mode==='custom'||(saved.mode===undefined&&saved.enabled===true)?'custom':'onboard'}catch{}
if(tachyon){
  if(tachyonPreviousMode==='onboard'&&['custom','rhythm'].includes(savedMode))tachyonPreviousMode=savedMode
  mode='onboard'
}
function persist(){
  const file=path.join(stateDir,'preset.json')
  try{
    const old=JSON.parse(readFileSync(file,'utf8'))
    const previous=old.profile?.custom?.layers?.map((layer:{id:string;effect:string})=>`${layer.id}:${layer.effect}`).join('|')
    const current=profile?.custom?.layers?.map(layer=>`${layer.id}:${layer.effect}`).join('|')
    if(previous!==current)writeFileSync(path.join(stateDir,`preset-layer-backup-${Date.now()}.json`),JSON.stringify(old))
  }catch{/* No previous valid preset. */}
  writeFileSync(file+'.tmp',JSON.stringify({version:3,mode,savedMode,enabled:mode!=='onboard',profile}));renameSync(file+'.tmp',file)
}
const frameEncoder=new RgbFrameEncoder()
const playback=new CustomPlayback(profile)
let engine=playback.engine, reconnectAt=0
let lastError:string|null=null, frames=0, packets=0, hallSnapshots=0, timeouts=0, lastFrameAt=0, maxGapMs=0, frameMs=0
const eventLoopDelay=monitorEventLoopDelay({resolution:5});eventLoopDelay.enable()
let cpuPrevious=process.cpuUsage(),cpuAt=performance.now(),cpuPercent=0
const frameGaps:number[]=[]
let gapsOver100=0,lastLongGapAt:string|null=null
let sessionId=randomUUID(),frameSequence=0
let rawInputReady=false, inputTransitions=0
const outputHeld=new Set<string>(),inputLatencies:number[]=[]
const pendingInputs:number[]=[]
let windowStart=performance.now(), windowFrames=0, fps=0
let customSubmission=0,lastCustomSubmission=0,reusedFrames=0,windowRendered=0,renderFps=0,customJob=false,customTickPending=false
const customFrames=new Map<number,{keys:Record<string,string>;started:number;renderMs:number;encodeMs:number}>()
function onCustomTick(){
  if(mode!=='custom'||closing)return
  if(customJob){customTickPending=true;return}
  customJob=true
  void exclusive(tick).catch(e=>{connected=false;lastError=String(e);reconnectAt=performance.now()+1000;publishFrame({enabled:mode!=='onboard',connected:false,sessionId})}).finally(()=>{customJob=false;if(customTickPending){customTickPending=false;onCustomTick()}})
}
function onCustomFrame(value:{submission:number;packets:number;frameMs:number;gapMs:number;droppedFrames:number;reusedFrames:number}){
  if(mode!=='custom')return
  const frame=customFrames.get(value.submission),now=performance.now()
  audioState='stopped';audioError='';audioLevel=0
  connected=true;lastError=null;frames++;windowFrames++;packets+=value.packets;frameMs=value.frameMs;droppedFrames=value.droppedFrames;reusedFrames=value.reusedFrames
  if(value.submission!==lastCustomSubmission){windowRendered++;lastCustomSubmission=value.submission}
  if(frame){renderMs=frame.renderMs;encodeMs=frame.encodeMs;writeMs=value.frameMs}
  if(value.gapMs>0){maxGapMs=Math.max(maxGapMs,value.gapMs);frameGaps.push(value.gapMs);if(frameGaps.length>512)frameGaps.shift();if(value.gapMs>100)gapsOver100++}
  if(frame){while(pendingInputs.length&&pendingInputs[0]<=frame.started){inputLatencies.push(now-pendingInputs.shift()!);if(inputLatencies.length>256)inputLatencies.shift()}if(frameClients.size)publishFrame({enabled:true,connected:true,mode:'custom',keys:frame.keys,sequence:++frameSequence,sessionId})}
  if(!frameClients.size)frameSequence++
}
let audioState='stopped',audioError='',audioLevel=0,audioEndpoint='',sampleRate=0,droppedFrames=0,audioTimestampInvalid=0,renderMs=0,encodeMs=0,writeMs=0
const audioLatencies:number[]=[],captureLatencies:number[]=[]
function onNativeFrame(value:{colors:string[];packets:number;frameMs:number;gapMs:number;droppedFrames:number;audioLevel:number;audioState:string;audioError:string;audioEndpoint:string;sampleRate:number;audioToWriteMs:number;captureToWriteMs:number;audioTimestampInvalid:boolean;renderMs:number;encodeMs:number;writeMs:number}){
  if(mode!=='rhythm'||value.colors?.length!==68)return
  connected=true;lastError=null;frames++;windowFrames++;packets+=value.packets;frameMs=value.frameMs;droppedFrames=value.droppedFrames
  audioState=value.audioState;audioError=value.audioError;audioLevel=value.audioLevel;audioEndpoint=value.audioEndpoint;sampleRate=value.sampleRate
  if(value.gapMs>0){maxGapMs=Math.max(maxGapMs,value.gapMs);frameGaps.push(value.gapMs);if(frameGaps.length>512)frameGaps.shift();if(value.gapMs>100)gapsOver100++}
  if(value.audioToWriteMs>=0){audioLatencies.push(value.audioToWriteMs);if(audioLatencies.length>512)audioLatencies.shift()}
  if(value.captureToWriteMs>=0){captureLatencies.push(value.captureToWriteMs);if(captureLatencies.length>512)captureLatencies.shift()}
  if(value.audioTimestampInvalid)audioTimestampInvalid++
  renderMs=value.renderMs;encodeMs=value.encodeMs;writeMs=value.writeMs
  const now=performance.now();if(now-windowStart>=1000){fps=windowFrames*1000/(now-windowStart);windowFrames=0;windowStart=now}
  if(frameClients.size)publishFrame({enabled:true,connected:true,mode:'rhythm',keys:Object.fromEntries(HERO68_KEY_IDS.map((id,i)=>[id,value.colors[i]])),audioLevel,sequence:++frameSequence,sessionId,sideOutput:false})
  else frameSequence++
}
const frameClients=new Set<ServerResponse>()
const frameWriters=new WeakMap<ServerResponse,ReturnType<typeof latestSse>>()
type HallRecord=SharedHallSample
type HallClient={id:string;keys:Set<string>;pending:Map<string,HallRecord>;lastSent:number}
const hallClients=new Map<ServerResponse,HallClient>()
const hallSamples=new Map<string,HallRecord>()
const hallBroker=new HallBroker()
const gamepadClients=new Set<ServerResponse>()
const gamepadInputClients=new Map<ServerResponse,ReturnType<typeof latestSse>>()
let inputStreamScheduled=false,inputStreamApplied=false
function scheduleInputStream(){
  if(inputStreamScheduled||closing)return;inputStreamScheduled=true
  void exclusive(async()=>{
    while(!closing&&inputStreamApplied!==(gamepadInputClients.size>0)){
      const wanted=gamepadInputClients.size>0
      const result=await bridge.line(wanted?'gamepad-input-on':'gamepad-input-off')
      if(result!=='gamepad-input-ready')throw Error('Fast gamepad input unavailable')
      inputStreamApplied=wanted
    }
  }).catch(()=>{inputStreamApplied=false;for(const client of gamepadInputClients.keys())client.destroy();gamepadInputClients.clear()}).finally(()=>{inputStreamScheduled=false;if(!closing&&inputStreamApplied!==(gamepadInputClients.size>0))scheduleInputStream()})
}
function publishGamepadInput(value: {enabled:boolean;report:unknown;sequence:number}){
  if(!gamepadInputClients.size)return
  const now=performance.now(),keys=new Set(gamepadConfigurations[gamepadSlot].bindings.map(b=>b.keyId))
  const samples=value.enabled?[...hallSamples.values()].filter(s=>keys.has(s.keyId)).map(s=>({...s,ageMs:now-(hallReceivedAt.get(s.keyId)??0)})):[]
  const text=`data: ${JSON.stringify({...value,samples})}\n\n`
  for(const [client,send] of gamepadInputClients){if(client.destroyed||client.writableLength>65536)client.destroy();else send(text)}
}
let hallPolls=0,hallMetrics:{requests:number;timeouts:number;keys:HallKeyMetric[];nativeCpuPercent?:number;nativeRssMB?:number}={requests:0,timeouts:0,keys:[]}
let gamepadState:Pick<GamepadStatus,'enabled'|'armed'|'stale'|'xinputVerified'|'userIndex'|'neutralCount'|'error'|'report'|'keyboardHookSupported'|'fastInputSupported'>={enabled:false,armed:false,stale:true,xinputVerified:false,userIndex:-1,neutralCount:0,error:'',report:{buttons:0,lx:0,ly:0,rx:0,ry:0,lt:0,rt:0}}
let gamepadSlot=0,gamepadConfigurations:Record<number,GamepadConfiguration>={0:defaultGamepad(),1:defaultGamepad(),2:defaultGamepad()}
try{const v=JSON.parse(readFileSync(path.join(stateDir,'gamepad.json'),'utf8'));for(const slot of [0,1,2])if(v.profiles?.[slot])gamepadConfigurations[slot]=validateGamepad(v.profiles[slot]);if([0,1,2].includes(v.slot))gamepadSlot=v.slot}catch{}
function persistGamepad(){const file=path.join(stateDir,'gamepad.json');writeFileSync(file+'.tmp',JSON.stringify({version:1,slot:gamepadSlot,profiles:gamepadConfigurations}));renameSync(file+'.tmp',file)}
function gamepadStatus():GamepadStatus{return {...gamepadState,keyboardSuppressionActive:firmware.active||!!(gamepadState as GamepadStatus).keyboardSuppressionActive,keyboardSuppressionError:firmware.error||(gamepadState as GamepadStatus).keyboardSuppressionError,firmwareRecoveryPending:firmware.pendingRecovery,backend:'vigem',slot:gamepadSlot,configuration:gamepadConfigurations[gamepadSlot],capabilities:{gamepad:true,keyboardSuppression:gamepadState.fastInputSupported===true,keyboardHook:gamepadState.keyboardHookSupported===true,fastInput:gamepadState.fastInputSupported===true},hall:{...hallMetrics,consumers:hallBroker.consumers.map(s=>({...s,keys:[...s.keys]}))},samples:[...hallSamples.values()].map(s=>({...s,ageMs:performance.now()-(hallReceivedAt.get(s.keyId)??0)}))}}
const hallReceivedAt=new Map<string,number>()
function publishGamepad(){const value=`data: ${JSON.stringify(gamepadStatus())}\n\n`;for(const client of gamepadClients){if(client.destroyed||client.writableLength>65536){client.destroy();gamepadClients.delete(client)}else if(!client.writableLength)client.write(value)}}
function needsAnalogHall(){return !tachyon&&mode==='custom'&&needsRgbAnalogHall(profile?.custom)}
let lastHallCommand=''
async function syncHall(){
  hallBroker.update({id:'rgb',keys:needsAnalogHall()?rgbHallKeys(profile?.custom):[],hz:100})
  for(const [suffix,analog] of [['analog',true],['digital',false]] as const)hallBroker.update({id:'gamepad:'+suffix,keys:gamepadState.enabled?gamepadConfigurations[gamepadSlot].bindings.filter(b=>isAnalogAction(b.action)===analog).map(b=>b.keyId):[],hz:analog?gamepadConfigurations[gamepadSlot].rate:100})
  const command=hallBroker.command('gamepad:')
  if(command!==lastHallCommand){const result=await bridge.line(command);if(result!=='hall-ready')throw Error(result);lastHallCommand=command}
  for(const key of hallSamples.keys())if(!hallBroker.demands.has(key)){hallSamples.delete(key);hallReceivedAt.delete(key)}
}
let hallSyncScheduled=false,hallSyncAgain=false
function scheduleHallSync(){
  hallSyncAgain=true;if(hallSyncScheduled||closing)return;hallSyncScheduled=true
  void exclusive(async()=>{while(hallSyncAgain&&!closing){hallSyncAgain=false;await syncHall()}}).catch(e=>{lastError=String(e);hallSyncAgain=true}).finally(()=>{hallSyncScheduled=false;if(hallSyncAgain&&!closing)setTimeout(scheduleHallSync,100).unref()})
}
function publishHall(records:HallRecord[]){
  const now=performance.now()
  for(const [client,subscription] of hallClients){
    if(client.destroyed||client.writableLength>65536){client.destroy();hallClients.delete(client);hallBroker.unsubscribe(subscription.id);scheduleHallSync();continue}
    for(const record of records)if(subscription.keys.has(record.keyId))subscription.pending.set(record.keyId,record)
    if(!subscription.pending.size||now-subscription.lastSent<(subscription.keys.size>10?32:0))continue
    client.write(`data: ${JSON.stringify({records:[...subscription.pending.values()]})}\n\n`)
    subscription.pending.clear();subscription.lastSent=now
  }
}
const keyByPosition=new Map(Object.entries(HERO68_KEY_POSITIONS).map(([id,pos])=>[pos,id]))
function onHallSnapshot(value:{publishedMs?:number;requests:number;timeouts:number;records:Omit<HallRecord,'keyId'>[]}){
  const records:HallRecord[]=[]
  for(const s of value.records){const keyId=keyByPosition.get(s.pos);if(!keyId||!hallBroker.demands.has(keyId))continue;const record={...s,keyId};hallSamples.set(keyId,record);hallReceivedAt.set(keyId,performance.now()-Math.max(0,(value.publishedMs??s.timestampMs)-s.timestampMs));records.push(record);if(firmware.active&&gamepadState.enabled&&gamepadConfigurations[gamepadSlot].bindings.some(b=>b.keyId===keyId))onRgbKey(keyId,s.pressed)}
  hallPolls=value.requests;hallSnapshots+=records.length;publishHall(records)
}
function onRgbKey(id:string,pressed:boolean){
  if(mode!=='custom'||!engine||(pressed?outputHeld.has(id):!outputHeld.has(id)))return
  if(pressed)outputHeld.add(id);else outputHeld.delete(id)
  const at=performance.now();pendingInputs.push(at);playback.advance();engine.event(id,pressed);inputTransitions++
}
let lastPublishedFrame:unknown=null
function publishFrame(value:unknown){
  lastPublishedFrame=value
  const text=`data: ${JSON.stringify(value)}\n\n`
  for(const client of frameClients){
    if(client.destroyed||client.writableLength>65536){client.destroy();frameClients.delete(client)}
    else frameWriters.get(client)?.(text)
  }
}
let tail:Promise<unknown>=Promise.resolve()
let pendingRequests=0
function exclusive<T>(work:()=>Promise<T>):Promise<T>{if(pendingRequests>=32)return Promise.reject(Error('Device request queue is busy; try again'));pendingRequests++;const next=tail.then(work).finally(()=>{pendingRequests--});tail=next.catch(()=>{});return next}

class Bridge {
  // Downloaded cores live in the state folder; the supervisor retains the
  // installed app folder as cwd, where its compatible native helper resides.
  private process=spawn(existsSync(path.join(__dirname,'hid-bridge.exe'))?path.join(__dirname,'hid-bridge.exe'):path.join(process.cwd(),'hid-bridge.exe'),[],{stdio:['pipe','pipe','pipe'],windowsHide:true})
  private pending:{resolve:(v:string)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null
  private gone=false
  constructor(){
    createInterface({input:this.process.stdout}).on('line',line=>{
      if(line.startsWith('gamepad-input:')){try{publishGamepadInput(JSON.parse(line.slice(14)))}catch{}return}
      if(line.startsWith('hall-snapshot:')){try{onHallSnapshot(JSON.parse(line.slice(14)))}catch{}return}
      if(line.startsWith('hall-stats:')){try{const v=JSON.parse(line.slice(11));hallMetrics={...v,keys:v.keys.map((k:HallKeyMetric)=>({...k,keyId:keyByPosition.get(k.pos)??''}))}}catch{}return}
      if(line==='power:suspend'||line==='power:resume'){if(firmware.active||firmware.pendingRecovery)scheduleFirmwareRecovery();return}
      if(line.startsWith('hall-error:')){hallSamples.clear();hallReceivedAt.clear();lastError=line.slice(11);timeouts++;if(firmware.active)scheduleFirmwareRecovery();return}
      if(line.startsWith('gamepad-status:')){try{const enabled=gamepadState.enabled;gamepadState=JSON.parse(line.slice(15));if(enabled!==gamepadState.enabled)scheduleHallSync();publishGamepad()}catch{}return}
      if(line==='custom-tick:'){onCustomTick();return}
      if(line.startsWith('custom-frame:')){try{onCustomFrame(JSON.parse(line.slice(13)))}catch{}return}
      if(line.startsWith('custom-error:')){if(mode==='custom'){connected=false;lastError=line.slice(13);timeouts++;publishFrame({enabled:true,connected:false,sessionId})}return}
      if(line.startsWith('rhythm-frame:')){try{onNativeFrame(JSON.parse(line.slice(13)))}catch{}return}
      if(line.startsWith('rhythm-error:')){if(mode==='rhythm'){connected=false;lastError=line.slice(13);timeouts++;publishFrame({enabled:true,connected:false,sessionId})}return}
      if(line==='raw:ready'||line==='raw:unavailable'){rawInputReady=line==='raw:ready';return}
      if(line.startsWith('key:')){
        const input=decodeHero68Input(line)
        if(input)onRgbKey(input.id,input.pressed)
        return
      }
      const p=this.pending;if(p){this.pending=null;clearTimeout(p.timer);p.resolve(line)}
    })
    this.process.stderr.on('data',data=>log(`bridge: ${data}`))
    this.process.on('error',e=>this.fail(e));this.process.on('exit',()=>this.fail(Error('Native HID bridge exited')))
  }
  private fail(e:Error){if(this.gone)return;this.gone=true;gamepadState={...gamepadState,enabled:false,armed:false,stale:true,error:e.message,report:{buttons:0,lx:0,ly:0,rx:0,ry:0,lt:0,rt:0}};hallSamples.clear();hallReceivedAt.clear();publishGamepad();if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(e);this.pending=null}if(!closing)setImmediate(()=>void shutdown(1))}
  async line(value:string){
    if(this.gone)throw Error('Native HID bridge unavailable; restart service')
    if(this.pending)throw Error('Concurrent HID operation')
    return new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.fail(Error('Native HID bridge stalled'));this.process.kill()},2000)
      this.pending={resolve,reject,timer};this.process.stdin.write(value+'\n',e=>{if(e)this.fail(e)})
    })
  }
  async request(packet:Uint8Array,sendOnly=false){
    return profileRequest(packet,packet=>this.requestOnce(packet,sendOnly))
  }
  private async requestOnce(packet:Uint8Array,sendOnly=false){
    const result=await this.line((sendOnly?'send:':'')+Buffer.from(packet).toString('hex'))
    if(result.startsWith('error:'))throw Error(result.slice(6))
    if(!/^[0-9a-f]{128}$/.test(result))throw Error('Invalid bridge response')
    const reply=decodeReport(Uint8Array.from(Buffer.from(result,'hex')))
    if(!reply.checksumValid||reply.command!==packet[1]||reply.zone!==packet[2])throw Error('Unexpected HID response')
    packets++;return reply
  }
  async startCustom(){const result=await this.line('custom-start');if(result!=='custom-ready')throw Error('Native custom scheduler did not start')}
  async stopCustom(){const result=await this.line('custom-stop');if(result!=='custom-stopped')throw Error('Native custom scheduler did not stop')}
  async queueFrame(id:number,values:Uint8Array[]){const result=await this.line('frame:'+id+':'+values.map(p=>Buffer.from(p).toString('hex')).join(','));if(result!=='frame-queued')throw Error(result.startsWith('error:')?result.slice(6):'Invalid frame queue acknowledgement')}
  async batch(values:Uint8Array[]){const result=await this.line('batch:'+values.map(p=>Buffer.from(p).toString('hex')).join(','));if(result!=='batch-written')throw Error(result.startsWith('error:')?result.slice(6):'Invalid RGB batch acknowledgement');packets+=values.length}
  async configureRhythm(value:RhythmConfiguration){const result=await this.line(nativeRhythmCommand(value));if(result!=='rhythm-ready')throw Error(result.startsWith('error:')?result.slice(6):'Native rhythm did not start')}
  async stopRhythm(){const result=await this.line('rhythm-stop');if(result!=='rhythm-stopped')throw Error('Native rhythm did not stop')}
  async audioDevices(){const result=await this.line('audio-devices');if(!result.startsWith('audio-devices:'))throw Error('Audio enumeration failed');return JSON.parse(result.slice(14))}
  async close(){await this.line('close')}
  async wait(ms:number){await this.line(`wait:${Math.max(0,Math.min(25,ms))}`)}
  end(){this.process.stdin.end()}
}
const bridge=new Bridge()
const recoveryFile=path.join(stateDir,'gamepad-remap-recovery.json')
const firmware=new GamepadFirmware(packet=>bridge.request(packet),async()=>{
  const result=await bridge.line('device-identity');if(!/^device-identity:[0-9a-f]+$/.test(result))throw Error('Cannot identify HERO68 for remap recovery')
  return createHash('sha256').update(result).digest('hex')
},{
  load:()=>existsSync(recoveryFile)?JSON.parse(readFileSync(recoveryFile,'utf8')):null,
  save:j=>{const fd=openSync(recoveryFile+'.tmp','w');try{writeFileSync(fd,JSON.stringify(j));fsyncSync(fd)}finally{closeSync(fd)}renameSync(recoveryFile+'.tmp',recoveryFile)},
  clear:()=>{if(existsSync(recoveryFile))unlinkSync(recoveryFile)},
})
let firmwareRecoveryScheduled=false,firmwareRecoveryTimer:ReturnType<typeof setTimeout>|undefined,firmwareRecoveryAttempt=0
async function stopGamepad(){const result=await bridge.line('gamepad-stop');if(result!=='gamepad-stopped')throw Error(result);if(firmware.active)for(const binding of gamepadConfigurations[gamepadSlot].bindings)onRgbKey(binding.keyId,false);gamepadState={...gamepadState,enabled:false,armed:false,stale:true,report:{buttons:0,lx:0,ly:0,rx:0,ry:0,lt:0,rt:0}};await syncHall();await firmware.restore()}
function scheduleFirmwareRecovery(){
  if(closing||firmwareRecoveryScheduled||firmwareRecoveryTimer)return
  firmwareRecoveryScheduled=true
  void exclusive(async()=>{await stopGamepad();firmwareRecoveryAttempt=0;publishGamepad()}).catch(e=>{
    log('Gamepad remap recovery pending: '+String(e));publishGamepad()
    if(!closing)firmwareRecoveryTimer=setTimeout(()=>{firmwareRecoveryTimer=undefined;scheduleFirmwareRecovery()},[250,500,1000,2000][Math.min(firmwareRecoveryAttempt++,3)])
  }).finally(()=>{firmwareRecoveryScheduled=false})
}
async function applyFirmware(config:GamepadConfiguration){
  if(config.suppressMappedKeys&&config.keyboardSuppressionMode==='firmware')await firmware.apply(gamepadSlot as 0|1|2,config.bindings.map(b=>b.keyId))
}
async function configureNativeGamepad(config:GamepadConfiguration,running:boolean){
  const actual=running&&config.suppressMappedKeys&&config.keyboardSuppressionMode==='hook'?await hookConfiguration(config,packet=>bridge.request(packet)):config
  const r=await bridge.line(nativeGamepadCommand(actual));if(r!=='gamepad-configured')throw Error(r)
}
const lightingTransport={request:(packet:Uint8Array)=>bridge.request(packet)}
async function connect(){
  const identity=await bridge.request(buildReport({command:0x82,zone:1}))
  if(![0x11,0,0,0,0,3].every((v,i)=>identity.data[i]===v))throw Error('Device is not the supported HERO68')
  connected=true;lastError=null;hallSamples.clear();frameEncoder.reset();engine=playback.start(profile);outputHeld.clear();pendingInputs.length=0;lastFrameAt=0
  if(tachyon){try{await tachyonLighting.disable(lightingTransport)}catch(e){connected=false;throw e}}
  log('HERO68 connected')
}
async function setTachyon(enabled:boolean){
  if(enabled){
    if(!tachyon)tachyonPreviousMode=mode
    tachyon=true;persistTachyon()
    await stop()
    await bridge.stopCustom();await bridge.stopRhythm()
    try{if(!connected)await connect();else await tachyonLighting.disable(lightingTransport)}catch(e){connected=false;lastError=String(e);throw e}
    publishFrame({enabled:false,connected,mode:'onboard',tachyon:true,sessionId})
  }else{
    if(!connected)await connect()
    await tachyonLighting.restore(lightingTransport)
    tachyon=false
    const restoreMode=tachyonPreviousMode
    tachyonPreviousMode='onboard'
    persistTachyon()
    if(restoreMode==='rhythm'){
      const config=validateRhythm(rhythmConfig)
      nativeRhythmCommand(config)
      if(!connected){try{await connect()}catch(e){lastError=String(e);connected=false}}
      await bridge.configureRhythm(config);rhythmConfig=config;mode='rhythm';savedMode='rhythm'
      engine?.releaseAll();outputHeld.clear();sessionId=randomUUID();frameSequence=0
      frames=packets=timeouts=maxGapMs=droppedFrames=audioTimestampInvalid=0
      frameGaps.length=audioLatencies.length=captureLatencies.length=0
      windowFrames=0;windowStart=performance.now();fps=0;audioState='connecting';audioError=''
      persistRhythm();persist()
      publishFrame({enabled:true,connected,mode:'rhythm',sessionId,sequence:frameSequence})
      log('Rhythm Sync resumed after Tachyon')
    }else if(restoreMode==='custom'&&profile){
      if(mode==='rhythm')await bridge.stopRhythm()
      if(mode!=='custom'){engine=playback.start(profile);outputHeld.clear();pendingInputs.length=0}
      mode='custom';savedMode='custom';customFrames.clear();reusedFrames=windowRendered=renderFps=0
      await bridge.startCustom();frameEncoder.reset();sessionId=randomUUID();frameSequence=0
      publishFrame({enabled:true,connected,sessionId,sequence:0})
      reconnectAt=0;frames=0;packets=0;hallSnapshots=0;timeouts=0;maxGapMs=0;gapsOver100=0;lastLongGapAt=null
      frameGaps.length=0;eventLoopDelay.reset();lastFrameAt=0;persist()
      log('Custom RGB resumed after Tachyon')
    }else{
      mode='onboard';savedMode='onboard';persist()
      publishFrame({enabled:false,connected,mode:'onboard',tachyon:false,sessionId})
      log('Onboard RGB restored after Tachyon')
    }
  }
}
async function stop(){
  const previousMode=mode;mode='onboard'
  if(previousMode==='rhythm')await bridge.stopRhythm()
  if(previousMode==='custom')await bridge.stopCustom()
  customFrames.clear()
  audioState='stopped';audioLevel=0;fps=0
  sessionId=randomUUID();frameSequence=0
  if(connected){try{await bridge.request(buildReport({command:8,zone:2,data:[0,0,0]}))}catch(e){lastError=String(e)}}
  engine?.releaseAll();outputHeld.clear();pendingInputs.length=0;persist();log('Onboard RGB restored')
  publishFrame({enabled:false,connected:false,sessionId})
  await syncHall()
}
async function tick(){
  if(mode!=='custom'||!profile||!engine||closing)return
  if(!connected){if(performance.now()<reconnectAt)return;await connect()}
  const started=performance.now()
  playback.advance()
  if(needsAnalogHall()){
    const ids=new Set(rgbHallKeys(profile?.custom)),samples=[...hallSamples].filter(([id])=>ids.has(id)&&performance.now()-(hallReceivedAt.get(id)??0)<100)
    engine!.setTravel(Object.fromEntries(samples.map(([id,s])=>[id,s.distanceUnits/100])),Object.fromEntries(samples.map(([id,s])=>[id,{sequence:s.sequence,timestampMs:s.timestampMs}])))
  }
  const renderedAt=performance.now()
  const frame=frameEncoder.prepare(engine!.frame().keys)
  const encodedAt=performance.now()
  const submission=++customSubmission
  customFrames.set(submission,{keys:frame.keys,started,renderMs:renderedAt-started,encodeMs:encodedAt-renderedAt})
  while(customFrames.size>8)customFrames.delete(customFrames.keys().next().value!)
  await bridge.queueFrame(submission,frame.packets)
}
let timer:ReturnType<typeof setTimeout>
async function loop(){
  const now=performance.now()
  if(tachyon&&!connected&&!closing&&now>=reconnectAt){reconnectAt=now+1000;try{await exclusive(connect)}catch(e){connected=false;lastError=String(e)}}
  if(now-windowStart>=1000){fps=windowFrames*1000/(now-windowStart);renderFps=windowRendered*1000/(now-windowStart);windowFrames=windowRendered=0;windowStart=now}
  if(!closing)timer=setTimeout(loop,250)
}


function percentile(values:readonly number[],fraction=.95){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*fraction)-1]}
function status(){const now=performance.now();if(now-cpuAt>=1000){const next=process.cpuUsage();cpuPercent=((next.user-cpuPrevious.user)+(next.system-cpuPrevious.system))/(now-cpuAt)/10;cpuPrevious=next;cpuAt=now}return {
  service:'OpenHero68 RGB',version:2,apiVersion:CORE_API_VERSION,
  supportedEffects:CUSTOM_RGB_EFFECTS.map(effect=>effect.id),supportedBaseEffects:['aurora'],
  pid:process.pid,coreVersion,launcherVersion:LAUNCHER_VERSION,mode,tachyon,supportsTachyon:true,enabled:mode!=='onboard',connected,
  preset:!!profile||savedMode==='rhythm',savedMode,configurationBusy,pendingRequests,sessionId,
  fps,frameMs,renderMs,encodeMs,writeMs,frames,packets,hallSnapshots,hallPolls,hallClients:hallClients.size,timeouts,maxGapMs,
  frameGapP95Ms:percentile(frameGaps),frameGapP99Ms:percentile(frameGaps,.99),gapsOver100,lastLongGapAt,
  eventLoopDelayP99Ms:eventLoopDelay.percentile(99)/1e6,eventLoopDelayMaxMs:eventLoopDelay.max/1e6,
  lastError,rawInputReady,inputTransitions,inputToLedP95Ms:percentile(inputLatencies),targetFps:60,
  renderFps:mode==='rhythm'?fps:renderFps,reusedFrames,paletteColors:32,sideOutput:RHYTHM_SIDE_VERIFIED,
  supportedModes:['onboard','custom','rhythm'],supportedRhythmModes:RHYTHM_MODES.map(m=>m.id),
  supportedRhythmSideModes:RHYTHM_SIDE_VERIFIED?[500,501,502,503]:[500],rhythmConfiguration:rhythmConfig,
  audioState,audioError,audioLevel,audioEndpoint,sampleRate,droppedFrames,
  audioToWriteP95Ms:percentile(audioLatencies),audioTimestampInvalid,
  audioLatencySamples:audioLatencies.length,captureToWriteP95Ms:percentile(captureLatencies)
  ,supportsGamepad:true,gamepad:gamepadStatus(),sharedHall:true,cpuPercent,rssMB:process.memoryUsage().rss/1048576
}}
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
    if(req.method==='GET'&&req.url==='/gamepad/status'){json(200,gamepadStatus());return}
    if(req.method==='GET'&&req.url==='/gamepad/input/events'){
      if(!gamepadState.fastInputSupported){json(409,{error:'Update the full Windows service package to 0.4.1 or later'});return}
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no','Cache-Control':'no-store'});res.write(': connected\n\n')
      gamepadInputClients.set(res,latestSse(res));scheduleInputStream()
      req.on('close',()=>{gamepadInputClients.delete(res);scheduleInputStream()});return
    }
    if(req.method==='GET'&&req.url==='/gamepad/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(gamepadStatus())}\n\n`);gamepadClients.add(res)
      const heartbeat=setInterval(()=>{if(!res.writableLength)res.write(': keepalive\n\n')},15000);heartbeat.unref();req.on('close',()=>{clearInterval(heartbeat);gamepadClients.delete(res)});return
    }
    if(req.method==='GET'&&req.url==='/audio/devices'){json(200,{devices:await exclusive(()=>bridge.audioDevices())});return}
    if(req.method==='GET'&&req.url==='/updates'){const latest=await latestCore();json(200,{coreVersion,...latest});return}
    if(req.method==='GET'&&req.url==='/frames'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'})
      res.write(': connected\n\n');frameClients.add(res)
      const send=latestSse(res);frameWriters.set(res,send)
      if(lastPublishedFrame)send(`data: ${JSON.stringify(lastPublishedFrame)}\n\n`)
      const heartbeat=setInterval(()=>{if(!res.writableLength)res.write(': keepalive\n\n')},15000);heartbeat.unref()
      req.on('close',()=>{clearInterval(heartbeat);frameClients.delete(res)});return
    }
    if(req.method==='GET'&&req.url?.startsWith('/hall/stream?')){
      const ids=new URL(req.url,`http://127.0.0.1:${port}`).searchParams.get('keys')?.split(',')??[]
      if(ids.length<1||ids.length>HERO68_KEY_IDS.length||ids.some(id=>!HERO68_KEY_IDS.includes(id)))throw Error('Expected 1-68 valid Hall keys')
      const keys=new Set(ids)
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'})
      const id='web:'+randomUUID()
      res.write(': connected\n\n');hallClients.set(res,{id,keys,pending:new Map(),lastSent:0});hallBroker.subscribe({id,keys:[...keys],hz:100});scheduleHallSync()
      const initial=[...hallSamples.values()].filter(record=>keys.has(record.keyId))
      if(initial.length)res.write(`data: ${JSON.stringify({records:initial})}\n\n`)
      const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);heartbeat.unref()
      req.on('close',()=>{clearInterval(heartbeat);hallClients.delete(res);hallBroker.unsubscribe(id);scheduleHallSync()});return
    }
    if(req.method!=='POST'||!['/gamepad/config','/gamepad/profile','/gamepad/start','/gamepad/stop','/tachyon','/start','/stop','/mode','/preset','/rhythm/start','/rhythm/config','/shutdown','/updates/apply','/updates/tray-check','/device/request','/device/batch'].includes(req.url??'')){json(404,{error:'Unknown endpoint'});return}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(415,{error:'Expected application/json'});return}
    let body='',size=0
    for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Preset too large');body+=chunk}
    const input=JSON.parse(body||'{}')
    if(updating&&req.url!=='/shutdown')throw Error('Core update in progress')
    if(req.url?.startsWith('/gamepad/')){
      const slot=input.slot??gamepadSlot;if(!Number.isInteger(slot)||slot<0||slot>2)throw Error('Expected profile 0-2')
      const config=input.configuration===undefined?gamepadConfigurations[slot]:validateGamepad(input.configuration)
      if(req.url!=='/gamepad/stop'&&config.suppressMappedKeys&&!(config.keyboardSuppressionMode==='hook'?gamepadState.keyboardHookSupported:gamepadState.fastInputSupported))throw Error('Mapped-key blocking requires the full Windows service 0.4.1 package or later')
      await exclusive(async()=>{
        clearTimeout(firmwareRecoveryTimer);firmwareRecoveryTimer=undefined
        if(req.url==='/gamepad/stop'){await stopGamepad();return}
        if(tachyon)throw Error('Turn off Tachyon Mode before starting Hall gamepad output.')
        const active=req.url==='/gamepad/profile'||req.url==='/gamepad/start'||slot===gamepadSlot
        const run=active&&(gamepadState.enabled||req.url==='/gamepad/start')
        const resume=mode!=='onboard'
        if(active){
          if(req.url==='/gamepad/start'&&!config.bindings.length)throw Error('Add at least one gamepad binding')
        }
        if(active&&resume)await bridge.line('rhythm-pause')
        try{
          if(active){
            await stopGamepad()
            if(run){if(!connected)await connect();await bridge.request(selectProfile(slot as 0|1|2))}
            await configureNativeGamepad(config,run)
            gamepadSlot=slot
          }
          gamepadConfigurations[slot]=config;persistGamepad()
          if(run){
            if(!connected)await connect()
            // Check the driver before mutating firmware. Output remains neutral
            // until Hall subscriptions are installed and every bound key rests.
            const r=await bridge.line(gamepadState.fastInputSupported?'gamepad-start-paused':'gamepad-start');if(r!=='gamepad-ready')throw Error(r)
            gamepadState={...gamepadState,enabled:true,armed:false,stale:true,error:''}
            await bridge.line('gamepad-pause');await applyFirmware(config);await bridge.line('gamepad-resume')
          }
          const state=await bridge.line('gamepad-status');if(!state.startsWith('gamepad-state:'))throw Error(state);gamepadState=JSON.parse(state.slice(14));await syncHall()
        }catch(e){if(active)await stopGamepad().catch(()=>{});publishGamepad();throw e}
        finally{if(active&&resume)await bridge.line('rhythm-resume')}
      });publishGamepad();json(200,gamepadStatus());return
    }
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
    if(req.url==='/tachyon'){
      if(typeof input.enabled!=='boolean')throw Error('Expected Tachyon enabled boolean')
      await exclusive(async()=>{if(input.enabled)await stopGamepad();await setTachyon(input.enabled);await syncHall()});json(200,status());return
    }
    if(req.url==='/rhythm/start'||req.url==='/rhythm/config'||(req.url==='/start'&&!Object.keys(input).length&&savedMode==='rhythm')){
      await exclusive(async()=>{
        if(tachyon)throw Error('Turn off Tachyon Mode before starting RGB effects.')
        const editing=req.url==='/rhythm/config'
        if(editing&&(mode!=='rhythm'||input.sessionId!==sessionId))throw Error('Stale rhythm editor session; configuration was not applied')
        const config=validateRhythm(input.configuration??(req.url==='/start'?rhythmConfig:input))
        nativeRhythmCommand(config)
        if(!connected){try{await connect()}catch(e){lastError=String(e);connected=false}}
        await bridge.configureRhythm(config);rhythmConfig=config;mode='rhythm';savedMode='rhythm'
        if(!editing){engine?.releaseAll();outputHeld.clear();sessionId=randomUUID();frameSequence=0;frames=packets=timeouts=maxGapMs=droppedFrames=audioTimestampInvalid=0;frameGaps.length=audioLatencies.length=captureLatencies.length=0;windowFrames=0;windowStart=performance.now();fps=0;audioState='connecting';audioError=''}
        persistRhythm();persist();publishFrame({enabled:true,connected,mode:'rhythm',sessionId,sequence:frameSequence})
        await syncHall()
      });json(200,status());return
    }
    if(req.url==='/device/request'||req.url==='/device/batch'){
      const batch=req.url==='/device/batch'
      const requests:ReturnType<typeof validateDeviceRequest>[]=batch?(Array.isArray(input.requests)&&input.requests.length>0&&input.requests.length<=128?input.requests.map(validateDeviceRequest):(()=>{throw Error('Expected 1-128 device requests')})()):[validateDeviceRequest(input)]
      if(batch&&requests.some(({reenumerate})=>reenumerate))throw Error('Re-enumeration requires a standalone request')
      const replies=await exclusive(async()=>{
        if(tachyon&&requests.some(({packet})=>isTachyonLightingWrite(packet)))throw Error('Turn off Tachyon Mode before changing RGB lighting.')
        configurationBusy=true;const resume=mode!=='onboard';await bridge.line('gamepad-pause');if(resume)await bridge.line('rhythm-pause')
        const mutatesRemaps=requests.some(({packet,reenumerate})=>reenumerate||[0x03,0x10,0x12,0x05].includes(packet[1]))
        const run=gamepadState.enabled
        try{
        if(!connected)await connect()
        if(mutatesRemaps&&(firmware.active||firmware.pendingRecovery))await firmware.restore()
        const replies:string[]=[]
        for(const {packet,reenumerate} of requests){
          let reply:Awaited<ReturnType<Bridge['request']>>|undefined
          const attempts=batch&&[0x19,0x16,0x15].includes(packet[1])?3:1
          for(let i=0;i<attempts;i++){
            try{reply=await bridge.request(packet,reenumerate);break}
            catch(e){if(i===attempts-1)throw e;await new Promise(resolve=>setTimeout(resolve,100))}
          }
          if(!reply)throw Error('Missing HID reply')
          replies.push(Buffer.from(firmware.projectRead(reply).raw).toString('hex'))
          if(packet[1]===0x10&&packet[2]===0){gamepadSlot=packet[7];await configureNativeGamepad(gamepadConfigurations[gamepadSlot],run);persistGamepad();await syncHall()}
          if(reenumerate){
            connected=false;await bridge.close()
            const deadline=performance.now()+7000;let recovered=false
            while(performance.now()<deadline){await new Promise(resolve=>setTimeout(resolve,120));try{await connect();recovered=true;break}catch{await bridge.close()}}
            if(!recovered)throw Error('HERO68 did not return after polling-rate change')
          }
        }
        if(mutatesRemaps&&run){await configureNativeGamepad(gamepadConfigurations[gamepadSlot],run);await applyFirmware(gamepadConfigurations[gamepadSlot])}
        return replies
        }catch(e){if(run)await stopGamepad().catch(()=>{});throw e}
        finally{configurationBusy=false;if(resume)await bridge.line('rhythm-resume');await bridge.line('gamepad-resume')}
      })
      json(200,batch?{hexes:replies}:{hex:replies[0]});return
    }
    await exclusive(async()=>{
      if(req.url==='/stop'||req.url==='/shutdown'||(req.url==='/mode'&&input.mode==='onboard')){await stop();return}
      if(tachyon)throw Error('Turn off Tachyon Mode before starting RGB effects.')
      if(req.url==='/mode'&&input.mode!=='custom')throw Error('Expected onboard or custom mode')
      if(req.url==='/preset'&&input.sessionId!==sessionId)throw Error('Stale RGB editor session; preset was not applied')
      if(req.url==='/preset'||(req.url==='/start'&&Object.keys(input).length)||(req.url==='/mode'&&input.profile)){profile=normalizeProfile(req.url==='/mode'||req.url==='/preset'?input.profile:input);if(engine)engine.configure(profile);else engine=playback.start(profile);persist()}
      if(req.url==='/start'||req.url==='/mode'){if(mode==='rhythm')await bridge.stopRhythm();if(!profile)throw Error('Send a preset first');if(mode!=='custom'){engine=playback.start(profile);outputHeld.clear();pendingInputs.length=0}mode='custom';savedMode='custom';customFrames.clear();reusedFrames=windowRendered=renderFps=0;await bridge.startCustom();frameEncoder.reset();sessionId=randomUUID();frameSequence=0;publishFrame({enabled:true,connected,sessionId,sequence:0});reconnectAt=0;frames=0;packets=0;hallSnapshots=0;timeouts=0;maxGapMs=0;gapsOver100=0;lastLongGapAt=null;frameGaps.length=0;eventLoopDelay.reset();lastFrameAt=0;persist();log('Custom RGB started')}
      await syncHall()
    })
    json(200,status())
    if(req.url==='/shutdown')void shutdown()
  }catch(e){json(400,{error:e instanceof Error?e.message:String(e)})}
})
async function shutdown(exitCode=0){if(closing)return;closing=true;clearTimeout(timer);clearTimeout(firmwareRecoveryTimer);publishFrame({enabled:false,connected:false,shuttingDown:true});await exclusive(async()=>{await stopGamepad();await stop()}).catch(e=>log(String(e)));for(const client of frameClients)client.end();for(const client of gamepadClients)client.end();for(const client of gamepadInputClients.keys())client.end();for(const client of hallClients.keys())client.end();await exclusive(()=>bridge.close()).catch(()=>{});bridge.end();server.close(()=>process.exit(exitCode));setTimeout(()=>process.exit(exitCode),1000).unref()}
async function restartForUpdate(){await shutdown(73)}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown())
process.on('uncaughtException',e=>{log(e.stack??e.message);void shutdown()})
server.on('error',e=>{log(`Server error: ${e.message}`);bridge.end();process.exitCode=1})
server.listen(port,'127.0.0.1',()=>{log(`Service listening on 127.0.0.1:${port}`);void exclusive(async()=>{await bridge.line(nativeGamepadCommand(gamepadConfigurations[gamepadSlot]));if(firmware.pendingRecovery)try{await firmware.restore()}catch{setImmediate(scheduleFirmwareRecovery)}if(mode==='custom')await bridge.startCustom();if(mode==='rhythm')await bridge.configureRhythm(rhythmConfig);await syncHall()}).catch(e=>{lastError=String(e);mode='onboard'});void loop()})
