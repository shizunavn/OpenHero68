import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Circle, Layers, Plus, RotateCcw, Sparkles, Trash2, Waves } from 'lucide-react'
import Hero68Preview from './Hero68Preview'
import RgbColorPicker from './RgbColorPicker'
import { CUSTOM_RGB_EFFECTS, CustomRgbEngine, MAX_RGB_LAYERS, createRgbLayer, restoreCustomRgb, type CustomRgbConfiguration, type CustomRgbLayer } from '../keyboard/customRgb'
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'
import { KEY_RGB_MODES } from '../keyboard/rgbCatalog'
import type { LightingFrame } from '../keyboard/lightingPreviewBus'
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { hero68HallStream, useHero68HallStream } from '../protocol/hero68/hallStream'
import { hero68DeviceManager, useHero68Device } from '../protocol/hero68/webhid'
import { rgbService, type RgbServiceStatus } from '../protocol/rgbService'
import { latestUpdates } from '../protocol/latestUpdates'

const hex = (rgb: RgbColor) => '#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join('')
const rgb = (value: string): RgbColor => [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)) as RgbColor
function Slider({ label, value, min, max, step = 1, unit, disabled, onChange }: {label:string;value:number;min:number;max:number;step?:number;unit:string;disabled:boolean;onChange:(v:number)=>void}) {
  return <label className="custom-rgb-slider"><span>{label}</span><div><input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))onChange(Math.max(min,Math.min(max,n)))}}/><small>{unit}</small></div></label>
}
export default function CustomRgbEditor({ value, onChange, busy, advancedBindings }: {value:RgbProfile;onChange:(v:RgbProfile)=>void;busy:boolean;advancedBindings:AdvancedBinding[]}) {
  const config = restoreCustomRgb(value.custom, value)
  const [active, setActive] = useState('base')
  const [selected, setSelected] = useState(new Set<string>())
  const [paint, setPaint] = useState('#ffd95a')
  const [replay, setReplay] = useState(0)
  const [frame, setFrame] = useState<{keys:LightingFrame;side:string[]}>({keys:{},side:[]})
  const [error, setError] = useState<string|null>(null)
  const [service, setService] = useState<RgbServiceStatus|null>(null)
  const [serviceBusy, setServiceBusy] = useState(false)
  const serviceRendering = useRef(false)
  const updates = useRef<ReturnType<typeof latestUpdates<{profile:RgbProfile;sessionId:string}>>|null>(null)
  const previousValue = useRef(value)
  const [previewSynced,setPreviewSynced]=useState(false)
  const engineRef = useRef<CustomRgbEngine|null>(null)
  const ownsHall = useRef(false)
  const hall = useHero68HallStream()
  const device = useHero68Device()
  const layer = config.layers.find(l=>l.id===active)
  const mode = KEY_RGB_MODES.find(m=>m.id===config.base.mode)!
  function change(next: CustomRgbConfiguration) { onChange({...value,custom:next}) }
  function patchLayer(patch: Partial<CustomRgbLayer>) { change({...config,layers:config.layers.map(l=>l.id===active?{...l,...patch}:l)}) }
  function base(patch: Partial<CustomRgbConfiguration['base']>) { change({...config,base:{...config.base,...patch}}) }
  useEffect(()=>{engineRef.current?.configure(value)},[value])
  useEffect(()=>{
    let disposed=false
    const refresh=()=>void rgbService.status().then(s=>{if(!disposed)setService(s)}).catch(()=>{if(!disposed)setService(null)})
    refresh();const timer=setInterval(refresh,2000)
    return()=>{disposed=true;clearInterval(timer)}
  },[])
  useEffect(()=>{
    let disposed=false
    const queue=latestUpdates<{profile:RgbProfile;sessionId:string}>(async next=>{const status=await rgbService.update(next.profile,next.sessionId);if(!disposed)setService(status)},e=>{if(!disposed)setError(String(e))})
    updates.current=queue
    return()=>{disposed=true;queue.close();updates.current=null}
  },[])
  useEffect(()=>{
    const changed=previousValue.current!==value;previousValue.current=value
    if(changed&&service?.enabled&&service.sessionId)updates.current?.stage({profile:value,sessionId:service.sessionId})
  },[value,service?.enabled,service?.sessionId])
  useEffect(()=>{
    serviceRendering.current=service?.enabled===true
    if(!service?.enabled){setPreviewSynced(false);return}
    if((service.apiVersion??0)<2){setError('Update the service to sync the web preview.');return}
    return rgbService.frames(next=>{
      if(next.enabled&&next.connected&&next.keys){setFrame({keys:next.keys,side:[]});setPreviewSynced(true)}
      else setPreviewSynced(false)
    },()=>setPreviewSynced(false))
  },[service?.enabled,service?.apiVersion])
  async function toggleService(){
    setServiceBusy(true);setError(null)
    try{
      if(service?.enabled){
        setService(await ((service.apiVersion??0)>=3?rgbService.mode('onboard'):rgbService.stop()))
      }
      else {
        if(hero68HallStream.getSnapshot().active)await hero68HallStream.stop()
        ownsHall.current=false
        await hero68DeviceManager.disconnect()
        const started=await ((service?.apiVersion??0)>=3?rgbService.mode('custom',value):rgbService.start(value));setService(started)
        if((started.apiVersion??0)>=2)await hero68DeviceManager.connectViaService()
      }
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setServiceBusy(false)}
  }
  useEffect(()=>{
    const engine = new CustomRgbEngine(value)
    engineRef.current=engine
    let handle=0, previous=0, elapsed=110, disposed=false, sampleIndex=0
    const samples = HERO68_KEY_IDS.slice(17,22).flatMap((id,i)=>[{at:elapsed+150+i*140,id,pressed:true},{at:elapsed+350+i*140,id,pressed:false}]).sort((a,b)=>a.at-b.at)
    const releases: {id:string;at:number}[]=[]
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
    const held = new Set<string>()
    setError(null)
    const renderFrame=()=>{
      if(serviceRendering.current)return
      const currentHall=hero68HallStream.getSnapshot()
      engine.setTravel(currentHall.active?Object.fromEntries(Object.entries(currentHall.samples).filter(([,s])=>!s.releaseInferred).map(([id,s])=>[id,s.distanceMm])):{})
      engine.advance(elapsed);setFrame(engine.frame())
    }
    const tick=(now:number)=>{
      if(disposed||document.hidden||reduced.matches)return
      elapsed+=previous?Math.min(now-previous,100):0;previous=now
      try {
        while(sampleIndex<samples.length&&samples[sampleIndex].at<=elapsed){const e=samples[sampleIndex++];engine.advance(e.at);engine.event(e.id,e.pressed)}
        while(releases.length&&releases[0].at<=elapsed){const e=releases.shift()!;engine.event(e.id,false)}
        renderFrame();handle=requestAnimationFrame(tick)
      } catch(e){setError(e instanceof Error?e.message:String(e))}
    }
    const keydown=(e:KeyboardEvent)=>{
      if(serviceRendering.current)return
      if(e.repeat||!HERO68_KEY_IDS.includes(e.code))return
      if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]'))return
      held.add(e.code);engine.event(e.code,true)
      if(reduced.matches)renderFrame()
    }
    const keyup=(e:KeyboardEvent)=>{if(held.delete(e.code)){engine.event(e.code,false);if(reduced.matches)renderFrame()}}
    const blur=()=>{held.clear();engine.releaseAll();renderFrame()}
    const visibility=()=>{cancelAnimationFrame(handle);previous=0;if(document.hidden)blur();else if(!reduced.matches)handle=requestAnimationFrame(tick)}
    const click=(event:Event)=>{if(serviceRendering.current)return;const id=(event as CustomEvent<string>).detail;engine.event(id,true);if(reduced.matches){engine.advance(elapsed+50);setFrame(engine.frame());engine.event(id,false)}else releases.push({id,at:elapsed+180})}
    try{renderFrame();if(!reduced.matches)handle=requestAnimationFrame(tick)}catch(e){setError(String(e))}
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur)
    window.addEventListener('custom-rgb-preview-press',click);document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',visibility)
    return()=>{disposed=true;cancelAnimationFrame(handle);engine.releaseAll();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);window.removeEventListener('custom-rgb-preview-press',click);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',visibility);engineRef.current=null}
    // The engine is reconfigured separately without restarting animations on slider changes.
  },[replay])
  useEffect(()=>()=>{if(ownsHall.current){ownsHall.current=false;void hero68HallStream.stop()}},[])
  useEffect(()=>{if(active!=='base'&&!config.layers.some(l=>l.id===active))setActive('base')},[active,config.layers])
  function toggle(id:string){setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next});window.dispatchEvent(new CustomEvent('custom-rgb-preview-press',{detail:id}))}
  function addLayer(){if(config.layers.length>=MAX_RGB_LAYERS)return;const next=createRgbLayer();change({...config,layers:[...config.layers,next]});setActive(next.id)}
  function move(offset:number){const layers=[...config.layers],i=layers.findIndex(l=>l.id===active),target=i+offset;if(i<0||target<0||target>=layers.length)return;[layers[i],layers[target]]=[layers[target],layers[i]];change({...config,layers})}
  async function toggleHall(){setError(null);try{if(ownsHall.current){await hero68HallStream.stop();ownsHall.current=false}else if(!hall.active){ownsHall.current=true;await hero68HallStream.start(selected.size?selected:HERO68_KEY_IDS,'direct-poll')}}catch(e){ownsHall.current=false;setError(e instanceof Error?e.message:String(e))}}
  function exportPreset(){const blob=new Blob([JSON.stringify({...value,custom:config},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='hero68-custom-rgb.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  return <>
    <div className="rgb-preview-stage"><Hero68Preview advancedBindings={advancedBindings} selectedKeys={selected} onToggleKey={toggle} lightingFrame={frame.keys} selectionEnabled/><div className="rgb-side-preview" aria-label="18 side light positions">{frame.side.map((color,i)=><span key={i} style={{background:color,color}}/>)}</div></div>
    <section className="settings-card rgb-custom-editor">
      <div className="rgb-section-heading"><div><h2><Layers size={20}/> Custom Effects</h2><p>AULA Hero68 · 68 keys · {config.layers.length}/{MAX_RGB_LAYERS} FX layers</p></div><div className="custom-rgb-actions"><button className="secondary-button" onClick={exportPreset}>Export preset</button><button className="secondary-button" onClick={()=>setReplay(n=>n+1)}><RotateCcw size={15}/> Replay</button></div></div>
      <p className="custom-rgb-status"><span/> {service?.enabled?previewSynced?'Preview synced with keyboard RGB':'Waiting for service frames':'Preview active · Layers saved locally with this profile'}</p>
      <div className="custom-rgb-onboard"><button className="apply-button" disabled={busy||serviceBusy||!service} onClick={()=>void toggleService()}>{serviceBusy?'Connecting…':service?.enabled?'Stop service RGB':'Start service RGB'}</button><span>{service?service.enabled?service.connected?`Keyboard RGB · ${service.fps.toFixed(1)} FPS · runs after closing this page`:`Waiting for keyboard · ${service.lastError??'connecting'}`:'Service ready · Start sends this preset to the keyboard':'Download and extract the service, then run Hero68RgbService.exe.'}</span><a href="https://github.com/shizunavn/OpenHero68-RGB-Service/releases/latest/download/OpenHero68-RGB-Windows-x64.zip" target="_blank" rel="noreferrer">Download service</a>{service&&<a href="http://127.0.0.1:16868/" target="_blank" rel="noreferrer">Service panel</a>}</div>
      {config.base.mode!==19&&<div className="custom-rgb-warning">The base effect controls its own colors. Select Per-key Color to use painted key colors.</div>}
      <div className="custom-rgb-columns">
        <div className="custom-rgb-stack"><h3>Base layer</h3><button className={`custom-rgb-layer ${active==='base'?'active':''}`} onClick={()=>setActive('base')}><Circle size={17}/><span>{mode.name}</span><small>68 keys</small></button><h3>Effect layers</h3><p className="custom-rgb-stack-note">Lower layers blend over earlier ones.</p>{config.layers.map((l,i)=><div key={l.id} className={`custom-rgb-layer ${active===l.id?'active':''} ${!l.enabled?'muted':''}`}><button className="custom-rgb-layer-select" onClick={()=>setActive(l.id)}><Sparkles size={16}/><span>{CUSTOM_RGB_EFFECTS.find(e=>e.id===l.effect)?.name}</span><small>{i+1}</small></button><button className="custom-rgb-delete" aria-label={`Remove layer ${i+1}`} disabled={busy} onClick={()=>change({...config,layers:config.layers.filter(item=>item.id!==l.id)})}><Trash2 size={14}/></button></div>)}<button className="custom-rgb-add" disabled={busy||config.layers.length>=MAX_RGB_LAYERS} onClick={addLayer}><Plus size={16}/> Add RGB FX layer</button>{!config.layers.length&&<p className="custom-rgb-empty">Add a layer to animate over your base colors.</p>}</div>
        <div className="custom-rgb-selection"><h3>{active==='base'?'Base effect':'Effect selection'}</h3><div className="custom-rgb-effect-grid">{active==='base'?KEY_RGB_MODES.map(m=><button key={m.id} disabled={busy} aria-pressed={config.base.mode===m.id} onClick={()=>base({mode:m.id})}><Waves size={16}/>{m.name}</button>):CUSTOM_RGB_EFFECTS.map(effect=><button key={effect.id} disabled={busy} aria-pressed={layer?.effect===effect.id} onClick={()=>patchLayer({effect:effect.id})}><Sparkles size={16}/>{effect.name}</button>)}</div></div>
        <div className="custom-rgb-parameters"><h3>{active==='base'?'Base parameters':'Effect parameters'}</h3>
          {active==='base'?<><Slider label="Base brightness" value={config.base.brightness*5} min={0} max={100} step={5} unit="%" disabled={busy} onChange={v=>base({brightness:v/5})}/>{mode.speed&&<Slider label="Base speed" value={config.base.speed+1} min={1} max={5} unit="/ 5" disabled={busy} onChange={v=>base({speed:v-1})}/>} {mode.color&&<><label className="custom-rgb-color">Base color<RgbColorPicker label="Base effect color" value={hex(config.base.rgb)} disabled={busy} onChange={v=>base({rgb:rgb(v)})}/></label><label className="custom-rgb-check"><input type="checkbox" checked={config.base.mix} disabled={busy} onChange={e=>base({mix:e.target.checked})}/> Multicolor</label></>}<p className="rgb-preview-note">Base effects use the existing firmware V3.20 color engine.</p></>:layer&&<><p className="custom-rgb-description">{CUSTOM_RGB_EFFECTS.find(e=>e.id===layer.effect)?.detail}</p><label className="custom-rgb-check"><input type="checkbox" checked={layer.enabled} disabled={busy} onChange={e=>patchLayer({enabled:e.target.checked})}/> Enable layer</label><label className="custom-rgb-color">Effect color<RgbColorPicker label="Layer color" value={hex(layer.color)} disabled={busy} onChange={v=>patchLayer({color:rgb(v)})}/></label><label className="custom-rgb-check"><input type="checkbox" checked={layer.multicolor} disabled={busy} onChange={e=>patchLayer({multicolor:e.target.checked})}/> Multicolor</label><Slider label="Opacity" value={layer.opacity} min={0} max={100} unit="%" disabled={busy} onChange={v=>patchLayer({opacity:v})}/>{!['touch','reaction','breath','rt','trail','mixing'].includes(layer.effect)&&<Slider label={layer.effect==='aoe'?'Radius':'Width'} value={layer.width} min={.25} max={12} step={.25} unit="keys" disabled={busy} onChange={v=>patchLayer({width:v})}/>} {['scan','breath','ripple'].includes(layer.effect)&&<Slider label="Speed" value={layer.speed} min={.5} max={30} step={.5} unit="keys/s" disabled={busy} onChange={v=>patchLayer({speed:v})}/>} {['ripple','reaction','trail','rt'].includes(layer.effect)&&<Slider label="Fade duration" value={layer.duration} min={100} max={4000} step={50} unit="ms" disabled={busy} onChange={v=>patchLayer({duration:v})}/>} {layer.effect==='scan'&&<div className="custom-rgb-direction"><span>Direction</span><div>{(['horizontal','vertical'] as const).map(direction=><button key={direction} disabled={busy} aria-pressed={layer.direction===direction} onClick={()=>patchLayer({direction})}>{direction==='horizontal'?'Horizontal':'Vertical'}</button>)}</div></div>}{['rt','jelly','aoe','touch','mixing'].includes(layer.effect)&&<div className="custom-rgb-hall"><p>{hall.active?`Hall feedback · ${hall.telemetryHz?.toFixed(0)??'—'} reports/s`:'Preview clicks simulate full travel. Start Hall feedback for actual analog travel; RT Display uses reported press/release state in the service.'}</p><button className="secondary-button" disabled={busy||device.state!=='connected'||hall.starting||(hall.active&&!ownsHall.current)} onClick={()=>void toggleHall()}>{hall.starting?'Starting…':ownsHall.current?'Stop Hall feedback':hall.active?'Hall already active':'Start Hall feedback'}</button></div>}<div className="custom-rgb-order"><button className="secondary-button" disabled={busy||config.layers[0]?.id===active} onClick={()=>move(-1)}><ArrowUp size={15}/> Move up</button><button className="secondary-button" disabled={busy||config.layers.at(-1)?.id===active} onClick={()=>move(1)}><ArrowDown size={15}/> Move down</button></div></>}
        </div>
      </div>
      <div className="custom-rgb-key-tools"><span>{selected.size} keys selected</span><button className="secondary-button" onClick={()=>setSelected(new Set(HERO68_KEY_IDS))}>Select all</button><button className="secondary-button" onClick={()=>setSelected(new Set())}>Deselect</button>{active==='base'?<><RgbColorPicker label="Paint selected keys" value={paint} disabled={busy} onChange={setPaint}/><button className="apply-button" disabled={busy||!selected.size} onClick={()=>{const colors={...value.colors};for(const id of selected)colors[id]=rgb(paint);onChange({...value,colors})}}>Paint keys</button></>:layer&&<><button className="apply-button" disabled={busy||!selected.size} onClick={()=>patchLayer({keys:[...selected]})}>Use selected keys</button><button className="secondary-button" disabled={busy} onClick={()=>patchLayer({keys:[...HERO68_KEY_IDS]})}>Use all 68 keys</button><small>Layer affects {layer.keys.length} keys</small></>}</div>
      <div className="custom-rgb-onboard"><button className="secondary-button" disabled={busy} onClick={()=>onChange({...value,keys:{...config.base}})}>Use base on keyboard</button><span>Stages the base for the profile Save button. FX layers stay in your local preset.</span></div>
      <p className="rgb-preview-note">Service RGB runs the keyboard effects and streams the same colors back to this preview. AP, RT and other profile settings remain available through the service. Side LEDs retain their onboard effect.</p>
      {error&&<p role="alert" className="stream-error">{error}</p>}
    </section>
  </>
}
