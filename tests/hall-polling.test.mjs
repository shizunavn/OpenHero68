import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rolldown } from 'rolldown'

const bundle = await rolldown({ input: 'src/protocol/hero68/hallPolling.ts' })
const { output } = await bundle.generate({ format: 'esm' })
const { runHallPolling } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)
await bundle.close()
const timeout = () => new Error('HERO68 read timed out (command=0x98, zone=0x01)')

test('normal polling covers every selected position in batches of at most nine', async () => {
  let active = true
  const batches = [], delays = []
  await runHallPolling({ positions: Array.from({ length: 10 }, (_, i) => i + 1), isActive: () => active,
    requestBatch: async batch => { batches.push([...batch]); if (batches.length === 2) active = false },
    delay: async ms => { delays.push(ms) },
  })
  assert.deepEqual(batches, [[1,2,3,4,5,6,7,8,9], [10]])
  assert.deepEqual(delays, [8])
})

test('a dropped Hall reply retries the same batch and continues after recovery', async () => {
  let active = true
  const batches = [], delays = []
  await runHallPolling({ positions: [30, 56], isActive: () => active,
    requestBatch: async batch => { batches.push([...batch]); if (batches.length === 1) throw timeout(); active = false },
    delay: async ms => { delays.push(ms) },
  })
  assert.deepEqual(batches, [[30,56], [30,56]])
  assert.deepEqual(delays, [80])
})

test('repeated large-batch timeouts reduce batch size without skipping keys or regrowing it', async () => {
  let active = true
  const requested = [], successful = []
  const positions = Array.from({ length: 10 }, (_, i) => i + 1)
  await runHallPolling({ positions, isActive: () => active,
    requestBatch: async batch => {
      requested.push([...batch])
      if (batch.length > 3) throw timeout()
      successful.push(...batch)
      if (successful.length === 20) active = false
    }, delay: async () => {},
  })
  assert.deepEqual(requested.slice(0, 4).map(batch => batch.length), [9,9,4,4])
  assert.ok(requested.slice(4).every(batch => batch.length === 2))
  assert.deepEqual(successful, [...positions, ...positions])
})

test('a completely unresponsive keyboard fails after bounded single-key retries', async () => {
  let requests = 0, clock = 0
  await assert.rejects(() => runHallPolling({ positions: [30], isActive: () => true,
    requestBatch: async () => { requests++; clock += 650; throw timeout() }, delay: async ms => { clock += ms },
    now: () => clock, maxOutageMs: 2000,
  }), /timed out/)
  assert.equal(requests, 4)
})

test('a temporary single-key outage recovers without ending the stream', async () => {
  let active = true, requests = 0, recovered = 0, clock = 0
  const statuses = [], delays = []
  await runHallPolling({ positions: [30], isActive: () => active,
    requestBatch: async () => { requests++; clock += 650; if (requests <= 5) throw timeout(); active = false },
    delay: async ms => { clock += ms; delays.push(ms) }, now: () => clock,
    recover: async () => { recovered++ }, onRecovering: value => statuses.push(value),
  })
  assert.equal(requests, 6)
  assert.equal(recovered, 1)
  assert.deepEqual(statuses, [true, false])
  assert.ok(delays.includes(250) && delays.includes(500))
})

test('outage budget resets after successful telemetry, not after reopening alone', async () => {
  let active = true, clock = 0, request = 0, recovered = 0
  const statuses = []
  await runHallPolling({ positions: [30], isActive: () => active,
    requestBatch: async () => { request++; clock += 200; if (request % 3 !== 0) throw timeout(); if (request === 6) active = false },
    delay: async ms => { clock += ms }, now: () => clock, maxOutageMs: 800,
    recover: async () => { recovered++ }, onRecovering: value => statuses.push(value),
  })
  assert.equal(recovered, 2)
  assert.deepEqual(statuses, [true, false, true, false])
})

test('stop during handle recovery sends no additional poll', async () => {
  let active = true, requests = 0
  await runHallPolling({ positions: [30], isActive: () => active,
    requestBatch: async () => { requests++; throw timeout() }, delay: async () => {},
    recover: async () => { active = false },
  })
  assert.equal(requests, 2)
})

test('stopping during timeout backoff sends no retry or next batch', async () => {
  let active = true, requests = 0
  await runHallPolling({ positions: [30,56], isActive: () => active,
    requestBatch: async () => { requests++; throw timeout() }, delay: async () => { active = false },
  })
  assert.equal(requests, 1)
})

test('disconnect during a request preserves cancellation instead of raising a polling failure', async () => {
  let active = true
  await runHallPolling({ positions: [30], isActive: () => active,
    requestBatch: async () => { active = false; throw Error('HERO68 disconnected') },
    delay: async () => { assert.fail('Disconnected polling must not retry') },
  })
})

test('transport errors other than timeouts are not retried', async () => {
  let requests = 0
  await assert.rejects(() => runHallPolling({ positions: [30,56], isActive: () => true,
    requestBatch: async () => { requests++; throw Error('HERO68 is not connected') }, delay: async () => {},
  }), /not connected/)
  assert.equal(requests, 1)
})
