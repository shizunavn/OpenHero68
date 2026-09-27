import { advancedDelete, advancedDks, advancedEnd, advancedModTap, advancedMpt, advancedSocd, advancedTgl, readAdvancedKey, readAdvancedKeyPositions, selectProfile } from './commands'
import { decodeReport } from './codec'
import { keyIdToPos, posToKeyId } from './keyPositions'
import type { Hero68Requester } from './hero68Encoder'
import type { DecodedReport, ProfileSlot } from './types'

export type AdvancedKind = 'SOCD' | 'DKS' | 'MT' | 'TGL' | 'MPT' | 'END'
export type AdvancedBinding = {
  id: string; kind: AdvancedKind | 'UNKNOWN'; keys: string[]; actions: number[];
  thresholds: number[]; states: number[][]; delay: number; mode: number;
  raw?: { type: number; data: number[] }
}
export const ADVANCED_KINDS: AdvancedKind[] = ['SOCD', 'DKS', 'MT', 'TGL', 'MPT', 'END']
export const ADVANCED_LIMIT = 40
const u16 = (d: Uint8Array, i: number) => (d[i] << 8) | d[i + 1]
const u32 = (d: Uint8Array, i: number) => ((d[i] * 0x1000000) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3]) >>> 0
export function newAdvanced(kind: AdvancedKind, keys: string[]): AdvancedBinding {
  return { id: keys[0], kind, keys, actions: kind === 'DKS' ? [4,22,7,9] : kind === 'MPT' ? [4,22,7] : kind === 'MT' ? [4,22] : [4],
    thresholds: kind === 'MPT' ? [1,2,3] : [1,3,3,1],
    states: [[10,0,0,0],[0,10,0,0],[0,0,10,0],[0,0,0,10]], delay: 300, mode: 1 }
}
export function validateAdvanced(bindings: AdvancedBinding[]) {
  if (bindings.length > ADVANCED_LIMIT) throw new Error('Maximum 40 Advanced Keys per profile.')
  const used = new Set<string>()
  for (const b of bindings) {
    if (b.keys.length !== (b.kind === 'SOCD' ? 2 : 1)) throw new Error('Select the required physical keys.')
    for (const key of b.keys) { keyIdToPos(key); if (used.has(key)) throw new Error('A physical key can only have one Advanced Key binding.'); used.add(key) }
    if (b.kind === 'UNKNOWN') { if (!b.raw) throw new Error('Missing original binding data.'); continue }
    if (!ADVANCED_KINDS.includes(b.kind)) throw new Error('Unknown Advanced Key type.')
    if (b.actions.some(a => !Number.isInteger(a) || a < 0 || a > 0xffffffff)) throw new Error('Invalid action.')
    if (['MT','TGL'].includes(b.kind) && (!Number.isInteger(b.delay) || b.delay < 1 || b.delay > 65535)) throw new Error('Delay must be 1–65535 ms.')
    if (b.kind === 'SOCD' && ![0,1,2,3,4].includes(b.mode)) throw new Error('Invalid SOCD mode.')
    if (['DKS','MPT'].includes(b.kind)) {
      if (b.thresholds.length !== (b.kind === 'DKS' ? 4 : 3) || b.thresholds.some(v => !Number.isFinite(v) || v < .1 || v > 3.4)) throw new Error('Depth must be 0.10–3.40 mm.')
      if (b.kind === 'MPT' && !(b.thresholds[0] < b.thresholds[1] && b.thresholds[1] < b.thresholds[2])) throw new Error('MPT depths must increase from left to right.')
      if (b.kind === 'DKS' && (b.thresholds[0] >= b.thresholds[1] || b.thresholds[3] >= b.thresholds[2])) throw new Error('Shallow DKS points must be above the deep points.')
    }
    const count = b.kind === 'DKS' ? 4 : b.kind === 'MPT' ? 3 : b.kind === 'MT' ? 2 : 1
    if (b.actions.length !== count) throw new Error('Invalid action count.')
    if (b.kind === 'DKS' && (b.states.length !== 4 || b.states.some(s => s.length !== 4 || s.some(v => ![0,4,6,10,12,14].includes(v))))) throw new Error('Invalid DKS action pattern.')
  }
}
export function advancedPacket(b: AdvancedBinding): Uint8Array {
  validateAdvanced([b])
  const pos = keyIdToPos(b.keys[0])
  const depths = b.thresholds.map(v => Math.round(v * 100))
  switch (b.kind) {
    case 'SOCD': return advancedSocd(0,[pos,keyIdToPos(b.keys[1])],b.mode)
    case 'MT': return advancedModTap(0,pos,b.actions[0],b.actions[1],b.delay) // first wire slot HOLD; second TAP
    case 'TGL': return advancedTgl(0,pos,b.actions[0],b.delay)
    case 'END': return advancedEnd(0,pos,b.actions[0])
    case 'MPT': return advancedMpt(0,pos,b.actions.map((a,i) => [a,depths[i]] as const))
    case 'DKS': return advancedDks(0,pos,depths as [number,number,number,number],b.actions.map((a,i) => [a,b.states[i] as [number,number,number,number]] as const))
    default: throw new Error('This firmware binding is preserved but cannot be edited.')
  }
}
function decodeBinding(r: DecodedReport): AdvancedBinding {
  if (!r.checksumValid || r.zone !== 0) throw new Error('Invalid Advanced Key reply.')
  const d = r.data, type = r.reserved
  const requireLength = (n: number) => { if (d.length !== n) throw new Error('Incomplete Advanced Key detail reply.') }
  if (type === 4) requireLength(6)
  else if (type === 1) requireLength(8)
  else if (type === 2) { if (![11,12].includes(d.length)) throw new Error('Incomplete Mod Tap reply.'); if (d.length === 11) throw new Error('Mod Tap reply omits its delay byte. Read a complete reply before editing.') }
  else if (type === 3) requireLength(42)
  else if (type === 5) { if (d.length < 3 || d[2] !== 3) throw new Error('Unsupported MPT action count.'); requireLength(21) }
  else if (type === 6) requireLength(6)
  else if (d.length < 2) throw new Error('Incomplete unknown binding.')
  const positions = type === 4 ? [u16(d,1),u16(d,3)] : [u16(d,0)]
  const keys = positions.map(pos => { const id = posToKeyId(pos); if (!id) throw new Error('Unknown Advanced Key position.'); return id })
  const kind: AdvancedBinding['kind'] = ({1:'TGL',2:'MT',3:'DKS',4:'SOCD',5:'MPT',6:'END'} as Partial<Record<number,AdvancedKind>>)[type] ?? 'UNKNOWN'
  const b = { ...newAdvanced(kind === 'UNKNOWN' ? 'END' : kind,keys), kind, raw: {type,data:Array.from(d)} } as AdvancedBinding
  if (type === 4) { if (d[0] !== 2) throw new Error('Invalid SOCD pair.'); b.mode = d[5] }
  if ([1,2,6].includes(type)) b.actions = type === 2 ? [u32(d,2),u32(d,6)] : [u32(d,2)]
  if (type === 1) b.delay = u16(d,6)
  if (type === 2) b.delay = u16(d,10)
  if (type === 3) { b.thresholds = [2,4,6,8].map(i => u16(d,i)/100); b.actions = [10,18,26,34].map(i => u32(d,i)); b.states = [14,22,30,38].map(i => Array.from(d.slice(i,i+4))) }
  if (type === 5) { b.actions = [3,9,15].map(i => u32(d,i)); b.thresholds = [7,13,19].map(i => u16(d,i)/100) }
  return b
}
export async function readAdvancedBindings(requester: Hero68Requester): Promise<AdvancedBinding[]> {
  const r = await requester.request(readAdvancedKeyPositions(0),0x92,0)
  if (!r.checksumValid || r.reserved !== 0 || r.data.length % 2 || r.data.length > 56) throw new Error('Invalid Advanced Keys position list.')
  const positions = Array.from({length:r.data.length/2},(_,i) => u16(r.data,i*2))
  if (new Set(positions).size !== positions.length) throw new Error('Duplicate Advanced Key position.')
  const bindings: AdvancedBinding[] = [], seen = new Set<number>()
  for (const pos of positions) {
    if (seen.has(pos)) continue
    const b = decodeBinding(await requester.request(readAdvancedKey(0,pos),0x92,0))
    if (!b.keys.includes(posToKeyId(pos) ?? '')) throw new Error('Advanced Key detail does not match its requested position.')
    for (const key of b.keys) { const p = keyIdToPos(key); if (!positions.includes(p) || seen.has(p)) throw new Error('Incomplete or overlapping Advanced Key pair.'); seen.add(p) }
    bindings.push(b)
  }
  return bindings
}
const signature = (b: AdvancedBinding) => JSON.stringify(b.kind === 'UNKNOWN' ? b.raw : {
  kind:b.kind,keys:b.keys,
  actions:b.kind==='SOCD'?undefined:b.actions,
  mode:b.kind==='SOCD'?b.mode:undefined,
  delay:['MT','TGL'].includes(b.kind)?b.delay:undefined,
  depths:['DKS','MPT'].includes(b.kind)?b.thresholds.map(v=>Math.round(v*100)):undefined,
  states:b.kind==='DKS'?b.states:undefined,
})
export function advancedEqual(a: AdvancedBinding[],b: AdvancedBinding[]) { return JSON.stringify(a.map(signature).sort()) === JSON.stringify(b.map(signature).sort()) }
export function mergeAdvanced(fresh: AdvancedBinding[], draft?: AdvancedBinding[], baseline?: AdvancedBinding[]) {
  if (!draft || !baseline) return fresh
  const changed = new Set([...draft,...baseline].filter(b => !draft.some(d => d.id === b.id && baseline.some(v => v.id === b.id && signature(d) === signature(v)))).map(b => b.id))
  const result = [...fresh.filter(b => !changed.has(b.id)),...draft.filter(b => changed.has(b.id))]
  validateAdvanced(result)
  return result
}
/** Read before writing; preserve unedited/unknown bindings and verify final readback. */
export async function saveAdvancedBindings(requester: Hero68Requester, slot: ProfileSlot, draft: AdvancedBinding[], baseline: AdvancedBinding[]) {
  validateAdvanced(draft)
  await requester.request(selectProfile(slot),0x10,0)
  const fresh = await readAdvancedBindings(requester)
  if (!advancedEqual(fresh,baseline)) throw new Error('Advanced Keys changed on the keyboard. Read this profile again before saving.')
  for (const old of baseline) if (!draft.some(b => signature(b) === signature(old))) {
    if (old.kind === 'UNKNOWN') throw new Error('Unknown firmware bindings cannot be removed here.')
    for (const key of old.keys) await requester.request(advancedDelete(0,keyIdToPos(key)),0x12,0,1000)
  }
  for (const b of draft) if (!baseline.some(old => signature(old) === signature(b))) await requester.request(advancedPacket(b),0x12,0,1000)
  const verified = await readAdvancedBindings(requester)
  if (!advancedEqual(verified,draft)) throw new Error('Advanced Keys readback did not match. Read the profile before retrying.')
  return verified
}
