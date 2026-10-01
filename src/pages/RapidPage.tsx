import type { Dispatch, SetStateAction } from 'react'
import Hero68Preview from '../components/Hero68Preview'
import FeatureHelp from '../components/FeatureHelp'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'
import { RAPID_TRIGGER_VALUES } from '../app/helpers'
import { Toggle } from '../app/components/Toggle'
import { RangeControl } from '../app/components/RangeControl'
import { VerticalRangeControl } from '../app/components/VerticalRangeControl'

export interface RapidPageProps {
  advancedBindings: AdvancedBinding[]
  selectedKeys: Set<string>
  toggleKey: (keyId: string) => void
  quickPreviewMode: 'none' | 'actuation' | 'rapid' | 'deadzone'
  rapidPreviewByKey: Record<string, { primary: string; secondary?: string; active: boolean }>
  deadzonePreviewByKey: Record<string, { top: string; bottom: string; active: boolean }>
  hasSelection: boolean
  allSelected: boolean
  selectAll: () => void
  discardSelection: () => void
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
  setQuickPreviewMode: Dispatch<SetStateAction<'none' | 'actuation' | 'rapid' | 'deadzone'>>
  rapidTriggerByKey: Record<string, boolean>
}

function RapidPage({
  advancedBindings,
  selectedKeys,
  toggleKey,
  quickPreviewMode,
  rapidPreviewByKey,
  deadzonePreviewByKey,
  hasSelection,
  allSelected,
  selectAll,
  discardSelection,
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
  setQuickPreviewMode,
  rapidTriggerByKey,
}: RapidPageProps) {
  return (
            <div className="page quick-page rapid-page page-enter">
              <section className="keyboard-stage rapid-keyboard-stage">
                <Hero68Preview
                  advancedBindings={advancedBindings}
                  selectedKeys={selectedKeys}
                  onToggleKey={toggleKey}
                  overlayMode={quickPreviewMode === 'deadzone' ? 'deadzone' : 'rapid'}
                  rapidPreviewValues={rapidPreviewByKey}
                  deadzonePreviewValues={deadzonePreviewByKey}
                />
              </section>

              <div className="selection-instruction rapid-selection-instruction">
                {hasSelection
                  ? `Adjusting Rapid Trigger for ${selectedKeys.size} selected key${selectedKeys.size === 1 ? '' : 's'}.`
                  : 'To adjust Rapid Trigger, please select one or more keys first.'}
              </div>

              <div className="quick-heading-row rapid-heading-row">
                <div className="rapid-title-wrap">
                  <h1>Rapid Trigger</h1>
                  <FeatureHelp title="Rapid Trigger" paragraphs={[
                    'Rapid Trigger dynamically adjusts the actuation and deactivation points. After the key reaches its actuation point, pressing it down activates it and releasing it resets it according to the sensitivity you set.',
                    "This can make repeated inputs faster in competitive games: you don't have to fully release a key before pressing it again. A lower sensitivity value requires less movement, while a higher value helps avoid unintended inputs.",
                  ]} />
                </div>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={selectAll}>Select all keys</button>
                  <button type="button" className={hasSelection ? "secondary-button" : "ghost-button"} disabled={!hasSelection} onClick={discardSelection}>Discard selection</button>
                </div>
              </div>

              <section className="rapid-woot-grid">
                <article
                  className={`setting-card rapid-woot-card rapid-enable-card ${!hasSelection ? 'is-unavailable' : ''}`}
                  onMouseEnter={() => setQuickPreviewMode('rapid')}
                >
                  <div className="rapid-card-head with-control">
                    <h2>Enable Rapid Trigger</h2>
                    <Toggle checked={rapidTrigger} mixed={rapidTriggerMixed} onChange={setRapidTriggerForSelection} label="Rapid Trigger" disabled={!hasSelection} />
                  </div>
                  <p className="rapid-card-copy">
                    Rapid Trigger dynamically actuates and resets your key based on your intention to press or release the key. Rapid Trigger starts and ends after the actuation point.
                  </p>
                  <div className="rapid-enabled-summary">
                    <span>ENABLED ON <strong>{HERO68_KEY_IDS.filter((keyId) => rapidTriggerByKey[keyId]).length}</strong> KEYS</span>
                  </div>
                </article>

                <article
                  className={`setting-card rapid-woot-card rapid-sensitivity-card ${!rapidTriggerControlsEnabled ? 'is-unavailable' : ''}`}
                  onMouseEnter={() => setQuickPreviewMode('rapid')}
                >
                  <div className="rapid-card-head">
                    <h2>Rapid Trigger Sensitivity</h2>
                  </div>

                  <div className="rapid-split-row">
                    <span className="rapid-split-label">Split sensitivity <FeatureHelp title="Split sensitivity" paragraphs={[
                      'Set separate Rapid Trigger sensitivities for pressing and releasing a key. Press sensitivity controls how far the key moves down to reactivate; release sensitivity controls how far it moves up to reset.',
                      'Use a smaller release value for a quicker reset, or a larger press value to reduce accidental reactivation. With split sensitivity off, the same value applies in both directions.',
                    ]} /></span>
                    <Toggle
                      checked={splitSensitivity}
                      mixed={splitSensitivityMixed}
                      onChange={setSplitSensitivityForSelection}
                      label="Split sensitivity"
                      disabled={!rapidTriggerControlsEnabled}
                    />
                  </div>

                  {!splitSensitivity && !splitSensitivityMixed ? (
                    <div className="rapid-sensitivity-control">
                      <div className="rapid-control-label">SENSITIVITY</div>
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
                      <div className="rapid-range-labels"><span>HIGH</span><span>LOW</span></div>
                    </div>
                  ) : (
                    <div className="rapid-split-controls">
                      <div>
                        <div className="rapid-control-label">PRESS</div>
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
                      </div>
                      <div>
                        <div className="rapid-control-label">RELEASE</div>
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
                      </div>
                    </div>
                  )}
                </article>

                <article
                  className={`setting-card rapid-woot-card rapid-deadzone-card ${!hasSelection ? 'is-unavailable' : ''}`}
                  onMouseEnter={() => setQuickPreviewMode('deadzone')}
                  onMouseLeave={() => setQuickPreviewMode('rapid')}
                >
                  <div className="rapid-card-head with-control">
                    <h2>Dead Zone</h2>
                    <Toggle checked={deadzoneEnabled} mixed={deadzoneEnabledMixed} onChange={setDeadzoneEnabledForSelection} label="Dead Zone" disabled={!hasSelection} />
                  </div>
                  <p className="rapid-card-copy rapid-deadzone-copy">
                    The top dead zone reduces false touches, while the bottom dead zone helps prevent unintended release near full travel.
                  </p>

                  <div className="deadzone-grid rapid-deadzone-grid">
                    <div className="deadzone-card rapid-deadzone-control-card">
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
                    <div className="deadzone-card rapid-deadzone-control-card">
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
              </section>
            </div>
  )
}

export { RapidPage }
