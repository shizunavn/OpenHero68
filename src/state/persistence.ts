import type { RemapLayers } from '../protocol/hero68/remap'
import type { RgbProfile, RgbDirty } from '../protocol/hero68/rgb'
import type { AdvancedBinding } from '../protocol/hero68/advanced'

export const OPENHERO68_STATE_KEY = 'openhero68:web-state:v1'

export type PersistedOpenHeroState = {
  activeRail?: 'keyboard' | 'settings' | 'help'
  activePage?: string
  activeSettingsPage?: string
  selectedKeys?: string[]
  selectedSwitchId?: string
  assignedSwitchesByKey?: Record<string, string>
  actuationByKey?: Record<string, number>
  rapidTriggerByKey?: Record<string, boolean>
  splitSensitivityByKey?: Record<string, boolean>
  rapidSensitivityByKey?: Record<string, number>
  pressSensitivityByKey?: Record<string, number>
  releaseSensitivityByKey?: Record<string, number>
  deadzoneEnabledByKey?: Record<string, boolean>
  topDeadzoneByKey?: Record<string, number>
  bottomDeadzoneByKey?: Record<string, number>
  tachyon?: boolean
  tachyonPreviousPollingRate?: 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000
  compactSidebar?: boolean
  showAdvancedPages?: boolean
  rememberSelection?: boolean
  pollingRate?: 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000
  osModeMac?: boolean
  winLock?: boolean
  hallDebounce?: boolean
  autoCalibration?: boolean
  switchSearch?: string
  switchBrandFilter?: string
  profileSlot?: 0 | 1 | 2
  profileNames?: Record<0 | 1 | 2, string>
  remapLayers?: RemapLayers
  profileDrafts?: Partial<Record<0 | 1 | 2, ProfileDraft>>
}

export type ProfileDraft = Pick<PersistedOpenHeroState,
  'assignedSwitchesByKey' | 'actuationByKey' | 'rapidTriggerByKey' |
  'splitSensitivityByKey' | 'rapidSensitivityByKey' | 'pressSensitivityByKey' |
  'releaseSensitivityByKey' | 'deadzoneEnabledByKey' | 'topDeadzoneByKey' |
  'bottomDeadzoneByKey' | 'remapLayers'> & { advancedBindings?: AdvancedBinding[]; advancedBaseline?: AdvancedBinding[]; dirtyKeys?: string[]; dirtyRemaps?: string[]; remapBaseline?: RemapLayers; rgb?: RgbProfile; rgbBaseline?: RgbProfile; rgbDirty?: RgbDirty; rgbFormat?: 1 }

export function loadOpenHeroState(): PersistedOpenHeroState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(OPENHERO68_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as PersistedOpenHeroState : null
  } catch {
    return null
  }
}

export function saveOpenHeroState(state: PersistedOpenHeroState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OPENHERO68_STATE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in private / restricted browser contexts.
  }
}
