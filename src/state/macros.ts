import catalog from '../protocol/hero68/macroCatalog.json'
import { HERO68_LAYOUT } from '../keyboard/hero68Layout'

export type MacroEvent = { key: string; type: 'down' | 'up'; delayMs: number }
export type MacroDefinition = { id: string; name: string; events: MacroEvent[]; playback: 'once' | 'repeat' | 'hold' | 'toggle'; repeatCount: number }
// Editor limits; these are not claims about the keyboard's storage capacity.
export const MACRO_EVENT_LIMIT = 512
export const MACRO_LIBRARY_LIMIT = 64
export const MACRO_STORAGE_KEY = 'openhero68:macro-library:v1'
export const MACRO_LIBRARY_EVENT = 'openhero68:macro-library-changed'
export const MACRO_DRAFT_KEY = 'openhero68:macro-draft:v1'
const names = Object.fromEntries(HERO68_LAYOUT.flat().map(key => [key.id, key.label]))
const special: Record<string,string> = { MouseKey0: 'Mouse left', MouseKey1: 'Mouse right', MouseKey2: 'Mouse middle', MouseKey3: 'Mouse back', MouseKey4: 'Mouse forward', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', AltLeft: 'L-Alt', AltRight: 'R-Alt', MetaLeft: 'L-Win', Space: 'Spacebar' }
export const MACRO_ACTIONS = catalog.map(action => ({ ...action, label: special[action.name] ?? names[action.name] ?? action.name.replace('Key','').replace('Digit','').replace('Numpad','Num ') }))
const keys = new Set(MACRO_ACTIONS.map(action => action.name))
export const macroKeyLabel = (key:string) => MACRO_ACTIONS.find(action => action.name === key)?.label ?? key
export function newMacro(): MacroDefinition { return { id: crypto.randomUUID(), name: 'Untitled macro', events: [], playback: 'once', repeatCount: 2 } }
export function validateMacro(value: unknown, requireComplete = true): asserts value is MacroDefinition {
  const macro = value as MacroDefinition | null
  if (!macro || typeof macro.id !== 'string' || !macro.id || macro.id.length > 128 || typeof macro.name !== 'string' || !macro.name.trim() || macro.name.length > 48) throw new Error('Give the macro a name between 1 and 48 characters.')
  if (!['once','repeat','hold','toggle'].includes(macro.playback) || !Number.isInteger(macro.repeatCount) || macro.repeatCount < 1 || macro.repeatCount > 255) throw new Error('Repeat count must be between 1 and 255.')
  if (!Array.isArray(macro.events) || macro.events.length > MACRO_EVENT_LIMIT) throw new Error(`A macro can contain up to ${MACRO_EVENT_LIMIT} events in this editor.`)
  if (requireComplete && !macro.events.length) throw new Error('Record a sequence or add a keystroke first.')
  const held = new Set<string>()
  macro.events.forEach((event,index) => {
    if (!event || !keys.has(event.key) || !['down','up'].includes(event.type) || !Number.isInteger(event.delayMs) || event.delayMs < 0 || event.delayMs > 60000) throw new Error(`Event ${index+1}: choose a supported key and a delay between 0 and 60000 ms.`)
    if (!requireComplete) return
    if (event.type === 'down') { if (held.has(event.key)) throw new Error(`Event ${index+1}: ${macroKeyLabel(event.key)} is already held. Add a release before pressing it again.`); held.add(event.key) }
    else { if (!held.has(event.key)) throw new Error(`Event ${index+1}: ${macroKeyLabel(event.key)} needs a press before its release.`); held.delete(event.key) }
  })
  if (held.size) throw new Error(`Release ${[...held].map(macroKeyLabel).join(', ')} before saving. Use “Release held keys” to finish the sequence.`)
}
export function heldMacroKeys(events: MacroEvent[]) { const held = new Set<string>(); for (const event of events) { if(event.type==='down') held.add(event.key); else held.delete(event.key) } return [...held] }
export function parseMacroImport(text: string): MacroDefinition[] {
  const data = JSON.parse(text)
  if (!data || data.schema !== 'openhero68-macros' || data.version !== 1 || !Array.isArray(data.macros) || data.macros.length > MACRO_LIBRARY_LIMIT) throw new Error('Choose an OpenHero68 macro export (.json).')
  data.macros.forEach((macro:unknown) => validateMacro(macro))
  if (new Set(data.macros.map((macro:MacroDefinition)=>macro.id)).size !== data.macros.length) throw new Error('The file contains duplicate macro IDs.')
  return data.macros
}
export function macroExport(macros:MacroDefinition[]) { return JSON.stringify({schema:'openhero68-macros',version:1,macros},null,2) }

export function loadMacroLibrary(): MacroDefinition[] {
  const stored = localStorage.getItem(MACRO_STORAGE_KEY)
  return stored ? parseMacroImport(stored) : []
}
export function saveMacroLibrary(macros: MacroDefinition[]) {
  if (macros.length > MACRO_LIBRARY_LIMIT) throw new Error(`This library can hold ${MACRO_LIBRARY_LIMIT} macros.`)
  localStorage.setItem(MACRO_STORAGE_KEY, macroExport(macros))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(MACRO_LIBRARY_EVENT, { detail: { count: macros.length } }))
}
