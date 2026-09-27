import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Plus, Search, Trash2, X } from 'lucide-react'
import Hero68Preview from './Hero68Preview'
import AdvancedKeyIcon from './AdvancedKeyIcon'
import FeatureHelp from './FeatureHelp'
import { HERO68_KEY_IDS, HERO68_LAYOUT } from '../keyboard/hero68Layout'
import { ADVANCED_KINDS, ADVANCED_LIMIT, newAdvanced, validateAdvanced, type AdvancedBinding, type AdvancedKind } from '../protocol/hero68/advanced'
import { REMAP_CATEGORIES, remapLabel } from '../protocol/hero68/remap'
import { ADVANCED_PRESETS, applyAdvancedPreset, presetConflicts, type AdvancedPreset } from '../protocol/hero68/advancedPresets'
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
function bindingSummary(binding:AdvancedBinding) {
  const actions=binding.actions.map(remapLabel)
  if(binding.kind==='SOCD')return SOCD_OPTIONS.find(o=>o.value===binding.mode)?.title ?? 'Existing keyboard priority'
  if(binding.kind==='MT')return `Hold: ${actions[0]} · Tap: ${actions[1]}`
  if(binding.kind==='TGL')return `Toggle: ${actions[0]}`
  if(binding.kind==='END')return `On release: ${actions[0]}`
  if(binding.kind==='MPT')return binding.thresholds.map((depth,i)=>`${depth.toFixed(2)} mm: ${actions[i]}`).join(' · ')
  if(binding.kind==='DKS')return actions.filter((_,i)=>binding.states[i]?.some(Boolean)).join(' · ') || 'No actions assigned'
  return 'Preserved from the keyboard; editing unavailable'
}
function ActionPicker({value,onChange,title}:{value:number;onChange:(v:number)=>void;title:string}) {
  const [open,setOpen] = useState(false), [query,setQuery] = useState('')
  const container = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null)
  const [position,setPosition] = useState({left:0,top:0})
  useEffect(()=>{ if(!open)return; const close=(e:PointerEvent)=>{if(!container.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))setOpen(false)}; const move=(e:Event)=>{if(!(e.target instanceof Node)||!popup.current?.contains(e.target))setOpen(false)}; document.addEventListener('pointerdown',close); window.addEventListener('resize',move); window.addEventListener('scroll',move,true); return()=>{document.removeEventListener('pointerdown',close);window.removeEventListener('resize',move);window.removeEventListener('scroll',move,true)}},[open])
  const normalize=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'')
  const categories = REMAP_CATEGORIES.map(c=>({...c,actions:c.actions.filter(a=>normalize(`${a.label} ${a.description}`).includes(normalize(query)))})).filter(c=>c.actions.length)
  return <div className="ak-action-picker" ref={container}>
    <button type="button" className="ak-action-key" aria-label={`${title}: ${remapLabel(value)}`} aria-expanded={open} onClick={()=>{const rect=container.current!.getBoundingClientRect();setPosition({left:Math.max(18,Math.min(rect.left,window.innerWidth-Math.min(440,window.innerWidth-36)-18)),top:Math.max(18,Math.min(rect.bottom+8,window.innerHeight-420))});setOpen(!open)}}>{remapLabel(value)}</button>
    {open&&createPortal(<div ref={popup} className="ak-action-popover" style={{position:'fixed',left:position.left,top:position.top}} role="dialog" aria-label={`Choose ${title}`} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false)}}}>
      <div className="ak-picker-head"><strong>{title}</strong><button className="icon-button" aria-label="Close action picker" onClick={()=>setOpen(false)}><X size={16}/></button></div>
      <label className="ak-search"><Search size={16}/><input autoFocus type="search" placeholder="Search actions…" aria-label="Search actions" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="ak-action-results">{categories.map(c=><section key={c.id}><h4>{c.label}</h4><div>{c.actions.map((a,i)=><button key={`${a.value}:${i}`} className={a.value===value?'is-active':''} onClick={()=>{onChange(a.value);setOpen(false);setQuery('');container.current?.querySelector('button')?.focus()}}>{a.label}</button>)}</div></section>)}{!categories.length&&<p>No actions match your search.</p>}</div>
    </div>,document.body)}
  </div>
}
function Depth({value,onChange,title}:{value:number;onChange:(n:number)=>void;title:string}) {
  return <label className="ak-depth"><input aria-label={title} type="number" min="0.1" max="3.4" step="0.05" value={value} onChange={e=>onChange(Number(e.target.value))}/><span>mm</span></label>
}
function DksGrid({binding,onChange}:{binding:AdvancedBinding;onChange:(b:AdvancedBinding)=>void}) {
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
    <p>Choose each action and when it should tap or stay held. Set unused actions to <strong>No action</strong>.</p>
    <div className="ak-dks-simple">{binding.actions.map((action,r)=>{
      const matched=patterns.findIndex(p=>p.every((n,i)=>n===binding.states[r][i]))
      return <div className="ak-dks-simple-row" key={r}><span>Action {r+1}</span><ActionPicker value={action} title={`Action ${r+1}`} onChange={v=>onChange({...binding,actions:binding.actions.map((a,i)=>i===r?v:a)})}/><select aria-label={`Action ${r+1} pattern`} value={matched+1} onChange={e=>{const pattern=patterns[Number(e.target.value)-1];if(pattern)setRow(r,pattern)}}>{presets.map((pattern,i)=><option key={pattern} value={i} disabled={i===0}>{pattern}</option>)}</select></div>
    })}</div>
    <p className="ak-hint">Press: {binding.thresholds[0].toFixed(2)} → {binding.thresholds[1].toFixed(2)} mm · Release: {binding.thresholds[2].toFixed(2)} → {binding.thresholds[3].toFixed(2)} mm</p>
    <details className="ak-dks-details"><summary>Fine-tune depths &amp; action points</summary>
    <div className="ak-dks-grid" onPointerUp={()=>{const d=drag.current;if(d&&d.end>d.start){setRow(d.row,hold(d.start,d.end));skipClick.current=true}drag.current=null;setPreview(null)}} onPointerLeave={()=>{drag.current=null;setPreview(null)}}>
      <span className="ak-grid-corner">Bindings</span>{phases.map((p,i)=><div className={`ak-phase ak-phase-${i}`} key={p}>{i<2?<ArrowDown size={23}/>:<ArrowUp size={23}/>}<strong>{p}</strong><Depth value={binding.thresholds[i]} title={`${p} depth`} onChange={v=>onChange({...binding,thresholds:binding.thresholds.map((n,j)=>i===j?v:n)})}/></div>)}
      {binding.actions.map((action,r)=>{const range=([[0,1],[1,2],[2,3],[0,2],[0,3],[1,3]] as const).find(([start,end])=>hold(start,end).every((v,i)=>binding.states[r][i]===v));return <div className="ak-dks-row" key={r}><ActionPicker value={action} title={`Action ${r+1}`} onChange={v=>onChange({...binding,actions:binding.actions.map((a,i)=>i===r?v:a)})}/>{phases.map((p,c)=>{
        const lit=range?c>=range[0]&&c<=range[1]:binding.states[r][c]!==0, highlighted=preview?.row===r&&c>=preview.start&&c<=preview.end
        return <button type="button" key={p} className={`ak-dks-point ${lit?'is-active':''} ${highlighted?'is-dragging':''} ${range&&c>=range[0]&&c<range[1]?'has-hold-next':''} ${range&&c>range[0]&&c<=range[1]?'has-hold-prev':''}`} aria-label={`Action ${r+1}: ${p}`} aria-pressed={lit}
          onPointerDown={e=>{skipClick.current=false;if(e.button===0){drag.current={row:r,start:c,end:c};setPreview(drag.current)}}}
          onPointerEnter={()=>{if(drag.current?.row===r&&c>=drag.current.start){drag.current.end=c;setPreview({...drag.current})}}}
          onClick={()=>{if(skipClick.current){skipClick.current=false;return}const states=binding.states[r].some(v=>v!==0&&v!==10)?[0,0,0,0]:[...binding.states[r]];states[c]=states[c]===10?0:10;setRow(r,states)}}>{lit?<span className="ak-point-dot"/>:<Plus size={15}/>}</button>
      })}</div>})}
    </div>
    <p className="ak-hint">Click a point for a single action. Drag from one point to a later point to hold the action between them.</p>
    </details>
  </div>
}
function OutputTester() {
  const [held,setHeld] = useState<string[]>([]), [released,setReleased] = useState<string[]>([])
  return <div className="ak-tester" tabIndex={0} aria-label="Advanced Key output tester" onBlur={()=>setHeld([])} onKeyDown={e=>{if(e.key==='Tab')return;e.stopPropagation();e.preventDefault();if(!e.repeat)setHeld(h=>[...new Set([...h,e.code])])}} onKeyUp={e=>{if(e.key==='Tab')return;e.stopPropagation();e.preventDefault();setHeld(h=>h.filter(k=>k!==e.code));setReleased(h=>[e.code,...h.filter(k=>k!==e.code)].slice(0,5))}}>
    <strong>Test your binding</strong><p>Save to the keyboard, then click here and press your configured key.</p><small>Pressed keys</small><div className="ak-output">{held.length?held.map(k=><kbd key={k}>{label(k)}</kbd>):<span>—</span>}</div><small>Recently released</small><div className="ak-output is-released">{released.map(k=><kbd key={k}>{label(k)}</kbd>)}</div>
  </div>
}
export default function AdvancedKeysPage({bindings,busy,pending,connected,onChange}:Props) {
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
    if(view==='overview'&&existing){if(existing.kind==='UNKNOWN'){setError('This firmware binding is preserved, but its editor is unavailable.');return}setKind(existing.kind);setDraft(structuredClone(existing));setEditingId(existing.id);setKeys(existing.keys);setView('edit');return}
    if(existing){setError(`${label(key)} already has an Advanced Key. Edit or remove that binding first.`);return}
    if(view==='overview'){setKeys(keys.includes(key)?[]:[key]);return}
    if(keys.includes(key)){const index=keys.indexOf(key);setKeys(keys.map((k,i)=>i===index?null:k));setSlot(index);return}
    const next=Array.from({length:required},(_,i)=>keys[i]??null);next[slot]=key;setKeys(next);const empty=next.indexOf(null);if(empty!==-1)setSlot(empty)
  }
  function begin(mode:AdvancedKind,preset?:string[]){setKind(mode);setEditingId(null);setError('');setDraft(null);const selected=(preset??assignedKeys).filter(k=>!occupied.has(k)).slice(0,mode==='SOCD'?2:1);setKeys(selected);setSlot(selected.length<(mode==='SOCD'?2:1)?selected.length:0);setNotice('');setView('assign')}
  function cancel(){setView('overview');setDraft(null);setKeys([]);setError('');setEditingId(null);setRemoveOpen(false);setHovered(null)}
  function commit(){if(!draft)return;try{const next=[...bindings.filter(b=>b.id!==editingId),{...draft,id:draft.keys[0],raw:undefined}];validateAdvanced(next);onChange(next);cancel();setNotice(editingId?'Binding updated in your profile draft. Save the profile to apply it to the keyboard.':'Binding added to your profile draft. Save the profile to apply it to the keyboard.')}catch(e){setError(e instanceof Error?e.message:String(e))}}
  function applyPreset(preset:AdvancedPreset,confirmed=false){try{const next=applyAdvancedPreset(bindings,preset);if(!confirmed&&presetConflicts(bindings,preset).length){setPresetReview(preset);return}onChange(next);setPresetReview(null);cancel();setNotice(`${preset.title} added to your profile draft. Use Save to profile above to apply it to the keyboard.`)}catch(e){setPresetReview(null);setError(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=='Escape')return;if(presetReview){setPresetReview(null);return}if(!removeOpen&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLSelectElement))cancel()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[removeOpen,presetReview])
  const action=(index:number,title:string)=>draft&&<label className="ak-action-field"><span>{title}</span><ActionPicker title={title} value={draft.actions[index]} onChange={v=>setDraft({...draft,actions:draft.actions.map((a,i)=>i===index?v:a)})}/></label>
  return <div ref={page} className="page advanced-keys-page page-enter" aria-busy={busy}>
    <section className={`keyboard-stage ak-keyboard-stage ${view==='assign'?'is-assigning':''}`}><Hero68Preview advancedBindings={bindings} selectedKeys={highlighted} onToggleKey={assign} lightingFrame={neutral} keyDecorations={decorations}/></section>
    {error&&<p className="ak-error" role="alert">{error}</p>}
    {view==='overview'&&notice&&pending&&<p className="ak-draft-notice" role="status">{notice}</p>}
    {view==='overview'?<><div className="ak-page-heading"><h1>Advanced Keys</h1><FeatureHelp title="Advanced Keys" paragraphs={['Assign different actions to a key based on how you press it, or pair two keys to control simultaneous inputs.','Choose a mode, select its physical key or keys, then configure the binding. Add binding or Apply changes keeps your edits locally; Save to profile sends them to the keyboard.']}/><span>{pending?'Draft changes · not saved to keyboard':'Main Layer'}</span></div>
      <div className="ak-overview"><article className="ak-card"><h2>Add an Advanced Key</h2><p>{assignedKeys.length?`${label(assignedKeys[0])} selected. Choose what it should do below.`:"Choose a type below, then select the key or keys you want to configure."}</p><div className="ak-mode-list">{ADVANCED_KINDS.map(mode=><button key={mode} disabled={bindings.length>=ADVANCED_LIMIT||busy} onClick={()=>begin(mode)}><AdvancedKeyIcon kind={mode}/><span><strong>{INFO[mode].title}</strong><span>{INFO[mode].description}</span></span></button>)}</div></article>
        <article className="ak-card ak-current"><h2>Configured Advanced Keys <small>{bindings.length} / {ADVANCED_LIMIT}</small></h2>{!bindings.length?<div className="ak-empty"><p>No Advanced Keys configured yet. Select a type on the left to add your first binding.</p><div className="ak-empty-symbol"><Plus size={28}/></div></div>:<div className="ak-binding-list">{bindings.map(b=><button key={b.id} onMouseEnter={()=>setHovered(b.keys[0])} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(b.keys[0])} onBlur={()=>setHovered(null)} onClick={()=>assign(b.keys[0])}><AdvancedKeyIcon kind={b.kind}/><span><strong>{b.kind==='UNKNOWN'?'Firmware binding':INFO[b.kind].title}</strong><span>{b.keys.map(k=><kbd key={k}>{label(k)}</kbd>)}</span><small className="ak-binding-summary">{bindingSummary(b)}</small></span><span className="ak-edit-label">{b.kind==='UNKNOWN'?'Read only':'Edit'}</span></button>)}</div>}<p className="ak-save-note">{pending?(connected?"Draft changes are ready. Use Save to profile above to apply them to the keyboard.":"Draft changes are kept locally. Connect HERO68, then use Save to profile above."):"Select a binding to edit its behavior."}</p>{connected&&!pending&&bindings.length>0&&<details className="ak-test-disclosure"><summary>Test saved keyboard output</summary><OutputTester/></details>}</article>
      </div></>:<section className="ak-workbench"><header className="ak-workbench-head"><h2>{info.title}</h2><FeatureHelp title={info.title} paragraphs={[info.description,kind==='DKS'?'The columns follow the press and release journey. Click a point to trigger once, or drag across points to hold the selected action.':'Choose the physical key above and set its behavior below. Save the profile before testing it on your keyboard.']}/><div><button className="secondary-button" onClick={cancel}>Cancel</button>{view==='edit'&&editingId&&<button className="secondary-button ak-delete" onClick={()=>setRemoveOpen(true)}><Trash2 size={15}/>Delete</button>}<button className="apply-button" disabled={busy||(view==='assign'&&!ready)} onClick={()=>{if(view==='assign'){setDraft(newAdvanced(kind,assignedKeys));setView('edit')}else commit()}}>{view==='assign'?'Configure binding':editingId?'Apply changes':'Add binding'}</button></div></header>
      <p className="ak-step-status">{view==='assign'?`Step 1 of 2 · ${assignedKeys.length} / ${required} keys selected${ready?' · Ready to configure':''}`:"Step 2 of 2 · Configure the behavior, then add it to your profile draft."}</p>
      <div className="ak-workbench-body"><article className="ak-editor">
        {view==='assign'?<><h3>Select {required===2?'two keys':'a key'} from the keyboard preview above</h3><p>{info.description}</p><div className="ak-assign-slots">{Array.from({length:required},(_,i)=><label key={i}><span>Key {i+1}</span><button className={`ak-assign-slot ${keys[i]?'is-filled':''} ${slot===i?'is-active':''}`} aria-label={`Assign key ${i+1}`} onClick={()=>setSlot(i)}>{keys[i]?label(keys[i]):'Assign'}</button></label>)}</div><div className="ak-physical-input" tabIndex={0} aria-label="Assign using physical keyboard" onKeyDown={e=>{if(e.key==='Tab')return;if(HERO68_KEY_IDS.includes(e.code)){e.preventDefault();if(!e.repeat)assign(e.code)}}}>Or click here and press a physical key to assign it.</div></>:draft&&<><div className="ak-target-keys">{draft.keys.map(k=><kbd key={k}>{label(k)}</kbd>)}<span>{info.title}</span></div>
          {kind==='SOCD'?<div className="ak-socd-options"><h3>When both keys are pressed</h3>{SOCD_OPTIONS.map(o=><label key={o.value} className={draft.mode===o.value?'is-active':''}><input type="radio" name="socd" checked={draft.mode===o.value} onChange={()=>setDraft({...draft,mode:o.value})}/><span><strong>{o.title}{o.value===3?` (${label(draft.keys[0])})`:o.value===4?` (${label(draft.keys[1])})`:''}</strong><span>{o.desc}</span></span></label>)}{draft.mode===2&&<p>Mode 2 is retained from the keyboard; choose a verified mode to change it.</p>}</div>
          :kind==='DKS'?<DksGrid binding={draft} onChange={setDraft}/>
          :kind==='MPT'?<div className="ak-mpt"><h3>Depth-triggered actions</h3><p>Deeper presses add actions. Releasing the key removes them in reverse order.</p>{draft.actions.map((_,i)=><div key={i}><span>Point {i+1}</span>{action(i,`Action ${i+1}`)}<Depth title={`Point ${i+1} depth`} value={draft.thresholds[i]} onChange={v=>setDraft({...draft,thresholds:draft.thresholds.map((d,j)=>i===j?v:d)})}/></div>)}</div>
          :<><p>{info.description}</p><div className="ak-simple-actions">{kind==='MT'?<>{action(0,'Hold action')}{action(1,'Tap action')}</>:action(0,kind==='END'?'Action on release':'Toggle action')}</div>{['MT','TGL'].includes(kind)&&<label className="ak-delay"><span>{kind==='MT'?'Hold duration':'Tap / hold duration'}</span><div><input type="number" aria-label="Tap hold delay" min="1" max="65535" value={draft.delay} onChange={e=>setDraft({...draft,delay:Number(e.target.value)})}/><span>ms</span></div></label>}{['MT','TGL'].includes(kind)&&<p className="ak-hint">{kind==='MT'?`Release within ${draft.delay} ms to send ${remapLabel(draft.actions[1])}. Hold longer to send ${remapLabel(draft.actions[0])}.`:`Release within ${draft.delay} ms to toggle ${remapLabel(draft.actions[0])}. Hold longer for a normal press and release.`}</p>}</>}
        </>}
      </article><aside className="ak-side-panel">{view==='assign'?<><h3>{kind==='SOCD'?'Suggested key pairs':'Ready-made bindings'}</h3>{kind==='SOCD'?<>{[['KeyA','KeyD'],['ArrowLeft','ArrowRight']].map(pair=><button className="ak-preset" key={pair[0]} disabled={pair.some(k=>occupied.has(k))} onClick={()=>{setKeys(pair);setSlot(1)}}><div>{pair.map(k=><kbd key={k}>{label(k)}</kbd>)}</div><strong>{pair[0]==='KeyA'?'Instant direction switching':'Left / right pair'}</strong><span>Use this pair, then choose its priority behavior.</span><small className="ak-preset-cta">Select this pair</small></button>)}</>:ADVANCED_PRESETS.some(p=>p.kind===kind)?<>{ADVANCED_PRESETS.filter(p=>p.kind===kind).map(p=><button key={p.id} className="ak-preset" disabled={busy} onClick={()=>applyPreset(p)}><div>{p.badges.map(b=><kbd key={b}>{b}</kbd>)}</div><strong>{p.title}</strong><span>{p.description}</span><small className="ak-preset-cta">Add preset to draft</small></button>)}<p className="ak-hint">Apply a preset to your profile draft in one click. Save to the keyboard when ready.</p></>:<div className="ak-preset-info"><AdvancedKeyIcon kind={kind}/><p>Choose one physical key to start. You can select its action in the next step.</p></div>}</>:<><h3>Finish &amp; save</h3><ol className="ak-finish-steps"><li>Choose the actions and settings on the left.</li><li>Click <strong>{editingId?'Apply changes':'Add binding'}</strong> to keep them in your profile draft.</li><li>{connected?<>Use <strong>Save to profile</strong> above to apply them to the keyboard.</>:<>Connect HERO68, then use <strong>Save to profile</strong> above.</>}</li></ol><p className="ak-hint">After saving, test the binding from the configured bindings list.</p></>}</aside></div>
    </section>}
    {presetReview&&<div className="ak-modal-backdrop" onClick={()=>setPresetReview(null)}><section role="dialog" aria-modal="true" aria-labelledby="ak-preset-title" className="ak-remove-modal" onClick={e=>e.stopPropagation()}><h2 id="ak-preset-title">Replace existing bindings?</h2><p>{presetReview.title} will replace bindings on {presetConflicts(bindings,presetReview).flatMap(b=>b.keys).map(label).join(', ')}. Paired keys in a replaced binding are removed together.</p><p>Changes stay in your profile draft until you save.</p><div><button autoFocus className="secondary-button" onClick={()=>setPresetReview(null)}>Cancel</button><button className="apply-button" onClick={()=>applyPreset(presetReview,true)}>Apply preset</button></div></section></div>}
    {removeOpen&&<div className="ak-modal-backdrop" onClick={()=>setRemoveOpen(false)}><section role="dialog" aria-modal="true" aria-labelledby="ak-remove-title" className="ak-remove-modal" onClick={e=>e.stopPropagation()}><h2 id="ak-remove-title">Remove this binding?</h2><p>{draft?.keys.map(label).join(' + ')} will return to its normal key behavior after the profile is saved.</p><div><button autoFocus className="secondary-button" onClick={()=>setRemoveOpen(false)}>Cancel</button><button className="apply-button" onClick={()=>{onChange(bindings.filter(b=>b.id!==editingId));cancel()}}>Remove binding</button></div></section></div>}
  </div>
}
