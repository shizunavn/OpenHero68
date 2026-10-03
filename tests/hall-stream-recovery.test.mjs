import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const bundle = await rolldown({ input: 'src/protocol/hero68/hallStream.ts', plugins: [{
  name: 'mock-hall-device',
  resolveId(source, importer) {
    if (source === './webhid' && importer?.endsWith('hallStream.ts')) return '\0hall-device'
    if (source === './hallPolling' && importer?.endsWith('hallStream.ts')) return '\0hall-polling'
  },
  load(id) {
    if (id === '\0hall-device') return 'export const hero68DeviceManager = globalThis.__hallTestDevice'
    if (id === '\0hall-polling') return `import {runHallPolling as poll} from ${JSON.stringify(process.cwd().replaceAll('\\','/') + '/src/protocol/hero68/hallPolling.ts')}; export const runHallPolling = options => poll({...options,maxOutageMs:120})`
  },
}] })
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false })
await bundle.close()
let instance = 0
const waitUntil = async predicate => {
  const deadline = Date.now() + 1000
  while (!predicate()) { assert.ok(Date.now() < deadline, 'Hall recovery did not finish'); await new Promise(resolve => setTimeout(resolve, 2)) }
}

async function withStream(run) {
  const oldWindow = globalThis.window, oldDevice = globalThis.__hallTestDevice
  globalThis.window = { setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {} }
  const reports = new Set(), devices = new Set(), sent = []
  let handler = async () => {}, state = 'connected'
  const manager = {
    connected: true, viaService: false,
    onReport(fn) { reports.add(fn); return () => reports.delete(fn) },
    subscribe(fn) { devices.add(fn); return () => devices.delete(fn) },
    getSnapshot() { return { state, error: null } },
    async recoverControlChannel() {},
    async request(packet, command, zone, _timeout, predicate) {
      sent.push({ command, zone, data: [...packet.slice(7, 7 + packet[6])] })
      await handler(packet, command, zone)
      let data = command === 0x84 ? [1] : [...packet.slice(7, 7 + packet[6])]
      if (command === 0x98 && zone === 1) {
        data = []
        for (let i = 7; i < 7 + packet[6]; i += 2) data.push(packet[i], packet[i+1], 0, 100, 0x80, 123)
      }
      const reply = { command, zone, data: Uint8Array.from(data), checksumValid: true }
      assert.ok(!predicate || predicate(reply))
      for (const fn of reports) fn(reply)
      return reply
    },
  }
  globalThis.__hallTestDevice = manager
  const { hero68HallStream: stream } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code + '\n// instance ' + instance++).toString('base64')}`)
  try {
    await run({ stream, sent, reports, devices, setHandler(fn) { handler = fn },
      disconnect() { manager.connected = false; state = 'disconnected'; for (const fn of [...devices]) fn() },
    })
  } finally {
    handler = async () => {}
    try { await stream.stop() } finally { globalThis.window = oldWindow; globalThis.__hallTestDevice = oldDevice }
  }
}

test('persistent polling failure clears pressed samples, exits distance mode, and restores auto calibration', () => withStream(async ({ stream, sent, reports, devices, setHandler }) => {
  let reads = 0
  setHandler(async (_packet, command, zone) => {
    if (command === 0x98 && zone === 1 && ++reads > 1) throw Error('HERO68 read timed out')
  })
  await stream.start(['KeyW'], 'mode-poll')
  await waitUntil(() => stream.getSnapshot().sampleCount > 0)
  assert.equal(stream.getSnapshot().samples.KeyW.pressed, true)
  await waitUntil(() => sent.some(r => r.command === 0x04 && r.zone === 25 && r.data[0] === 1))
  const snapshot = stream.getSnapshot()
  assert.equal(snapshot.active, false)
  assert.match(snapshot.error, /timed out/)
  assert.equal(snapshot.samples.KeyW.visualDistanceMm, 0)
  assert.equal(snapshot.samples.KeyW.pressed, false)
  assert.equal(snapshot.telemetryHz, null)
  assert.deepEqual(sent.slice(-2).map(r => [r.command,r.zone,r.data]), [[0x98,2,[]],[0x04,25,[1]]])
  assert.equal(reports.size, 0); assert.equal(devices.size, 0)
}))

test('transient timeouts keep the stream active and clear recovery state after telemetry returns', () => withStream(async ({ stream, setHandler }) => {
  let reads = 0
  setHandler(async (_packet, command, zone) => {
    if (command === 0x98 && zone === 1 && ++reads === 2) throw Error('HERO68 read timed out')
  })
  await stream.start(['KeyW'])
  await waitUntil(() => stream.getSnapshot().recovering)
  assert.equal(stream.getSnapshot().active, true)
  assert.equal(stream.getSnapshot().samples.KeyW.pressed, false)
  await waitUntil(() => reads >= 3 && !stream.getSnapshot().recovering)
  assert.equal(stream.getSnapshot().active, true)
  assert.equal(stream.getSnapshot().error, null)
  assert.equal(stream.getSnapshot().samples.KeyW.pressed, true)
}))

test('USB disconnect is not overwritten by the pending request failure', () => withStream(async ({ stream, setHandler, disconnect }) => {
  let rejectRead
  setHandler((_packet, command, zone) => command === 0x98 && zone === 1
    ? new Promise((_resolve, reject) => { rejectRead = reject }) : Promise.resolve())
  await stream.start(['KeyW'])
  await waitUntil(() => !!rejectRead)
  disconnect()
  rejectRead(Error('HERO68 read timed out'))
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(stream.getSnapshot().active, false)
  assert.match(stream.getSnapshot().error, /USB interface disconnected/)
}))

test('a failed calibration restore still cleans up, and the next start retries restoration', () => withStream(async ({ stream, setHandler, sent, reports, devices }) => {
  setHandler(async (_packet, command, zone) => { if (command === 0x04 && zone === 25 && _packet[7] === 1) throw Error('restore timeout') })
  await stream.start(['KeyW'], 'mode-poll')
  await assert.rejects(() => stream.stop(), /restore timeout/)
  assert.equal(stream.getSnapshot().active, false)
  assert.equal(reports.size, 0); assert.equal(devices.size, 0)
  const before = sent.length
  setHandler(async () => {})
  await stream.start(['KeyW'])
  assert.deepEqual(sent[before], { command: 0x04, zone: 25, data: [1] })
  await stream.stop()
}))
