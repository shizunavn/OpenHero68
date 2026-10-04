import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

async function bundle(input) {
  const build = await rolldown({ input })
  try {
    const { output } = await build.generate({ format: 'esm' })
    return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
  } finally { await build.close() }
}
const bridge = await bundle('src/protocol/deviceBridge.ts')
const { hero68ProtocolEncoder } = await bundle('src/protocol/hero68/hero68Encoder.ts')
const snapshot = Object.freeze({
  profileSlot: 2,
  tachyon: false,
  keys: Object.freeze([Object.freeze(bridge.makeKeyDeviceSettings('KeyW', {
    actuationMm: 1.6, rapidTriggerEnabled: true, splitSensitivity: false,
    rapidSensitivityMm: 0.65, pressSensitivityMm: 0.5, releaseSensitivityMm: 0.55,
    deadzoneEnabled: true, topDeadzoneMm: 0.1, bottomDeadzoneMm: 0.1, switchProfile: 'white',
  }))]),
})

test('unregistered protocol rejects Save and preserves the editable snapshot', async () => {
  assert.equal(bridge.isHero68ProtocolReady(), false)
  const before = structuredClone(snapshot)
  await assert.rejects(bridge.saveDeviceConfiguration(snapshot), /protocol is not ready/)
  assert.deepEqual(snapshot, before)
})

test('Save sends the real encoder packets in order and reports success only after the last write', async () => {
  const expected = hero68ProtocolEncoder.encodeSave(snapshot), sent = []
  bridge.registerHero68Protocol(hero68ProtocolEncoder, { async sendHex(packet) { sent.push(packet) } })
  assert.equal(bridge.isHero68ProtocolReady(), true)
  assert.deepEqual(await bridge.saveDeviceConfiguration(snapshot), { mode: 'sent', packets: expected })
  assert.deepEqual(sent, expected)
})

test('a serial transport failure rejects Save, stops subsequent writes and retains the snapshot for retry', async () => {
  const before = structuredClone(snapshot), sent = [], failure = new Error('USB disconnected')
  bridge.registerHero68Protocol(hero68ProtocolEncoder, {
    async sendHex(packet) { sent.push(packet); if (sent.length === 2) throw failure },
  })
  await assert.rejects(bridge.saveDeviceConfiguration(snapshot), error => error === failure)
  assert.equal(sent.length, 2)
  assert.deepEqual(snapshot, before)
  const retry = []
  bridge.registerHero68Protocol(hero68ProtocolEncoder, { async sendHex(packet) { retry.push(packet) } })
  assert.equal((await bridge.saveDeviceConfiguration(snapshot)).mode, 'sent')
  assert.deepEqual(retry, hero68ProtocolEncoder.encodeSave(snapshot))
})

test('batch transport is awaited and its failure cannot produce a successful save', async () => {
  const expected = hero68ProtocolEncoder.encodeSave(snapshot), failure = new Error('Batch ACK missing')
  let batch
  bridge.registerHero68Protocol(hero68ProtocolEncoder, {
    async sendHex() { assert.fail('Batch-capable transport must not use individual writes') },
    async sendBatchHex(packets) { batch = packets; throw failure },
  })
  await assert.rejects(bridge.saveDeviceConfiguration(snapshot), error => error === failure)
  assert.deepEqual(batch, expected)
  bridge.registerHero68Protocol(hero68ProtocolEncoder, {
    async sendHex() { assert.fail('Batch-capable transport must not use individual writes') },
    async sendBatchHex(packets) { assert.deepEqual(packets, expected) },
  })
  assert.deepEqual(await bridge.saveDeviceConfiguration(snapshot), { mode: 'sent', packets: expected })
})

test('encoding failure rejects before any device writes and preserves the snapshot', async () => {
  const failure = new Error('Unknown switch'), before = structuredClone(snapshot)
  bridge.registerHero68Protocol({ encodeSave() { throw failure } }, {
    async sendHex() { assert.fail('An invalid snapshot must not reach the device') },
  })
  await assert.rejects(bridge.saveDeviceConfiguration(snapshot), error => error === failure)
  assert.deepEqual(snapshot, before)
})
