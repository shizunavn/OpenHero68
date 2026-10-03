import { useI18n } from '../i18n'
import { translateHallError } from '../i18n/deviceErrors'
import type { Dispatch, SetStateAction } from 'react'
import { Info } from 'lucide-react'
import Hero68Preview from '../components/Hero68Preview'
import FeatureHelp from '../components/FeatureHelp'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { hallKeyLabel } from '../app/helpers'
import type { SwitchOption } from '../app/switchAssets'
import { SwitchStemMenuIcon } from '../app/components/SwitchStemMenuIcon'
import { Toggle } from '../app/components/Toggle'
import { VerticalRangeControl } from '../app/components/VerticalRangeControl'

export interface ActuationPageProps {
  actuationPreviewWidth: number | undefined
  advancedBindings: AdvancedBinding[]
  selectedKeys: Set<string>
  toggleKey: (keyId: string) => void
  actuationByKey: Record<string, number>
  hallStreamPreviewByKey: Record<string, { distanceMm: number; rawAdc: number; pressed: boolean; releaseInferred: boolean }>
  setActuationPreviewWidth: Dispatch<SetStateAction<number | undefined>>
  hasSelection: boolean
  allSelected: boolean
  selectAll: () => void
  discardSelection: () => void
  switchProfileMixed: boolean
  selectedSwitch: SwitchOption
  actuation: number
  actuationMixed: boolean
  setActuationForSelection: (value: number) => void
  hallStream: ReturnType<typeof import('../protocol/hero68/hallStream').useHero68HallStream>
  deviceConnected: boolean
  handleActuationHallStreamToggle: () => Promise<void>
  actuationHallTriggered: boolean
  actuationHallFocusKeyId: string | null
  actuationHallTravelMm: number
  actuationHallTravelPercent: number
  actuationHallThresholdPercent: number
  actuationHallThresholdMm: number
}

function ActuationPage({
  actuationPreviewWidth,
  advancedBindings,
  selectedKeys,
  toggleKey,
  actuationByKey,
  hallStreamPreviewByKey,
  setActuationPreviewWidth,
  hasSelection,
  allSelected,
  selectAll,
  discardSelection,
  switchProfileMixed,
  selectedSwitch,
  actuation,
  actuationMixed,
  setActuationForSelection,
  hallStream,
  deviceConnected,
  handleActuationHallStreamToggle,
  actuationHallTriggered,
  actuationHallFocusKeyId,
  actuationHallTravelMm,
  actuationHallTravelPercent,
  actuationHallThresholdPercent,
  actuationHallThresholdMm,
}: ActuationPageProps) {
  const { tr } = useI18n()
  return (
            <div className="page quick-page actuation-page page-enter" style={{ '--actuation-preview-width': actuationPreviewWidth ? `${actuationPreviewWidth}px` : undefined } as React.CSSProperties}>
              <section className={`keyboard-stage actuation-keyboard-stage ${hallStream.active ? 'is-streaming' : ''}`}>
                <Hero68Preview
                  advancedBindings={advancedBindings}
                  selectedKeys={selectedKeys}
                  onToggleKey={toggleKey}
                  overlayMode="actuation"
                  actuationValues={actuationByKey}
                  streamPreviewValues={hallStreamPreviewByKey}
                  onWidthChange={setActuationPreviewWidth}
                />
              </section>

              <div className="selection-instruction actuation-selection-instruction">
                {hasSelection
                  ? tr(selectedKeys.size === 1 ? 'Adjusting Actuation Point for {count} selected key.' : 'Adjusting Actuation Point for {count} selected keys.', { count: selectedKeys.size })
                  : tr('To adjust Actuation Point, select one or more keys first.')}
              </div>

              <div className="quick-heading-row actuation-heading-row">
                <div className="actuation-title-wrap">
                  <h1>{tr('Actuation Point')}</h1>
                  <FeatureHelp title="Actuation Point" paragraphs={[
                    'The actuation point is the distance a key must travel before it registers a keypress. A lower value activates the key with a lighter press; a higher value requires a deeper press.',
                    'Select one or more keys to adjust their actuation point. Use a shallow setting for fast inputs, or a deeper setting to help avoid accidental keypresses when typing.',
                  ]} />
                </div>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={selectAll}>{tr('Select all keys')}</button>
                  <button type="button" className={hasSelection ? "secondary-button" : "ghost-button"} disabled={!hasSelection} onClick={discardSelection}>{tr('Discard selection')}</button>
                </div>
              </div>

              <section className="actuation-woot-grid">
                <article className={`setting-card actuation-woot-card actuation-editor-woot-card ${!hasSelection ? 'is-unavailable' : ''}`}>
                  <div className="actuation-editor-head actuation-editor-woot-head">
                    <div>
                      <h2>{tr('Set Actuation Point')}</h2>
                      <p>{tr('Customize the actuation point by setting the exact distance a key must be pressed before it registers a keypress.')}</p>
                    </div>
                    <span className="actuation-always-on"><i />{tr('Always on')}</span>
                  </div>

                  <div className="actuation-editor-summary-line">
                    <span>{tr('Changing Actuation Point for')}</span>
                    <strong>{tr(selectedKeys.size === 1 ? '{count} key' : '{count} keys', { count: hasSelection ? selectedKeys.size : 0 })}</strong>
                  </div>

                  <div className="actuation-editor-body actuation-editor-woot-body">
                    <div className={`actuation-switch-preview ${switchProfileMixed ? 'is-mixed' : ''}`}>
                      <div
                        className="actuation-switch-image-wrap"
                      >
                        {selectedSwitch.front ? <img src={selectedSwitch.front} alt={`${selectedSwitch.name} switch`} /> : <SwitchStemMenuIcon />}
                      </div>
                    </div>

                    <div className="actuation-distance-control source-actuation-slider actuation-page-slider">
                      <VerticalRangeControl
                        value={actuation}
                        min={0.1}
                        max={3.4}
                        step={0.05}
                        suffix="mm"
                        direction="top"
                        disabled={!hasSelection}
                        mixed={actuationMixed}
                        mixedPlaceholder="MIXED"
                        onChange={setActuationForSelection}
                      />
                      <div className="actuation-distance-labels">
                        <span><b>0.10 mm</b><small>{tr('Shallow')}</small></span>
                        <span><b>3.40 mm</b><small>{tr('Deep')}</small></span>
                      </div>
                    </div>
                  </div>

                </article>

                <article className={`setting-card actuation-woot-card actuation-hall-card ${(!hasSelection || !deviceConnected) && !hallStream.active ? 'is-unavailable' : ''}`}>
                  <div className="actuation-woot-card-head actuation-hall-head">
                    <div>
                      <h2>{tr('Visual Feedback')}</h2>
                      <span className={`actuation-live-state ${hallStream.active ? 'is-live' : ''}`}><i />{tr(hallStream.starting ? 'STARTING' : hallStream.active ? 'LIVE' : 'IDLE')}</span>
                    </div>
                    <Toggle
                      checked={hallStream.active}
                      onChange={() => void handleActuationHallStreamToggle()}
                      label={tr('Visual Feedback')}
                      disabled={!deviceConnected || !hasSelection || hallStream.starting}
                    />
                  </div>
                  <p className="actuation-woot-copy">
                    {tr("Read the selected keys' real Hall travel and compare it with their Actuation Point while you press them.")}
                  </p>

                  <div className={`actuation-hall-panel ${actuationHallTriggered ? 'is-actuated' : ''}`}>
                    <div className="actuation-hall-row">
                      <div>
                        <span className="actuation-hall-kicker">{tr(selectedKeys.size > 1 ? 'ACTIVE SELECTED KEY' : 'SELECTED KEY')}</span>
                        <strong>{actuationHallFocusKeyId ? hallKeyLabel(actuationHallFocusKeyId) : tr(hasSelection ? 'Press a selected key' : 'Select a key')}</strong>
                      </div>
                      <div className="actuation-hall-value">
                        <strong>{hallStream.active ? actuationHallTravelMm.toFixed(2) : '0.00'}</strong><small> mm</small>
                      </div>
                    </div>

                    <div className="actuation-hall-track" aria-hidden="true">
                      <span className="actuation-hall-fill" style={{ width: `${hallStream.active ? actuationHallTravelPercent : 0}%` }} />
                      {hasSelection && (!actuationMixed || Boolean(actuationHallFocusKeyId)) && (
                        <span className="actuation-hall-threshold" style={{ left: `${actuationHallThresholdPercent}%` }} />
                      )}
                    </div>

                    <div className="actuation-hall-meta">
                      <span>{tr(actuationHallTriggered && hallStream.active ? 'ACTUATED' : hallStream.active ? 'READY' : 'STREAM OFF')}</span>
                      <span>{actuationHallFocusKeyId ? `AP ${actuationHallThresholdMm.toFixed(2)} mm` : actuationMixed ? tr('Mixed AP values') : `AP ${actuation.toFixed(2)} mm`}</span>
                      <span>{hallStream.active && hallStream.telemetryHz ? `~${hallStream.telemetryHz.toFixed(1)} Hz` : tr('Selected-key Hall poll')}</span>
                    </div>
                  </div>

                  <div className="actuation-hall-note">
                    <Info size={15} aria-hidden="true" />
                    <span>{!deviceConnected
                      ? tr('Connect HERO68 to use Visual Feedback.')
                      : !hasSelection
                        ? tr('Select one or more keys above, then enable Visual Feedback.')
                        : hallStream.active
                          ? tr('Press any selected key. The most recently moving selected key is shown here.')
                          : tr('Enable Visual Feedback to start reading the selected keys.')}</span>
                  </div>
                  {hallStream.error && <p className="actuation-hall-error">{translateHallError(hallStream.error, tr)}</p>}
                </article>
              </section>
            </div>
  )
}

export { ActuationPage }
