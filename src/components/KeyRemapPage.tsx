import { useEffect, useMemo, useState } from 'react'
import { Copy, Keyboard, ListOrdered, MoreVertical, RotateCcw } from 'lucide-react'
import FeatureHelp from './FeatureHelp'
import { REMAP_PRESETS, remapPreset, remapPresetDifferences, type RemapPresetId } from '../state/remapPresets'
import './KeyRemapPage.css'
import RemapIcon, { RemapActionIcon, hasRemapActionIcon } from "./RemapIcon"
import Hero68Preview from './Hero68Preview'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { HERO68_LAYOUT } from '../keyboard/hero68Layout'
import {
  decodeMacroRemap,
  defaultRemapLayers,
  encodeMacroRemap,
  REMAP_CATEGORIES,
  REMAP_LAYER_NAMES,
  REMAP_LAYERS,
  remapDisplayLabel,
  remapPreviewPresentation,
  type MacroRemapMode,
  type RemapLayer,
  type RemapLayers,
} from '../protocol/hero68/remap'
import { loadMacroLibrary, MACRO_LIBRARY_EVENT, MACRO_STORAGE_KEY, type MacroDefinition } from '../state/macros'

type Props = {
  advancedBindings: AdvancedBinding[]
  layers: RemapLayers
  busy: boolean
  dirtyCount: number
  canSave: boolean
  onSave: () => void
  onAssign: (layer: RemapLayer, keyId: string, value: number) => void
  onCopyLayer: (source: RemapLayer, target: RemapLayer) => void
}
const FACTORY_REMAP_LAYERS = defaultRemapLayers()
const MACRO_MODES: Array<{ id: MacroRemapMode; label: string }> = [
  { id: 'circle', label: 'Run N times' },
  { id: 'button', label: 'Toggle' },
  { id: 'repeat', label: 'Hold' },
]
const macroModeLabel = (mode: MacroRemapMode) => MACRO_MODES.find(item => item.id === mode)?.label ?? mode
const GROUP_ICONS: Record<string, string> = { characters: 'basic-characters', extended: 'extended-keys', functions: 'functions', media: 'media-audio', mouse: 'mouse' }
const GROUP_HELP: Record<string, string> = {
  characters: 'Letters, numbers and punctuation.',
  extended: 'Modifiers, arrows and other keyboard keys.',
  functions: 'Layer keys, shortcuts and device controls.',
  media: 'Playback, mute and volume controls.',
  mouse: 'Mouse buttons and pointer controls.',
}
const basic = REMAP_CATEGORIES.find(item => item.id === 'basic_key')!.actions
const characterNames = /^[A-Z0-9]$|^[-,;.'\[\]\/\\`=]/
const REMAP_GROUPS = [
  {id:'characters',label:'Basic characters',mark:'A',actions:basic.filter(action=>characterNames.test(action.name)).sort((a,b)=>{
    const rank=(name:string)=>/^[A-Z]$/.test(name)?name.charCodeAt(0)-65:/^[0-9]$/.test(name)?26+(name==='0'?9:Number(name)-1):40+basic.findIndex(item=>item.name===name)
    return rank(a.name)-rank(b.name)
  })},
  {id:'extended',label:'Extended keys',mark:'#',actions:basic.filter(action=>!characterNames.test(action.name)&&!['Fn','Fn1'].includes(action.name))},
  {id:'functions',label:'Functions',mark:'⌘',actions:[...basic.filter(action=>['Fn','Fn1'].includes(action.name)),...REMAP_CATEGORIES.filter(item=>!['basic_key','mouse','system_multimedia'].includes(item.id)).flatMap(item=>item.actions)]},
  {id:'media',label:'Media and audio',mark:'♫',actions:REMAP_CATEGORIES.find(item=>item.id==='system_multimedia')!.actions},
  {id:'mouse',label:'Mouse',mark:'↖',actions:REMAP_CATEGORIES.find(item=>item.id==='mouse')!.actions},
]

export default function KeyRemapPage({ advancedBindings, layers, busy, dirtyCount, canSave, onSave, onAssign, onCopyLayer }: Props) {
  const [layer, setLayer] = useState<RemapLayer>(0)
  const [keyId, setKeyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openGroups, setOpenGroups] = useState(new Set(['characters']))
  const [layerMenu, setLayerMenu] = useState<RemapLayer | null>(null)
  const [presetNotice, setPresetNotice] = useState('')
  const [hoveredPreset, setHoveredPreset] = useState<RemapPresetId | null>(null)
  const [presetUndo, setPresetUndo] = useState<{layer:RemapLayer;keys:Record<string,number>;applied:Record<string,number>} | null>(null)
  const [copiedLayer, setCopiedLayer] = useState<RemapLayer | null>(null)
  const [macros, setMacros] = useState<MacroDefinition[]>([])
  const [macroError, setMacroError] = useState('')
  const [macroMode, setMacroMode] = useState<MacroRemapMode>('circle')
  const [macroCount, setMacroCount] = useState(1)

  useEffect(() => {
    const refresh = () => {
      try { setMacros(loadMacroLibrary()); setMacroError('') }
      catch (error) { setMacros([]); setMacroError(error instanceof Error ? error.message : String(error)) }
    }
    const storage = (event: StorageEvent) => { if (event.key === MACRO_STORAGE_KEY) refresh() }
    refresh()
    window.addEventListener(MACRO_LIBRARY_EVENT, refresh)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(MACRO_LIBRARY_EVENT, refresh); window.removeEventListener('storage', storage) }
  }, [])

  const physicalLabel = HERO68_LAYOUT.flat().find(key => key.id === keyId)?.label
  const selected = useMemo(() => new Set(keyId ? [keyId] : []), [keyId])
  const presetHighlights = useMemo(() => hoveredPreset ? remapPresetDifferences(hoveredPreset, layer, layers[layer]) : new Set<string>(), [hoveredPreset, layer, layers])
  const previewMappings = useMemo(() => hoveredPreset ? { ...layers[layer], ...remapPreset(hoveredPreset, layer) } : layers[layer], [hoveredPreset, layer, layers])
  const selectedValue = keyId ? layers[layer][keyId] : undefined
  const selectedMacro = decodeMacroRemap(selectedValue)

  function changeMacroMode(mode: MacroRemapMode) {
    setMacroMode(mode)
    if (keyId && selectedMacro) onAssign(layer, keyId, encodeMacroRemap(selectedMacro.macroIndex, mode, mode === 'circle' ? macroCount : 1))
  }

  function changeMacroCount(count: number) {
    setMacroCount(count)
    if (keyId && selectedMacro && macroMode === 'circle') onAssign(layer, keyId, encodeMacroRemap(selectedMacro.macroIndex, macroMode, count))
  }

  useEffect(() => {
    const binding = decodeMacroRemap(selectedValue)
    if (binding) { setMacroMode(binding.mode); setMacroCount(Math.max(1, binding.count)) }
  }, [layer, keyId, selectedValue])

  const keyPresentations = useMemo(() => Object.fromEntries(Object.entries(previewMappings).map(([id, value]) => {
    const presentation = remapPreviewPresentation(layer, id, value)
    const binding = decodeMacroRemap(value)
    if (!binding) return [id, presentation]
    const macro = macros[binding.macroIndex]
    const name = macro?.name ?? `Macro #${binding.macroIndex}`
    const compact = macro ? (macro.name.length <= 9 ? macro.name : `${macro.name.slice(0, 8)}…`) : `M${binding.macroIndex}`
    return [id, {
      ...presentation,
      label: compact,
      fullLabel: `Macro · ${name}`,
      category: binding.mode === 'circle' ? `${macroModeLabel(binding.mode)} · ${binding.count} times` : macroModeLabel(binding.mode),
    }]
  })), [previewMappings, layer, macros])
  const keyLabels = useMemo(() => Object.fromEntries(Object.entries(keyPresentations).map(([id, presentation]) => [id, presentation.label])), [keyPresentations])
  const presetDecorations = useMemo(() => Object.fromEntries([...presetHighlights].map(id => [id, <span className="hero-key-label" key={id}>{keyLabels[id]}</span>])), [presetHighlights, keyLabels])
  const keyTooltips = useMemo(() => Object.fromEntries(Object.entries(keyPresentations)
    .filter(([, presentation]) => presentation.needsTooltip)
    .map(([id, presentation]) => [id, { title: presentation.fullLabel, detail: presentation.category, raw: presentation.raw }])), [keyPresentations])

  const normalizedQuery = query.toLowerCase().trim()
  const visibleCategories = REMAP_GROUPS.map(item => ({
    ...item, actions: item.actions.filter(action => `${action.label} ${action.description}`.toLowerCase().includes(normalizedQuery)),
  })).filter(item => item.actions.length)
  const visibleMacros = macros.map((macro, index) => ({ macro, index })).filter(({ macro }) => !normalizedQuery || `${macro.name} macro`.toLowerCase().includes(normalizedQuery))
  const showMacros = openGroups.has('macros') || !!normalizedQuery
  function toggleGroup(id:string){setOpenGroups(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})}
  function applyPreset(id:RemapPresetId){
    setHoveredPreset(null)
    const applied=remapPreset(id,layer)
    setPresetUndo({layer,keys:Object.fromEntries(Object.keys(applied).map(key=>[key,layers[layer][key]])),applied})
    for(const [key,value] of Object.entries(applied))onAssign(layer,key,value)
    setPresetNotice(`${REMAP_PRESETS.find(item=>item.id===id)!.label} applied to ${REMAP_LAYER_NAMES[layer]}. Save to profile to keep it.`)
  }
  const targetLabel = keyId && selectedMacro
    ? `Macro · ${macros[selectedMacro.macroIndex]?.name ?? `#${selectedMacro.macroIndex}`}`
    : keyId ? remapDisplayLabel(layer, keyId, selectedValue) : 'Choose a function'

  return (
    <div className="page remap-page page-enter">
      <section className="remap-preview-layout">
        <aside className="remap-preview-layers">
          <h2>Layers <FeatureHelp title="Layers" paragraphs={['Main Layer is your normal layout. Hold Fn or Fn1 to use the corresponding Fn layer.']}/></h2>
          <div role="group" aria-label="Keyboard layer">
            {REMAP_LAYERS.map(id=><div className="remap-layer-row" key={id}>
              <button disabled={busy} className={`remap-layer ${layer===id?'is-active':''}`} aria-pressed={layer===id} onClick={()=>{setLayer(id);setLayerMenu(null)}}>{REMAP_LAYER_NAMES[id]}</button>
              <button className="remap-layer-menu-trigger" aria-label={`Options for ${REMAP_LAYER_NAMES[id]}`} aria-expanded={layerMenu===id} onClick={()=>setLayerMenu(layerMenu===id?null:id)}><MoreVertical size={16}/></button>
              {layerMenu===id&&<div className="remap-layer-menu"><button disabled={busy} onClick={()=>{setCopiedLayer(id);setLayerMenu(null)}}><Copy size={14}/>Copy layer</button><button disabled={busy||copiedLayer===null||copiedLayer===id} onClick={()=>{if(copiedLayer!==null)onCopyLayer(copiedLayer,id);setLayerMenu(null)}}>Paste layer</button></div>}
            </div>)}
          </div>
        </aside>
        <div className="keyboard-stage">
        <Hero68Preview advancedBindings={layer === 0 ? advancedBindings : []} selectedKeys={selected} highlightedKeys={presetHighlights} keyDecorations={presetDecorations} onToggleKey={id => setKeyId(id === keyId ? null : id)} keyLabels={keyLabels} keyTooltips={keyTooltips} />
        </div>
      </section>
      <div className="remap-heading">
        <div><h1>Key Remap</h1><p>Select a key, then choose a function or macro.</p></div>
        <div className="remap-save-actions"><span className="profile-status">{dirtyCount ? `${dirtyCount} unsaved mapping${dirtyCount === 1 ? '' : 's'}` : 'No pending changes'}</span><button className="apply-button mobile-profile-save" disabled={!canSave || busy || !dirtyCount} onClick={onSave}>Save mappings</button></div>
      </div>
      <section className="remap-editor">
        <aside className="remap-guide settings-card">
          <h2>Remap keys</h2>
          <p>Select a key on the preview, then choose its new function.</p>
          <h3>Layout presets</h3>
          <div className="remap-preset-grid">{REMAP_PRESETS.map(preset=><button key={preset.id} disabled={busy} onMouseEnter={()=>setHoveredPreset(preset.id)} onMouseLeave={()=>setHoveredPreset(null)} onClick={()=>applyPreset(preset.id)}><span>{preset.id==='default'?<Keyboard size={24}/>:preset.mark}</span><strong>{preset.label}</strong></button>)}</div>
          <p className="remap-preset-hint">Presets apply to the selected layer.</p>
          {presetNotice&&<div className="remap-preset-notice" role="status"><p>{presetNotice}</p>{presetUndo&&<button className="secondary-button" disabled={busy} onClick={()=>{for(const [key,value] of Object.entries(presetUndo.keys)){if(layers[presetUndo.layer][key]===presetUndo.applied[key])onAssign(presetUndo.layer,key,value)}setPresetUndo(null);setPresetNotice('Preset undone.')}}>Undo preset</button>}</div>}
        </aside>
        <article className="remap-picker settings-card">
          <div className="remap-target">
            <div className={`remap-target-key ${keyId ? 'is-selected' : ''}`}>{physicalLabel ?? '—'}</div>
            <div><small>{keyId ? `${REMAP_LAYER_NAMES[layer]} · selected key` : 'Select a key above'}</small><strong>{targetLabel}</strong></div>
            <button className="ghost-button" disabled={!keyId || busy || (keyId !== null && layers[layer][keyId] === FACTORY_REMAP_LAYERS[layer][keyId])} onClick={() => keyId && onAssign(layer, keyId, FACTORY_REMAP_LAYERS[layer][keyId])}><RotateCcw size={14} />Restore key</button>
          </div>
          <label className="remap-search"><RemapIcon name="search" /><input type="search" placeholder="Search functions or macros…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search remap functions" /></label>
          <div className="remap-functions">
            {visibleCategories.map(item => {const open=!!normalizedQuery||openGroups.has(item.id);return <section key={item.id} className="remap-accordion-item"><h3><button className="remap-accordion-trigger" aria-expanded={open} aria-controls={`remap-group-${item.id}`} onClick={()=>toggleGroup(item.id)}><span className="remap-group-icon" title={GROUP_HELP[item.id]}><RemapIcon name={GROUP_ICONS[item.id]} /></span>{item.label}<RemapIcon name="chevron-down" /></button></h3>{open&&<div id={`remap-group-${item.id}`} className="remap-function-grid">{item.actions.map((action, index) => {
              const label = action.label.replace(/\b[a-z]/g, letter => letter.toUpperCase())
              const className = `remap-function-button ${!keyId ? "needs-key" : ""} ${keyId && layers[layer][keyId] === action.value ? "is-active" : ""}`
              const assign = () => { if (keyId) onAssign(layer, keyId, action.value) }
              return hasRemapActionIcon(action.name)
                ? <FeatureHelp key={`${action.value}:${index}`} title={label} paragraphs={[]} triggerLabel={label} disabled={busy} triggerClassName={className} icon={<RemapActionIcon name={action.name} label={label} />} pinOnClick={false} onActivate={assign} />
                : <button key={`${action.value}:${index}`} className={className} disabled={!keyId || busy} onClick={assign}>{label}</button>
            })}</div>}</section>})}
            {(!normalizedQuery||visibleMacros.length>0)&&<section className="remap-macro-section remap-accordion-item">
              <h3><button className="remap-accordion-trigger" aria-expanded={showMacros} aria-controls="remap-group-macros" onClick={()=>toggleGroup('macros')}><span className="remap-group-icon"><ListOrdered size={16}/></span>Macros<RemapIcon name="chevron-down" /></button></h3>
              {showMacros&&<div id="remap-group-macros">
              {macroError ? <p className="remap-empty" role="alert">Macro library could not be read: {macroError}</p> : macros.length ? <>
                <div className="remap-macro-controls">
                  <div className="remap-macro-mode" role="group" aria-label="Macro playback mode">
                    {MACRO_MODES.map(mode => <button key={mode.id} disabled={busy} className={macroMode === mode.id ? 'is-active' : ''} aria-pressed={macroMode === mode.id} onClick={() => changeMacroMode(mode.id)}><strong>{mode.label}</strong></button>)}
                  </div>
                  <label className={`remap-macro-count ${macroMode !== 'circle' ? 'is-disabled' : ''}`}><span>Times</span><input type="number" disabled={busy || macroMode !== 'circle'} min={1} max={255} value={macroCount} onChange={event => changeMacroCount(Math.max(1, Math.min(255, Number(event.target.value) || 1)))} /></label>
                </div>
                <div className="remap-macro-grid">
                  {visibleMacros.map(({ macro, index }) => {
                    const value = encodeMacroRemap(index, macroMode, macroMode === 'circle' ? macroCount : 1)
                    const exact = selectedValue === value
                    const assigned = selectedMacro?.macroIndex === index
                    return <button key={macro.id} disabled={!keyId || busy} className={`${assigned ? 'is-assigned' : ''} ${exact ? 'is-active' : ''}`} onClick={() => keyId && onAssign(layer, keyId, value)}>
                      <span className="remap-macro-icon"><ListOrdered size={15}/></span><span className="remap-macro-copy"><strong>{macro.name}</strong><small>{macro.events.length} event{macro.events.length === 1 ? '' : 's'}</small></span><span className="remap-macro-assign">{exact ? 'Assigned' : assigned ? 'Update' : 'Assign'}</span>
                    </button>
                  })}
                </div>
                {!visibleMacros.length && <p className="remap-empty">No macros match “{query}”.</p>}
              </> : <p className="remap-empty">Create a macro in Macros to get started.</p>}
              </div>}
            </section>}
            {!!query && !visibleCategories.length && !visibleMacros.length && <p className="remap-empty">No functions or macros match “{query}”.</p>}
          </div>
        </article>
      </section>
    </div>
  )
}
