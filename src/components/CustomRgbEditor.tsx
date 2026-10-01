import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Layers, Plus, RotateCcw, Sparkles, Trash2, Waves } from 'lucide-react'
import Hero68Preview from './Hero68Preview'
import RgbColorPicker from './RgbColorPicker'
import { CUSTOM_RGB_EFFECTS, CustomRgbEngine, MAX_RGB_LAYERS, RGB_EFFECT_METADATA, RGB_GRADIENT_PALETTES, createRgbLayer, restoreCustomRgb, type CustomRgbConfiguration, type CustomRgbEffect, type CustomRgbLayer, type RgbGradientPalette } from '../keyboard/customRgb'
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'
import { KEY_RGB_MODES } from '../keyboard/rgbCatalog'
import type { LightingFrame } from '../keyboard/lightingPreviewBus'
import type { RgbColor, RgbProfile } from '../protocol/hero68/rgb'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { rgbService } from '../protocol/rgbService'
import { refreshRgbService } from '../protocol/rgbServiceState'
import type { useCustomRgbPlayback } from './useCustomRgbPlayback'

const hex = (color: RgbColor) => '#'+color.map(c=>c.toString(16).padStart(2,'0')).join('')
const rgb = (value: string): RgbColor => [1,3,5].map(i=>parseInt(value.slice(i,i+2),16)) as RgbColor
function Slider({label,value,min,max,step=1,unit,disabled,onChange}:{label:string;value:number;min:number;max:number;step?:number;unit:string;disabled:boolean;onChange:(v:number)=>void}) {
  return <label className="custom-rgb-slider"><span>{label}</span><div><input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/><input aria-label={`${label} value`} type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e=>{const n=e.target.valueAsNumber;if(Number.isFinite(n))onChange(Math.max(min,Math.min(max,n)))}}/><small>{unit}</small></div></label>
}
type Props={value:RgbProfile;onChange:(v:RgbProfile)=>void;busy:boolean;advancedBindings:AdvancedBinding[];visible:boolean;onSetup:()=>void;playback:ReturnType<typeof useCustomRgbPlayback>}
export default function CustomRgbEditor({value,onChange,busy,advancedBindings,visible,onSetup,playback}:Props) {
  const config=restoreCustomRgb(value.custom,value)
  const [active,setActive]=useState('base')
  const [selected,setSelected]=useState(new Set<string>())
  const [paint,setPaint]=useState('#ffd95a')
  const [replay,setReplay]=useState(0)
  const [adding,setAdding]=useState(false)
  const [demo,setDemo]=useState(false)
  const [frame,setFrame]=useState<{keys:LightingFrame;side:string[]}>({keys:Object.fromEntries(HERO68_KEY_IDS.map(id=>[id,'#35393b'])),side:[]})
  const [previewError,setPreviewError]=useState<string|null>(null)
  const [synced,setSynced]=useState(false)
  const engineRef=useRef<CustomRgbEngine|null>(null)
  const replayRef=useRef(-1)
  const {status,checking,applied,session,updateRequired}=playback
  const locked=!demo&&(checking||!status)
  const paused=!visible||locked
  const live=applied&&!demo
  const disabled=busy||playback.busy
  const layer=config.layers.find(l=>l.id===active)
  const definition=layer?CUSTOM_RGB_EFFECTS.find(e=>e.id===layer.effect):undefined
  const metadata=layer?RGB_EFFECT_METADATA[layer.effect]:undefined
  const mode=KEY_RGB_MODES.find(m=>m.id===config.base.mode)!
  const auroraBase=config.baseEffect?.effect==='aurora'
  function animation(patch:Partial<NonNullable<CustomRgbConfiguration['baseEffect']>>){if(config.baseEffect)change({...config,baseEffect:{...config.baseEffect,...patch}})}
  function change(next:CustomRgbConfiguration){onChange({...value,custom:next})}
  function patchLayer(patch:Partial<CustomRgbLayer>){change({...config,layers:config.layers.map(l=>l.id===active?{...l,...patch}:l)})}
  function base(patch:Partial<CustomRgbConfiguration['base']>){change({...config,base:{...config.base,...patch,...(patch.mix!==undefined||patch.rgb!==undefined?{mixValue:undefined}:{})}})}
  function choose(effect:CustomRgbEffect){
    if(adding){const next=createRgbLayer(effect);change({...config,layers:[...config.layers,next]});setActive(next.id);setAdding(false)}
    else if(layer&&layer.effect!==effect){const next=createRgbLayer(effect,layer.id);patchLayer({...next,keys:layer.keys,enabled:layer.enabled})}
  }
  function moveAuroraToBase(){
    if(!layer||layer.effect!=='aurora')return
    change({...config,base:{...config.base,rgb:layer.color,mix:layer.multicolor,brightness:Math.round(layer.opacity/5)},
      baseEffect:{effect:'aurora',palette:layer.palette??'aurora',width:layer.width,speed:layer.speed},layers:config.layers.filter(l=>l.id!==layer.id)})
    setActive('base')
  }
  function move(offset:number){const layers=[...config.layers],i=layers.findIndex(l=>l.id===active),target=i+offset;if(i<0||target<0||target>=layers.length)return;[layers[i],layers[target]]=[layers[target],layers[i]];change({...config,layers})}
  function exportPreset(){const blob=new Blob([JSON.stringify({...value,custom:config},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='hero68-custom-rgb.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  useEffect(()=>{engineRef.current?.configure(value);if(engineRef.current&&!live&&!paused)setFrame(engineRef.current.frame())},[value,live,paused])
  useEffect(()=>{if(active!=='base'&&!config.layers.some(l=>l.id===active))setActive('base')},[active,config.layers])
  useEffect(()=>{
    setSynced(false)
    if(!live||!visible)return
    let disposed=false,lastSequence=-1
    const close=rgbService.frames(next=>{
      if(disposed||next.sessionId!==session)return
      if(next.sequence!==undefined&&next.sequence<=lastSequence)return
      if(next.sequence!==undefined)lastSequence=next.sequence
      if(next.enabled&&next.connected&&next.keys){setFrame({keys:next.keys,side:[]});setSynced(true)}else setSynced(false)
    },()=>{if(!disposed)setSynced(false)})
    return ()=>{disposed=true;close()}
  },[live,session,visible])
  useEffect(()=>{
    if(paused||live)return
    const engine=replayRef.current===replay&&engineRef.current?engineRef.current:new CustomRgbEngine(value)
    replayRef.current=replay;engineRef.current=engine;engine.configure(value)
    let handle=0,previous=0,elapsed=Math.max(110,engine.milliseconds),disposed=false,sampleIndex=0
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
    const held=new Set<string>(), releases:{id:string;at:number}[]=[]
    const samples=replay>0?HERO68_KEY_IDS.slice(17,22).flatMap((id,i)=>[{id,at:elapsed+150+i*140,pressed:true},{id,at:elapsed+350+i*140,pressed:false}]).sort((a,b)=>a.at-b.at):[]
    const render=()=>{try{engine.advance(elapsed);setFrame(engine.frame())}catch(reason){setPreviewError(String(reason))}}
    const tick=(now:number)=>{
      if(disposed||document.hidden||reduced.matches)return
      elapsed+=previous?Math.min(now-previous,100):0;previous=now
      while(sampleIndex<samples.length&&samples[sampleIndex].at<=elapsed){const event=samples[sampleIndex++];engine.advance(event.at);engine.event(event.id,event.pressed)}
      while(releases.length&&releases[0].at<=elapsed){const event=releases.shift()!;engine.event(event.id,false)}
      render();handle=requestAnimationFrame(tick)
    }
    const keydown=(event:KeyboardEvent)=>{
      if(event.repeat||!HERO68_KEY_IDS.includes(event.code)||(event.target as HTMLElement)?.closest('input,textarea,select,button,a,[contenteditable=true]'))return
      held.add(event.code);engine.event(event.code,true);if(reduced.matches)render()
    }
    const keyup=(event:KeyboardEvent)=>{if(held.delete(event.code)){engine.event(event.code,false);if(reduced.matches)render()}}
    const blur=()=>{held.clear();engine.releaseAll();render()}
    const resume=()=>{cancelAnimationFrame(handle);previous=0;if(document.hidden)blur();else if(!reduced.matches)handle=requestAnimationFrame(tick);else render()}
    const click=(event:Event)=>{const id=(event as CustomEvent<string>).detail;engine.event(id,true);if(reduced.matches){elapsed+=50;render();engine.event(id,false)}else releases.push({id,at:elapsed+180})}
    if(reduced.matches&&samples.length){for(const event of samples){engine.advance(event.at);engine.event(event.id,event.pressed);engine.frame()}elapsed=samples.at(-1)!.at+50}
    setPreviewError(null);render();resume()
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);window.addEventListener('custom-rgb-preview-press',click)
    document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume)
    return()=>{disposed=true;cancelAnimationFrame(handle);engine.releaseAll();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);window.removeEventListener('custom-rgb-preview-press',click);document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume)}
  },[replay,paused,live])
  function toggle(id:string){if(locked)return;setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next});if(!live)window.dispatchEvent(new CustomEvent('custom-rgb-preview-press',{detail:id}))}
  const state=playback.busy?'Applying':updateRequired?'Update required':!status?'Offline':live?(status.connected?'Live':'Waiting for keyboard'):status.connected?'Ready':'Waiting for keyboard'
  return <div className="custom-rgb-gate" hidden={!visible}>
    <div className={`custom-rgb-content ${locked?'is-locked':''}`} inert={locked}>
      <div className="rgb-preview-stage"><div className="custom-preview-label">{demo?'Demo · Preview only':live?(synced?'Live keyboard':'Waiting for live frames'):'Local preview'}</div><Hero68Preview advancedBindings={advancedBindings} selectedKeys={selected} onToggleKey={toggle} lightingFrame={frame.keys} lightingSource="local" selectionEnabled/>{frame.side.length>0&&<div className="rgb-side-preview" aria-label="18 side light positions">{frame.side.map((color,i)=><span key={i} style={{background:color,color}}/>)}</div>}</div>
      <section className="settings-card rgb-custom-editor">
        <div className="rgb-section-heading"><div><h2><Layers size={20}/> Custom Effects</h2><p>{config.layers.length}/{MAX_RGB_LAYERS} FX layers · Changes stay in this profile</p></div><div className="custom-rgb-actions"><button className="secondary-button" disabled={disabled} onClick={exportPreset}><Download size={15}/> Export</button><button className="secondary-button" disabled={disabled||live} onClick={()=>setReplay(n=>n+1)}><RotateCcw size={15}/> Replay</button></div></div>
        <div className="custom-service-bar"><span className={`service-state-pill ${live?'is-ready':''}`} role="status">{demo?'Demo · Preview only':state}</span><span className="custom-service-hint">{!status?'App required to apply to your keyboard':live?'Runs after closing this page':updateRequired?'Update the app to use this preset':'Preview first, then apply'}</span><button className="apply-button" disabled={disabled} onClick={()=>void playback.apply().then(ok=>{if(ok)setDemo(false)})}>{playback.busy?'Applying…':updateRequired?'Update app':applied?'Reapply preset':'Apply to keyboard'}</button>{status?.enabled&&<button className="secondary-button" disabled={disabled} onClick={()=>void playback.onboard()}>Use onboard lighting</button>}</div>
        <details className="service-details"><summary>Service details</summary><div><p>{status?`${status.fps.toFixed(1)} FPS · ${status.connected?'Keyboard connected':'Waiting for keyboard'} · ${synced?'Preview synced':'Local preview or waiting for frames'}`:'The background service is not responding.'}</p>{status?.lastError&&<p>{status.lastError}</p>}<div className="custom-rgb-actions"><button className="secondary-button" onClick={onSetup}>Setup / Update</button>{status&&<a className="secondary-button" href="http://127.0.0.1:16868/" target="_blank" rel="noreferrer">Service panel</a>}<button className="secondary-button" onClick={()=>void refreshRgbService()}>Check again</button></div></div></details>
        {(playback.error||previewError)&&<p className="stream-error" role="alert">{playback.error||previewError}</p>}
        <div className="custom-rgb-columns">
          <aside className="custom-rgb-stack"><h3>Base layer</h3><button className={`custom-rgb-layer ${active==='base'&&!adding?'active':''}`} disabled={disabled} onClick={()=>{setActive('base');setAdding(false)}}><Waves size={16}/><span>{auroraBase?'Aurora':mode.name}</span></button><h3>Effect layers</h3><p className="custom-rgb-stack-note">Lower layers blend over earlier ones.</p>{config.layers.map((item,i)=><div key={item.id} className={`custom-rgb-layer ${active===item.id&&!adding?'active':''} ${!item.enabled?'muted':''}`}><button className="custom-rgb-layer-select" disabled={disabled} onClick={()=>{setActive(item.id);setAdding(false)}}><span className="layer-color-dot" style={{background:hex(item.color)}}/><span>{CUSTOM_RGB_EFFECTS.find(e=>e.id===item.effect)?.name}</span><small>{i+1}</small></button><input type="checkbox" aria-label={`Enable ${CUSTOM_RGB_EFFECTS.find(e=>e.id===item.effect)?.name} layer ${i+1}`} checked={item.enabled} disabled={disabled} onChange={e=>change({...config,layers:config.layers.map(l=>l.id===item.id?{...l,enabled:e.target.checked}:l)})}/></div>)}<button className="custom-rgb-add" disabled={disabled||config.layers.length>=MAX_RGB_LAYERS} onClick={()=>setAdding(true)}><Plus size={16}/> Add layer</button>{!config.layers.length&&<p className="custom-rgb-empty">Choose a layer to bring your base colors to life.</p>}{layer&&!adding&&<div className="custom-rgb-order"><button className="secondary-button" aria-label="Move layer up" disabled={disabled||config.layers[0]?.id===active} onClick={()=>move(-1)}><ArrowUp size={15}/></button><button className="secondary-button" aria-label="Move layer down" disabled={disabled||config.layers.at(-1)?.id===active} onClick={()=>move(1)}><ArrowDown size={15}/></button><button className="secondary-button" aria-label="Delete selected layer" disabled={disabled} onClick={()=>change({...config,layers:config.layers.filter(l=>l.id!==active)})}><Trash2 size={15}/></button></div>}</aside>
          <div className="custom-rgb-inspector"><div className="custom-rgb-selection"><div className="custom-inspector-heading"><h3>{adding?'Add an effect':active==='base'?'Base effect':definition?.name}</h3>{adding&&<button className="secondary-button" onClick={()=>setAdding(false)}>Cancel</button>}</div><div className="custom-rgb-effect-grid">{active==='base'&&!adding?<><button disabled={disabled} aria-pressed={auroraBase} onClick={()=>{if(!auroraBase)change({...config,base:{...config.base,mix:true,rgb:[34,211,238]},baseEffect:{effect:'aurora',palette:'aurora',width:2.5,speed:.5}})}}><Sparkles size={15}/>Aurora</button>{KEY_RGB_MODES.map(item=><button key={item.id} disabled={disabled} aria-pressed={!auroraBase&&config.base.mode===item.id} onClick={()=>change({...config,baseEffect:undefined,base:{...config.base,mode:item.id}})}><Waves size={15}/>{item.name}</button>)}</>:CUSTOM_RGB_EFFECTS.filter(effect=>effect.id!=='aurora'||layer?.effect==='aurora'&&!adding).map(effect=><button key={effect.id} disabled={disabled} aria-pressed={!adding&&layer?.effect===effect.id} onClick={()=>choose(effect.id)}><Sparkles size={15}/>{effect.name}</button>)}</div></div>
          {!adding&&<div className="custom-rgb-parameters"><h3>{active==='base'?'Base parameters':'Effect parameters'}</h3>{active==='base'?<><Slider label="Brightness" value={config.base.brightness*5} min={0} max={100} step={5} unit="%" disabled={disabled} onChange={v=>base({brightness:v/5})}/>{auroraBase&&config.baseEffect?<>
            <p className="custom-rgb-description">Soft color curtains across all keys. Add FX layers for key reactions.</p>
            <div className="custom-slider-grid"><Slider label="Ribbon width" value={config.baseEffect.width} min={.25} max={12} step={.25} unit="keys" disabled={disabled} onChange={v=>animation({width:v})}/><Slider label="Speed" value={config.baseEffect.speed} min={.5} max={3} step={.5} unit="×" disabled={disabled} onChange={v=>animation({speed:v})}/></div>
            <div className="custom-rgb-direction"><span>Color mode</span><div><button disabled={disabled} aria-pressed={!config.base.mix} onClick={()=>base({mix:false})}>Single color</button><button disabled={disabled} aria-pressed={config.base.mix} onClick={()=>base({mix:true})}>Palette</button></div></div>
            {config.base.mix?<div className="custom-palette-options">{Object.entries(RGB_GRADIENT_PALETTES).map(([id,palette])=><button key={id} disabled={disabled} aria-pressed={config.baseEffect?.palette===id} onClick={()=>animation({palette:id as RgbGradientPalette})}><span style={{background:`linear-gradient(90deg,${palette.colors.join(',')})`}}/>{palette.name}</button>)}</div>:<label className="custom-rgb-color">Base color<RgbColorPicker label="Base effect color" value={hex(config.base.rgb)} disabled={disabled} onChange={v=>base({rgb:rgb(v)})}/></label>}
          </>:<>{mode.speed&&<Slider label="Base speed" value={config.base.speed+1} min={1} max={5} unit="/ 5" disabled={disabled} onChange={v=>base({speed:v-1})}/>} {mode.color&&<><label className="custom-rgb-color">Base color<RgbColorPicker label="Base effect color" value={hex(config.base.rgb)} disabled={disabled} onChange={v=>base({rgb:rgb(v)})}/></label><label className="custom-rgb-check"><input type="checkbox" checked={config.base.mix} disabled={disabled} onChange={e=>base({mix:e.target.checked})}/> Multicolor</label></>}</>}</>:layer&&metadata&&<><p className="custom-rgb-description">{definition?.detail}</p>{layer.effect==="aurora"&&<div className="custom-rgb-base-migration"><p>Aurora is now a Base effect. Move this layer to cover all keys and control its brightness directly.</p><button className="secondary-button" disabled={disabled} onClick={moveAuroraToBase}>Move Aurora to Base</button></div>}{!metadata.semanticColor&&<>{metadata.gradient?<><div className="custom-rgb-direction"><span>Color mode</span><div><button disabled={disabled} aria-pressed={!layer.multicolor} onClick={()=>patchLayer({multicolor:false})}>Single color</button><button disabled={disabled} aria-pressed={layer.multicolor} onClick={()=>patchLayer({multicolor:true})}>Palette</button></div></div>{layer.multicolor&&<div className="custom-palette-options">{Object.entries(RGB_GRADIENT_PALETTES).map(([id,palette])=><button key={id} disabled={disabled} aria-pressed={(layer.palette??(layer.effect==='comet'?'ice':'aurora'))===id} onClick={()=>patchLayer({palette:id as RgbGradientPalette})}><span style={{background:`linear-gradient(90deg,${palette.colors.join(',')})`}}/>{palette.name}</button>)}</div>}</>:<label className="custom-rgb-check"><input type="checkbox" checked={layer.multicolor} disabled={disabled} onChange={e=>patchLayer({multicolor:e.target.checked})}/> Multicolor</label>}{(!metadata.gradient||!layer.multicolor)&&<label className="custom-rgb-color">Effect color<RgbColorPicker label="Layer color" value={hex(layer.color)} disabled={disabled} onChange={v=>patchLayer({color:rgb(v)})}/></label>}</>}<div className="custom-slider-grid"><Slider label="Opacity" value={layer.opacity} min={0} max={100} unit="%" disabled={disabled} onChange={v=>patchLayer({opacity:v})}/>{metadata.width&&<Slider label={metadata.width} value={layer.width} min={.25} max={12} step={.25} unit="keys" disabled={disabled} onChange={v=>patchLayer({width:v})}/>} {metadata.speed&&<Slider label="Speed" value={layer.speed} min={.5} max={30} step={.5} unit={metadata.speed} disabled={disabled} onChange={v=>patchLayer({speed:v})}/>} {metadata.duration&&<Slider label={metadata.duration} value={layer.duration} min={100} max={4000} step={50} unit="ms" disabled={disabled} onChange={v=>patchLayer({duration:v})}/>}</div>{metadata.direction&&<div className="custom-rgb-direction"><span>Direction</span><div>{(['horizontal','vertical'] as const).map(direction=><button key={direction} disabled={disabled} aria-pressed={layer.direction===direction} onClick={()=>patchLayer({direction})}>{direction==='horizontal'?'Horizontal':'Vertical'}</button>)}</div></div>}{metadata.hall&&<p className="custom-rgb-description">{live?'Analog feedback runs automatically in the background app.':'Click or type to simulate a press. Apply with the app for actual analog feedback.'}</p>}</>}
          <div className="custom-rgb-key-tools"><h3>Affected keys</h3><span>{selected.size} selected{layer?` · Layer affects ${layer.keys.length}`:''}</span><div className="custom-rgb-actions"><button className="secondary-button" disabled={disabled} onClick={()=>setSelected(new Set(HERO68_KEY_IDS))}>All keys</button><button className="secondary-button" disabled={disabled} onClick={()=>setSelected(new Set())}>Clear selection</button>{layer&&<><button className="apply-button" disabled={disabled||!selected.size} onClick={()=>patchLayer({keys:[...selected]})}>Use selection</button><button className="secondary-button" disabled={disabled} onClick={()=>patchLayer({keys:[...HERO68_KEY_IDS]})}>Affect all keys</button></>}{active==='base'&&!auroraBase&&<><RgbColorPicker label="Paint selected keys" value={paint} disabled={disabled} onChange={setPaint}/><button className="apply-button" disabled={disabled||!selected.size||config.base.mode!==19} onClick={()=>{const colors={...value.colors};for(const id of selected)colors[id]=rgb(paint);onChange({...value,colors})}}>Paint keys</button></>}</div>{active==='base'&&!auroraBase&&config.base.mode!==19&&<p className="custom-rgb-description">Choose Per-key Color to paint individual keys.</p>}</div>
          {active==='base'&&!auroraBase&&<details className="service-details"><summary>Advanced</summary><div><button className="secondary-button" disabled={disabled} onClick={()=>onChange({...value,keys:{...config.base}})}>Use base on keyboard</button><p>Stages the base for Save. Custom layers remain in your local preset.</p></div></details>}</div>}</div>
        </div>
        <p className="rgb-preview-note">Side lights keep their onboard effect. {demo?'Demo only changes the preview.':'Apply streams the key effects through the background app.'}</p>
      </section>
    </div>
    {locked&&<div className="custom-rgb-lock-overlay"><div className="custom-rgb-lock-card" role="status"><span className="custom-lock-icon"><Layers size={27}/></span><h2>{checking?'Checking background service…':'Background service required'}</h2><p>Run the background app to use Custom Effects, or try a preview.</p><div className="custom-rgb-actions"><button className="apply-button" onClick={onSetup}><Download size={16}/> Download app</button><button className="secondary-button" onClick={()=>setDemo(true)}>Try demo</button><button className="custom-text-button" onClick={()=>void refreshRgbService()}>Check again</button></div></div></div>}
  </div>
}
