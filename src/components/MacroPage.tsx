import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Circle, Copy, Download, ListOrdered, Play, Plus, Search, Square, Trash2, Upload } from 'lucide-react'
import FeatureHelp from './FeatureHelp'
import { MACRO_ACTIONS, MACRO_DRAFT_KEY, MACRO_EVENT_LIMIT, MACRO_LIBRARY_LIMIT, heldMacroKeys, loadMacroLibrary, macroExport, macroKeyLabel, newMacro, parseMacroImport, saveMacroLibrary, validateMacro, type MacroDefinition, type MacroEvent } from '../state/macros'
import { syncHero68MacroLibrary } from '../protocol/hero68/macroDevice'
import { hero68DeviceManager, useHero68Device } from '../protocol/hero68/webhid'
import { AppSelect } from '../app/components/AppSelect'
import './MacroPage.css'
import { useI18n } from '../i18n'

function loadWorkspace() {
  let macros:MacroDefinition[]=[], draft:MacroDefinition|null=null, error=''
  try { macros=loadMacroLibrary() } catch { error='The saved macro library could not be read. Export or recover your existing data before replacing it.' }
  try { const stored=localStorage.getItem(MACRO_DRAFT_KEY); if(stored){draft=JSON.parse(stored);validateMacro(draft,false)} } catch { draft=null }
  return {macros,draft,error}
}
const playbackLabels = {once:'Play once',repeat:'Repeat a set number of times',hold:'Repeat while held',toggle:'Tap to start / stop'}
const mouseButtonToMacroKey: Record<number,string> = {0:'MouseKey0',1:'MouseKey2',2:'MouseKey1',3:'MouseKey3',4:'MouseKey4'}
export default function MacroPage() {
  const { tr } = useI18n()
  const initial=useMemo(loadWorkspace,[])
  const [macros,setMacros]=useState(initial.macros), [draft,setDraft]=useState<MacroDefinition|null>(initial.draft??initial.macros[0]??null)
  const [query,setQuery]=useState(''), [error,setError]=useState(initial.error), [notice,setNotice]=useState('')
  const [recording,setRecording]=useState(false), [playing,setPlaying]=useState(false), [previewIndex,setPreviewIndex]=useState<number|null>(null), [previewHeld,setPreviewHeld]=useState<string[]>([])
  const [addKey,setAddKey]=useState('KeyA'), [eventType,setEventType]=useState<'down'|'up'>('down'), [fixedDelay,setFixedDelay]=useState(50), [useRecordedDelay,setUseRecordedDelay]=useState(true)
  const [switchTarget,setSwitchTarget]=useState<MacroDefinition|null>(null), [undoDelete,setUndoDelete]=useState<MacroDefinition|null>(null), [deviceSaving,setDeviceSaving]=useState(false), [deviceSynced,setDeviceSynced]=useState(false)
  const device=useHero68Device()
  const recorder=useRef<{events:MacroEvent[];held:Set<string>;last:number}|null>(null), recordArea=useRef<HTMLDivElement>(null), recordToggleButton=useRef<HTMLButtonElement>(null), importInput=useRef<HTMLInputElement>(null), previewTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const saved=macros.find(macro=>macro.id===draft?.id), dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(saved)
  const locked=recording||playing||deviceSaving, duration=draft?.events.reduce((sum,event)=>sum+event.delayMs,0)??0
  useEffect(()=>{try{if(!draft){localStorage.removeItem(MACRO_DRAFT_KEY);return}validateMacro(draft,false);localStorage.setItem(MACRO_DRAFT_KEY,JSON.stringify(draft))}catch{/* Keep the last valid draft while an input is incomplete. */}},[draft])
  useEffect(()=>()=>{if(previewTimer.current)clearTimeout(previewTimer.current)},[])
  useEffect(()=>{
    if(!recording)return
    const shouldIgnorePointerTarget=(target:EventTarget|null)=>target instanceof Node && !!recordToggleButton.current?.contains(target)
    const recordCode=(code:string,type:'down'|'up')=>{
      if(!recorder.current||!MACRO_ACTIONS.some(action=>action.name===code))return
      const session=recorder.current
      if(type==='down'&&(session.held.has(code)))return
      if(type==='up'&&!session.held.has(code))return
      if(session.events.length+session.held.size+2>=MACRO_EVENT_LIMIT){stopRecording();setError(tr('Recording reached the event limit. Save this sequence before starting another.'));return}
      const now=performance.now(), delayMs=session.events.length?(useRecordedDelay?Math.min(60000,Math.max(0,Math.round(now-session.last))):fixedDelay):0
      session.events.push({key:code,type,delayMs});session.last=now
      if(type==='down')session.held.add(code);else session.held.delete(code)
      setDraft(previous=>previous?{...previous,events:[...session.events]}:previous)
    }
    const onKeyDown=(event:KeyboardEvent)=>{
      if(!MACRO_ACTIONS.some(action=>action.name===event.code))return
      event.preventDefault();event.stopPropagation();if(event.repeat)return
      recordCode(event.code,'down')
    }
    const onKeyUp=(event:KeyboardEvent)=>{
      if(!MACRO_ACTIONS.some(action=>action.name===event.code))return
      event.preventDefault();event.stopPropagation();recordCode(event.code,'up')
    }
    const onMouseDown=(event:MouseEvent)=>{
      if(shouldIgnorePointerTarget(event.target))return
      const code=mouseButtonToMacroKey[event.button]
      if(!code)return
      event.preventDefault();event.stopPropagation();recordCode(code,'down')
    }
    const onMouseUp=(event:MouseEvent)=>{
      if(shouldIgnorePointerTarget(event.target))return
      const code=mouseButtonToMacroKey[event.button]
      if(!code)return
      event.preventDefault();event.stopPropagation();recordCode(code,'up')
    }
    const onContextMenu=(event:MouseEvent)=>{ if(!shouldIgnorePointerTarget(event.target)) event.preventDefault() }
    window.addEventListener('keydown',onKeyDown,{capture:true})
    window.addEventListener('keyup',onKeyUp,{capture:true})
    window.addEventListener('mousedown',onMouseDown,{capture:true})
    window.addEventListener('mouseup',onMouseUp,{capture:true})
    window.addEventListener('contextmenu',onContextMenu,{capture:true})
    return ()=>{
      window.removeEventListener('keydown',onKeyDown,{capture:true})
      window.removeEventListener('keyup',onKeyUp,{capture:true})
      window.removeEventListener('mousedown',onMouseDown,{capture:true})
      window.removeEventListener('mouseup',onMouseUp,{capture:true})
      window.removeEventListener('contextmenu',onContextMenu,{capture:true})
    }
  },[recording,useRecordedDelay,fixedDelay])
  function store(next:MacroDefinition[]) { saveMacroLibrary(next);setMacros(next);setDeviceSynced(false) }
  function select(target:MacroDefinition) { if(locked)return;if(dirty&&draft?.events.length){setSwitchTarget(target);return}setDraft(structuredClone(target));setError('');setNotice('');setPreviewIndex(null) }
  async function save() {
    if(!draft||locked)return false
    try {
      validateMacro(draft)
      if(!saved&&macros.length>=MACRO_LIBRARY_LIMIT)throw new Error(`This library can hold ${MACRO_LIBRARY_LIMIT} macros.`)
      const clean={...draft,name:draft.name.trim()}
      const currentIndex=macros.findIndex(m=>m.id===draft.id)
      const next=currentIndex>=0?macros.map((macro,index)=>index===currentIndex?clean:macro):[...macros,clean]
      store(next);setDraft(clean);setError('')
      if(!hero68DeviceManager.connected){setNotice(tr('Saved locally. Connect HERO68 and save again to write this macro library to the keyboard.'));return true}
      setDeviceSaving(true)
      try {
        const packets=await syncHero68MacroLibrary(hero68DeviceManager,next)
        setDeviceSynced(true)
        setNotice(tr(packets === 1 ? 'Saved locally and wrote the macro library to HERO68 ({count} packet).' : 'Saved locally and wrote the macro library to HERO68 ({count} packets).', { count: packets }))
        return true
      } catch(e) {
        setError(tr('Saved locally, but HERO68 macro sync failed: {error}', { error: e instanceof Error ? e.message : String(e) }))
        setNotice('')
        return false
      } finally { setDeviceSaving(false) }
    } catch(e){setError(e instanceof Error?e.message:String(e));return false}
  }
  function updateEvents(events:MacroEvent[]) {if(!draft)return;if(events.length>MACRO_EVENT_LIMIT){setError(`The editor supports up to ${MACRO_EVENT_LIMIT} events.`);return}setDraft({...draft,events});setError('');setNotice('');setPreviewIndex(null)}
  function stopRecording() {const session=recorder.current;if(!session)return;for(const key of session.held)session.events.push({key,type:'up',delayMs:0});recorder.current=null;setRecording(false);setDraft(previous=>previous?{...previous,events:[...session.events]}:previous);setNotice(tr('Recording stopped. Any held keys were released automatically.'))}
  function startRecording() {if(!draft)return;setError('');setNotice(tr('Recording started. Click Stop recording to finish.'));setPreviewIndex(null);recorder.current={events:[...draft.events],held:new Set(heldMacroKeys(draft.events)),last:performance.now()};setRecording(true);recordArea.current?.focus()}
  function stopPreview(){if(previewTimer.current)clearTimeout(previewTimer.current);previewTimer.current=null;setPlaying(false);setPreviewHeld([]);setPreviewIndex(null)}
  function preview(){if(!draft)return;try{validateMacro(draft)}catch(e){setError(e instanceof Error?e.message:String(e));return}setError('');setPlaying(true);setPreviewHeld([]);setPreviewIndex(null);const events=structuredClone(draft.events);let i=0;const next=()=>{if(i===events.length){setPlaying(false);setPreviewHeld([]);previewTimer.current=null;return}previewTimer.current=setTimeout(()=>{const event=events[i];setPreviewIndex(i);setPreviewHeld(keys=>event.type==='down'?[...keys,event.key]:keys.filter(key=>key!==event.key));i++;next()},events[i].delayMs)};next()}
  function move(index:number,direction:number){if(!draft)return;const events=[...draft.events];[events[index],events[index+direction]]=[events[index+direction],events[index]];updateEvents(events)}
  function appendKeystroke(){if(!draft)return;updateEvents([...draft.events,{key:addKey,type:'down',delayMs:draft.events.length?fixedDelay:0},{key:addKey,type:'up',delayMs:fixedDelay}])}
  async function importFile(file?:File){if(!file)return;try{if(file.size>1_000_000)throw new Error('Choose a macro export smaller than 1 MB.');const imported=parseMacroImport(await file.text()).map(m=>({...m,id:crypto.randomUUID()}));if(imported.length+macros.length>MACRO_LIBRARY_LIMIT)throw new Error(`The library can hold ${MACRO_LIBRARY_LIMIT} macros.`);store([...macros,...imported]);setError('');setNotice(tr(imported.length === 1 ? 'Imported {count} macro into your local library.' : 'Imported {count} macros into your local library.', { count: imported.length }))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{if(importInput.current)importInput.current.value=''}}
  function exportLibrary(){const url=URL.createObjectURL(new Blob([macroExport(macros)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='openhero68-macros.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  const filtered=macros.filter(m=>m.name.toLowerCase().includes(query.toLowerCase()))
  return <div className="page macro-page page-enter">
    <div className="macro-heading"><div><h1>{tr('Macros')} <FeatureHelp title="Macros" paragraphs={['Build a sequence of key presses, releases and delays. Record a sequence or add keystrokes, then edit each event.','Save keeps an editable local copy and, while HERO68 is connected, also writes the macro definition library with the recovered CMD 0x05 protocol. Assign saved macros to physical keys from Key Remap → Macros; the on-device playback mode and count are selected there. Preview only animates the sequence; it does not send keys to other applications.']}/></h1><p>{tr('A sequence of actions, ready when you need it.')}</p></div><div><input ref={importInput} type="file" accept=".json,application/json" hidden onChange={event=>void importFile(event.target.files?.[0])}/><button className="secondary-button" disabled={locked} onClick={()=>importInput.current?.click()}><Upload size={15}/>{tr('Import')}</button><button className="secondary-button" disabled={!macros.length||locked} onClick={exportLibrary}><Download size={15}/>{tr('Export')}</button><button className="apply-button" disabled={locked||macros.length>=MACRO_LIBRARY_LIMIT} onClick={()=>select(newMacro())}><Plus size={16}/>{tr('New macro')}</button></div></div>
    {error&&<p className="macro-message is-error" role="alert">{tr(error)}</p>}{notice&&<p className="macro-message" role="status">{tr(notice)}{undoDelete&&<button onClick={()=>{try{store([...macros,undoDelete]);setDraft(undoDelete);setUndoDelete(null);setNotice('Macro restored.')}catch{setError('Could not restore the macro. Check browser storage.')}}}>{tr('Undo delete')}</button>}</p>}
    <div className="macro-workspace"><aside className="macro-library"><div className="macro-section-title"><h2>{tr('Your macros')}</h2><span>{macros.length}</span></div><label className="macro-search"><Search size={16}/><input type="search" aria-label={tr('Search macros…')} placeholder={tr('Search macros…')} value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="macro-library-list">{filtered.map(macro=><button key={macro.id} disabled={locked} className={draft?.id===macro.id?'is-active':''} onClick={()=>select(macro)}><ListOrdered size={19}/><span><strong>{macro.name}</strong><small>{tr(macro.events.length === 1 ? '{count} event' : '{count} events', { count: macro.events.length })} · {(macro.events.reduce((sum,event)=>sum+event.delayMs,0)/1000).toFixed(2)} s</small></span></button>)}{!macros.length&&<p>{tr('Create a macro to start your library.')}</p>}{!!macros.length&&!filtered.length&&<p>{tr('No macros match your search.')}</p>}</div><p className="macro-local-note">{tr('Stored on this computer. Export your library to move it to another device.')}</p></aside>
      {!draft?<section className="macro-empty"><span className="macro-empty-icon"><ListOrdered size={36}/></span><h2>{tr('Your first macro starts here')}</h2><p>{tr('Record a shortcut or build a sequence one keystroke at a time.')}</p><button className="apply-button" onClick={()=>select(newMacro())}><Plus size={16}/>{tr('Create macro')}</button><p className="macro-hardware-note">{tr('Connect HERO68 to write saved macro definitions to the keyboard, then use Key Remap → Macros to assign one to a key.')}</p></section>:<section className="macro-editor">
        <header className="macro-editor-head"><label><span>{tr('Macro name')}</span><input aria-label={tr('Macro name')} maxLength={48} value={draft.name} disabled={locked} onChange={event=>{setDraft({...draft,name:event.target.value});setNotice('')}}/></label><span className="macro-draft-badge">{deviceSaving ? tr('Writing to HERO68…') : dirty ? tr('Draft') : deviceSynced ? tr('Saved to HERO68') : tr('Saved locally')}</span><div><button className="icon-button" disabled={locked} aria-label={tr('Duplicate macro')} onClick={()=>select({...structuredClone(draft),id:crypto.randomUUID(),name:tr('{name} copy',{name:draft.name}).slice(0,48)})}><Copy size={17}/></button><button className="icon-button" disabled={locked} aria-label={tr('Delete macro')} onClick={()=>{try{if(saved){store(macros.filter(m=>m.id!==draft.id));setUndoDelete(saved);setNotice('Macro removed from the local library.')}setDraft(null);setError('')}catch{setError('Could not remove the macro. Check browser storage.')}}}><Trash2 size={17}/></button><button className="apply-button" disabled={locked||(!dirty&&device.state!=='connected')} onClick={()=>void save()}>{deviceSaving ? tr('Saving…') : device.state === 'connected' && !dirty && !deviceSynced ? tr('Sync to HERO68') : tr('Save macro')}</button></div></header>
        <div className="macro-record-controls"><button ref={recordToggleButton} className={`secondary-button ${recording?'is-recording':''}`} disabled={playing} onClick={recording?stopRecording:startRecording}>{recording?<Square size={15}/>:<Circle size={15}/>} {recording ? tr('Stop recording') : tr('Record keys')}</button><label><input type="checkbox" checked={useRecordedDelay} disabled={locked} onChange={event=>setUseRecordedDelay(event.target.checked)}/>{tr('Use recorded timing')}</label>{!useRecordedDelay&&<label className="macro-delay-input"><input type="number" aria-label={tr('Recording delay')} min={0} max={60000} value={fixedDelay} disabled={locked} onChange={event=>setFixedDelay(Math.max(0,Math.min(60000,Number(event.target.value))))}/><span>ms</span></label>}<span>{tr('Recording appends to this sequence.')}</span></div>
        <div ref={recordArea} tabIndex={0} className={`macro-record-area ${recording?'is-recording':''}`} aria-label={tr('Macro recording area')}>{recording?<><span className="macro-record-dot"/>{tr('Recording — press keys or mouse buttons. Recording continues until you click')} <strong>{tr('Stop recording')}</strong>.</>:<>{tr('Click')} <strong>{tr('Record keys')}</strong>{tr(', then press your shortcut or sequence.')}</>}</div>
        <div className="macro-sequence-heading"><div><h2>{tr('Sequence')}</h2><span>{tr(draft.events.length === 1 ? '{count} event' : '{count} events', { count: draft.events.length })} · {tr('{seconds} s per cycle',{seconds:(duration/1000).toFixed(2)})}</span></div><button className="secondary-button" disabled={recording||!draft.events.length} onClick={playing?stopPreview:preview}>{playing?<Square size={14}/>:<Play size={14}/>} {playing ? tr('Stop preview') : tr('Preview one cycle')}</button></div>
        {(playing||previewIndex!==null)&&<div className="macro-preview" role="status"><span>{playing ? tr('Previewing') : tr('Preview complete')} · {tr('Event {count} / {total}',{count:(previewIndex??-1)+1,total:draft.events.length})}</span><div>{previewHeld.length?previewHeld.map(key=><kbd key={key}>{macroKeyLabel(key)}</kbd>):<span>{tr('No keys held')}</span>}</div><small>{tr('Visual preview only — no keys are sent to applications.')}</small></div>}
        {!draft.events.length?<div className="macro-sequence-empty"><p>{tr('No events yet. Record your keys or add a keystroke below.')}</p></div>:<div className="macro-event-list"><div className="macro-event-columns"><span>#</span><span>{tr('Wait before')}</span><span>{tr('Action')}</span><span>{tr('Key / button')}</span><span/></div>{draft.events.map((event,index)=><div key={index} className={`macro-event-row ${previewIndex===index?'is-previewed':''}`}><span className="macro-event-index">{index+1}</span><label className="macro-delay-input"><input type="number" min={0} max={60000} aria-label={tr('Event {count} delay',{count:index+1})} value={event.delayMs} disabled={locked} onChange={e=>updateEvents(draft.events.map((item,i)=>i===index?{...item,delayMs:Number(e.target.value)}:item))}/><span>ms</span></label><AppSelect<'down'|'up'> label={tr('Event {count} action',{count:index+1})} value={event.type} disabled={locked} onChange={type=>updateEvents(draft.events.map((item,i)=>i===index?{...item,type}:item))} options={[{value:'down',label:'↓ '+tr('Press')},{value:'up',label:'↑ '+tr('Release')}]} /><AppSelect label={tr('Event {count} key',{count:index+1})} value={event.key} disabled={locked} onChange={key=>updateEvents(draft.events.map((item,i)=>i===index?{...item,key}:item))} options={MACRO_ACTIONS.map(action=>({value:action.name,label:action.label}))} /><div className="macro-row-actions"><button className="icon-button" aria-label={tr('Move event {count} up',{count:index+1})} disabled={locked||index===0} onClick={()=>move(index,-1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label={tr('Move event {count} down',{count:index+1})} disabled={locked||index===draft.events.length-1} onClick={()=>move(index,1)}><ArrowDown size={14}/></button><button className="icon-button" aria-label={tr('Remove event {count}',{count:index+1})} disabled={locked} onClick={()=>updateEvents(draft.events.filter((_,i)=>i!==index))}><Trash2 size={14}/></button></div></div>)}</div>}
        <div className="macro-add-controls"><AppSelect label={tr('Key to add')} value={addKey} disabled={locked} onChange={setAddKey} options={MACRO_ACTIONS.map(action=>({value:action.name,label:action.label}))} /><button className="secondary-button" disabled={locked} onClick={appendKeystroke}><Plus size={15}/>{tr('Add keystroke')}</button>{heldMacroKeys(draft.events).length>0&&!recording&&<button className="secondary-button" disabled={locked} onClick={()=>updateEvents([...draft.events,...heldMacroKeys(draft.events).map(key=>({key,type:'up' as const,delayMs:0}))])}>{tr('Release held keys')}</button>}</div>
        <details className="macro-single-event"><summary>{tr('Add a single press or release')}</summary><AppSelect<'down'|'up'> label={tr('Single event action')} value={eventType} disabled={locked} onChange={setEventType} options={[{value:'down',label:tr('Press')},{value:'up',label:tr('Release')}]} /><button className="secondary-button" disabled={locked} onClick={()=>updateEvents([...draft.events,{key:addKey,type:eventType,delayMs:fixedDelay}])}>{tr(eventType==='down'?'Add press of {key}':'Add release of {key}',{key:macroKeyLabel(addKey)})}</button></details>
        <footer className="macro-playback"><div><label><span>{tr('Playback behavior')}</span><AppSelect<MacroDefinition['playback']> label={tr('Playback behavior')} value={draft.playback} disabled={locked} onChange={playback=>setDraft({...draft,playback})} options={Object.entries(playbackLabels).map(([value,label])=>({value:value as MacroDefinition['playback'],label:tr(label)}))} /></label>{draft.playback==='repeat'&&<label className="macro-delay-input"><input type="number" aria-label={tr('Repeat count')} min={1} max={255} value={draft.repeatCount} disabled={locked} onChange={event=>setDraft({...draft,repeatCount:Number(event.target.value)})}/><span>{tr('times')}</span></label>}</div><p>{draft.playback === 'once' ? tr('Play the complete sequence once per trigger.') : draft.playback === 'repeat' ? tr('Play the sequence {count} times per trigger.', { count: draft.repeatCount }) : draft.playback === 'hold' ? tr('Keep repeating while the trigger key is held.') : tr('Tap the trigger to start repeating; tap again to stop.')}</p><div className="macro-hardware-note"><strong>{device.state === 'connected' ? tr('On-device sync ready') : tr('Local + device library')}</strong><span>{device.state === 'connected' ? tr('Save writes the complete macro definition library to HERO68 using CMD 0x05. Playback behavior takes effect only after a macro is assigned to a key.') : tr('Your editable copy is kept locally. Connect HERO68, then save to write the definitions; assign them from Key Remap → Macros.')}</span></div></footer>
      </section>}
    </div>
    {switchTarget&&<div className="macro-modal-backdrop"><section className="macro-discard-modal" role="dialog" aria-modal="true" aria-labelledby="macro-draft-title"><h2 id="macro-draft-title">{tr('Keep this draft?')}</h2><p>{tr('Save “{name}” to your library before switching, or discard its unsaved edits.', { name: draft?.name ?? '' })}</p><div><button autoFocus className="secondary-button" onClick={()=>setSwitchTarget(null)}>{tr('Cancel')}</button><button className="secondary-button" onClick={()=>{setDraft(switchTarget);setSwitchTarget(null);setError('');setNotice('')}}>{tr('Discard edits')}</button><button className="apply-button" disabled={deviceSaving} onClick={()=>void (async()=>{if(await save()){setDraft(switchTarget);setSwitchTarget(null)}})()}>{deviceSaving ? tr('Saving…') : tr('Save & continue')}</button></div>{error&&<p role="alert">{tr(error)}</p>}</section></div>}
  </div>
}
