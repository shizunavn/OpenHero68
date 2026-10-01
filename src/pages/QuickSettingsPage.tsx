import type { Dispatch, SetStateAction } from 'react'
import Hero68Preview from '../components/Hero68Preview'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { RAPID_TRIGGER_VALUES } from '../app/helpers'
import type { SwitchOption } from '../app/switchAssets'
import { SwitchStemMenuIcon } from '../app/components/SwitchStemMenuIcon'
import { Toggle } from '../app/components/Toggle'
import { RangeControl } from '../app/components/RangeControl'
import { VerticalRangeControl } from '../app/components/VerticalRangeControl'

export interface QuickSettingsPageProps {
  advancedBindings: AdvancedBinding[]
  selectedKeys: Set<string>
  toggleKey: (keyId: string) => void
  quickPreviewMode: 'none' | 'actuation' | 'rapid' | 'deadzone'
  actuationByKey: Record<string, number>
  rapidPreviewByKey: Record<string, { primary: string; secondary?: string; active: boolean }>
  deadzonePreviewByKey: Record<string, { top: string; bottom: string; active: boolean }>
  hasSelection: boolean
  allSelected: boolean
  selectAll: () => void
  discardSelection: () => void
  selectedSwitch: SwitchOption
  switchProfileMixed: boolean
  actuation: number
  actuationMixed: boolean
  setActuationForSelection: (value: number) => void
  rapidTrigger: boolean
  rapidTriggerMixed: boolean
  setRapidTriggerForSelection: (value: boolean) => void
  rapidTriggerControlsEnabled: boolean
  splitSensitivity: boolean
  splitSensitivityMixed: boolean
  setSplitSensitivityForSelection: (value: boolean) => void
  splitSensitivityControlsEnabled: boolean
  rapidSensitivity: number
  rapidSensitivityMixed: boolean
  setRapidSensitivityForSelection: (value: number) => void
  pressSensitivity: number
  pressSensitivityMixed: boolean
  setPressSensitivityForSelection: (value: number) => void
  releaseSensitivity: number
  releaseSensitivityMixed: boolean
  setReleaseSensitivityForSelection: (value: number) => void
  deadzoneEnabled: boolean
  deadzoneEnabledMixed: boolean
  setDeadzoneEnabledForSelection: (value: boolean) => void
  deadzoneControlsEnabled: boolean
  topDeadzone: number
  topDeadzoneMixed: boolean
  setTopDeadzoneForSelection: (value: number) => void
  bottomDeadzone: number
  bottomDeadzoneMixed: boolean
  setBottomDeadzoneForSelection: (value: number) => void
  tachyon: boolean
  handleTachyonChange: (enabled: boolean) => Promise<void>
  deviceConnected: boolean
  setQuickPreviewMode: Dispatch<SetStateAction<'none' | 'actuation' | 'rapid' | 'deadzone'>>
}

function QuickSettingsPage({
  advancedBindings,
  selectedKeys,
  toggleKey,
  quickPreviewMode,
  actuationByKey,
  rapidPreviewByKey,
  deadzonePreviewByKey,
  hasSelection,
  allSelected,
  selectAll,
  discardSelection,
  selectedSwitch,
  switchProfileMixed,
  actuation,
  actuationMixed,
  setActuationForSelection,
  rapidTrigger,
  rapidTriggerMixed,
  setRapidTriggerForSelection,
  rapidTriggerControlsEnabled,
  splitSensitivity,
  splitSensitivityMixed,
  setSplitSensitivityForSelection,
  splitSensitivityControlsEnabled,
  rapidSensitivity,
  rapidSensitivityMixed,
  setRapidSensitivityForSelection,
  pressSensitivity,
  pressSensitivityMixed,
  setPressSensitivityForSelection,
  releaseSensitivity,
  releaseSensitivityMixed,
  setReleaseSensitivityForSelection,
  deadzoneEnabled,
  deadzoneEnabledMixed,
  setDeadzoneEnabledForSelection,
  deadzoneControlsEnabled,
  topDeadzone,
  topDeadzoneMixed,
  setTopDeadzoneForSelection,
  bottomDeadzone,
  bottomDeadzoneMixed,
  setBottomDeadzoneForSelection,
  tachyon,
  handleTachyonChange,
  deviceConnected,
  setQuickPreviewMode,
}: QuickSettingsPageProps) {
  return (
            <div className="page quick-page page-enter">
              <section className="keyboard-stage">
                <Hero68Preview
                  advancedBindings={advancedBindings}
                  selectedKeys={selectedKeys}
                  onToggleKey={toggleKey}
                  overlayMode={quickPreviewMode}
                  actuationValues={actuationByKey}
                  rapidPreviewValues={rapidPreviewByKey}
                  deadzonePreviewValues={deadzonePreviewByKey}
                />
              </section>

              <div className="selection-instruction">
                {hasSelection
                  ? `${selectedKeys.size} key${selectedKeys.size === 1 ? '' : 's'} selected.`
                  : 'To adjust Actuation Point, Rapid Trigger, or Dead Zone, select one or more keys first.'}
              </div>

              <div className="quick-heading-row">
                <h1>Quick Settings</h1>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={selectAll}>Select all keys</button>
                  <button type="button" className={hasSelection ? "secondary-button" : "ghost-button"} disabled={!hasSelection} onClick={discardSelection}>Discard selection</button>
                </div>
              </div>

              <section className="quick-grid">
                <article
                  className={`setting-card ${!hasSelection ? 'is-unavailable' : ''}`}
                  onMouseEnter={() => setQuickPreviewMode('actuation')}
                  onMouseLeave={() => setQuickPreviewMode('none')}
                >
                  <div className="card-head compact-head">
                    <h2>Actuation Point</h2>
                    <p>Set the point at which a key activates when pressed for all selected keys.</p>
                  </div>
                  <div className="actuation-visual with-switch-preview">
                    <div className={`selected-switch-preview ${switchProfileMixed ? 'is-mixed' : ''}`} aria-hidden="true">
                      {selectedSwitch.front ? <img src={selectedSwitch.front} alt="" /> : <SwitchStemMenuIcon />}
                      <span>{switchProfileMixed ? 'Mixed switch profiles' : selectedSwitch.name}</span>
                    </div>
                    <VerticalRangeControl
                      value={actuation}
                      min={0.1}
                      max={3.4}
                      step={0.05}
                      suffix="mm"
                      disabled={!hasSelection}
                      direction="top"
                      mixed={actuationMixed}
                      mixedPlaceholder="MIXED"
                      onChange={setActuationForSelection}
                    />
                  </div>
                </article>

                <article
                  className={`setting-card ${!hasSelection ? 'is-unavailable' : ''}`}
                  onMouseEnter={() => setQuickPreviewMode('rapid')}
                  onMouseLeave={() => setQuickPreviewMode('none')}
                >
                  <div className="card-head with-toggle compact-head">
                    <div>
                      <h2>Rapid Trigger</h2>
                      <p>When enabled, selected keys dynamically activate and reset based on press and release movement.</p>
                    </div>
                    <Toggle checked={rapidTrigger} mixed={rapidTriggerMixed} onChange={setRapidTriggerForSelection} label="Rapid Trigger" disabled={!hasSelection} />
                  </div>

                  <div className="split-row">
                    <span>Separate press/release sensitivity</span>
                    <Toggle checked={splitSensitivity} mixed={splitSensitivityMixed} onChange={setSplitSensitivityForSelection} label="Separate press/release sensitivity" disabled={!rapidTriggerControlsEnabled} />
                  </div>

                  {!splitSensitivity && !splitSensitivityMixed ? (
                    <>
                      <div className="setting-subtitle">Sensitivity</div>
                      <div className="range-stack">
                        <RangeControl
                          value={rapidSensitivity}
                          min={0.01}
                          max={3.4}
                          step={0.05}
                          allowedValues={RAPID_TRIGGER_VALUES}
                          suffix="mm"
                          recommendedValue={0.65}
                          mixed={rapidSensitivityMixed}
                          disabled={!splitSensitivityControlsEnabled}
                          onChange={setRapidSensitivityForSelection}
                        />
                        <div className="range-labels"><span>High</span><span>Low</span></div>
                      </div>
                    </>
                  ) : (
                    <div className="separate-sensitivity-grid">
                      <div className="separate-sensitivity-item">
                        <div className="setting-subtitle">Press</div>
                        <div className="range-stack">
                          <RangeControl
                            value={pressSensitivity}
                            min={0.01}
                            max={3.4}
                            step={0.05}
                            allowedValues={RAPID_TRIGGER_VALUES}
                            suffix="mm"
                            recommendedValue={0.5}
                            mixed={pressSensitivityMixed || splitSensitivityMixed}
                            disabled={!splitSensitivityControlsEnabled}
                            onChange={setPressSensitivityForSelection}
                          />
                          <div className="range-labels"><span>High</span><span>Low</span></div>
                        </div>
                      </div>
                      <div className="separate-sensitivity-item">
                        <div className="setting-subtitle">Release</div>
                        <div className="range-stack">
                          <RangeControl
                            value={releaseSensitivity}
                            min={0.01}
                            max={3.4}
                            step={0.05}
                            allowedValues={RAPID_TRIGGER_VALUES}
                            suffix="mm"
                            recommendedValue={0.55}
                            mixed={releaseSensitivityMixed || splitSensitivityMixed}
                            disabled={!splitSensitivityControlsEnabled}
                            onChange={setReleaseSensitivityForSelection}
                          />
                          <div className="range-labels"><span>High</span><span>Low</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </article>

                <article
                  className={`setting-card deadzone-setting-card ${!hasSelection ? 'is-unavailable' : ''}`}
                  onMouseEnter={() => setQuickPreviewMode('deadzone')}
                  onMouseLeave={() => setQuickPreviewMode('none')}
                >
                  <div className="card-head with-toggle compact-head deadzone-title-row">
                    <div>
                      <h2>Dead zone setting</h2>
                      <p>The top dead zone reduces false touches, while the bottom dead zone reduces disconnection.</p>
                    </div>
                    <Toggle checked={deadzoneEnabled} mixed={deadzoneEnabledMixed} onChange={setDeadzoneEnabledForSelection} label="Dead zone setting" disabled={!hasSelection} />
                  </div>
                  <div className="deadzone-grid standalone-deadzone-grid">
                    <div className="deadzone-card">
                      <div className="deadzone-head">Top dead zone</div>
                      <VerticalRangeControl
                        value={topDeadzone}
                        min={0}
                        max={0.5}
                        step={0.01}
                        suffix="mm"
                        disabled={!deadzoneControlsEnabled}
                        mixed={topDeadzoneMixed}
                        direction="top"
                        onChange={setTopDeadzoneForSelection}
                      />
                    </div>
                    <div className="deadzone-card">
                      <div className="deadzone-head">Bottom dead zone</div>
                      <VerticalRangeControl
                        value={bottomDeadzone}
                        min={0}
                        max={0.5}
                        step={0.01}
                        suffix="mm"
                        disabled={!deadzoneControlsEnabled}
                        mixed={bottomDeadzoneMixed}
                        direction="bottom"
                        onChange={setBottomDeadzoneForSelection}
                      />
                    </div>
                  </div>
                </article>

                <article className="setting-card tachyon-card">
                  <div className="tachyon-card-inner">
                    <div>
                      <div className="card-head with-toggle compact-head tachyon-head-inline">
                        <h2>Tachyon Mode</h2>
                        <Toggle checked={tachyon} onChange={handleTachyonChange} label="Tachyon Mode" disabled={!deviceConnected} />
                      </div>
                      <p className="tachyon-copy">
                        Tachyon Mode forces 8000 Hz polling and keeps diagnostic streams out of the fast path. Starting Hall Stream turns the host-side Tachyon mode off without changing polling, so the keyboard does not USB re-enumerate just to open telemetry.
                      </p>
                    </div>
                  </div>
                </article>
              </section>
            </div>
  )
}

export { QuickSettingsPage }
