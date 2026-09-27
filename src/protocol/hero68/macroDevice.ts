import catalog from './macroCatalog.json'
import { buildReport, MAX_DATA_LENGTH } from './codec'
import type { MacroDefinition, MacroEvent } from '../../state/macros'
import type { DecodedReport } from './types'

const MACRO_COMMAND = 0x05
const MAX_DURATION = 0x0fffff
const MAX_PACKET_COUNT = 0xff
const MAX_BLOB_LENGTH = MAX_DATA_LENGTH * MAX_PACKET_COUNT
const actionByName = new Map(catalog.map(action => [action.name, action] as const))

export interface Hero68MacroRequester {
  request(
    report: Uint8Array,
    expectedCommand: number,
    expectedZone?: number,
    timeoutMs?: number,
    predicate?: (reply: DecodedReport) => boolean,
  ): Promise<DecodedReport>
}

function encodeEvent(event: MacroEvent): number[] {
  const action = actionByName.get(event.key)
  if (!action) throw new Error(`Unsupported macro action: ${event.key}`)
  if (!Number.isInteger(event.delayMs) || event.delayMs < 0 || event.delayMs > MAX_DURATION) {
    throw new RangeError(`Macro delay must be an integer between 0 and ${MAX_DURATION} ms.`)
  }

  const actionCode = event.type === 'up' ? action.up : action.down
  return [
    (actionCode & 0xf0) | ((event.delayMs >>> 16) & 0x0f),
    (event.delayMs >>> 8) & 0xff,
    event.delayMs & 0xff,
    action.value,
  ]
}

/**
 * Encode the official HERO68 v3 macro table used by CMD 0x05.
 *
 * Blob layout:
 *   N * { offset:u16le, length:u16le }
 *   followed by N entries:
 *   { utf8NameLength:u8, utf8Name[], events[] }
 *
 * Event layout (4 bytes):
 *   byte0 = action high nibble | duration[19:16]
 *   byte1 = duration[15:8]
 *   byte2 = duration[7:0]
 *   byte3 = action value
 */
export function encodeHero68MacroBlob(macros: readonly MacroDefinition[]): Uint8Array {
  if (macros.length === 0) return new Uint8Array()

  const encoder = new TextEncoder()
  const entries = macros.map((macro) => {
    const name = encoder.encode(macro.name)
    if (name.length > 0xff) throw new RangeError(`Macro name “${macro.name}” is too long for the device format.`)

    const events: number[] = []
    for (const event of macro.events) events.push(...encodeEvent(event))
    const entry = Uint8Array.from([name.length, ...name, ...events])
    if (entry.length > 0xffff) throw new RangeError(`Macro “${macro.name}” is too large for the device format.`)
    return entry
  })

  const tableLength = entries.length * 4
  if (tableLength > 0xffff) throw new RangeError('Macro table is too large for the device format.')

  let offset = tableLength
  const bytes: number[] = []
  for (const entry of entries) {
    if (offset > 0xffff) throw new RangeError('Macro table offset exceeds the device format.')
    bytes.push(offset & 0xff, (offset >>> 8) & 0xff, entry.length & 0xff, (entry.length >>> 8) & 0xff)
    offset += entry.length
  }
  for (const entry of entries) bytes.push(...entry)

  if (bytes.length > MAX_BLOB_LENGTH) {
    throw new RangeError(`Macro library is too large for CMD 0x05 framing (${bytes.length} > ${MAX_BLOB_LENGTH} bytes).`)
  }
  return Uint8Array.from(bytes)
}

export function buildHero68MacroReports(macros: readonly MacroDefinition[]): Uint8Array[] {
  const blob = encodeHero68MacroBlob(macros)
  if (blob.length === 0) return []

  const total = Math.ceil(blob.length / MAX_DATA_LENGTH)
  const reports: Uint8Array[] = []
  for (let sequence = 0; sequence < total; sequence++) {
    const start = sequence * MAX_DATA_LENGTH
    reports.push(buildReport({
      command: MACRO_COMMAND,
      zone: 0,
      reserved: 0,
      total,
      sequence,
      data: blob.slice(start, start + MAX_DATA_LENGTH),
    }))
  }
  return reports
}

function exactEcho(expected: Uint8Array, reply: DecodedReport): boolean {
  if (reply.raw.length !== expected.length) return false
  for (let index = 0; index < expected.length; index++) {
    if (reply.raw[index] !== expected[index]) return false
  }
  return true
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms))
}

/**
 * Mirrors the official v3 controller's _send_macro_to_device():
 * 56-byte CMD 0x05 chunks and an exact echoed-report acknowledgement.
 */
export async function syncHero68MacroLibrary(
  requester: Hero68MacroRequester,
  macros: readonly MacroDefinition[],
): Promise<number> {
  const reports = buildHero68MacroReports(macros)
  if (reports.length === 0) return 0

  for (const report of reports) {
    let lastError: unknown = null
    let sent = false
    for (let attempt = 0; attempt < 5 && !sent; attempt++) {
      try {
        await requester.request(
          report,
          MACRO_COMMAND,
          0,
          1000,
          reply => reply.total === report[4]
            && reply.sequence === report[5]
            && exactEcho(report, reply),
        )
        sent = true
      } catch (error) {
        lastError = error
        if (attempt < 4) await sleep(20)
      }
    }
    if (!sent) throw lastError instanceof Error ? lastError : new Error('HERO68 rejected the macro payload.')
  }

  return reports.length
}
