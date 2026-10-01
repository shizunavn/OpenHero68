import Hero68Preview from '../components/Hero68Preview'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { HERO68_HALL_VISUAL_MAX_MM } from '../protocol/hero68/hallStream'
import type { useHero68HallStream } from '../protocol/hero68/hallStream'
import { hallKeyLabel } from '../app/helpers'

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
  return (
            <div className="page quick-page stream-page page-enter">
              <div className="stream-toolbar">
                <div>
                  <h1>Hall Stream</h1>
                  <p>Monitor every key's Hall travel in real time. Click a key on the preview to pin it as the focused key.</p>
                </div>
                <div className="stream-toolbar-actions">
                  <span className={`stream-live-pill ${hallStream.active ? 'is-live' : ''}`}>
                    <i />{hallStream.active ? 'LIVE' : hallStream.starting ? 'STARTING' : 'IDLE'}
                  </span>
                  <button type="button" className={`apply-button ${hallStream.active ? 'is-danger' : ''}`} onClick={handleHallStreamToggle} disabled={!deviceConnected || hallStream.starting}>
                    {hallStream.starting ? 'Starting…' : hallStream.active ? 'Stop stream' : 'Start stream'}
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
                      <span className="stream-eyebrow">{hallStreamPinnedKeyId ? 'FOCUSED KEY · PINNED' : 'FOCUSED KEY'}</span>
                      <h2>{hallKeyLabel(hallStreamFocusKeyId)}</h2>
                    </div>
                    <span className={`stream-pressed-badge ${hallStreamFocusSample?.pressed ? 'is-pressed' : ''} ${hallStreamFocusSample?.releaseInferred ? 'is-inferred' : ''}`}>
                      {hallStreamFocusSample?.pressed ? 'PRESSED' : hallStreamFocusSample?.releaseInferred ? 'RELEASED · HID' : 'RELEASED'}
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
                      <span>{hallStreamFocusPercent.toFixed(0)}% travel</span>
                    </div>
                  </div>
                </article>

                <article className="setting-card stream-observed-card">
                  <div className="card-head compact-head">
                    <h2>Live keys</h2>
                    <span>{hallStreamActiveSamples.length} active</span>
                  </div>
                  <div className="stream-selected-list">
                    {hallStreamListKeyIds.map((keyId) => {
                      const sample = hallStream.samples[keyId]
                      const pct = sample ? Math.max(0, Math.min(100, (sample.visualDistanceMm / HERO68_HALL_VISUAL_MAX_MM) * 100)) : 0
                      return (
                        <div className="stream-selected-row" key={keyId}>
                          <strong>{hallKeyLabel(keyId)}</strong>
                          <span className="stream-row-bar"><i style={{ width: `${pct}%` }} /></span>
                          <span className="stream-row-value">
                            <b>{sample ? (sample.releaseInferred ? '0.00 mm' : `${sample.visualDistanceMm.toFixed(2)} mm`) : '—'}</b>
                            <small>{sample && hallStream.keyTelemetryHz[keyId] ? `${hallStream.keyTelemetryHz[keyId].toFixed(1)} Hz` : '—'}</small>
                          </span>
                        </div>
                      )
                    })}
                    {hallStreamListKeyIds.length === 0 && <p className="stream-empty-copy">Start the stream, then press a key. Its travel will appear here and directly on the keyboard.</p>}
                  </div>
                </article>
              </section>

              <div className="stream-footline">
                <span>68-key Hall monitoring</span>
                <span>{hallStream.telemetryHz ? `~${hallStream.telemetryHz.toFixed(1)} Hz refresh` : hallStream.active ? 'Measuring refresh rate…' : 'Ready'}</span>
              </div>
              {hallStream.error && <p className="stream-error stream-error-banner">{hallStream.error}</p>}
            </div>
  )
}

export { StreamPage }
