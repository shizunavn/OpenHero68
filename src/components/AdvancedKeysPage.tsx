import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Plus, Search, Trash2, X } from 'lucide-react'
import Hero68Preview from './Hero68Preview'
import AdvancedKeyIcon from './AdvancedKeyIcon'
import FeatureHelp from './FeatureHelp'
import { useI18n } from '../i18n'
import { HERO68_KEY_IDS, HERO68_LAYOUT } from '../keyboard/hero68Layout'
import { ADVANCED_KINDS, ADVANCED_LIMIT, newAdvanced, validateAdvanced, type AdvancedBinding, type AdvancedKind } from '../protocol/hero68/advanced'
import { REMAP_CATEGORIES, remapLabel } from '../protocol/hero68/remap'
import { ADVANCED_PRESETS, applyAdvancedPreset, presetConflicts, type AdvancedPreset } from '../protocol/hero68/advancedPresets'
import { AppSelect } from '../app/components/AppSelect'
import './AdvancedKeysPage.css'

const INFO: Record<AdvancedKind,{title:string;description:string}> = {
  SOCD:{title:'SOCD',description:'Pair two keys and choose which input takes priority when both are pressed.'},
  DKS:{title:'Dynamic Keystroke (DKS)',description:'Assign up to four actions to different points of a key press and release.'},
  MT:{title:'Mod Tap',description:'Two actions on one key. Hold for the first action, or tap for the second.'},
  TGL:{title:'Toggle Key',description:'Tap to lock an action on or off. Hold the key for normal press and release.'},
  MPT:{title:'Multi-point Trigger (MPT)',description:'Activate three actions at three different depths of a single key.'},
  END:{title:'Release Action (END)',description:'Keep the normal key press and send an additional action when you release it.'},
}
const phases = ['Start of press','Deep press','Release from deep','End of release']
const label = (key:string) => HERO68_LAYOUT.flat().find(k=>k.id===key)?.label ?? key
const neutral = Object.fromEntries(HERO68_KEY_IDS.map(k=>[k,'#292d2f']))
const SOCD_OPTIONS = [{value:1,title:'Last input priority',desc:'The last key pressed overrides the first.'},{value:3,title:'First key priority',desc:'Key 1 wins whenever both keys are active.'},{value:4,title:'Second key priority',desc:'Key 2 wins whenever both keys are active.'},{value:0,title:'Neutral',desc:'Neither key is active while both are pressed.'}]
type Props = {bindings:AdvancedBinding[];busy:boolean;pending:boolean;connected:boolean;onChange:(bindings:AdvancedBinding[])=>void}
type View = 'overview'|'assign'|'edit'
function bindingSummary(binding:AdvancedBinding,tr:ReturnType<typeof useI18n>['tr']) {
  const actions=binding.actions.map(remapLabel)
  if(binding.kind==='SOCD')return tr(SOCD_OPTIONS.find(o=>o.value===binding.mode)?.title ?? 'Existing keyboard priority')
  if(binding.kind==='MT')return tr('Hold: {hold} · Tap: {tap}',{hold:actions[0],tap:actions[1]})
  if(binding.kind==='TGL')return tr('Toggle: {action}',{action:actions[0]})
  if(binding.kind==='END')return tr('On release: {action}',{action:actions[0]})
  if(binding.kind==='MPT')return binding.thresholds.map((depth,i)=>`${depth.toFixed(2)} mm: ${actions[i]}`).join(' · ')
  if(binding.kind==='DKS')return actions.filter((_,i)=>binding.states[i]?.some(Boolean)).join(' · ') || tr('No actions assigned')
  return tr('Preserved from the keyboard; editing unavailable')
}
function ActionPicker({value,onChange,title}:{value:number;onChange:(v:number)=>void;title:string}) {
  const { tr } = useI18n()
  const [open,setOpen] = useState(false), [query,setQuery] = useState('')
  const container = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null)
  const [position,setPosition] = useState({left:0,top:0})
  useEffect(()=>{ if(!open)return; const close=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))setOpen(false)}; const move=(e:Event)=>{if(!(e.target instanceof Node)||!popup.current?.contains(e.target))setOpen(false)}; document.addEventListener('pointerdown',close); window.addEventListener('resize',move); window.addEventListener('scroll',move,true); return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',move);window.removeEventListener('scroll',move,true)}},[open])
  const normalize=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'')
  const categories = REMAP_CATEGORIES.map(c=>({...c,actions:c.actions.filter(a=>normalize(`${a.label} ${a.description}`).includes(normalize(query)))})).filter(c=>c.actions.length)
  return <div className="ak-action-picker" ref={container}>
    <button type="button" className="ak-action-key" aria-label={`${title}: ${remapLabel(value)}`} aria-expanded={open} onClick={()=>{const rect=container.current!.getBoundingClientRect();setPosition({left:Math.max(18,Math.min(rect.left,window.innerWidth-Math.min(440,window.innerWidth-36)-18)),top:Math.max(18,Math.min(rect.bottom+8,window.innerHeight-420))});setOpen(!open)}}>{remapLabel(value)}</button>
    {open&&createPortal(<div ref={popup} className="ak-action-popover" style={{position:'fixed',left:position.left,top:position.top}} role="dialog" aria-label={tr('Choose {action}',{action:title})} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false)}}}>
      <div className="ak-picker-head"><strong>{title}</strong><button className="icon-button" aria-label={tr('Close action picker')} onClick={()=>setOpen(false)}><X size={16}/></button></div>
      <label className="ak-search"><Search size={16}/><input autoFocus type="search" placeholder={tr('Search actions…')} aria-label={tr('Search actions')} value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="ak-action-results">{categories.map(c=><section key={c.id}><h4>{tr(c.label)}</h4><div>{c.actions.map((a,i)=><button key={`${a.value}:${i}`} className={a.value===value?'is-active':''} onClick={()=>{onChange(a.value);setOpen(false);setQuery('');container.current?.querySelector('button')?.focus()}}>{tr(a.label)}</button>)}</div></section>)}{!categories.length&&<p>{tr('No actions match your search.')}</p>}</div>
    </div>,document.body)}
  </div>
}
function Depth({value,onChange,title}:{value:number;onChange:(n:number)=>void;title:string}) {
  return <label className="ak-depth"><input aria-label={title} type="number" min="0.1" max="3.4" step="0.05" value={value} onChange={e=>onChange(Number(e.target.value))}/><span>mm</span></label>
}
function DksGrid({binding,onChange}:{binding:AdvancedBinding;onChange:(b:AdvancedBinding)=>void}) {
  const { tr } = useI18n()
  const drag = useRef<{row:number;start:number;end:number}|null>(null), skipClick = useRef(false)
  const [preview,setPreview] = useState<{row:number;start:number;end:number}|null>(null)
  const setRow=(r:number,states:number[])=>onChange({...binding,states:binding.states.map((s,i)=>i===r?states:s)})
  const hold=(start:number,end:number):number[]=>{
    const states=[0,0,0,0]
    if(end===start+1)states[start]=14
    else if(start===0&&end===2){states[0]=6;states[1]=12}
    else if(start===0&&end===3){states[0]=6;states[1]=4;states[2]=12}
    else if(start===1&&end===3){states[1]=6;states[2]=12}
    return states
  }
  const presets = ['Custom','No action','Tap at start','Tap at deep press','Tap on release from deep','Tap at end of release','Hold: start → deep press','Hold: deep press → release from deep','Hold: release from deep → end','Hold: start → release from deep','Hold: start → end','Hold: deep press → end']
  const patterns=[[0,0,0,0],[10,0,0,0],[0,10,0,0],[0,0,10,0],[0,0,0,10],hold(0,1),hold(1,2),hold(2,3),hold(0,2),hold(0,3),hold(1,3)]
  return <div className="ak-dks-editor">
    <p>{tr('Choose each action and when it should tap or stay held. Set unused actions to')} <strong>{tr('No action')}</strong>.</p>
    <div className="ak-dks-simple">{binding.actions.map((action,r)=>{
      const matched=patterns.findIndex(p=>p.every((n,i)=>n===binding.states[r][i]))
      return <div className="ak-dks-simple-row" key={r}><span>{tr('Action {count}',{count:r+1})}</span><ActionPicker value={action} title={tr('Action {count}',{count:r+1})} onChange={v=>onChange({...binding,actions:binding.actions.map((a,i)=>i===r?v:a)})}/><AppSelect label={tr('Action {count} pattern',{count:r+1})} value={matched+1} onChange={value=>{const pattern=patterns[value-1];if(pattern)setRow(r,pattern)}} options={presets.map((pattern,i)=>({value:i,label:tr(pattern),disabled:i===0}))} /></div>
    })}</div>
    <p className="ak-hint">{tr('Press')}: {binding.thresholds[0].toFixed(2)} → {binding.thresholds[1].toFixed(2)} mm · {tr('Release')}: {binding.thresholds[2].toFixed(2)} → {binding.thresholds[3].toFixed(2)} mm</p>
    <details className="ak-dks-details"><summary>{tr('Fine-tune depths & action points')}</summary>
    <div className="ak-dks-grid" onPointerUp={()=>{const d=drag.current;if(d&&d.end>d.start){setRow(d.row,hold(d.start,d.end));skipClick.current=true}drag.current=null;setPreview(null)}} onPointerLeave={()=>{drag.current=null;setPreview(null)}}>
      <span className="ak-grid-corner">{tr('Bindings')}</span>{phases.map((p,i)=><div className={`ak-phase ak-phase-${i}`} key={p}>{i<2?<ArrowDown size={23}/>:<ArrowUp size={23}/>}<strong>{tr(p)}</strong><Depth value={binding.thresholds[i]} title={tr('{point} depth',{point:tr(p)})} onChange={v=>onChange({...binding,thresholds:binding.thresholds.map((n,j)=>i===j?v:n)})}/></div>)}
      {binding.actions.map((action,r)=>{const range=([[0,1],[1,2],[2,3],[0,2],[0,3],[1,3]] as const).find(([start,end])=>hold(start,end).every((v,i)=>binding.states[r][i]===v));return <div className="ak-dks-row" key={r}><ActionPicker value={action} title={tr('Action {count}',{count:r+1})} onChange={v=>onChange({...binding,actions:binding.actions.map((a,i)=>i===r?v:a)})}/>{phases.map((p,c)=>{
        const lit=range?c>=range[0]&&c<=range[1]:binding.states[r][c]!==0, highlighted=preview?.row===r&&c>=preview.start&&c<=preview.end
        return <button type="button" key={p} className={`ak-dks-point ${lit?'is-active':''} ${highlighted?'is-dragging':''} ${range&&c>=range[0]&&c<range[1]?'has-hold-next':''} ${range&&c>range[0]&&c<=range[1]?'has-hold-prev':''}`} aria-label={tr('Action {count}: {point}',{count:r+1,point:tr(p)})} aria-pressed={lit}
          onPointerDown={e=>{skipClick.current=false;if(e.button===0){drag.current={row:r,start:c,end:c};setPreview(drag.current)}}}
          onPointerEnter={()=>{if(drag.current?.row===r&&c>=drag.current.start){drag.current.end=c;setPreview({...drag.current})}}}
          onClick={()=>{if(skipClick.current){skipClick.current=false;return}const states=binding.states[r].some(v=>v!==0&&v!==10)?[0,0,0,0]:[...binding.states[r]];states[c]=states[c]===10?0:10;setRow(r,states)}}>{lit?<span className="ak-point-dot"/>:<Plus size={15}/>}</button>
      })}</div>})}
    </div>
    <p className="ak-hint">{tr('Click a point for a single action. Drag from one point to a later point to hold the action between them.')}</p>
    </details>
  </div>
}
function OutputTester() {
  const { tr } = useI18n()
  const [held,setHeld] = useState<string[]>([]), [released,setReleased] = useState<string[]>([])
  return <div className="ak-tester" tabIndex={0} aria-label={tr('Advanced Key output tester')} onBlur={()=>setHeld([])} onKeyDown={e=>{if(e.key==='Tab')return;e.stopPropagation();e.preventDefault();if(!e.repeat)setHeld(h=>[...new Set([...h,e.code])])}} onKeyUp={e=>{if(e.key==='Tab')return;e.stopPropagation();e.preventDefault();setHeld(h=>h.filter(k=>k!==e.code));setReleased(h=>[e.code,...h.filter(k=>k!==e.code)].slice(0,5))}}>
    <strong>{tr('Test your binding')}</strong><p>{tr('Save to the keyboard, then click here and press your configured key.')}</p><small>{tr('Pressed keys')}</small><div className="ak-output">{held.length?held.map(k=><kbd key={k}>{label(k)}</kbd>):<span>—</span>}</div><small>{tr('Recently released')}</small><div className="ak-output is-released">{released.map(k=><kbd key={k}>{label(k)}</kbd>)}</div>
  </div>
}
export default function AdvancedKeysPage({bindings,busy,pending,connected,onChange}:Props) {
  const { tr } = useI18n()
  const [view,setView] = useState<View>('overview'), [kind,setKind] = useState<AdvancedKind>('SOCD')
  const [presetReview,setPresetReview] = useState<AdvancedPreset|null>(null)
  const page = useRef<HTMLDivElement>(null)
  useEffect(()=>{page.current?.scrollIntoView({block:'start',behavior:'instant'})},[view])
  const [keys,setKeys] = useState<(string|null)[]>([]), [slot,setSlot] = useState(0), [draft,setDraft] = useState<AdvancedBinding|null>(null)
  const [editingId,setEditingId] = useState<string|null>(null), [error,setError] = useState(''), [removeOpen,setRemoveOpen] = useState(false), [hovered,setHovered] = useState<string|null>(null)
  useEffect(()=>{if(error)page.current?.querySelector('[role="alert"]')?.scrollIntoView({block:'nearest',behavior:'instant'})},[error])
  const required=kind==='SOCD'?2:1, info=INFO[kind]
  const [notice,setNotice] = useState('')
  const assignedKeys=keys.filter((key):key is string=>key!==null)
  const ready=assignedKeys.length===required
  const occupied = useMemo(()=>new Map(bindings.flatMap(b=>b.keys.map(k=>[k,b] as const))),[bindings])
  const highlighted = new Set(view==='edit'?draft?.keys:view==='assign'?assignedKeys:hovered?occupied.get(hovered)?.keys:assignedKeys)
  const decorations:Record<string,React.ReactNode>={}
  for(const key of HERO68_KEY_IDS)if(!occupied.has(key))decorations[key]=<span className="ak-preview-key"><span>{label(key)}</span><span className={`ak-preview-plus ${keys.includes(key)?'is-remove':''}`}>{keys.includes(key)?<X size={13}/>:<Plus size={13}/>}</span></span>
  function assign(key:string){
    if(busy)return
    setError('');setNotice('')
    if(view==='edit')return
    const existing=occupied.get(key)
    if(view==='overview'&&existing){if(existing.kind==='UNKNOWN'){setError(tr('This firmware binding is preserved, but its editor is unavailable.'));return}setKind(existing.kind);setDraft(structuredClone(existing));setEditingId(existing.id);setKeys(existing.keys);setView('edit');return}
    if(existing){setError(tr('{key} already has an Advanced Key. Edit or remove that binding first.',{key:label(key)}));return}
    if(view==='overview'){setKeys(keys.includes(key)?[]:[key]);return}
    if(keys.includes(key)){const index=keys.indexOf(key);setKeys(keys.map((k,i)=>i===index?null:k));setSlot(index);return}
    const next=Array.from({length:required},(_,i)=>keys[i]??null);next[slot]=key;setKeys(next);const empty=next.indexOf(null);if(empty!==-1)setSlot(empty)
  }
  function begin(mode:AdvancedKind,preset?:string[]){setKind(mode);setEditingId(null);setError('');setDraft(null);const selected=(preset??assignedKeys).filter(k=>!occupied.has(k)).slice(0,mode==='SOCD'?2:1);setKeys(selected);setSlot(selected.length<(mode==='SOCD'?2:1)?selected.length:0);setNotice('');setView('assign')}
  function cancel(){setView('overview');setDraft(null);setKeys([]);setError('');setEditingId(null);setRemoveOpen(false);setHovered(null)}
  function commit(){if(!draft)return;try{const next=[...bindings.filter(b=>b.id!==editingId),{...draft,id:draft.keys[0],raw:undefined}];validateAdvanced(next);onChange(next);cancel();setNotice(tr(editingId?'Binding updated in your profile draft. Save the profile to apply it to the keyboard.':'Binding added to your profile draft. Save the profile to apply it to the keyboard.'))}catch(e){setError(e instanceof Error?e.message:String(e))}}
  function applyPreset(preset:AdvancedPreset,confirmed=false){try{const next=applyAdvancedPreset(bindings,preset);if(!confirmed&&presetConflicts(bindings,preset).length){setPresetReview(preset);return}onChange(next);setPresetReview(null);cancel();setNotice(tr('{name} added to your profile draft. Use Save to profile above to apply it to the keyboard.',{name:tr(preset.title)}))}catch(e){setPresetReview(null);setError(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(presetReview){setPresetReview(null);return}if(!removeOpen&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLSelectElement))cancel()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[removeOpen,presetReview])
  const action=(index:number,title:string)=>draft&&<label className="ak-action-field"><span>{tr(title)}</span><ActionPicker title={tr(title)} value={draft.actions[index]} onChange={v=>setDraft({...draft,actions:draft.actions.map((a,i)=>i===index?v:a)})}/></label>
  return <div ref={page} className="page advanced-keys-page page-enter" aria-busy={busy}>
    <section className={`keyboard-stage ak-keyboard-stage ${view==='assign'?'is-assigning':''}`}><Hero68Preview advancedBindings={bindings} selectedKeys={highlighted} onToggleKey={assign} lightingFrame={neutral} keyDecorations={decorations}/></section>
    {error&&<p className="ak-error" role="alert">{error}</p>}
    {view==='overview'&&notice&&pending&&<p className="ak-draft-notice" role="status">{notice}</p>}
    {view==='overview'?<><div className="ak-page-heading"><h1>{tr('Advanced Keys')}</h1><FeatureHelp title="Advanced Keys" paragraphs={['Assign different actions to a key based on how you press it, or pair two keys to control simultaneous inputs.','Choose a mode, select its physical key or keys, then configure the binding. Add binding or Apply changes keeps your edits locally; Save to profile sends them to the keyboard.']}/><span>{tr(pending?'Draft changes · not saved to keyboard':'Main Layer')}</span></div>
      <div className="ak-overview"><article className="ak-card"><h2>{tr('Add an Advanced Key')}</h2><p>{assignedKeys.length?tr('{key} selected. Choose what it should do below.', { key: label(assignedKeys[0]) }):tr('Choose a type below, then select the key or keys you want to configure.')}</p><div className="ak-mode-list">{ADVANCED_KINDS.map(mode=><button key={mode} disabled={bindings.length>=ADVANCED_LIMIT||busy} onClick={()=>begin(mode)}><AdvancedKeyIcon kind={mode}/><span><strong>{tr(INFO[mode].title)}</strong><span>{tr(INFO[mode].description)}</span></span></button>)}</div></article>
        <article className="ak-card ak-current"><h2>{tr('Configured Advanced Keys')} <small>{bindings.length} / {ADVANCED_LIMIT}</small></h2>{!bindings.length?<div className="ak-empty"><p>{tr('No Advanced Keys configured yet. Select a type on the left to add your first binding.')}</p><div className="ak-empty-symbol"><Plus size={28}/></div></div>:<div className="ak-binding-list">{bindings.map(b=><button key={b.id} onMouseEnter={()=>setHovered(b.keys[0])} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(b.keys[0])} onBlur={()=>setHovered(null)} onClick={()=>assign(b.keys[0])}><AdvancedKeyIcon kind={b.kind}/><span><strong>{b.kind==='UNKNOWN'?tr('Firmware binding'):tr(INFO[b.kind].title)}</strong><span>{b.keys.map(k=><kbd key={k}>{label(k)}</kbd>)}</span><small className="ak-binding-summary">{bindingSummary(b,tr)}</small></span><span className="ak-edit-label">{tr(b.kind==='UNKNOWN'?'Read only':'Edit')}</span></button>)}</div>}<p className="ak-save-note">{tr(pending?(connected?'Draft changes are ready. Use Save to profile above to apply them to the keyboard.':'Draft changes are kept locally. Connect HERO68, then use Save to profile above.'):'Select a binding to edit its behavior.')}</p>{connected&&!pending&&bindings.length>0&&<details className="ak-test-disclosure"><summary>{tr('Test saved keyboard output')}</summary><OutputTester/></details>}</article>
      </div></>:<section className="ak-workbench"><header className="ak-workbench-head"><h2>{tr(info.title)}</h2><FeatureHelp title={info.title} paragraphs={[info.description,kind==='DKS'?'The columns follow the press and release journey. Click a point to trigger once, or drag across points to hold the selected action.':'Choose the physical key above and set its behavior below. Save the profile before testing it on your keyboard.']}/><div><button className="secondary-button" onClick={cancel}>{tr('Cancel')}</button>{view==='edit'&&editingId&&<button className="secondary-button ak-delete" onClick={()=>setRemoveOpen(true)}><Trash2 size={15}/>{tr('Delete')}</button>}<button className="apply-button" disabled={busy||(view==='assign'&&!ready)} onClick={()=>{if(view==='assign'){setDraft(newAdvanced(kind,assignedKeys));setView('edit')}else commit()}}>{tr(view==='assign'?'Configure binding':editingId?'Apply changes':'Add binding')}</button></div></header>
      <p className="ak-step-status">{view==='assign'?tr('Step 1 of 2 · {count} / {required} keys selected',{count:assignedKeys.length,required})+(ready?' · '+tr('Ready to configure'):''):tr('Step 2 of 2 · Configure the behavior, then add it to your profile draft.')}</p>
      <div className="ak-workbench-body"><article className="ak-editor">
        {view==='assign'?<><h3>{tr(required===2?'Select two keys from the keyboard preview above':'Select a key from the keyboard preview above')}</h3><p>{tr(info.description)}</p><div className="ak-assign-slots">{Array.from({length:required},(_,i)=><label key={i}><span>{tr('Key')} {i+1}</span><button className={`ak-assign-slot ${keys[i]?'is-filled':''} ${slot===i?'is-active':''}`} aria-label={tr('Assign key {count}',{count:i+1})} onClick={()=>setSlot(i)}>{keys[i]?label(keys[i]):tr('Assign')}</button></label>)}</div><div className="ak-physical-input" tabIndex={0} aria-label={tr('Assign using physical keyboard')} onKeyDown={e=>{if(e.key==='Tab')return;if(HERO68_KEY_IDS.includes(e.code)){e.preventDefault();if(!e.repeat)assign(e.code)}}}>{tr('Or click here and press a physical key to assign it.')}</div></>:draft&&<><div className="ak-target-keys">{draft.keys.map(k=><kbd key={k}>{label(k)}</kbd>)}<span>{tr(info.title)}</span></div>
          {kind==='SOCD'?<div className="ak-socd-options"><h3>{tr('When both keys are pressed')}</h3>{SOCD_OPTIONS.map(o=><label key={o.value} className={draft.mode===o.value?'is-active':''}><input type="radio" name="socd" checked={draft.mode===o.value} onChange={()=>setDraft({...draft,mode:o.value})}/><span><strong>{tr(o.title)}{o.value===3?` (${label(draft.keys[0])})`:o.value===4?` (${label(draft.keys[1])})`:''}</strong><span>{tr(o.desc)}</span></span></label>)}{draft.mode===2&&<p>{tr('Mode 2 is retained from the keyboard; choose a verified mode to change it.')}</p>}</div>
          :kind==='DKS'?<DksGrid binding={draft} onChange={setDraft}/>
          :kind==='MPT'?<div className="ak-mpt"><h3>{tr('Depth-triggered actions')}</h3><p>{tr('Deeper presses add actions. Releasing the key removes them in reverse order.')}</p>{draft.actions.map((_,i)=><div key={i}><span>{tr('Point {count}',{count:i+1})}</span>{action(i,tr('Action {count}',{count:i+1}))}<Depth title={tr('Point {count} depth',{count:i+1})} value={draft.thresholds[i]} onChange={v=>setDraft({...draft,thresholds:draft.thresholds.map((d,j)=>i===j?v:d)})}/></div>)}</div>
          :<><p>{tr(info.description)}</p><div className="ak-simple-actions">{kind==='MT'?<>{action(0,'Hold action')}{action(1,'Tap action')}</>:action(0,kind==='END'?'Action on release':'Toggle action')}</div>{['MT','TGL'].includes(kind)&&<label className="ak-delay"><span>{tr(kind==='MT'?'Hold duration':'Tap / hold duration')}</span><div><input type="number" aria-label={tr('Tap hold delay')} min="1" max="65535" value={draft.delay} onChange={e=>setDraft({...draft,delay:Number(e.target.value)})}/><span>ms</span></div></label>}{['MT','TGL'].includes(kind)&&<p className="ak-hint">{kind==='MT'?tr('Release within {delay} ms to send {tap}. Hold longer to send {hold}.',{delay:draft.delay,tap:remapLabel(draft.actions[1]),hold:remapLabel(draft.actions[0])}):tr('Release within {delay} ms to toggle {action}. Hold longer for a normal press and release.',{delay:draft.delay,action:remapLabel(draft.actions[0])})}</p>}</>}
        </>}
      </article><aside className="ak-side-panel">{view==='assign'?<><h3>{tr(kind==='SOCD'?'Suggested key pairs':'Ready-made bindings')}</h3>{kind==='SOCD'?<>{[['KeyA','KeyD'],['ArrowLeft','ArrowRight']].map(pair=><button className="ak-preset" key={pair[0]} disabled={pair.some(k=>occupied.has(k))} onClick={()=>{setKeys(pair);setSlot(1)}}><div>{pair.map(k=><kbd key={k}>{label(k)}</kbd>)}</div><strong>{tr(pair[0]==='KeyA'?'Instant direction switching':'Left / right pair')}</strong><span>{tr('Use this pair, then choose its priority behavior.')}</span><small className="ak-preset-cta">{tr('Select this pair')}</small></button>)}</>:ADVANCED_PRESETS.some(p=>p.kind===kind)?<>{ADVANCED_PRESETS.filter(p=>p.kind===kind).map(p=><button key={p.id} className="ak-preset" disabled={busy} onClick={()=>applyPreset(p)}><div>{p.badges.map(b=><kbd key={b}>{b}</kbd>)}</div><strong>{tr(p.title)}</strong><span>{tr(p.description)}</span><small className="ak-preset-cta">{tr('Add preset to draft')}</small></button>)}<p className="ak-hint">{tr('Apply a preset to your profile draft in one click. Save to the keyboard when ready.')}</p></>:<div className="ak-preset-info"><AdvancedKeyIcon kind={kind}/><p>{tr('Choose one physical key to start. You can select its action in the next step.')}</p></div>}</>:<><h3>{tr('Finish & save')}</h3><ol className="ak-finish-steps"><li>{tr('Choose the actions and settings on the left.')}</li><li>{tr('Click {action} to keep them in your profile draft.',{action:tr(editingId?'Apply changes':'Add binding')})}</li><li>{tr(connected?'Use Save to profile above to apply them to the keyboard.':'Connect HERO68, then use Save to profile above.')}</li></ol><p className="ak-hint">{tr('After saving, test the binding from the configured bindings list.')}</p></>}</aside></div>
    </section>}
    {presetReview&&<div className="ak-modal-backdrop" onClick={()=>setPresetReview(null)}><section role="dialog" aria-modal="true" aria-labelledby="ak-preset-title" className="ak-remove-modal" onClick={e=>e.stopPropagation()}><h2 id="ak-preset-title">{tr('Replace existing bindings?')}</h2><p>{tr('{name} will replace bindings on {keys}. Paired keys in a replaced binding are removed together.',{name:tr(presetReview.title),keys:presetConflicts(bindings,presetReview).flatMap(b=>b.keys).map(label).join(', ')})}</p><p>{tr('Changes stay in your profile draft until you save.')}</p><div><button autoFocus className="secondary-button" onClick={()=>setPresetReview(null)}>{tr('Cancel')}</button><button className="apply-button" onClick={()=>applyPreset(presetReview,true)}>{tr('Apply preset')}</button></div></section></div>}
    {removeOpen&&<div className="ak-modal-backdrop" onClick={()=>setRemoveOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="ak-remove-title" className="ak-remove-modal" onClick={e=>e.stopPropagation()}><h2 id="ak-remove-title">{tr('Remove this binding?')}</h2><p>{tr('{keys} will return to its normal key behavior after the profile is saved.',{keys:draft?.keys.map(label).join(' + ')??''})}</p><div><button autoFocus className="secondary-button" onClick={()=>setRemoveOpen(false)}>{tr('Cancel')}</button><button className="apply-button" onClick={()=>{onChange(bindings.filter(b=>b.id!==editingId));cancel()}}>{tr('Remove binding')}</button></div></section></div>}
  </div>
}
