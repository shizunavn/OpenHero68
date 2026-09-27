import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import { rolldown } from 'rolldown'

async function bundle(path) {
  const build = await rolldown({ input: path })
  try {
    const { output } = await build.generate({ format: 'esm' })
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally { await build.close() }
}
const encoder = await bundle('src/protocol/hero68/hero68Encoder.ts')
const switches = await bundle('src/protocol/hero68/switchProfiles.ts')
const positions = await bundle('src/protocol/hero68/keyPositions.ts')
const codec = await bundle('src/protocol/hero68/codec.ts')
// Only switch/settings packet data is retained; no machine-specific capture metadata.
const capture = JSON.parse(fs.readFileSync(new URL('./fixtures/switch-profiles.json', import.meta.url), 'utf8'))

test('capture confirms all twelve presets, with Black King at both ends', () => {
  assert.deepEqual(capture.switchRuns.map(run => run.switchIds[0]), [8,4,13,1,3,5,14,15,16,22,24,27,8])
  assert.equal(switches.HERO68_SWITCH_PROFILES.length, 12)
  for (const run of capture.switchRuns) assert.deepEqual(run.positions, [56,57,62,63])
  assert.equal(switches.switchProfileLabel('clear'), 'Jade')
  assert.equal(switches.switchProfileLabel('switch-14'), 'Jade King')
})

test('all 13 individual-key saves match the captured 0x15 -> AP -> RT -> DZ packets exactly', () => {
  const out = capture.reports.filter(report => report.direction === 'out')
  assert.equal(out.length, 13 * 4)
  for (let index = 0; index < out.length; index += 4) {
    const burst = out.slice(index, index + 4)
    assert.deepEqual(burst.map(report => report.command), [0x15,0x13,0x19,0x16])
    const keys = burst[0].records.map(record => ({
      keyId: positions.posToKeyId(record.pos),
      switchProfile: switches.switchProfileId(record.switchId),
      actuationMm: 0.8, rapidTriggerEnabled: true, splitSensitivity: false,
      rapidSensitivityMm: 0.2, pressSensitivityMm: 0.2, releaseSensitivityMm: 0.2,
      deadzoneEnabled: true, topDeadzoneMm: 0.1, bottomDeadzoneMm: 0.1,
    }))
    const packets = encoder.hero68ProtocolEncoder.encodeSave({ keys, profileSlot: 1, tachyon: false })
    assert.deepEqual(packets.slice(1).map(hex => hex.toLowerCase()), burst.map(report => report.hex))
  }
})

test('readback preserves every captured switch and unlisted firmware IDs', async () => {
  for (const firmwareId of [...new Set(capture.switchRuns.map(run => run.switchIds[0])), 34, 255]) {
    const hydrated = await encoder.hydrateFromDevice({
      async request(packet, command) {
        const request = codec.decodeReport(packet)
        if (command !== 0x95) return { data: new Uint8Array() }
        const records = []
        for (let i = 0; i < request.data.length; i += 2) records.push(request.data[i], request.data[i+1], firmwareId)
        return { data: Uint8Array.from(records) }
      },
    }, 1)
    assert.equal(hydrated.size, 68)
    for (const settings of hydrated.values()) assert.equal(switches.switchFirmwareId(settings.switchProfile), firmwareId)
    const keys = [...hydrated].map(([keyId, settings]) => ({ keyId, ...settings, actuationMm: 0.8, rapidTriggerEnabled: false, splitSensitivity: false, rapidSensitivityMm: 0.2, pressSensitivityMm: 0.2, releaseSensitivityMm: 0.2, deadzoneEnabled: false, topDeadzoneMm: 0, bottomDeadzoneMm: 0 }))
    const reports = encoder.hero68ProtocolEncoder.encodeSave({ keys, profileSlot: 1, tachyon: false }).map(hex => codec.decodeReport(Uint8Array.from(Buffer.from(hex, 'hex')))).filter(report => report.command === 0x15)
    assert.deepEqual(reports.map(report => report.data.length / 3), [18,18,18,14])
    for (const report of reports) for (const record of codec.decodeSwitchTypeRecords(report.data)) assert.equal(record.switchType, firmwareId)
  }
})

test('invalid switch values fail before producing partial saves', () => {
  for (const value of ['switch--1', 'switch-256', 'wrong', '', 'switch-1.5']) {
    assert.equal(switches.isSwitchProfileId(value), false)
    assert.throws(() => switches.switchFirmwareId(value), RangeError)
  }
})
