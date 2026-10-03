import { useEffect, useRef, useState } from 'react'
import { AudioLines, Play, Square, RotateCcw, SlidersHorizontal, Radio, Layers, Download } from 'lucide-react'
import Hero68Preview from './Hero68Preview'
import RgbColorPicker from './RgbColorPicker'
import { defaultRhythm, validateRhythm, rhythmDemo, RHYTHM_MODES, RHYTHM_SIDE_MODES, type RhythmConfiguration } from '../keyboard/rhythm'
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'
import { rgbService, type AudioEndpoint, type RgbServiceFrame } from '../protocol/rgbService'
import { publishRgbServiceStatus, useRgbServiceState, refreshRgbService, getRgbServiceState } from '../protocol/rgbServiceState'
import { latestUpdates } from '../protocol/latestUpdates'
import { rgbFrameGuard } from '../protocol/rgbFrameGuard'
import { hero68DeviceManager } from '../protocol/hero68/webhid'
import { hero68HallStream } from '../protocol/hero68/hallStream'
import { useI18n } from '../i18n'
import { AppSelect } from '../app/components/AppSelect'
import './RhythmSyncEditor.css'

const draftKey='openhero68:rhythm-draft:v1'
const darkKeys=Object.fromEntries(HERO68_KEY_IDS.map(id=>[id,'#161a1e']))
function readDraft(){try{return validateRhythm(JSON.parse(localStorage.getItem(draftKey)??'null'))}catch{return defaultRhythm()}}
function Thumbnail({shape}:{shape:string}) {
  return <svg viewBox="0 0 104 48" aria-hidden="true" className={`rhythm-thumb rhythm-thumb-${shape}`}>
    {shape==='rings'||shape==='bloom'?<g fill="none" stroke="currentColor"><ellipse cx={shape==='rings'?52:38} cy="24" rx="9" ry="5"/><ellipse cx={shape==='rings'?52:38} cy="24" rx="21" ry="12"/><ellipse cx={shape==='rings'?52:38} cy="24" rx="36" ry="21"/></g>:
      shape==='field'?<rect x="10" y="8" width="84" height="32" rx="6" fill="currentColor" opacity=".6"/>:
      shape==='off'?<path d="M34 8L70 40M70 8L34 40" stroke="currentColor" strokeWidth="2"/>:
      Array.from({length:12},(_,i)=><rect key={i} x={10+i*7} y={40-(shape==='spectrum'?8+Math.sin(i*.8)*12+16:10+Math.sin(i*.6)*9+12)} width="4" height={shape==='spectrum'?8+Math.sin(i*.8)*12+16:10+Math.sin(i*.6)*9+12} rx="2" fill="currentColor" opacity={.4+i*.05}/>)}
  </svg>
}
function RhythmPreview({configuration,demo,live,paused,sessionId}:{configuration:RhythmConfiguration;demo:boolean;live:boolean;paused:boolean;sessionId?:string}) {
  const { tr } = useI18n()
  const [frame,setFrame]=useState<RgbServiceFrame>({enabled:false,connected:false,keys:darkKeys})
  const latest=useRef<RgbServiceFrame|null>(null)
  const currentConfig=useRef(configuration);currentConfig.current=configuration
  useEffect(()=>{
    let handle=0,close:(()=>void)|undefined,disposed=false
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
    const start=performance.now()
    const accept=rgbFrameGuard(sessionId)
    const render=(now:number)=>{
      if(disposed)return
      if(!document.hidden){
        if(demo){const sample=rhythmDemo(currentConfig.current,reduced.matches?0:now-start);setFrame({enabled:false,connected:false,keys:sample.keys,side:sample.side,audioLevel:sample.level})}
        else if(latest.current){setFrame(latest.current);latest.current=null}
      }
      handle=requestAnimationFrame(render)
    }
    if(!paused&&!demo&&live)close=rgbService.frames(value=>{if(!disposed&&accept(value))latest.current={...value,keys:value.enabled&&value.connected&&value.keys?value.keys:darkKeys}})
    if(!demo)setFrame({enabled:false,connected:false,keys:darkKeys})
    if(!paused&&(demo||live))handle=requestAnimationFrame(render)
    return()=>{disposed=true;cancelAnimationFrame(handle);close?.();latest.current=null}
  },[demo,live,paused,sessionId])
  return <div className="rhythm-preview">
    {!demo&&<div className="rhythm-preview-top"><span className="rhythm-source"><Radio size={13}/>{tr(live?'Live · USB output':'Preview · start to play')}</span><span>{tr(frame.connected?'Keyboard connected':'Waiting for keyboard')}</span></div>}
    <Hero68Preview selectedKeys={new Set()} onToggleKey={()=>{}} selectionEnabled={false} lightingSource="local" lightingFrame={frame.keys}/>
    <div className="rgb-side-preview" aria-label={demo?tr('18 illustrative side LEDs'):tr('Side LED output')}>{(frame.side??Array(18).fill('#20262b')).map((color,i)=><span key={i} style={{background:color,color}}/>)}</div>
    {!demo&&!frame.side&&<span className="rhythm-side-label">{tr('Side LEDs retain onboard lighting')}</span>}
    <div className="rhythm-meter"><AudioLines size={16}/><meter aria-label={tr('Audio level')} min={0} max={1} value={Math.min(1,frame.audioLevel??0)}/><span>{Math.round((frame.audioLevel??0)*100)}%</span></div>
  </div>
}

export default function RhythmSyncEditor({onSetup}:{onSetup:()=>void}) {
  const { tr } = useI18n()
  const {status,checking,reconnecting}=useRgbServiceState()
  const [config,setConfig]=useState<RhythmConfiguration>(readDraft)
  const [demo,setDemo]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
  const [endpoints,setEndpoints]=useState<AudioEndpoint[]>([]),[session,setSession]=useState<string|null>(null)
  const action=useRef(0),current=useRef(config),queue=useRef<ReturnType<typeof latestUpdates<RhythmConfiguration>>|null>(null)
  current.current=config
  const compatible=!!status&&(status.apiVersion??0)>=5&&status.supportedModes?.includes('rhythm')
  const locked=!demo&&(checking||!compatible)
  const live=status?.mode==='rhythm'&&status.enabled
  const applied=!!session&&status?.sessionId===session&&live
  const sideSupported=config.sideMode===500||!!status?.supportedRhythmSideModes?.includes(config.sideMode)
  // Rejoin the service's current configuration. Merely opening this editor never
  // writes the old local draft or restarts audio capture.
  useEffect(()=>{
    if(busy||demo)return
    if(compatible&&live&&status.sessionId&&status.rhythmConfiguration&&session!==status.sessionId){
      action.current++;queue.current?.close();queue.current=null
      setConfig(validateRhythm(status.rhythmConfiguration));setSession(status.sessionId);setError(null)
    }else if(session&&(!live||status?.sessionId!==session)){
      action.current++;queue.current?.close();queue.current=null;setSession(null)
    }
  },[compatible,live,status,session,busy,demo])
  useEffect(()=>{try{localStorage.setItem(draftKey,JSON.stringify(config))}catch{}},[config])
  useEffect(()=>{
    let cancelled=false
    if(compatible)void rgbService.audioDevices().then(devices=>{if(!cancelled)setEndpoints(devices)}).catch(e=>{if(!cancelled)setError(e.message)})
    return()=>{cancelled=true}
  },[compatible])
  useEffect(()=>{
    if(!applied||demo){queue.current?.close();queue.current=null;return}
    let disposed=false;const token=action.current
    const updates=latestUpdates<RhythmConfiguration>(async configuration=>{
      const active=getRgbServiceState().status
      if(disposed||!active?.enabled||active.mode!=='rhythm'||active.sessionId!==session)return
      const result=await rgbService.rhythmUpdate(configuration,session!)
      if(!disposed&&token===action.current&&getRgbServiceState().status?.sessionId===session)publishRgbServiceStatus(result)
    },e=>{if(!disposed)setError(e instanceof Error?e.message:String(e))},0)
    queue.current=updates
    return()=>{disposed=true;updates.close();if(queue.current===updates)queue.current=null}
  },[applied,session,demo])
  useEffect(()=>()=>{action.current++;queue.current?.close()},[])
  function change(patch:Partial<RhythmConfiguration>){
    const next={...current.current,...patch};current.current=next;setError(null);setConfig(next)
    if(applied&&!demo){
      if(next.sideMode!==500&&!status?.supportedRhythmSideModes?.includes(next.sideMode)){
        setError(tr('This firmware does not support live side rhythm. Keys keep playing with the last supported settings.'));return
      }
      queue.current?.stage(next)
    }
  }
  async function apply(){
    if(busy)return
    if(!compatible){onSetup();return}
    if(!sideSupported){setError(tr('Side rhythm is not yet verified on HERO68. Choose Leave onboard to play on the keys.'));return}
    const token=++action.current;setBusy(true);setError(null);queue.current?.close();setSession(null)
    try{
      const fresh=await refreshRgbService()
      if(!fresh||(fresh.apiVersion??0)<5)throw Error(tr('Update the Windows background app to 0.3.0 or later.'))
      if(hero68HallStream.getSnapshot().active)await hero68HallStream.stop()
      if(hero68DeviceManager.connected&&!hero68DeviceManager.viaService)await hero68DeviceManager.disconnect()
      if(token!==action.current)return
      const result=await rgbService.rhythmStart(current.current)
      if(token!==action.current)return
      publishRgbServiceStatus(result);setSession(result.sessionId??null);setDemo(false)
      if(result.connected)await hero68DeviceManager.connectViaService()
    }catch(e){if(token===action.current)setError(e instanceof Error?e.message:String(e))}
    finally{if(token===action.current)setBusy(false)}
  }
  async function stop(){
    if(busy)return;const token=++action.current;setBusy(true);setError(null);queue.current?.close();setSession(null)
    try{const result=await rgbService.stop();if(token===action.current)publishRgbServiceStatus(result)}
    catch(e){if(token===action.current)setError(e instanceof Error?e.message:String(e))}
    finally{if(token===action.current)setBusy(false)}
  }
  const selected=RHYTHM_MODES.find(mode=>mode.id===config.keyMode)!
  return <div className="custom-rgb-gate"><section className={`rhythm-editor custom-rgb-content${locked?' is-locked':''}`} inert={locked} aria-label="Rhythm Sync">
    <div className="rhythm-heading"><div><h2><AudioLines size={22}/> {tr('Rhythm Sync')}</h2><p>{tr('Let your music light up the keyboard.')}</p></div><span className="rhythm-fps">{live?`${(status?.fps??0).toFixed(1)} FPS`:tr('60 FPS target')}</span></div>
    <RhythmPreview configuration={config} demo={demo} live={!!live} paused={locked} sessionId={status?.sessionId}/>
    <div className="rhythm-actions">{!applied&&<button type="button" className="apply-button" onClick={()=>void apply()} disabled={busy||checking||compatible&&!sideSupported}><Play size={15}/>{busy?tr('Working…'):tr('Start Rhythm')}</button>}
      <button type="button" className="secondary-button" disabled={busy||!status?.enabled} onClick={()=>void stop()}><Square size={14}/> {tr('Return to onboard')}</button>
      <span className="rhythm-apply-note" role="status">{reconnecting?tr('Reconnecting to background app…'):applied?tr('Running · changes sync automatically'):live?tr('Joining running Rhythm…'):tr('Choose a mode, then start once')}</span>
    </div>
    {live&&status?.configurationBusy&&<p className="rgb-inline-note" role="status">{tr('Saving keyboard configuration · lighting paused')}</p>}
    {!status?.sideOutput&&<p className="rgb-inline-note">{tr('This keyboard firmware does not support live side rhythm. The side LEDs keep their onboard effect.')}</p>}
    {error&&<p className="stream-error" role="alert">{error}</p>}
    {live&&status?.lastError&&<p className="stream-error" role="alert">{status.lastError}</p>}
    {live&&status?.audioError&&<p className="stream-error" role="alert">{status.audioError}</p>}
    <div className="rhythm-layout"><div className="rhythm-modes"><h3>{tr('Key rhythm')}</h3><div className="rhythm-mode-grid">{RHYTHM_MODES.map(mode=><button type="button" key={mode.id} className={config.keyMode===mode.id?'active':''} aria-pressed={config.keyMode===mode.id} onClick={()=>change({keyMode:mode.id})} disabled={busy}><Thumbnail shape={mode.shape}/><strong>{tr(mode.name)}</strong><span>{tr(mode.description)}</span></button>)}</div>
      <h3>{tr('Side rhythm')}</h3><div className="rhythm-side-modes" role="group" aria-label={tr('Side rhythm')}>{RHYTHM_SIDE_MODES.map(mode=><button type="button" key={mode.id} className="secondary-button" aria-pressed={config.sideMode===mode.id} disabled={busy||!demo&&mode.id!==500&&!status?.supportedRhythmSideModes?.includes(mode.id)} title={!demo&&mode.id!==500&&!status?.supportedRhythmSideModes?.includes(mode.id)?tr('Requires firmware with live side rhythm support'):undefined} onClick={()=>change({sideMode:mode.id})}>{tr(mode.name)}</button>)}</div></div>
      <section className="settings-card rhythm-controls"><div className="rhythm-control-heading"><h3><SlidersHorizontal size={17}/> {tr(selected.name)}</h3><button type="button" className="rhythm-reset" aria-label={tr('Reset mode parameters')} title={tr('Reset mode parameters')} onClick={()=>change({...defaultRhythm(),keyMode:config.keyMode,sideMode:config.sideMode,endpoint:config.endpoint})}><RotateCcw size={16}/></button></div>
        <label className="rhythm-select">{tr('Audio source')}<AppSelect label={tr('Audio source')} value={config.endpoint} disabled={busy} onChange={endpoint=>change({endpoint})} options={[{value:'default',label:tr('Follow Windows default')},...(!endpoints.some(d=>d.id===config.endpoint)&&config.endpoint!=='default'?[{value:config.endpoint,label:tr('Saved device · unavailable')}]:[]),...endpoints.map(d=>({value:d.id,label:d.name+(d.default?' (default)':'')}))]} /><small>{tr('Captures music playing through your speakers or headphones.')}</small></label>
        <div className="rgb-parameters rhythm-sliders"><label>{tr('Brightness')} <strong>{config.brightness}%</strong><input aria-label={tr('Rhythm brightness')} type="range" min={0} max={100} value={config.brightness} onChange={e=>change({brightness:+e.target.value})}/></label>
          <label>{config.keyMode===428?tr('Spectrum sensitivity'):tr('Sensitivity')} <strong>{config.keyMode===428?config.spectrum.db:`${config.sensitivity.toFixed(1)}×`}</strong><input aria-label={tr('Rhythm sensitivity')} type="range" min={config.keyMode===428?0:.1} max={config.keyMode===428?100:10} step={config.keyMode===428?1:.1} value={config.keyMode===428?config.spectrum.db:config.sensitivity} onChange={e=>config.keyMode===428?change({spectrum:{...config.spectrum,db:+e.target.value}}):change({sensitivity:+e.target.value})}/></label>
          <label>{tr('Release / smoothing')} <strong>{config.releaseMs} ms</strong><input aria-label={tr('Rhythm release time')} type="range" min={0} max={200} step={5} value={config.releaseMs} onChange={e=>change({releaseMs:+e.target.value})}/><small>{tr('Fast attack. Release only softens the fade.')}</small></label></div>
        <label className="rhythm-select">{tr('Colors')}<AppSelect<RhythmConfiguration['palette']> label={tr('Colors')} value={config.palette} onChange={palette=>change({palette})} options={[{value:'fixed',label:tr('Single color')},{value:'rainbow',label:tr('Rainbow')},{value:'aurora',label:tr('Aurora')},{value:'fire',label:tr('Fire')}]} /></label>
        {config.palette==='fixed'&&<div className="rhythm-color"><RgbColorPicker label={tr('Rhythm color')} value={config.color} onChange={color=>change({color})}/><span>{config.color.toUpperCase()}</span></div>}
        <details className="rhythm-advanced"><summary>{tr('Advanced & diagnostics')}</summary>
          {config.keyMode===428&&<><label className="rhythm-select">{tr('FFT window')}<AppSelect<RhythmConfiguration['spectrum']['window']> label={tr('FFT window')} value={config.spectrum.window} onChange={window=>change({spectrum:{...config.spectrum,window}})} options={[{value:'hann',label:'Hann'},{value:'hamming',label:'Hamming'},{value:'blackman',label:'Blackman'}]} /></label><label className="rhythm-radius">{tr('Spatial smoothing')} <input aria-label={tr('Spectrum spatial radius')} type="range" min={0} max={16} value={config.spectrum.spatialRadius} onChange={e=>change({spectrum:{...config.spectrum,spatialRadius:+e.target.value}})}/>{config.spectrum.spatialRadius}</label></>}
          <dl><dt>{tr('Audio')}</dt><dd>{status?.audioState??tr('Stopped')}{status?.sampleRate?` · ${status.sampleRate/1000} kHz`:''}</dd><dt>{tr('Frame time')}</dt><dd>{(status?.frameMs??0).toFixed(2)} ms</dd><dt>{tr('Frame gap p95')}</dt><dd>{status?.frameGapP95Ms?.toFixed(2)??'—'} ms</dd><dt>{tr('Sample → USB p95')}</dt><dd>{status?.audioToWriteP95Ms?.toFixed(2)??'—'} ms</dd><dt>{tr('Dropped frames')}</dt><dd>{status?.droppedFrames??0}</dd></dl>
          <p>{tr('USB completion is not LED readback. Physical light latency needs a hardware measurement.')}</p>
          {status?.captureToWriteP95Ms!=null&&<p>{tr('Capture → USB p95')}: {status.captureToWriteP95Ms.toFixed(2)} ms.</p>}
          {live&&<p>{tr('Render')}: {(status?.renderMs??0).toFixed(2)} ms · {tr('Encode')}: {(status?.encodeMs??0).toFixed(2)} ms · {tr('USB write')}: {(status?.writeMs??0).toFixed(2)} ms.</p>}
          {!!status?.audioTimestampInvalid&&<p>{tr('Audio endpoint timestamps ahead of the capture clock were excluded')} ({status.audioTimestampInvalid}). {tr('Sample latency is not verified for those packets.')}</p>}
        </details>
      </section></div>
  </section>{locked&&<div className="custom-rgb-lock-overlay"><div className="custom-rgb-lock-card" role="status">
    <span className="custom-lock-icon"><Layers size={26}/></span>
    <h2>{checking?tr('Checking background service…'):status?tr('Background app update required'):tr('Background service required')}</h2>
    <p>{status?tr('Update the Windows app to 0.3.0 or later to use Rhythm Sync, or try a preview.'):tr('Run the background app to use Rhythm Sync, or try a preview.')}</p>
    <div className="custom-rgb-actions"><button type="button" className="apply-button" onClick={onSetup}><Download size={16}/>{status?tr('Update app'):tr('Download app')}</button>
      <button type="button" className="secondary-button" onClick={()=>setDemo(true)}>{tr('Try demo')}</button>
      <button type="button" className="custom-text-button" onClick={()=>void refreshRgbService()}>{tr('Check again')}</button></div>
  </div></div>}</div>
}
