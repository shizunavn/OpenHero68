import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { translateHallError } from '../i18n/deviceErrors'
import Hero68Preview from '../components/Hero68Preview'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { HERO68_HALL_VISUAL_MAX_MM } from '../protocol/hero68/hallStream'
import type { useHero68HallStream } from '../protocol/hero68/hallStream'
import { hallKeyLabel } from '../app/helpers'
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'

const liveKeyOrder = new Map(HERO68_KEY_IDS.map((key, index) => [key, index]))
const liveKeysPerGroup = 10

type HallStream = ReturnType<typeof useHero68HallStream>
type HallStreamSample = HallStream['samples'][string]

export interface StreamPageProps {
  hallStream: HallStream
  deviceConnected: boolean
  handleHallStreamToggle: () => Promise<void>
  advancedBindings: AdvancedBinding[]
  hallStreamPreviewSelection: Set<string>
  toggleHallStreamPin: (keyId: string) => void
  hallStreamPreviewByKey: Record<string, { distanceMm: number; rawAdc: number; pressed: boolean; releaseInferred: boolean }>
  hallStreamPinnedKeyId: string | null
  hallStreamFocusKeyId: string | null
  hallStreamFocusSample: HallStreamSample | undefined
  hallStreamFocusPercent: number
  hallStreamActiveSamples: HallStreamSample[]
  hallStreamListKeyIds: string[]
}

function StreamPage({
  hallStream,
  deviceConnected,
  handleHallStreamToggle,
  advancedBindings,
  hallStreamPreviewSelection,
  toggleHallStreamPin,
  hallStreamPreviewByKey,
  hallStreamPinnedKeyId,
  hallStreamFocusKeyId,
  hallStreamFocusSample,
  hallStreamFocusPercent,
  hallStreamActiveSamples,
  hallStreamListKeyIds,
}: StreamPageProps) {
  const { tr } = useI18n()
  const orderedKeyIds = [...hallStreamListKeyIds].sort((a, b) =>
    Number(!!hallStream.samples[b]?.pressed) - Number(!!hallStream.samples[a]?.pressed)
    || (liveKeyOrder.get(a) ?? 68) - (liveKeyOrder.get(b) ?? 68))
  const groupCount = Math.max(1, Math.ceil(orderedKeyIds.length / liveKeysPerGroup))
  const [group, setGroup] = useState(0)
  const visibleGroup = group % groupCount
  useEffect(() => {
    if (groupCount === 1) { setGroup(0); return }
    const timer = window.setInterval(() => setGroup(current => (current + 1) % groupCount), 2200)
    return () => window.clearInterval(timer)
  }, [groupCount])
  const visibleKeyIds = orderedKeyIds.slice(visibleGroup * liveKeysPerGroup, (visibleGroup + 1) * liveKeysPerGroup)
  return (
            <div className="page quick-page stream-page page-enter">
              <div className="stream-toolbar">
                <div>
                  <h1>{tr('Hall Stream')}</h1>
                  <p>{tr("Monitor every key's Hall travel in real time. Click a key on the preview to pin it as the focused key.")}</p>
                </div>
                <div className="stream-toolbar-actions">
                  <span className={`stream-live-pill ${hallStream.recovering ? 'is-recovering' : hallStream.active ? 'is-live' : ''}`}>
                    <i />{tr(hallStream.recovering ? 'RECOVERING' : hallStream.active ? 'LIVE' : hallStream.starting ? 'STARTING' : 'IDLE')}
                  </span>
                  <button type="button" className={`apply-button ${hallStream.active ? 'is-danger' : ''}`} onClick={handleHallStreamToggle} disabled={!deviceConnected || hallStream.starting}>
                    {tr(hallStream.starting ? 'Starting…' : hallStream.active ? 'Stop stream' : 'Start stream')}
                  </button>
                </div>
              </div>

              <section className="keyboard-stage stream-keyboard-stage">
                <Hero68Preview
                  advancedBindings={advancedBindings}
                  selectedKeys={hallStreamPreviewSelection}
                  onToggleKey={toggleHallStreamPin}
                  overlayMode="stream"
                  streamPreviewValues={hallStreamPreviewByKey}
                />
              </section>

              <section className="stream-dashboard">
                <article className="setting-card stream-travel-card">
                  <div className="stream-travel-head">
                    <div>
                      <span className="stream-eyebrow">{tr(hallStreamPinnedKeyId ? 'FOCUSED KEY · PINNED' : 'FOCUSED KEY')}</span>
                      <h2>{tr(hallKeyLabel(hallStreamFocusKeyId))}</h2>
                    </div>
                    <span className={`stream-pressed-badge ${hallStreamFocusSample?.pressed ? 'is-pressed' : ''} ${hallStreamFocusSample?.releaseInferred ? 'is-inferred' : ''}`}>
                      {tr(hallStreamFocusSample?.pressed ? 'PRESSED' : hallStreamFocusSample?.releaseInferred ? 'RELEASED · HID' : 'RELEASED')}
                    </span>
                  </div>
                  <div className="stream-travel-visual">
                    <div className="stream-travel-scale" aria-hidden="true">
                      <span>0.0</span><span>1.0</span><span>2.0</span><span>3.0</span><span>{HERO68_HALL_VISUAL_MAX_MM.toFixed(1)}</span>
                    </div>
                    <div className="stream-travel-track">
                      <div className="stream-travel-fill" style={{ height: `${hallStreamFocusPercent}%` }} />
                      <div className="stream-travel-marker" style={{ top: `${hallStreamFocusPercent}%` }} />
                    </div>
                    <div className="stream-travel-readout">
                      <strong>{hallStreamFocusSample ? hallStreamFocusSample.visualDistanceMm.toFixed(2) : '0.00'}<small> mm</small></strong>
                      <span>{hallStreamFocusPercent.toFixed(0)}% {tr('travel')}</span>
                    </div>
                  </div>
                </article>

                <article className="setting-card stream-observed-card">
                  <div className="card-head compact-head">
                    <h2>{tr('Live keys')}</h2>
                    <span>{hallStreamActiveSamples.length} {tr('active')}{groupCount > 1 && <> · {tr('Auto group {group}/{total}', { group: visibleGroup + 1, total: groupCount })}</>}</span>
                  </div>
                  <div className="stream-selected-list">
                    {visibleKeyIds.map((keyId) => {
                      const sample = hallStream.samples[keyId]
                      const pct = sample ? Math.max(0, Math.min(100, (sample.visualDistanceMm / HERO68_HALL_VISUAL_MAX_MM) * 100)) : 0
                      return (
                        <div className="stream-selected-row" key={keyId} title={sample && hallStream.keyTelemetryHz[keyId] ? `${hallKeyLabel(keyId)} · ${hallStream.keyTelemetryHz[keyId].toFixed(1)} Hz` : undefined}>
                          <strong>{hallKeyLabel(keyId)}</strong>
                          <span className="stream-row-bar"><i style={{ width: `${pct}%` }} /></span>
                          <span className="stream-row-value">
                            <b>{sample ? (sample.releaseInferred ? '0.00 mm' : `${sample.visualDistanceMm.toFixed(2)} mm`) : '—'}</b>
                          </span>
                        </div>
                      )
                    })}
                    {hallStreamListKeyIds.length === 0 && <p className="stream-empty-copy">{tr('Start the stream, then press a key. Its travel will appear here and directly on the keyboard.')}</p>}
                  </div>
                </article>
              </section>

              <div className="stream-footline">
                <span>{tr('68-key Hall monitoring')}</span>
                <span>{hallStream.recovering ? tr('Recovering Hall telemetry…') : hallStream.telemetryHz ? tr('~{rate} Hz refresh', { rate: hallStream.telemetryHz.toFixed(1) }) : hallStream.active ? tr('Measuring refresh rate…') : tr('Ready')}</span>
              </div>
              {hallStream.error && <p className="stream-error stream-error-banner">{translateHallError(hallStream.error, tr)}</p>}
            </div>
  )
}

export { StreamPage }
