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

test('capture preserves the twelve firmware IDs while the retired profile has no catalog name', () => {
  assert.deepEqual(capture.switchRuns.map(run => run.switchIds[0]), [8,4,13,1,3,5,14,15,16,22,24,27,8])
  assert.equal(switches.HERO68_SWITCH_PROFILES.length, 11)
  assert.equal(switches.HERO68_SWITCH_PROFILES.some(profile => profile.firmwareId === 27), false)
  for (const run of capture.switchRuns) assert.deepEqual(run.positions, [56,57,62,63])
  assert.equal(switches.switchProfileLabel('clear'), 'Jade')
  assert.equal(switches.switchProfileLabel('switch-14'), 'Jade King')
})

test('retired ID 27 stays raw through readback and persisted-profile lookup without being renamed as another switch', () => {
  assert.equal(switches.switchProfileId(27), 'switch-27')
  assert.equal(switches.isSwitchProfileId('switch-27'), true)
  assert.equal(switches.switchFirmwareId('switch-27'), 27)
  assert.equal(switches.switchProfileLabel('switch-27'), 'Stored profile (ID 27)')
  assert.equal(switches.switchProfileLabel('switch-255'), 'Stored profile (ID 255)')
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

test('incomplete, duplicate and unrelated switch readbacks cannot silently retain a cached profile', async () => {
  const a=positions.keyIdToPos('KeyA'),s=positions.keyIdToPos('KeyS'),d=positions.keyIdToPos('KeyD')
  const dataFor=records=>Uint8Array.from(records.flatMap(([pos,id])=>[pos>>8,pos&255,id]))
  for(const records of [[[a,13]],[[a,13],[a,27]],[[a,13],[d,27]]]){
    await assert.rejects(encoder.hydrateFromDevice({async request(_,command){return {data:command===0x95?dataFor(records):new Uint8Array()}}},0,['KeyA','KeyS']),/switch profile readback/)
  }
})

test('saving Meteor for all 68 keys writes only ID 13 and reads back all keys in the selected profile', async () => {
  const stored=new Map()
  const layout=await bundle('src/keyboard/hero68Layout.ts')
  const values=layout.HERO68_KEY_IDS.map(keyId=>({keyId,switchProfile:'white',actuationMm:1.6,rapidTriggerEnabled:false,splitSensitivity:false,rapidSensitivityMm:.65,pressSensitivityMm:.5,releaseSensitivityMm:.55,deadzoneEnabled:true,topDeadzoneMm:0,bottomDeadzoneMm:0}))
  const packets=encoder.hero68ProtocolEncoder.encodeSave({keys:values,profileSlot:0,tachyon:false}).map(hex=>codec.decodeReport(Buffer.from(hex,'hex')))
  assert.equal(packets[0].command,0x10);assert.equal(packets[0].data[0],0)
  for(const packet of packets.filter(packet=>packet.command===0x15))for(const record of codec.decodeSwitchTypeRecords(packet.data)){assert.equal(record.switchType,13);stored.set(record.keyId,record.switchType)}
  assert.equal(stored.size,68)
  const readback=await encoder.hydrateFromDevice({async request(packet,command){const request=codec.decodeReport(packet);if(command===0x10){assert.equal(request.data[0],0);return {data:new Uint8Array()}}if(command!==0x95)return {data:new Uint8Array()};const data=[];for(let i=0;i<request.data.length;i+=2)data.push(request.data[i],request.data[i+1],stored.get((request.data[i]<<8)|request.data[i+1]));return {data:Uint8Array.from(data)}}},0)
  assert.equal(readback.size,68)
  for(const settings of readback.values())assert.equal(settings.switchProfile,'white')
})
