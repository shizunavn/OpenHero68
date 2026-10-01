import { Suspense } from 'react'
import type * as React from 'react'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import type { RgbProfile } from '../protocol/hero68/rgb'
import type { ProfileSlot } from '../protocol/hero68/types'

type RgbSettingsPageComponent = typeof import('../components/RgbSettingsPage')['default']

export interface RgbPageProps {
  onSetup: () => void
  initialCustom: boolean
  onEntered: () => void
  advancedBindings: AdvancedBinding[]
  profileSlot: ProfileSlot
  rgb: RgbProfile
  profileBusy: boolean
  setRgb: React.Dispatch<React.SetStateAction<RgbProfile>>
  setSaveState: React.Dispatch<React.SetStateAction<'idle' | 'staged' | 'sent'>>
  RgbSettingsPage: React.LazyExoticComponent<RgbSettingsPageComponent>
}

function RgbPage({
  onSetup,
  initialCustom,
  onEntered,
  advancedBindings,
  profileSlot,
  rgb,
  profileBusy,
  setRgb,
  setSaveState,
  RgbSettingsPage,
}: RgbPageProps) {
  return (
            <Suspense fallback={<div className="page settings-page">Loading RGB preview…</div>}><RgbSettingsPage onSetup={onSetup} initialCustom={initialCustom} onEntered={onEntered} advancedBindings={advancedBindings} key={profileSlot} value={rgb} busy={profileBusy} onChange={next => { setRgb(next); setSaveState('idle') }} /></Suspense>
  )
}

export { RgbPage }
