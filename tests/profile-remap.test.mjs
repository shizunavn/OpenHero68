import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

// Bundle the real TypeScript modules so tests exercise the browser's protocol
// code without requiring another compiler/runtime dependency.
async function bundle(path) {
  const build = await rolldown({ input: path })
  try {
    const { output } = await build.generate({ format: 'esm' })
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally { await build.close() }
}
const remap = await bundle('src/protocol/hero68/remap.ts')
const commands = await bundle('src/protocol/hero68/commands.ts')
const codec = await bundle('src/protocol/hero68/codec.ts')
const positions = await bundle('src/protocol/hero68/keyPositions.ts')

function fakeDevice(initial = remap.defaultRemapLayers(), options = {}) {
  const layers = structuredClone(initial)
  const reports = []
  let name = null
  return {
    layers, reports,
    async request(packet, command, zone) {
      const decoded = codec.decodeReport(packet)
      reports.push(decoded)
      assert.equal(decoded.checksumValid, true)
      assert.equal(decoded.command, command)
      assert.equal(decoded.zone, zone)
      if (command === 0x03) {
        for (const record of codec.decodeRemapRecords(decoded.data)) layers[zone][positions.posToKeyId(record.keyId)] = record.keycode
        return { data: new Uint8Array() }
      }
      if (command === 0x83) {
        const data = []
        for (let i = 0; i < decoded.data.length; i += 2) {
          const pos = (decoded.data[i] << 8) | decoded.data[i + 1]
          data.push(...codec.u16be(pos), ...codec.u32be(options.mismatch ? 0 : layers[zone][positions.posToKeyId(pos)]))
        }
        if (options.incomplete) data.splice(-6)
        if (options.duplicate) data.push(...data.slice(0, 6))
        return { data: Uint8Array.from(data) }
      }
      if (command === 0x1a) {
        assert.equal(decoded.data.length, 56)
        name = remap.decodeProfileName(decoded.data)
      }
      if (command === 0x9a) {
        const encoded = new TextEncoder().encode(name ?? '')
        return { data: Uint8Array.from([encoded.length, ...encoded]) }
      }
      return { data: new Uint8Array() }
    },
  }
}

test('factory layouts contain all 68 physical keys on all three layers', () => {
  const layers = remap.defaultRemapLayers()
  for (const layer of remap.REMAP_LAYERS) assert.equal(Object.keys(layers[layer]).length, 68)
  assert.equal(layers[0].KeyA, 0x00000004)
  assert.equal(layers[0].Fn, 0x0d000000)
  assert.equal(layers[0].ShiftLeft, 0x00020000)
  layers[0].KeyA = 0
  assert.equal(remap.defaultRemapLayers()[0].KeyA, 4)
})

test('macro key bindings encode the captured official 03 TT CC II record', () => {
  assert.equal(remap.encodeMacroRemap(0, 'circle', 1), 0x03010100)
  assert.equal(remap.encodeMacroRemap(7, 'button', 3), 0x03020307)
  assert.equal(remap.encodeMacroRemap(12, 'repeat', 255), 0x0304ff0c)
  assert.deepEqual(remap.decodeMacroRemap(0x03010100), { mode: 'circle', modeCode: 1, count: 1, macroIndex: 0 })
  assert.equal(remap.decodeMacroRemap(0x03030100), null)
  assert.equal(remap.isMacroRemapValue(0x03030100), true)
  assert.throws(() => remap.encodeMacroRemap(256, 'circle', 1), /index/)
  assert.throws(() => remap.encodeMacroRemap(0, 'circle', 0), /count/)

  const packet = commands.writeRemap(0, [[0x0038, remap.encodeMacroRemap(0, 'circle', 1)]])[0]
  const decoded = codec.decodeReport(packet)
  assert.equal(decoded.command, 0x03)
  assert.equal(decoded.zone, 0)
  assert.deepEqual([...decoded.data], [0x00, 0x38, 0x03, 0x01, 0x01, 0x00])
})

test('reads all layers as independent requests with <=9 positions', async () => {
  const device = fakeDevice()
  assert.deepEqual(await remap.readRemapLayers(device), remap.defaultRemapLayers())
  assert.equal(device.reports.length, 24)
  for (const report of device.reports) {
    assert.equal(report.command, 0x83)
    assert.equal(report.total, 1)
    assert.equal(report.sequence, 0)
    assert.ok(report.data.length <= 18)
  }
})

test('incomplete or duplicate mapping replies are rejected', async () => {
  await assert.rejects(remap.readRemapLayers(fakeDevice(undefined, { incomplete: true })), /Incomplete/)
  await assert.rejects(remap.readRemapLayers(fakeDevice(undefined, { duplicate: true })), /Unexpected/)
})

test('saves only edited keys in their layer and preserves vendor action bits', async () => {
  const device = fakeDevice()
  const desired = remap.defaultRemapLayers()
  desired[0].KeyA = 0x00020000
  desired[1].KeyW = 0x020000cd
  desired[2].KeyZ = 0x0d010000
  await remap.saveRemapChanges(device, 2, desired, new Set(['0:KeyA', '1:KeyW', '2:KeyZ']))
  assert.deepEqual(device.layers, desired)
  assert.equal(device.reports[0].command, 0x10)
  assert.equal(device.reports[0].data[0], 2)
  assert.equal(device.reports.filter(report => report.command === 0x03).length, 3)
  assert.ok(device.reports.filter(report => report.command === 0x03).every(report => report.data.length === 6))
})

test('ten changes split into nine-record and one-record writes with readback', async () => {
  const desired = remap.defaultRemapLayers()
  const keys = Object.keys(desired[0]).slice(0, 10)
  for (const key of keys) desired[0][key] = 0x020000e9
  const device = fakeDevice()
  await remap.saveRemapChanges(device, 1, desired, new Set(keys.map(key => `0:${key}`)))
  assert.deepEqual(device.reports.filter(report => report.command === 3).map(report => report.data.length), [54, 6])
  assert.deepEqual(device.layers, desired)
})

test('save fails on mismatched or incomplete readback', async () => {
  const desired = remap.defaultRemapLayers()
  desired[0].KeyA = 0x0d000000
  for (const option of [{ mismatch: true }, { incomplete: true }, { duplicate: true }]) {
    await assert.rejects(remap.saveRemapChanges(fakeDevice(undefined, option), 0, desired, new Set(['0:KeyA'])), /readback/)
  }
})

test('empty dirty set sends no packets', async () => {
  const device = fakeDevice()
  await remap.saveRemapChanges(device, 1, device.layers, new Set())
  assert.equal(device.reports.length, 0)
})

test('profile names use official LEN=56, inner UTF-8 byte length and valid checksum', async () => {
  const name = 'Hồ sơ chơi game'
  const packet = commands.writeProfileName(2, name)
  const decoded = codec.decodeReport(packet)
  assert.equal(decoded.command, 0x1a)
  assert.equal(decoded.zone, 2)
  assert.equal(decoded.checksumValid, true)
  assert.equal(decoded.data.length, 56)
  assert.equal(decoded.data[0], new TextEncoder().encode(name).length)
  assert.equal(remap.decodeProfileName(decoded.data), name)
  assert.equal(remap.decodeProfileName(Uint8Array.of(255)), null)
  assert.equal(remap.decodeProfileName(Uint8Array.of(0)), null)
  assert.throws(() => remap.decodeProfileName(Uint8Array.of(56)), /Invalid/)
  assert.throws(() => remap.decodeProfileName(Uint8Array.of(4, 65)), /Invalid/)
  assert.equal(commands.writeProfileName(0, 'x'.repeat(55))[6], 56)
  assert.throws(() => commands.writeProfileName(0, 'x'.repeat(56)), /55/)
  assert.throws(() => commands.writeProfileName(0, 'ế'.repeat(19)), /55/)
  await remap.saveOnboardProfileName(fakeDevice(), 1, name)
})
