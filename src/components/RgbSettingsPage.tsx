import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Sparkles, Waves, Palette, RotateCcw } from 'lucide-react'
import CustomRgbEditor from './CustomRgbEditor'
import { restoreCustomRgb } from '../keyboard/customRgb'
import Hero68Preview from './Hero68Preview'
import RgbColorPicker from './RgbColorPicker'
import { FirmwareRgbPreview } from "../keyboard/rgbPreview"
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'
import { KEY_RGB_MODES, SIDE_RGB_MODES } from '../keyboard/rgbCatalog'
import type { LightingFrame } from '../keyboard/lightingPreviewBus'
import type { RgbColor, RgbProfile, RgbZone } from '../protocol/hero68/rgb'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import './RgbSettingsPage.css'

const colorHex=(color:RgbColor)=>'#'+color.map(v=>v.toString(16).padStart(2,'0')).join('')
const hexColor=(hex:string):RgbColor=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)) as RgbColor
export default function RgbSettingsPage({value,onChange,busy,advancedBindings}: {value:RgbProfile;onChange:(value:RgbProfile)=>void;busy:boolean;advancedBindings:AdvancedBinding[]}) {
  const [zone,setZone]=useState<'keys'|'side'>('keys')
  const [selected,setSelected]=useState(new Set<string>())
  const [paint,setPaint]=useState('#ffd95a')
  const [replay,setReplay]=useState(0)
  const [frame,setFrame]=useState<{keys:LightingFrame;side:string[]}>({keys:{},side:Array(18).fill('#35393b')})
  const [error,setError]=useState<string|null>(null)
  const engineRef=useRef<FirmwareRgbPreview|null>(null)
  const replayRef=useRef(replay)
  const releases=useRef<{at:number;id:string}[]>([])
  const effects=zone==='keys'?KEY_RGB_MODES:SIDE_RGB_MODES, config=value[zone]
  const customMode=value.custom?.enabled===true
  const capability=effects.find(mode=>mode.id===config.mode)
  const perKey=zone==='keys'&&config.mode===19
  const brightnessMax=zone==='side'?4:20
  function change(patch:Partial<RgbZone>) {onChange({...value,[zone]:{...config,...patch,...(patch.mix!==undefined||patch.rgb!==undefined?{mixValue:undefined}:{})}})}
  useEffect(()=>{
    if(customMode) return
    let handle=0, elapsed=0, previous=0, eventIndex=0, disposed=false
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)")
    const events=HERO68_KEY_IDS.slice(17,22).flatMap((id,i)=>[{at:150+i*140,id,pressed:true},{at:350+i*140,id,pressed:false}]).sort((a,b)=>a.at-b.at)
    setError(null)
    releases.current=[]
    try {
      const reused=engineRef.current instanceof FirmwareRgbPreview&&replayRef.current===replay
      const engine=reused?engineRef.current!:new FirmwareRgbPreview(value)
      engine.configure(value);engineRef.current=engine;replayRef.current=replay
      // A paused/reduced-motion preview still needs a newly generated frame,
      // rather than displaying the previous Single-color frame after MIX changes.
      elapsed=engine.ticks*0.5+(!reused||document.hidden||reduced.matches?110:0.5);engine.advance(elapsed);setFrame(engine.frame())
      for(const event of events) event.at+=elapsed
      function render(now:number) {
        if(disposed||document.hidden||reduced.matches) {previous=0;return}
        elapsed+=previous?Math.min(now-previous,100):0;previous=now
        try {
          while(eventIndex<events.length&&events[eventIndex].at<=elapsed) {const event=events[eventIndex++];engine.advance(event.at);engine.event(event.id,event.pressed)}
          while(releases.current.length&&releases.current[0].at<=elapsed) {const event=releases.current.shift()!;engine.advance(event.at);engine.event(event.id,false)}
          engine.advance(elapsed);setFrame(engine.frame());handle=requestAnimationFrame(render)
        } catch(e) {setError(e instanceof Error?e.message:String(e))}
      }
      const resume=()=>{cancelAnimationFrame(handle);previous=0;if(!document.hidden&&!reduced.matches)handle=requestAnimationFrame(render)}
      document.addEventListener("visibilitychange",resume);reduced.addEventListener("change",resume);resume()
      return ()=>{disposed=true;cancelAnimationFrame(handle);document.removeEventListener("visibilitychange",resume);reduced.removeEventListener("change",resume)}
    } catch(e) {setError(e instanceof Error?e.message:String(e))}
  },[value,replay,customMode])
  function toggle(id:string) {
    if(perKey) setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})
    else {const engine=engineRef.current;if(engine){
      engine.event(id,true)
      if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) {engine.advance(engine.ticks*0.5+50);setFrame(engine.frame());engine.event(id,false)}
      else releases.current.push({at:engine.ticks*0.5+150,id})
    }}
  }
  return <div className="page settings-page rgb-settings-page page-enter">
    <div className="settings-hero"><div><h1>RGB Settings</h1><p>{customMode?'Build a base and blend your own RGB effects.':'Onboard lighting · Changes are applied with Save.'}</p></div><span className="rgb-basic-badge">{customMode?'Custom':'Onboard'}</span></div>
    <div className="rgb-zone-tabs" role="group" aria-label="RGB mode">{[false,true].map(custom=><button key={String(custom)} disabled={busy} aria-pressed={customMode===custom} onClick={()=>onChange({...value,custom:{...restoreCustomRgb(value.custom,value),enabled:custom}})}>{custom?'Custom Effects':'Onboard Effects'}</button>)}</div>
    {customMode?<CustomRgbEditor value={value} onChange={onChange} busy={busy} advancedBindings={advancedBindings}/>:<>
    <div className="rgb-preview-stage">
      <Hero68Preview advancedBindings={advancedBindings} selectedKeys={perKey?selected:new Set()} onToggleKey={toggle} lightingFrame={frame.keys} selectionEnabled={perKey}/>
      <div className="rgb-side-preview" aria-label="18 side light positions">{frame.side.map((color,i)=><span key={i} style={{background:color,color}}/>)}</div>
    </div>
    <div className="rgb-zone-tabs" role="group" aria-label="Lighting zone">{(['keys','side'] as const).map(id=><button key={id} aria-pressed={zone===id} onClick={()=>setZone(id)}>{id==='keys'?'Keys':'Side Light'}</button>)}</div>
    <section className="settings-card rgb-basic-card">
      <div className="rgb-section-heading"><div><h2>{zone==='keys'?'Key lighting':'Side lighting'}</h2><p>{effects.length} effects stored on your keyboard</p></div><button className="secondary-button" onClick={()=>setReplay(x=>x+1)}><RotateCcw size={15}/> Replay preview</button></div>
      <div className="rgb-mode-grid">{effects.map((mode,i)=>{const Icon=[Lightbulb,Waves,Sparkles,Palette][i%4];return <button key={mode.id} disabled={busy} className={config.mode===mode.id?'active':''} aria-pressed={config.mode===mode.id} onClick={()=>change({mode:mode.id})}><Icon size={19}/><span>{mode.name}</span></button>})}</div>
      {!capability&&<p className="rgb-inline-note">Unrecognized onboard mode {config.mode}. It is preserved until you select another effect.</p>}
      <div className="rgb-parameters">
        <label>Brightness <strong>{config.brightness<=brightnessMax?`${config.brightness*(zone==='side'?25:5)}%`:`Unknown (${config.brightness})`}</strong><input aria-label="RGB brightness" type="range" min="0" max={brightnessMax} value={Math.min(config.brightness,brightnessMax)} disabled={busy||!capability||config.mode===0} onChange={e=>change({brightness:Number(e.target.value)})}/></label>
        <label>Speed <strong>{config.speed+1} / 5</strong><input aria-label="RGB speed" type="range" min="0" max="4" value={config.speed} disabled={busy||!capability?.speed} onChange={e=>change({speed:Number(e.target.value)})}/></label>
        {capability?.color&&<div className="rgb-color-controls"><div className="rgb-active-color">{config.mix?<><span className="rgb-rainbow-swatch" aria-label="Multicolor palette"/><span>Multicolor</span></>:<><label>Color<RgbColorPicker label="Effect color" value={colorHex(config.rgb)} disabled={busy} onChange={hex=>change({rgb:hexColor(hex)})}/></label><span>{colorHex(config.rgb).toUpperCase()}</span></>}</div><label className="rgb-mix"><input type="checkbox" checked={config.mix} disabled={busy} onChange={e=>change({mix:e.target.checked})}/> Multicolor</label></div>}
      </div>
      {perKey&&<div className="rgb-per-key"><div><h3>Paint your keys</h3><p>Select keys above, choose a color, then apply it. Black turns LEDs off.</p></div><div className="rgb-paint-actions"><span>{selected.size} keys selected</span><button className="secondary-button" onClick={()=>setSelected(new Set(HERO68_KEY_IDS))}>Select all</button><button className="secondary-button" onClick={()=>setSelected(new Set())}>Deselect</button><RgbColorPicker label="Per-key color" value={paint} disabled={busy} onChange={setPaint}/><button className="apply-button" disabled={busy||!selected.size} onClick={()=>{const colors={...value.colors};for(const id of selected)colors[id]=hexColor(paint);onChange({...value,colors})}}>Apply color</button></div></div>}
      {capability?.reactive&&<p className="rgb-inline-note">Replay uses sample key presses. You can also click a key to trigger the preview.</p>}
      {config.brightness>brightnessMax&&<p className="rgb-inline-note">This draft has an unrecognized brightness value. Choose a supported level before saving this zone.</p>}
      {error&&<p className="stream-error">Preview unavailable: {error}</p>}
      <p className="rgb-preview-note">Preview uses firmware V3.20 RGB calculations. Screen colors may differ from the LEDs.</p>
    </section>
    </>}
  </div>
}
