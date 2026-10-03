// Browser regression fixture. No HID connection or configuration writes.
import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { StreamPage } from '../../src/pages/StreamPage'
import { I18nProvider } from '../../src/i18n'
import { HERO68_KEY_IDS } from '../../src/keyboard/hero68Layout'
import { HERO68_KEY_POSITIONS } from '../../src/protocol/hero68/keyPositions'
import '../../src/styles/index.css'

function Fixture() {
  const [count, setCount] = useState(0), [spam, setSpam] = useState(false)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    if (!spam) return
    let tick = 0
    const timer = setInterval(() => setCount([0, 1, 8, 68][tick++ % 4]), 60)
    return () => clearInterval(timer)
  }, [spam])
  const keys = count === 10
    ? ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
    : HERO68_KEY_IDS.slice(0, count)
  const samples = useMemo(() => Object.fromEntries(keys.map((keyId, i) => [keyId, {
    keyId, pos: HERO68_KEY_POSITIONS[keyId], distanceMm: 1 + i % 3,
    visualDistanceMm: 1 + i % 3, distanceUnits: 100, rawAdc: 123,
    pressed: true, releaseInferred: false, timestampMs: 1,
  }])), [count])
  const active = Object.values(samples)
  const stream = { active: true, starting: false, recovering, source: 'direct-poll' as const,
    error: null, sampleCount: count, frameCount: 1, telemetryHz: 100,
    samples, keyTelemetryHz: Object.fromEntries(keys.map(key => [key, 15])),
  }
  return <I18nProvider language="vi"><main className="workspace" style={{ height: '100vh' }}>
    <header className="topbar" style={{ padding: 12, gap: 12, flexWrap: 'wrap' }}>
      <strong>Mô phỏng Hall Stream · không kết nối USB</strong>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 8, 10, 68].map(n => <button key={n} className="secondary-button" onClick={() => { setSpam(false); setCount(n) }}>{n} phím</button>)}
        <button className="apply-button" onClick={() => setSpam(!spam)}>{spam ? 'Dừng spam' : 'Spam phím'}</button>
        <button className="secondary-button" onClick={() => setRecovering(!recovering)}>Phục hồi</button>
      </div>
    </header>
    <StreamPage hallStream={stream} deviceConnected={false} handleHallStreamToggle={async () => {}}
      advancedBindings={[]} hallStreamPreviewSelection={new Set(keys)} toggleHallStreamPin={() => {}}
      hallStreamPreviewByKey={Object.fromEntries(active.map(s => [s.keyId, s]))}
      hallStreamPinnedKeyId={null} hallStreamFocusKeyId={keys[0] ?? null}
      hallStreamFocusSample={active[0]} hallStreamFocusPercent={active.length ? 100 / 3.4 : 0}
      hallStreamActiveSamples={active} hallStreamListKeyIds={keys} />
  </main></I18nProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
