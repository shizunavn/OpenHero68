import catalog from './remapCatalog.json'
import { HERO68_KEY_IDS } from '../../keyboard/hero68Layout'
import { keyIdToPos, posToKeyId } from './keyPositions'
import { decodeRemapRecords } from './codec'
import { readRemap, selectProfile, writeRemap, readProfileName, writeProfileName } from './commands'
import type { Hero68Requester } from './hero68Encoder'
import type { ProfileSlot } from './types'

export type RemapLayer = 0 | 1 | 2
export type RemapLayers = Record<RemapLayer, Record<string, number>>
export const REMAP_LAYERS = [0, 1, 2] as const
export const REMAP_LAYER_NAMES = ['Main Layer', 'Fn Layer 1', 'Fn Layer 2'] as const

export type MacroRemapMode = 'circle' | 'button' | 'repeat'
export type MacroRemapBinding = { mode: MacroRemapMode; modeCode: 0x01 | 0x02 | 0x04; count: number; macroIndex: number }
export const MACRO_REMAP_MODE_CODES: Record<MacroRemapMode, MacroRemapBinding['modeCode']> = { circle: 0x01, button: 0x02, repeat: 0x04 }
const MACRO_REMAP_MODES_BY_CODE = new Map<number, MacroRemapMode>([[0x01, 'circle'], [0x02, 'button'], [0x04, 'repeat']])

/** Official macro key action: 0x03 TT CC II (type, count, macro index). */
export function encodeMacroRemap(macroIndex: number, mode: MacroRemapMode = 'circle', count = 1): number {
  if (!Number.isInteger(macroIndex) || macroIndex < 0 || macroIndex > 0xff) throw new Error('Macro index must be between 0 and 255.')
  if (!Number.isInteger(count) || count < 1 || count > 0xff) throw new Error('Macro count must be between 1 and 255.')
  return ((0x03 << 24) | (MACRO_REMAP_MODE_CODES[mode] << 16) | (count << 8) | macroIndex) >>> 0
}
export function isMacroRemapValue(value: number | undefined): boolean {
  return value !== undefined && Number.isInteger(value) && (((value >>> 24) & 0xff) === 0x03)
}
export function decodeMacroRemap(value: number | undefined): MacroRemapBinding | null {
  if (!isMacroRemapValue(value) || value === undefined) return null
  const modeCode = (value >>> 16) & 0xff
  const mode = MACRO_REMAP_MODES_BY_CODE.get(modeCode)
  if (!mode || (modeCode !== 0x01 && modeCode !== 0x02 && modeCode !== 0x04)) return null
  return { mode, modeCode, count: (value >>> 8) & 0xff, macroIndex: value & 0xff }
}
const CATEGORY_NAMES: Record<string, string> = {
  basic_key: 'Keyboard', mouse: 'Mouse', edit: 'Editing', navigation: 'Navigation',
  windows: 'Windows', efficiency: 'Productivity', system_edit: 'Clipboard',
  system_multimedia: 'Media', system_tools: 'Device controls', system_action: 'System',
}
export const REMAP_CATEGORIES = catalog.categories.map(category => ({
  ...category, label: CATEGORY_NAMES[category.id] ?? category.id,
  actions: category.actions.map(action => ({
    ...action,
    label: action.name === 'empty_button' ? 'Disabled' : action.name.replace(/_/g, ' '),
  })),
}))
const labels = new Map(REMAP_CATEGORIES.flatMap(category => category.actions.map(action => [action.value, action.label] as const)))
export function remapLabel(value: number | undefined): string {
  if (value === undefined) return 'Unknown'
  return labels.get(value) ?? `0x${value.toString(16).padStart(8, '0').toUpperCase()}`
}

/**
 * The firmware can return internal/vendor action IDs on Fn layers that are not
 * present in the public remap picker catalog (for example some 0x07/0x08/0x09
 * actions). The official AULA UI keeps the layer's initialized key name when
 * its action lookup cannot resolve such a value. Mirror that presentation
 * without touching the raw u32 action stored in `layers`.
 */
export function remapDisplayLabel(layer: RemapLayer, keyId: string, value: number | undefined): string {
  if (value === undefined) return 'Unknown'
  if (isMacroRemapValue(value)) {
    const binding = decodeMacroRemap(value)
    return binding ? `Macro #${binding.macroIndex}` : 'Macro action'
  }
  const resolved = labels.get(value)
  if (resolved) return resolved

  if (layer !== 0) {
    const fallbackValue = defaultRemapLayers()[layer][keyId]
    const fallback = labels.get(fallbackValue)
    if (fallback) return fallback
  }

  return remapLabel(value)
}

const COMPACT_REMAP_LABELS: Record<string, string> = {
  'my computer': 'My PC',
  'browser': 'Web',
  'favorite': 'Fav',
  'calculator': 'Calc',
  'email': 'Mail',
  'previous song': 'Prev',
  'next song': 'Next',
  'play pause': 'Play/Pause',
  'pause': 'Pause',
  'volume up': 'Vol +',
  'volume down': 'Vol −',
  'mute': 'Mute',
  'system multimedia': 'Media',
  'screen bright up': 'Bright +',
  'screen bright down': 'Bright −',
  'close windows': 'Close',
  'lock computer': 'Lock',
  'show desktop': 'Desktop',
  'task manager': 'TaskMgr',
  'left button': 'Mouse 1',
  'right button': 'Mouse 2',
  'mid button': 'Mouse 3',
  'forward': 'Mouse Fwd',
  'back': 'Mouse Back',
  'dpi plus': 'DPI +',
  'dpi sub': 'DPI −',
  'dpi switch': 'DPI',
  'shoot button': 'Shoot',
}

export type RemapPreviewPresentation = {
  label: string
  fullLabel: string
  category?: string
  raw?: string
  needsTooltip: boolean
}

function compactRemapLabel(label: string): string {
  const normalized = label.toLowerCase().trim()
  const direct = COMPACT_REMAP_LABELS[normalized]
  if (direct) return direct

  const combo = label.match(/^(LWin|Ctrl|Alt) \+ (.+)$/i)
  if (combo) {
    const prefix = combo[1].toLowerCase() === 'lwin' ? 'Win' : combo[1]
    const tail = combo[2].replace(/Left/i, '←').replace(/Right/i, '→')
    const short = `${prefix}+${tail}`
    if (short.length <= 10) return short
  }

  return label
}

export function remapPreviewPresentation(layer: RemapLayer, keyId: string, value: number | undefined): RemapPreviewPresentation {
  const macroBinding = decodeMacroRemap(value)
  if (macroBinding) {
    const fullLabel = `Macro #${macroBinding.macroIndex}`
    return {
      label: `M${macroBinding.macroIndex}`,
      fullLabel,
      category: `Macro · ${macroBinding.mode} · count ${macroBinding.count}`,
      raw: `0x${(value ?? 0).toString(16).padStart(8, '0').toUpperCase()}`,
      needsTooltip: true,
    }
  }
  const fullLabel = remapDisplayLabel(layer, keyId, value)
  const label = compactRemapLabel(fullLabel)
  const category = value === undefined
    ? undefined
    : REMAP_CATEGORIES.find(item => item.actions.some(action => action.value === value))?.label
  const rawUnknown = value !== undefined && !labels.has(value)
  const raw = rawUnknown ? `0x${value.toString(16).padStart(8, '0').toUpperCase()}` : undefined
  return {
    label,
    fullLabel,
    category: rawUnknown ? `${REMAP_LAYER_NAMES[layer]} · Vendor action` : category,
    raw,
    needsTooltip: rawUnknown || label !== fullLabel || fullLabel.length > 9,
  }
}

export function defaultRemapLayers(): RemapLayers {
  const result: RemapLayers = { 0: {}, 1: {}, 2: {} }
  for (const layer of catalog.layers) {
    for (const key of layer.keys) {
      const keyId = posToKeyId(key.pos)
      if (keyId) result[layer.layer as RemapLayer][keyId] = key.value
    }
  }
  return result
}

/** Read every mapping; a partial reply never becomes a writable profile. */
export async function readRemapLayers(requester: Hero68Requester): Promise<RemapLayers> {
  const result: RemapLayers = { 0: {}, 1: {}, 2: {} }
  const positions = HERO68_KEY_IDS.map(keyIdToPos)
  for (const layer of REMAP_LAYERS) {
    for (const packet of readRemap(layer, positions)) {
      const expectedPositions = new Set<number>()
      for (let i = 7; i < 7 + packet[6]; i += 2) expectedPositions.add((packet[i] << 8) | packet[i + 1])
      const reply = await requester.request(packet, 0x83, layer)
      for (const record of decodeRemapRecords(reply.data)) {
        if (!expectedPositions.delete(record.keyId)) throw new Error(`Unexpected remap position ${record.keyId}`)
        const keyId = posToKeyId(record.keyId)
        if (keyId) result[layer][keyId] = record.keycode
      }
      if (expectedPositions.size) throw new Error(`Incomplete remap reply for ${REMAP_LAYER_NAMES[layer]}`)
    }
  }
  return result
}

/** Writes only edited keys, using official independent nine-record requests. */
export async function saveRemapChanges(requester: Hero68Requester, slot: ProfileSlot, layers: RemapLayers, dirty: ReadonlySet<string>) {
  if (!dirty.size) return
  await requester.request(selectProfile(slot), 0x10, 0)
  for (const layer of REMAP_LAYERS) {
    const keys = HERO68_KEY_IDS.filter(keyId => dirty.has(`${layer}:${keyId}`))
    if (!keys.length) continue
    for (const packet of writeRemap(layer, keys.map(keyId => [keyIdToPos(keyId), layers[layer][keyId]] as const))) {
      await requester.request(packet, 0x03, layer, 1000)
    }
    const verified = new Set<string>()
    for (const packet of readRemap(layer, keys.map(keyIdToPos))) {
      const reply = await requester.request(packet, 0x83, layer)
      for (const record of decodeRemapRecords(reply.data)) {
        const keyId = posToKeyId(record.keyId)
        if (!keyId || !keys.includes(keyId) || verified.has(keyId) || record.keycode !== layers[layer][keyId]) {
          throw new Error(`Remap readback did not match ${REMAP_LAYER_NAMES[layer]}`)
        }
        verified.add(keyId)
      }
    }
    if (verified.size !== keys.length) throw new Error(`Incomplete remap readback for ${REMAP_LAYER_NAMES[layer]}`)
  }
}

export function decodeProfileName(data: Uint8Array): string | null {
  const length = data[0]
  if (length === 255 || length === 0) return null
  if (length === undefined || length > 55 || data.length < length + 1) throw new Error('Invalid profile name reply')
  return new TextDecoder('utf-8', { fatal: true }).decode(data.slice(1, length + 1))
}
export async function readOnboardProfileName(requester: Hero68Requester, slot: ProfileSlot) {
  const reply = await requester.request(readProfileName(slot), 0x9a, slot)
  return decodeProfileName(reply.data)
}
export async function saveOnboardProfileName(requester: Hero68Requester, slot: ProfileSlot, name: string) {
  if (!name.trim()) throw new Error('Enter a profile name.')
  await requester.request(writeProfileName(slot, name), 0x1a, slot, 1000)
  const actual = await readOnboardProfileName(requester, slot)
  if (actual !== name) throw new Error('Profile name readback did not match. Refresh the profile and try again.')
}
