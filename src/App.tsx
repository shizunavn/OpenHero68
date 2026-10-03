import { lazy, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gamepad2,
  Keyboard,
  Lightbulb,
  ListOrdered,
  Palette,
  Search,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  Zap,
} from 'lucide-react'
import KeyRemapPage from './components/KeyRemapPage'
import AdvancedKeysPage from './components/AdvancedKeysPage'
import MacroPage from './components/MacroPage'
import { advancedEqual, mergeAdvanced, readAdvancedBindings, saveAdvancedBindings, type AdvancedBinding } from './protocol/hero68/advanced'
import MyProfilePage from './components/MyProfilePage'
import { mergeRgb, readRgbProfile, restoreStoredRgb, rgbChanges, rgbDirtyCount, saveRgbProfile, type RgbProfile } from './protocol/hero68/rgb'
import { HERO68_KEY_IDS } from './keyboard/hero68Layout'
import { loadOpenHeroState, saveOpenHeroState, type PersistedOpenHeroState, type ProfileDraft } from './state/persistence'
import { createTranslator, I18nProvider, type LanguagePreference } from './i18n'
import { browserSuggestedLanguage, detectRegion } from './i18n/region'
import { defaultRemapLayers, isMacroRemapValue, readRemapLayers, readOnboardProfileName, saveOnboardProfileName, saveRemapChanges, REMAP_LAYERS, type RemapLayer, type RemapLayers } from './protocol/hero68/remap'
import { makeKeyDeviceSettings, saveDeviceConfiguration } from './protocol/deviceBridge'
import { hero68DeviceManager, useHero68Device, type Hero68ConnectionState } from './protocol/hero68/webhid'
import { syncHero68MacroLibrary } from './protocol/hero68/macroDevice'
import { loadMacroLibrary } from './state/macros'
import { hydrateFromDevice } from './protocol/hero68/hero68Encoder'
import { isSwitchProfileId, switchProfileLabel } from './protocol/hero68/switchProfiles'
import { HERO68_HALL_VISUAL_MAX_MM, hero68HallStream, useHero68HallStream } from './protocol/hero68/hallStream'
import {
  liveIdle,
  POLLING_RATES,
  readActiveProfile,
  readAutoCalibration,
  readHallDebounce,
  readOsMode,
  readWinLock,
  selectProfile,
  writeAutoCalibration,
  writeHallDebounce,
  writeOsMode,
  writeWinLock,
} from './protocol/hero68/commands'
import type { PollingRate, ProfileSlot } from './protocol/hero68/types'
import logo from './assets/openhero68-logo.png'
import hero68 from './assets/hero68.png'
import { FACTORY_REMAP_LAYERS, HERO68_KEY_ID_SET, isWholeKeyboardSelected, mergeHydratedBooleans, mergeHydratedNumbers, mergePerKeyState, normalizeHero68Selection, RAPID_TRIGGER_VALUES, selectionHasMixedValues, snapToAllowedValue, snapToStep } from './app/helpers'
import { SWITCH_OPTIONS, type SwitchOption, type SwitchTone } from './app/switchAssets'
import { SwitchSelectorBoard } from './app/components/SwitchSelectorBoard'
import { RailItem } from './app/components/RailItem'
import { SidebarItem } from './app/components/SidebarItem'
import { KeyboardMenuIcon } from './app/components/KeyboardMenuIcon'
import { SwitchStemMenuIcon } from './app/components/SwitchStemMenuIcon'
import { KeyRemapMenuIcon } from './app/components/KeyRemapMenuIcon'
import { AdvancedKeysMenuIcon } from './app/components/AdvancedKeysMenuIcon'
import { RapidTriggerMenuIcon } from './app/components/RapidTriggerMenuIcon'
import { Toggle } from './app/components/Toggle'
import { LanguageSelect } from './app/components/LanguageSelect'
import { QuickSettingsPage } from './pages/QuickSettingsPage'
import { StreamPage } from './pages/StreamPage'
import { RgbPage } from './pages/RgbPage'
import BackgroundServicePage from './pages/BackgroundServicePage'
import LocalServicePermissionGuide from './components/LocalServicePermissionGuide'
import { ActuationPage } from './pages/ActuationPage'
import { RapidPage } from './pages/RapidPage'
import { TachyonContext } from './app/TachyonContext'
import { useDeviceSettings } from './app/hooks/useDeviceSettings'
import GamepadPage from './pages/GamepadPage'
import {gamepadService} from './protocol/gamepadService'

const RgbSettingsPage = lazy(() => import('./components/RgbSettingsPage'))

function App() {
  const persistedState = useMemo(() => loadOpenHeroState(), [])
  const hero68Device = useHero68Device()
  const hallStream = useHero68HallStream()
  const deviceConnectionState: Hero68ConnectionState = hero68Device.state
  const [activeRail, setActiveRail] = useState<'keyboard' | 'settings' | 'help'>(() => persistedState?.activeRail ?? 'keyboard')
  const [activePage, setActivePage] = useState(() => persistedState?.activePage ?? 'quick')
  const [activeSettingsPage, setActiveSettingsPage] = useState(() => persistedState?.activeSettingsPage ?? 'general')
  const [rgbCustomEntry, setRgbCustomEntry] = useState(false)
  const [actuation, setActuation] = useState(1.6)
  const [rapidTrigger, setRapidTrigger] = useState(false)
  const [splitSensitivity, setSplitSensitivity] = useState(false)
  const [rapidSensitivity, setRapidSensitivity] = useState(0.65)
  const [pressSensitivity, setPressSensitivity] = useState(0.5)
  const [releaseSensitivity, setReleaseSensitivity] = useState(0.55)
  const [deadzoneEnabled, setDeadzoneEnabled] = useState(true)
  const [topDeadzone, setTopDeadzone] = useState(0)
  const [bottomDeadzone, setBottomDeadzone] = useState(0)
  const [tachyon, setTachyon] = useState(() => persistedState?.tachyon ?? false)
  const [tachyonPreviousPollingRate, setTachyonPreviousPollingRate] = useState<PollingRate | null>(() => persistedState?.tachyonPreviousPollingRate ?? null)
  const [rgbStreamActive, setRgbStreamActive] = useState(false)
  const [quickPreviewMode, setQuickPreviewMode] = useState<'none' | 'actuation' | 'rapid' | 'deadzone'>('none')
  const [actuationByKey, setActuationByKey] = useState<Record<string, number>>(() => mergePerKeyState(persistedState?.actuationByKey, 1.6))
  const [rapidTriggerByKey, setRapidTriggerByKey] = useState<Record<string, boolean>>(() => mergePerKeyState(persistedState?.rapidTriggerByKey, false))
  const [splitSensitivityByKey, setSplitSensitivityByKey] = useState<Record<string, boolean>>(() => mergePerKeyState(persistedState?.splitSensitivityByKey, false))
  const [rapidSensitivityByKey, setRapidSensitivityByKey] = useState<Record<string, number>>(() => mergePerKeyState(persistedState?.rapidSensitivityByKey, 0.65))
  const [pressSensitivityByKey, setPressSensitivityByKey] = useState<Record<string, number>>(() => mergePerKeyState(persistedState?.pressSensitivityByKey, 0.5))
  const [releaseSensitivityByKey, setReleaseSensitivityByKey] = useState<Record<string, number>>(() => mergePerKeyState(persistedState?.releaseSensitivityByKey, 0.55))
  const [deadzoneEnabledByKey, setDeadzoneEnabledByKey] = useState<Record<string, boolean>>(() => mergePerKeyState(persistedState?.deadzoneEnabledByKey, true))
  const [topDeadzoneByKey, setTopDeadzoneByKey] = useState<Record<string, number>>(() => mergePerKeyState(persistedState?.topDeadzoneByKey, 0))
  const [bottomDeadzoneByKey, setBottomDeadzoneByKey] = useState<Record<string, number>>(() => mergePerKeyState(persistedState?.bottomDeadzoneByKey, 0))
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => normalizeHero68Selection(persistedState?.selectedKeys ?? []))
  const [actuationPreviewWidth, setActuationPreviewWidth] = useState<number>()
  const [hallStreamPinnedKeyId, setHallStreamPinnedKeyId] = useState<string | null>(null)
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set(persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1]?.dirtyKeys ?? []))
  const [profileOpen, setProfileOpen] = useState(false)
  const [selectedSwitchId, setSelectedSwitchId] = useState<SwitchTone>(() => isSwitchProfileId(persistedState?.selectedSwitchId) ? persistedState.selectedSwitchId : 'white')
  const [assignedSwitchesByKey, setAssignedSwitchesByKey] = useState<Record<string, SwitchTone>>(() =>
    mergePerKeyState(persistedState?.assignedSwitchesByKey as Record<string, SwitchTone> | undefined, 'white' as SwitchTone),
  )
  const [compactSidebar, setCompactSidebar] = useState(() => persistedState?.compactSidebar ?? false)
  const [showAdvancedPages, setShowAdvancedPages] = useState(() => persistedState?.showAdvancedPages ?? true)
  const [rememberSelection, setRememberSelection] = useState(() => persistedState?.rememberSelection ?? true)
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() => persistedState?.languagePreference ?? browserSuggestedLanguage())
  const [languageManuallySet, setLanguageManuallySet] = useState(() => persistedState?.languageManuallySet ?? false)
  const [languageRegionDetected, setLanguageRegionDetected] = useState(() => persistedState?.languageRegionDetected ?? false)
  const resolvedLanguage = languagePreference
  const tr = useMemo(() => createTranslator(resolvedLanguage), [resolvedLanguage])
  const [switchSearch, setSwitchSearch] = useState(() => persistedState?.switchSearch ?? '')
  const [switchBrandFilter, setSwitchBrandFilter] = useState(() => persistedState?.switchBrandFilter ?? 'all')
  const [saveState, setSaveState] = useState<'idle' | 'staged' | 'sent'>('idle')
  const [profileSlot, setProfileSlot] = useState<ProfileSlot>(() => persistedState?.profileSlot ?? 1)
  const initialRgbDraft = persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1]
  const [rgb, setRgb] = useState<RgbProfile>(() => restoreStoredRgb(initialRgbDraft?.rgb, initialRgbDraft?.rgbFormat))
  const [rgbBaseline, setRgbBaseline] = useState<RgbProfile>(() => restoreStoredRgb(initialRgbDraft?.rgbBaseline, initialRgbDraft?.rgbFormat))
  const [rgbHydratedSlot, setRgbHydratedSlot] = useState<ProfileSlot | null>(null)
  const rgbDirty = rgbChanges(rgb, rgbBaseline)
  const rgbPending = rgbDirtyCount(rgbDirty)
  const [loadedProfileSlot, setLoadedProfileSlot] = useState<ProfileSlot | null>(null)
  const [remapLayers, setRemapLayers] = useState<RemapLayers>(() => persistedState?.remapLayers ?? defaultRemapLayers())
  const [dirtyRemaps, setDirtyRemaps] = useState<Set<string>>(() => new Set(persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1]?.dirtyRemaps ?? []))
  const [profileNames, setProfileNames] = useState<Record<ProfileSlot, string>>(() => ({ 0: 'Onboard Profile 0', 1: 'Onboard Profile 1', 2: 'Onboard Profile 2', ...persistedState?.profileNames }))
  const [profileDrafts, setProfileDrafts] = useState<Partial<Record<ProfileSlot, ProfileDraft>>>(() => persistedState?.profileDrafts ?? {})
  const [profileBusy, setProfileBusy] = useState(false)
  const [advancedBindings, setAdvancedBindings] = useState<AdvancedBinding[]>(() => initialRgbDraft?.advancedBindings ?? [])
  const [advancedBaseline, setAdvancedBaseline] = useState<AdvancedBinding[]>(() => initialRgbDraft?.advancedBaseline ?? [])
  const [advancedHydratedSlot, setAdvancedHydratedSlot] = useState<ProfileSlot | null>(null)
  const [advancedReadError, setAdvancedReadError] = useState<string | null>(null)
  const advancedPending = !advancedEqual(advancedBindings, advancedBaseline)
  const profileBusyRef = useRef(false)
  const autoConnectStartedRef = useRef(false)
  const profileSwitchAllowedAtRef = useRef(0)
  const remapBaselineRef = useRef<RemapLayers>(persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1]?.remapBaseline ?? defaultRemapLayers())
  const {
    devicePollingRate,
    deviceOsModeMac,
    setDeviceOsModeMac,
    deviceWinLock,
    setDeviceWinLock,
    deviceHallDebounce,
    setDeviceHallDebounce,
    deviceAutoCalibration,
    setDeviceAutoCalibration,
    deviceSettingsState,
    setDeviceSettingsState,
    deviceReadState,
    setDeviceReadState,
    deviceActionError,
    setDeviceActionError,
    readDeviceGeneralSettings,
    handlePollingRateChange,
    applyBooleanDeviceSetting,
    handleTachyonChange,
    tachyonBusy,
  } = useDeviceSettings({
    persistedState,
    hallStream,
    rgbStreamActive,
    setRgbStreamActive,
    tachyon,
    setTachyon,
    tachyonPreviousPollingRate,
    setTachyonPreviousPollingRate,
  })
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const brandFilterRef = useRef<HTMLDivElement>(null)

  const sidebarItems = useMemo(() => {
    const items = [
      { id: 'actuation', label: tr('Actuation Point'), icon: <ArrowDownToLine size={18} />, advanced: false },
      { id: 'rapid', label: tr('Rapid Trigger'), icon: <RapidTriggerMenuIcon />, advanced: false },
      { id: 'stream', label: tr('Hall Stream'), icon: <Activity size={18} />, advanced: true },
      { id: 'rgb', label: tr('RGB Settings'), icon: <Lightbulb size={18} />, advanced: false },
      { id: 'remap', label: tr('Key Remap'), icon: <KeyRemapMenuIcon />, advanced: false },
      { id: 'advanced', label: tr('Advanced Keys'), icon: <AdvancedKeysMenuIcon />, advanced: false },
      { id: 'macros', label: tr('Macros'), icon: <ListOrdered size={18} />, advanced: false },
      { id: 'gamepad', label: tr('Gamepad'), icon: <Gamepad2 size={18} />, advanced: true },
    ]
    return items.filter((item) => showAdvancedPages || !item.advanced)
  }, [showAdvancedPages, tr])

  const keyboardSettingsItems = useMemo(() => [
    { id: 'general', label: tr('General Settings'), icon: <KeyboardMenuIcon /> },
    { id: 'switches', label: tr('Switch Selector'), icon: <SwitchStemMenuIcon /> },
  ], [tr])

  const uiSettingsItems = useMemo(() => [
    { id: 'interface', label: tr('Interface'), icon: <Palette size={18} /> },
    { id: 'background-service', label: tr('Background Service'), icon: <Activity size={18} /> },
  ], [tr])

  const selectedSwitch: SwitchOption = SWITCH_OPTIONS.find((option) => option.id === selectedSwitchId) ?? { id: selectedSwitchId, name: switchProfileLabel(selectedSwitchId), fullName: switchProfileLabel(selectedSwitchId), brand: 'Stored keyboard profile', accent: '#9ba3a8', note: '' }
  const switchTopImageById = useMemo(() => Object.fromEntries(SWITCH_OPTIONS.map((option) => [option.id, option.top ?? ''])) as Record<SwitchTone, string>, [])
  const switchPreviewByKey = useMemo(() => Object.fromEntries(HERO68_KEY_IDS.map((keyId) => [keyId, switchTopImageById[assignedSwitchesByKey[keyId] ?? 'white']])) as Record<string, string>, [assignedSwitchesByKey, switchTopImageById])
  const rapidPreviewByKey = useMemo(() => Object.fromEntries(HERO68_KEY_IDS.map((keyId) => {
    const split = splitSensitivityByKey[keyId] ?? false
    return [keyId, {
      primary: (split ? pressSensitivityByKey[keyId] : rapidSensitivityByKey[keyId]).toFixed(2),
      secondary: split ? (releaseSensitivityByKey[keyId]).toFixed(2) : undefined,
      active: rapidTriggerByKey[keyId] ?? false,
    }]
  })) as Record<string, { primary: string; secondary?: string; active: boolean }>, [splitSensitivityByKey, pressSensitivityByKey, releaseSensitivityByKey, rapidSensitivityByKey, rapidTriggerByKey])
  const deadzonePreviewByKey = useMemo(() => Object.fromEntries(HERO68_KEY_IDS.map((keyId) => [keyId, {
    top: (topDeadzoneByKey[keyId] ?? 0).toFixed(2),
    bottom: (bottomDeadzoneByKey[keyId] ?? 0).toFixed(2),
    active: deadzoneEnabledByKey[keyId] ?? true,
  }])) as Record<string, { top: string; bottom: string; active: boolean }>, [topDeadzoneByKey, bottomDeadzoneByKey, deadzoneEnabledByKey])
  const hallStreamPreviewByKey = useMemo(() => Object.fromEntries(
    Object.entries(hallStream.samples).map(([keyId, sample]) => [keyId, {
      distanceMm: sample.visualDistanceMm,
      rawAdc: sample.rawAdc,
      pressed: sample.pressed,
      releaseInferred: sample.releaseInferred,
    }]),
  ) as Record<string, { distanceMm: number; rawAdc: number; pressed: boolean; releaseInferred: boolean }>, [hallStream.samples])
  const hallStreamActiveSamples = useMemo(() => Object.values(hallStream.samples)
    .filter((sample) => sample.pressed || sample.visualDistanceMm >= 0.05)
    .sort((a, b) => b.timestampMs - a.timestampMs), [hallStream.samples])
  const hallStreamListKeyIds = hallStreamActiveSamples.map((sample) => sample.keyId)
  const hallStreamPreviewSelection = useMemo(
    () => new Set(hallStreamPinnedKeyId ? [hallStreamPinnedKeyId] : []),
    [hallStreamPinnedKeyId],
  )
  const hallStreamFocusKeyId = hallStreamPinnedKeyId ?? hallStreamActiveSamples[0]?.keyId ?? null
  const hallStreamFocusSample = hallStreamFocusKeyId ? hallStream.samples[hallStreamFocusKeyId] : undefined
  const hallStreamFocusPercent = hallStreamFocusSample
    ? Math.max(0, Math.min(100, (hallStreamFocusSample.visualDistanceMm / HERO68_HALL_VISUAL_MAX_MM) * 100))
    : 0
  const actuationHallActiveSamples = useMemo(() => hallStreamActiveSamples.filter((sample) => selectedKeys.has(sample.keyId)), [hallStreamActiveSamples, selectedKeys])
  const actuationHallFocusKeyId = actuationHallActiveSamples[0]?.keyId ?? (selectedKeys.size === 1 ? Array.from(selectedKeys)[0] : null)
  const actuationHallFocusSample = actuationHallFocusKeyId ? hallStream.samples[actuationHallFocusKeyId] : undefined
  const actuationHallTravelMm = actuationHallFocusSample?.visualDistanceMm ?? 0
  const actuationHallTravelPercent = Math.max(0, Math.min(100, (actuationHallTravelMm / HERO68_HALL_VISUAL_MAX_MM) * 100))
  const actuationHallThresholdMm = actuationHallFocusKeyId ? (actuationByKey[actuationHallFocusKeyId] ?? actuation) : actuation
  const actuationHallThresholdPercent = Math.max(0, Math.min(100, (actuationHallThresholdMm / HERO68_HALL_VISUAL_MAX_MM) * 100))
  const actuationHallTriggered = Boolean(actuationHallFocusSample && actuationHallTravelMm >= actuationHallThresholdMm)
  const hasSelection = selectedKeys.size > 0
  const allSelected = isWholeKeyboardSelected(selectedKeys)
  const actuationMixed = selectionHasMixedValues(selectedKeys, actuationByKey)
  const rapidTriggerMixed = selectionHasMixedValues(selectedKeys, rapidTriggerByKey)
  const splitSensitivityMixed = selectionHasMixedValues(selectedKeys, splitSensitivityByKey)
  const rapidSensitivityMixed = selectionHasMixedValues(selectedKeys, rapidSensitivityByKey)
  const pressSensitivityMixed = selectionHasMixedValues(selectedKeys, pressSensitivityByKey)
  const releaseSensitivityMixed = selectionHasMixedValues(selectedKeys, releaseSensitivityByKey)
  const deadzoneEnabledMixed = selectionHasMixedValues(selectedKeys, deadzoneEnabledByKey)
  const topDeadzoneMixed = selectionHasMixedValues(selectedKeys, topDeadzoneByKey)
  const bottomDeadzoneMixed = selectionHasMixedValues(selectedKeys, bottomDeadzoneByKey)
  const switchProfileMixed = selectionHasMixedValues(selectedKeys, assignedSwitchesByKey)
  // A mixed feature toggle is intentionally treated as unresolved, not as
  // partially enabled. Wootility requires the user to explicitly switch the
  // selected keys to ON before any dependent values can be edited.
  const rapidTriggerControlsEnabled = hasSelection && rapidTrigger && !rapidTriggerMixed
  const splitSensitivityControlsEnabled = rapidTriggerControlsEnabled && !splitSensitivityMixed
  const deadzoneControlsEnabled = hasSelection && deadzoneEnabled && !deadzoneEnabledMixed
  const filteredSwitchOptions = SWITCH_OPTIONS.filter((option) => {
    const matchesSearch = !switchSearch || option.fullName.toLowerCase().includes(switchSearch.toLowerCase()) || option.name.toLowerCase().includes(switchSearch.toLowerCase())
    const matchesBrand = switchBrandFilter === 'all' || option.brand === switchBrandFilter
    return matchesSearch && matchesBrand
  })
  const switchBrands = useMemo(() => Array.from(new Set(SWITCH_OPTIONS.map((option) => option.brand))), [])
  const brandFilterLabel = switchBrandFilter === 'all' ? 'Filter by brand' : switchBrandFilter

  useEffect(() => {
    document.documentElement.lang = resolvedLanguage
  }, [resolvedLanguage])

  useEffect(() => {
    if (languageManuallySet || languageRegionDetected) return
    let cancelled = false
    void detectRegion().then(result => {
      if (cancelled) return
      setLanguagePreference(result.suggestedLanguage)
      setLanguageRegionDetected(true)
    })
    return () => { cancelled = true }
  }, [languageManuallySet, languageRegionDetected])

  function selectLanguage(language: LanguagePreference) {
    setLanguagePreference(language)
    setLanguageManuallySet(true)
    setLanguageRegionDetected(true)
  }

  useEffect(() => {
    if (!brandMenuOpen) return

    const closeBrandMenu = (event: MouseEvent | TouchEvent) => {
      if (!brandFilterRef.current?.contains(event.target as Node)) setBrandMenuOpen(false)
    }

    document.addEventListener('mousedown', closeBrandMenu)
    document.addEventListener('touchstart', closeBrandMenu)
    return () => {
      document.removeEventListener('mousedown', closeBrandMenu)
      document.removeEventListener('touchstart', closeBrandMenu)
    }
  }, [brandMenuOpen])

  useEffect(() => {
    // Chrome/Chromium remembers WebHID permission for this origin. On reload,
    // getDevices() can recover that already-authorized keyboard without a
    // chooser or user gesture, so F5 should restore the previous connection.
    if (autoConnectStartedRef.current) return
    autoConnectStartedRef.current = true
    void (async () => {
      try {
        const restored = await hero68DeviceManager.connect(false)
        if (restored) await hydrateConnectedDevice()
      } catch (error) {
        setDeviceActionError(error instanceof Error ? error.message : String(error))
      }
    })()
  }, [])

  useEffect(() => {
    if (!selectedKeys.size) return
    const firstSelectedKey = Array.from(selectedKeys)[0]
    setActuation(actuationByKey[firstSelectedKey] ?? 1.6)
    setRapidTrigger(rapidTriggerByKey[firstSelectedKey] ?? false)
    setSplitSensitivity(splitSensitivityByKey[firstSelectedKey] ?? false)
    setRapidSensitivity(rapidSensitivityByKey[firstSelectedKey] ?? 0.65)
    setPressSensitivity(pressSensitivityByKey[firstSelectedKey] ?? 0.5)
    setReleaseSensitivity(releaseSensitivityByKey[firstSelectedKey] ?? 0.55)
    setDeadzoneEnabled(deadzoneEnabledByKey[firstSelectedKey] ?? true)
    setTopDeadzone(topDeadzoneByKey[firstSelectedKey] ?? 0)
    setBottomDeadzone(bottomDeadzoneByKey[firstSelectedKey] ?? 0)
    const assignedSwitch = assignedSwitchesByKey[firstSelectedKey]
    if (assignedSwitch) setSelectedSwitchId(assignedSwitch)
  }, [selectedKeys, actuationByKey, rapidTriggerByKey, splitSensitivityByKey, rapidSensitivityByKey, pressSensitivityByKey, releaseSensitivityByKey, deadzoneEnabledByKey, topDeadzoneByKey, bottomDeadzoneByKey, assignedSwitchesByKey])

  useEffect(() => {
    const snapshot: PersistedOpenHeroState = {
      activeRail,
      activePage,
      activeSettingsPage,
      selectedKeys: rememberSelection ? Array.from(selectedKeys) : [],
      selectedSwitchId,
      assignedSwitchesByKey,
      actuationByKey,
      rapidTriggerByKey,
      splitSensitivityByKey,
      rapidSensitivityByKey,
      pressSensitivityByKey,
      releaseSensitivityByKey,
      deadzoneEnabledByKey,
      topDeadzoneByKey,
      bottomDeadzoneByKey,
      tachyon,
      tachyonPreviousPollingRate: tachyonPreviousPollingRate ?? undefined,
      compactSidebar,
      showAdvancedPages,
      rememberSelection,
      languagePreference,
      languageManuallySet,
      languageRegionDetected,
      pollingRate: devicePollingRate ?? undefined,
      osModeMac: deviceOsModeMac,
      winLock: deviceWinLock,
      hallDebounce: deviceHallDebounce,
      autoCalibration: deviceAutoCalibration,
      switchSearch,
      switchBrandFilter,
      profileSlot,
      profileNames,
      remapLayers,
      profileDrafts: { ...profileDrafts, [profileSlot]: currentProfileDraft() },
    }
    saveOpenHeroState(snapshot)
  }, [activeRail, activePage, activeSettingsPage, selectedKeys, selectedSwitchId, assignedSwitchesByKey, actuationByKey, rapidTriggerByKey, splitSensitivityByKey, rapidSensitivityByKey, pressSensitivityByKey, releaseSensitivityByKey, deadzoneEnabledByKey, topDeadzoneByKey, bottomDeadzoneByKey, tachyon, tachyonPreviousPollingRate, compactSidebar, showAdvancedPages, rememberSelection, languagePreference, languageManuallySet, languageRegionDetected, devicePollingRate, deviceOsModeMac, deviceWinLock, deviceHallDebounce, deviceAutoCalibration, switchSearch, switchBrandFilter, profileSlot, profileNames, remapLayers, profileDrafts, dirtyKeys, dirtyRemaps, rgb, rgbBaseline, advancedBindings, advancedBaseline])

  function currentProfileDraft(): ProfileDraft {
    return { assignedSwitchesByKey, actuationByKey, rapidTriggerByKey, splitSensitivityByKey,
      rapidSensitivityByKey, pressSensitivityByKey, releaseSensitivityByKey, deadzoneEnabledByKey,
      topDeadzoneByKey, bottomDeadzoneByKey, remapLayers, rgb, rgbBaseline, rgbDirty, rgbFormat: 1, advancedBindings, advancedBaseline,
      dirtyKeys: Array.from(dirtyKeys), dirtyRemaps: Array.from(dirtyRemaps), remapBaseline: remapBaselineRef.current }
  }

  function restoreProfileDraft(draft?: ProfileDraft) {
    setAdvancedBindings(draft?.advancedBindings ?? [])
    setAdvancedBaseline(draft?.advancedBaseline ?? [])
    setAdvancedHydratedSlot(null)
    setAdvancedReadError(null)
    setRgb(restoreStoredRgb(draft?.rgb, draft?.rgbFormat))
    setRgbBaseline(restoreStoredRgb(draft?.rgbBaseline, draft?.rgbFormat))
    setRgbHydratedSlot(null)
    remapBaselineRef.current = draft?.remapBaseline ?? defaultRemapLayers()
    setAssignedSwitchesByKey(mergePerKeyState(draft?.assignedSwitchesByKey as Record<string, SwitchTone> | undefined, 'white' as SwitchTone))
    setActuationByKey(mergePerKeyState(draft?.actuationByKey, 1.6))
    setRapidTriggerByKey(mergePerKeyState(draft?.rapidTriggerByKey, false))
    setSplitSensitivityByKey(mergePerKeyState(draft?.splitSensitivityByKey, false))
    setRapidSensitivityByKey(mergePerKeyState(draft?.rapidSensitivityByKey, 0.65))
    setPressSensitivityByKey(mergePerKeyState(draft?.pressSensitivityByKey, 0.5))
    setReleaseSensitivityByKey(mergePerKeyState(draft?.releaseSensitivityByKey, 0.55))
    setDeadzoneEnabledByKey(mergePerKeyState(draft?.deadzoneEnabledByKey, true))
    setTopDeadzoneByKey(mergePerKeyState(draft?.topDeadzoneByKey, 0))
    setBottomDeadzoneByKey(mergePerKeyState(draft?.bottomDeadzoneByKey, 0))
    setRemapLayers(draft?.remapLayers ?? defaultRemapLayers())
    setDirtyKeys(new Set(draft?.dirtyKeys ?? []))
    setDirtyRemaps(new Set(draft?.dirtyRemaps ?? []))
  }

  async function selectOnboardProfile(slot: ProfileSlot) {
    if (profileBusyRef.current || slot === profileSlot) return
    const now = performance.now()
    if (now < profileSwitchAllowedAtRef.current) return
    profileSwitchAllowedAtRef.current = now + 200
    if(hero68DeviceManager.viaService)await gamepadService.profile(slot).catch(e=>setDeviceActionError(String(e)))
    setProfileDrafts(previous => ({ ...previous, [profileSlot]: currentProfileDraft() }))
    const draft = profileDrafts[slot]
    restoreProfileDraft(draft)
    setProfileSlot(slot)
    setLoadedProfileSlot(null)
    setDeviceReadState('idle')
    setProfileOpen(false)
    setDeviceActionError(null)
    if (hero68DeviceManager.connected) await handleReadFromDevice(slot, draft)
  }

  function assignRemap(layer: RemapLayer, keyId: string, value: number) {
    if (profileBusyRef.current || remapLayers[layer][keyId] === value) return
    setRemapLayers(previous => ({ ...previous, [layer]: { ...previous[layer], [keyId]: value } }))
    setDirtyRemaps(previous => {
      const next = new Set(previous)
      if (remapBaselineRef.current[layer][keyId] === value) next.delete(`${layer}:${keyId}`)
      else next.add(`${layer}:${keyId}`)
      return next
    })
    setSaveState('idle')
  }

  function copyRemapLayer(source: RemapLayer, target: RemapLayer) {
    if (profileBusyRef.current) return
    const keys = HERO68_KEY_IDS.filter(keyId => remapLayers[source][keyId] !== remapLayers[target][keyId])
    setRemapLayers(previous => ({ ...previous, [target]: { ...previous[source] } }))
    setDirtyRemaps(previous => {
      const next = new Set(previous)
      for (const keyId of keys) {
        if (remapBaselineRef.current[target][keyId] === remapLayers[source][keyId]) next.delete(`${target}:${keyId}`)
        else next.add(`${target}:${keyId}`)
      }
      return next
    })
    setSaveState('idle')
  }

  async function renameProfile(name: string) {
    if (profileBusyRef.current || !hero68DeviceManager.connected || loadedProfileSlot !== profileSlot) return false
    profileBusyRef.current = true
    setProfileBusy(true)
    setDeviceActionError(null)
    try {
      await saveOnboardProfileName(hero68DeviceManager, profileSlot, name)
      setProfileNames(previous => ({ ...previous, [profileSlot]: name }))
      return true
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      profileBusyRef.current = false
      setProfileBusy(false)
    }
  }

  function exportProfile() {
    const data = { schema: 'openhero68-profile', version: 1, name: profileNames[profileSlot], profileSlot, settings: currentProfileDraft() }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `hero68-profile-${profileSlot}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  useEffect(() => {
    if (!showAdvancedPages && ['stream', 'gamepad'].includes(activePage)) setActivePage('quick')
    if ((hallStream.active || hallStream.starting) && (activeRail !== 'keyboard' || !['stream', 'actuation'].includes(activePage))) void hero68HallStream.stop()
    // Actuation Live Hall is selection-scoped. If Discard selection is used, or
    // the last selected key is manually deselected, there is nothing left to
    // monitor, so stop the stream instead of leaving the card stuck on LIVE.
    if ((hallStream.active || hallStream.starting) && activeRail === 'keyboard' && activePage === 'actuation' && selectedKeys.size === 0) void hero68HallStream.stop()
  }, [showAdvancedPages, activeRail, activePage, hallStream.active, hallStream.starting, selectedKeys.size])

  function toggleKey(keyId: string) {
    if (!HERO68_KEY_ID_SET.has(keyId)) return
    setSelectedKeys((previous) => {
      const next = normalizeHero68Selection(previous)
      if (next.has(keyId)) next.delete(keyId)
      else next.add(keyId)
      return next
    })
  }

  function toggleHallStreamPin(keyId: string) {
    setHallStreamPinnedKeyId((previous) => previous === keyId ? null : keyId)
  }

  function selectAll() {
    setSelectedKeys((previous) => {
      // Rebuild from the canonical layout instead of trusting Set.size. This
      // makes Select All converge to the exact same 68-key state every time.
      if (isWholeKeyboardSelected(previous) && previous.size === HERO68_KEY_IDS.length) return previous
      return new Set(HERO68_KEY_IDS)
    })
  }

  function discardSelection() {
    // Stop immediately on Actuation rather than waiting for the next render.
    // The effect above is a second guard for clearing the last key manually.
    if (activeRail === 'keyboard' && activePage === 'actuation' && (hallStream.active || hallStream.starting)) void hero68HallStream.stop()
    setSelectedKeys((previous) => previous.size === 0 ? previous : new Set())
  }

  function markSelectedKeysDirty() {
    if (!selectedKeys.size) return
    setDirtyKeys((previous) => {
      const next = new Set(previous)
      selectedKeys.forEach((keyId) => next.add(keyId))
      return next
    })
  }

  function assignSwitchProfile(switchId: SwitchTone) {
    setSelectedSwitchId(switchId)
    if (selectedKeys.size === 0) return
    markSelectedKeysDirty()
    setAssignedSwitchesByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => {
        next[keyId] = switchId
      })
      return next
    })
  }

  function setActuationForSelection(value: number) {
    const nextValue = snapToStep(value, 0.1, 3.4, 0.05)
    setActuation(nextValue)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setActuationByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = nextValue })
      return next
    })
  }

  function setRapidTriggerForSelection(value: boolean) {
    setRapidTrigger(value)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setRapidTriggerByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = value })
      return next
    })
  }

  function setSplitSensitivityForSelection(value: boolean) {
    setSplitSensitivity(value)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setSplitSensitivityByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = value })
      return next
    })
  }

  function setRapidSensitivityForSelection(value: number) {
    const nextValue = snapToAllowedValue(value, RAPID_TRIGGER_VALUES)
    setRapidSensitivity(nextValue)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setRapidSensitivityByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = nextValue })
      return next
    })
  }

  function setPressSensitivityForSelection(value: number) {
    const nextValue = snapToAllowedValue(value, RAPID_TRIGGER_VALUES)
    setPressSensitivity(nextValue)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setPressSensitivityByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = nextValue })
      return next
    })
  }

  function setReleaseSensitivityForSelection(value: number) {
    const nextValue = snapToAllowedValue(value, RAPID_TRIGGER_VALUES)
    setReleaseSensitivity(nextValue)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setReleaseSensitivityByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = nextValue })
      return next
    })
  }

  function setDeadzoneEnabledForSelection(value: boolean) {
    setDeadzoneEnabled(value)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setDeadzoneEnabledByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = value })
      return next
    })
  }

  function setTopDeadzoneForSelection(value: number) {
    const nextValue = snapToStep(value, 0, 0.5, 0.01)
    setTopDeadzone(nextValue)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setTopDeadzoneByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = nextValue })
      return next
    })
  }

  function setBottomDeadzoneForSelection(value: number) {
    const nextValue = snapToStep(value, 0, 0.5, 0.01)
    setBottomDeadzone(nextValue)
    if (!selectedKeys.size) return
    markSelectedKeysDirty()
    setBottomDeadzoneByKey((previous) => {
      const next = { ...previous }
      selectedKeys.forEach((keyId) => { next[keyId] = nextValue })
      return next
    })
  }

  async function readCurrentProfileSlot(): Promise<ProfileSlot> {
    const report = await hero68DeviceManager.request(readActiveProfile(), 0x90, 0, 1000)
    const slot = report.data[0]
    if (slot !== 0 && slot !== 1 && slot !== 2) throw new Error(`Unsupported active profile returned by HERO68: ${slot}`)
    return slot
  }

  function blurActiveControl() {
    if (typeof document === 'undefined') return
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  }

  async function toggleHallStream(preferredKeyIds: Iterable<string>) {
    blurActiveControl()
    setDeviceActionError(null)
    try {
      if (hallStream.active || hallStream.starting) {
        await hero68HallStream.stop()
        // Stopping Hall Stream is a full UI reset: clear the pinned highlight
        // as well as the zeroed telemetry so the keyboard preview returns to its
        // normal RGB/key-label state immediately.
        setHallStreamPinnedKeyId(null)
      } else {
        // Explicit UI telemetry is allowed while Tachyon keeps all RGB idle.
        await hero68HallStream.start(preferredKeyIds, 'direct-poll')
      }
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleHallStreamToggle() {
    await toggleHallStream(hallStreamPinnedKeyId ? [hallStreamPinnedKeyId] : [])
  }

  async function handleActuationHallStreamToggle() {
    await toggleHallStream(selectedKeys)
  }

  async function hydrateConnectedDevice() {
    setDeviceActionError(null)
    setDeviceReadState('idle')
    setLoadedProfileSlot(null)
    const activeSlot = await readCurrentProfileSlot().catch(() => profileSlot)
    setProfileDrafts(previous => ({ ...previous, [profileSlot]: currentProfileDraft() }))
    const savedDraft = activeSlot === profileSlot ? currentProfileDraft() : profileDrafts[activeSlot]
    // Preserve explicit remap edits made offline. Performance/switch values
    // still come from the newly connected keyboard before they can be saved.
    const draft = savedDraft ? { ...savedDraft, dirtyKeys: [] } : undefined
    restoreProfileDraft(draft)
    setProfileSlot(activeSlot)
    await handleReadFromDevice(activeSlot, draft)
    await readDeviceGeneralSettings()
  }

  async function handleDeviceConnection() {
    setDeviceActionError(null)
    setDeviceReadState('idle')
    try {
      if (deviceConnectionState === 'connected') {
        if (hallStream.active || hallStream.starting) await hero68HallStream.stop()
        if (rgbStreamActive) {
          if (!hero68DeviceManager.viaService) {
            await hero68DeviceManager.send(liveIdle()).catch(() => {})
          }
          setRgbStreamActive(false)
        }
        await hero68DeviceManager.disconnect()
        setLoadedProfileSlot(null)
        setDeviceSettingsState('idle')
      }
      else {
        await hero68DeviceManager.connect(true)
        await hydrateConnectedDevice()
      }
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleReadFromDevice(slot: ProfileSlot = profileSlot, draft?: ProfileDraft) {
    if (!hero68DeviceManager.connected || profileBusyRef.current) return
    profileBusyRef.current = true
    setProfileBusy(true)
    try {
      await readAndApplyProfile(slot, draft ?? (slot === profileSlot ? currentProfileDraft() : profileDrafts[slot]))
    } finally {
      profileBusyRef.current = false
      setProfileBusy(false)
    }
  }

  async function readAndApplyProfile(slot: ProfileSlot, draft?: ProfileDraft) {
    setDeviceActionError(null)
    setDeviceReadState('reading')
    setLoadedProfileSlot(null)
    try {
      const hydrated = await hydrateFromDevice(hero68DeviceManager, slot)
      const mappings = await readRemapLayers(hero68DeviceManager)
      const freshRgb = await readRgbProfile(hero68DeviceManager)
      setAdvancedHydratedSlot(null)
      try {
        const freshAdvanced = await readAdvancedBindings(hero68DeviceManager)
        setAdvancedBindings(mergeAdvanced(freshAdvanced, draft?.advancedBindings, draft?.advancedBaseline))
        setAdvancedBaseline(freshAdvanced)
        setAdvancedHydratedSlot(slot)
        setAdvancedReadError(null)
      } catch (error) {
        setAdvancedReadError(error instanceof Error ? error.message : String(error))
      }
      setRgbBaseline(freshRgb)
      setRgb(mergeRgb(freshRgb, draft?.rgb, draft?.rgbDirty))
      setRgbHydratedSlot(slot)
      remapBaselineRef.current = structuredClone(mappings)
      const names: Partial<Record<ProfileSlot, string>> = {}
      for (const nameSlot of REMAP_LAYERS) {
        // Some firmware revisions do not return a valid profile-name record.
        // Keep the local/default name if this optional metadata is unavailable.
        try { names[nameSlot] = await readOnboardProfileName(hero68DeviceManager, nameSlot) ?? `Onboard Profile ${nameSlot}` } catch { /* performance/remap reads remain authoritative */ }
      }
      setProfileNames(previous => ({ ...previous, ...names }))
      function preserveEdits<T>(fresh: Record<string, T>, saved?: Record<string, T>) {
        for (const keyId of draft?.dirtyKeys ?? []) if (saved?.[keyId] !== undefined) fresh[keyId] = saved[keyId]
        return fresh
      }
      setActuationByKey(previous => preserveEdits(mergeHydratedNumbers(previous, hydrated, 'actuationMm'), draft?.actuationByKey))
      setRapidTriggerByKey(previous => preserveEdits(mergeHydratedBooleans(previous, hydrated, 'rapidTriggerEnabled'), draft?.rapidTriggerByKey))
      setSplitSensitivityByKey(previous => preserveEdits(mergeHydratedBooleans(previous, hydrated, 'splitSensitivity'), draft?.splitSensitivityByKey))
      setRapidSensitivityByKey(previous => preserveEdits(mergeHydratedNumbers(previous, hydrated, 'rapidSensitivityMm'), draft?.rapidSensitivityByKey))
      setPressSensitivityByKey(previous => preserveEdits(mergeHydratedNumbers(previous, hydrated, 'pressSensitivityMm'), draft?.pressSensitivityByKey))
      setReleaseSensitivityByKey(previous => preserveEdits(mergeHydratedNumbers(previous, hydrated, 'releaseSensitivityMm'), draft?.releaseSensitivityByKey))
      setDeadzoneEnabledByKey(previous => preserveEdits(mergeHydratedBooleans(previous, hydrated, 'deadzoneEnabled'), draft?.deadzoneEnabledByKey))
      setTopDeadzoneByKey(previous => preserveEdits(mergeHydratedNumbers(previous, hydrated, 'topDeadzoneMm'), draft?.topDeadzoneByKey))
      setBottomDeadzoneByKey(previous => preserveEdits(mergeHydratedNumbers(previous, hydrated, 'bottomDeadzoneMm'), draft?.bottomDeadzoneByKey))
      setAssignedSwitchesByKey((previous) => {
        const next = { ...previous }
        for (const [keyId, settings] of hydrated) {
          if (isSwitchProfileId(settings.switchProfile)) {
            next[keyId] = settings.switchProfile as SwitchTone
          }
        }
        return preserveEdits(next, draft?.assignedSwitchesByKey as Record<string, SwitchTone> | undefined)
      })
      for (const layer of REMAP_LAYERS) {
        for (const keyId of HERO68_KEY_IDS) {
          if (draft?.dirtyRemaps?.includes(`${layer}:${keyId}`) && draft.remapLayers?.[layer][keyId] !== undefined) mappings[layer][keyId] = draft.remapLayers[layer][keyId]
        }
      }
      setRemapLayers(mappings)
      setDirtyKeys(new Set(draft?.dirtyKeys ?? []))
      setDirtyRemaps(new Set((draft?.dirtyRemaps ?? []).filter(change => {
        const [layer, keyId] = change.split(':')
        return mappings[Number(layer) as RemapLayer]?.[keyId] !== remapBaselineRef.current[Number(layer) as RemapLayer]?.[keyId]
      })))
      setLoadedProfileSlot(slot)
      setSaveState('idle')
      setDeviceReadState('success')
      window.setTimeout(() => setDeviceReadState((current) => current === 'success' ? 'idle' : current), 1800)
      return true
    } catch (error) {
      setLoadedProfileSlot(null)
      setDeviceReadState('error')
      setDeviceActionError(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  async function handleSaveAll() {
    if (profileBusyRef.current) return
    if (!hero68DeviceManager.connected) {
      setDeviceActionError('Connect HERO68 before saving.')
      return
    }
    if (loadedProfileSlot !== profileSlot) {
      setDeviceActionError(`Profile ${profileSlot} has not been read from the keyboard yet. Read it before saving to avoid overwriting unknown per-key values.`)
      return
    }
    if (dirtyKeys.size === 0 && dirtyRemaps.size === 0 && rgbPending === 0 && !advancedPending) return
    if (advancedPending && advancedHydratedSlot !== profileSlot) {
      setDeviceActionError('Read Advanced Keys from this profile before saving. ' + (advancedReadError ?? ''))
      return
    }
    if (rgbHydratedSlot !== profileSlot) {
      setDeviceActionError('Read RGB from this profile before saving.')
      return
    }

    const webSnapshot: PersistedOpenHeroState = {
      activeRail,
      activePage,
      activeSettingsPage,
      selectedKeys: rememberSelection ? Array.from(selectedKeys) : [],
      selectedSwitchId,
      assignedSwitchesByKey,
      actuationByKey,
      rapidTriggerByKey,
      splitSensitivityByKey,
      rapidSensitivityByKey,
      pressSensitivityByKey,
      releaseSensitivityByKey,
      deadzoneEnabledByKey,
      topDeadzoneByKey,
      bottomDeadzoneByKey,
      tachyon,
      tachyonPreviousPollingRate: tachyonPreviousPollingRate ?? undefined,
      compactSidebar,
      showAdvancedPages,
      rememberSelection,
      languagePreference,
      languageManuallySet,
      languageRegionDetected,
      pollingRate: devicePollingRate ?? undefined,
      osModeMac: deviceOsModeMac,
      winLock: deviceWinLock,
      hallDebounce: deviceHallDebounce,
      autoCalibration: deviceAutoCalibration,
      switchSearch,
      switchBrandFilter,
      profileSlot,
      profileNames,
      remapLayers,
      profileDrafts: { ...profileDrafts, [profileSlot]: currentProfileDraft() },
    }
    saveOpenHeroState(webSnapshot)

    const snapshot = {
      keys: Array.from(dirtyKeys).map((keyId) => makeKeyDeviceSettings(keyId, {
        actuationMm: actuationByKey[keyId] ?? 1.6,
        rapidTriggerEnabled: rapidTriggerByKey[keyId] ?? false,
        splitSensitivity: splitSensitivityByKey[keyId] ?? false,
        rapidSensitivityMm: rapidSensitivityByKey[keyId] ?? 0.65,
        pressSensitivityMm: pressSensitivityByKey[keyId] ?? 0.5,
        releaseSensitivityMm: releaseSensitivityByKey[keyId] ?? 0.55,
        deadzoneEnabled: deadzoneEnabledByKey[keyId] ?? true,
        topDeadzoneMm: topDeadzoneByKey[keyId] ?? 0,
        bottomDeadzoneMm: bottomDeadzoneByKey[keyId] ?? 0,
        switchProfile: assignedSwitchesByKey[keyId] ?? 'white',
      })),
      tachyon,
      profileSlot,
    }

    try {
      profileBusyRef.current = true
      setProfileBusy(true)
      setDeviceActionError(null)
      const result = dirtyKeys.size ? await saveDeviceConfiguration(snapshot) : { mode: 'sent' as const }
      if(result.mode==='sent'&&dirtyKeys.size){
        const readback=await hydrateFromDevice(hero68DeviceManager,profileSlot,[...dirtyKeys])
        const near=(actual:number|undefined,wanted:number)=>actual!==undefined&&Math.abs(actual-wanted)<=0.011
        for(const expected of snapshot.keys){
          const actual=readback.get(expected.keyId)
          // Verify the values that were actually encoded on the wire. When
          // split sensitivity is off the firmware receives rapidSensitivityMm
          // for BOTH press/release; when RT is off it receives 0 for both.
          // Comparing readback against the hidden per-direction draft values
          // caused a false mismatch on the first dirty key (commonly KeyW).
          const expectedRelease=expected.rapidTriggerEnabled
            ? (expected.splitSensitivity?expected.releaseSensitivityMm:expected.rapidSensitivityMm)
            : 0
          const expectedPress=expected.rapidTriggerEnabled
            ? (expected.splitSensitivity?expected.pressSensitivityMm:expected.rapidSensitivityMm)
            : 0
          if(!actual||!near(actual.actuationMm,expected.actuationMm)||actual.rapidTriggerEnabled!==expected.rapidTriggerEnabled||
            !near(actual.pressSensitivityMm,expectedPress)||!near(actual.releaseSensitivityMm,expectedRelease)||
            actual.deadzoneEnabled!==expected.deadzoneEnabled||!near(actual.topDeadzoneMm,expected.topDeadzoneMm)||
            !near(actual.bottomDeadzoneMm,expected.bottomDeadzoneMm)||actual.switchProfile!==expected.switchProfile){
            throw Error(`Key setting readback mismatch: ${expected.keyId}`)
          }
        }
      }
      if (result.mode === 'sent' && [...dirtyRemaps].some(change => {
        const [layerText, keyId] = change.split(':')
        const remapLayer = Number(layerText) as RemapLayer
        return isMacroRemapValue(remapLayers[remapLayer]?.[keyId])
      })) {
        const macroLibrary = loadMacroLibrary()
        if (!macroLibrary.length) throw new Error('This mapping references a macro, but the local macro library is empty.')
        await hero68DeviceManager.request(selectProfile(profileSlot), 0x10, 0)
        await syncHero68MacroLibrary(hero68DeviceManager, macroLibrary)
      }
      if (result.mode === 'sent') await saveRemapChanges(hero68DeviceManager, profileSlot, remapLayers, dirtyRemaps)
      if (result.mode === 'sent' && advancedPending) {
        const verified = await saveAdvancedBindings(hero68DeviceManager, profileSlot, advancedBindings, advancedBaseline)
        setAdvancedBaseline(verified)
      }
      if (result.mode === 'sent' && rgbPending && !tachyon) await saveRgbProfile(hero68DeviceManager, rgb, rgbBaseline, setRgbBaseline)
      if (result.mode === 'sent') {
        if(dirtyKeys.size)setDirtyKeys(new Set())
        if(dirtyRemaps.size){remapBaselineRef.current=structuredClone(remapLayers);setDirtyRemaps(new Set())}
        setSaveState('sent')
      } else setSaveState(result.mode)
      window.setTimeout(() => setSaveState('idle'), 1200)
    } catch (error) {
      setSaveState('idle')
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    } finally {
      profileBusyRef.current = false
      setProfileBusy(false)
    }
  }

  const deviceConnected = deviceConnectionState === 'connected'
  const deviceConnecting = deviceConnectionState === 'connecting'
  const deviceStatusLabel = deviceConnectionState === 'connected'
    ? tr('Connected')
    : deviceConnectionState === 'connecting'
      ? tr('Connecting…')
      : deviceConnectionState === 'unsupported'
        ? tr('WebHID unavailable')
        : deviceConnectionState === 'error'
          ? tr('Connection error')
          : tr('Not connected')
  const rawFeedback = deviceActionError ?? hero68Device.error
  const deviceFeedback = (rawFeedback ? tr(rawFeedback) : null)
    ?? (deviceReadState === 'success' ? tr('Profile {slot} loaded from keyboard.', { slot: profileSlot }) : null)

  const renderDevicePanel = () => (
    <div className={`device-panel is-${deviceConnectionState}`}>
      <div className="device-card device-card-static">
        <span className="device-thumb"><img src={hero68} alt="AULA Hero68" /></span>
        <span className="device-copy">
          <small><span className="device-status-dot" aria-hidden="true" />{deviceStatusLabel}</small>
          <strong>{hero68Device.deviceName || 'AULA Hero68'}</strong>
        </span>
        <Activity size={17} className="device-state-icon" aria-hidden="true" />
      </div>

      <div className="device-controls">
        <button
          type="button"
          className={`device-connect-button ${deviceConnected ? 'is-connected' : ''}`}
          onClick={handleDeviceConnection}
          disabled={profileBusy || deviceConnecting || deviceConnectionState === 'unsupported'}
        >
          {deviceConnecting ? tr('Connecting…') : deviceConnected ? tr('Disconnect') : tr('Connect')}
        </button>

        <div className="profile-slot-row">
          <span>{tr('Profile slot')}</span>
          <div className="profile-slot-buttons" role="group" aria-label={tr('Profile slot')}>
            {([0, 1, 2] as const).map((slot) => (
              <button
                type="button"
                key={slot}
                className={profileSlot === slot ? 'is-active' : ''}
                aria-pressed={profileSlot === slot}
                disabled={profileBusy}
                onClick={() => void selectOnboardProfile(slot)}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="device-read-button"
          onClick={() => void handleReadFromDevice()}
          disabled={!deviceConnected || profileBusy}
        >
          {deviceReadState === 'reading' ? tr('Reading…') : tr('Read from device')}
        </button>
      </div>

      {deviceFeedback && <div className={`device-feedback ${deviceActionError || hero68Device.error ? 'is-error' : 'is-success'}`}>{deviceFeedback}</div>}
    </div>
  )

  const showKeyboardArea = activeRail === 'keyboard'

  return (
    <I18nProvider language={resolvedLanguage}><TachyonContext.Provider value={tachyon}>
    <div
      className={`app-shell ${compactSidebar ? 'is-sidebar-compact' : ''}`}
    >
      <LocalServicePermissionGuide />
      <aside className="rail">
        <div className="brand-mark"><img src={logo} alt="OpenHero68" /></div>
        <div className="rail-stack">
          <RailItem icon={<Keyboard size={22} />} label={tr('Keyboard')} active={activeRail === 'keyboard'} onClick={() => setActiveRail('keyboard')} />
          <RailItem icon={<Settings size={22} />} label={tr('Settings')} active={activeRail === 'settings'} onClick={() => setActiveRail('settings')} />
          <RailItem icon={<CircleHelp size={22} />} label={tr('Help')} active={activeRail === 'help'} onClick={() => setActiveRail('help')} />
        </div>
      </aside>

      <aside className="sidebar">
        {showKeyboardArea ? (
          <>
            <div className="sidebar-title">
              <strong>{tr('Keyboard Configuration')}</strong>
              <button
                type="button"
                className="icon-button compact"
                aria-label={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                title={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                onClick={() => setCompactSidebar((prev) => !prev)}
              >
                {compactSidebar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            {renderDevicePanel()}

            <div className="sidebar-section-label">{tr('Profiles')}</div>
            <SidebarItem icon={<Zap size={18} />} label={tr('Quick Settings')} active={activePage === 'quick'} onClick={() => setActivePage('quick')} />
            <SidebarItem icon={<Sparkles size={18} />} label={tr('My Profile')} active={activePage === 'profile'} onClick={() => setActivePage('profile')} />

            <div className="sidebar-section-label">{tr('Keyboard Configuration')}</div>
            {sidebarItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activePage === item.id} onClick={() => setActivePage(item.id)} />
            ))}

            <div className="sidebar-version">OpenHero68 <span>v0.9.55 UI</span></div>
          </>
        ) : activeRail === 'settings' ? (
          <>
            <div className="sidebar-title">
              <strong>{tr('Settings')}</strong>
              <button
                type="button"
                className="icon-button compact"
                aria-label={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                title={compactSidebar ? tr('Expand sidebar') : tr('Collapse sidebar')}
                onClick={() => setCompactSidebar((prev) => !prev)}
              >
                {compactSidebar ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            {renderDevicePanel()}

            <div className="sidebar-section-label">{tr('Keyboard settings')}</div>
            {keyboardSettingsItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeSettingsPage === item.id} onClick={() => setActiveSettingsPage(item.id)} />
            ))}

            <div className="sidebar-section-label">{tr('Interface settings')}</div>
            {uiSettingsItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeSettingsPage === item.id} onClick={() => setActiveSettingsPage(item.id)} />
            ))}

            <div className="sidebar-version">OpenHero68 <span>{tr('Settings UI')}</span></div>
          </>
        ) : (
          <>
            <div className="sidebar-title">
              <strong>{tr('Help')}</strong>
            </div>
            <div className="help-sidebar-copy">
              <p>{tr('This baseline currently focuses on the keyboard workspace and the switch profile selector settings page.')}</p>
            </div>
          </>
        )}
      </aside>

      <main className={`workspace ${activeRail === 'settings' ? 'workspace-settings' : ''}`}>
        {activeRail !== 'settings' && (
          <header className="topbar">
            <div className="profile-control-wrap">
              {showKeyboardArea && activePage === 'macros' ? (
                <div className="page-title-bar"><span className="profile-icon"><ListOrdered size={17}/></span><strong>{tr('Macro library')}</strong></div>
              ) : showKeyboardArea ? (
                <>
                  <button className="profile-control" disabled={profileBusy} onClick={() => setProfileOpen(!profileOpen)}>
                    <span className="profile-icon"><Keyboard size={17} /></span>
                    <strong>{profileNames[profileSlot]}</strong>
                    <ChevronDown size={17} className={profileOpen ? 'rotate' : ''} />
                  </button>
                  {profileOpen && (
                    <div className="profile-menu">
                      {([0, 1, 2] as const).map((slot) => (
                        <button
                          key={slot}
                          className={profileSlot === slot ? 'is-selected' : ''}
                          disabled={profileBusy}
                          onClick={() => { setProfileOpen(false); void selectOnboardProfile(slot) }}
                        >
                          {profileNames[slot]} {profileSlot === slot && <span>{tr('Current')}</span>}
                        </button>
                      ))}
                      <button onClick={() => { setActivePage('profile'); setProfileOpen(false) }}>{tr('Manage profile')}</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="page-title-bar">
                  <span className="profile-icon"><Settings size={17} /></span>
                  <strong>{tr('Help')}</strong>
                </div>
              )}
            </div>

            <div className="topbar-actions">
              {showKeyboardArea && activePage === 'macros' ? <span className="profile-status">{tr('Local + HERO68 macro library')}</span> : <button className="apply-button" onClick={handleSaveAll} disabled={!deviceConnected || profileBusy || loadedProfileSlot !== profileSlot || (dirtyKeys.size === 0 && dirtyRemaps.size === 0 && rgbPending === 0 && !advancedPending)}>{profileBusy ? tr('Syncing…') : saveState === 'sent' ? tr('Saved to profile {slot}', { slot: profileSlot }) : saveState === 'staged' ? tr('Saved locally') : tr('Save to profile {slot}', { slot: profileSlot })}</button>}
            </div>
          </header>
        )}

        <div key={`${activeRail}:${activePage}:${activeSettingsPage}`} className="workspace-content" inert={profileBusy || undefined}>
        {showKeyboardArea ? (
          activePage === 'profile' ? (
            <MyProfilePage slot={profileSlot} names={profileNames} connected={deviceConnected} loaded={loadedProfileSlot === profileSlot} busy={profileBusy} pending={dirtyKeys.size + dirtyRemaps.size + rgbPending + Number(advancedPending)} rapidKeys={HERO68_KEY_IDS.filter(keyId => rapidTriggerByKey[keyId]).length} remappedKeys={REMAP_LAYERS.reduce<number>((count, layer) => count + HERO68_KEY_IDS.filter(keyId => remapLayers[layer][keyId] !== FACTORY_REMAP_LAYERS[layer][keyId]).length, 0)} onSelect={slot => void selectOnboardProfile(slot)} onRename={renameProfile} onExport={exportProfile} onRemap={() => setActivePage('remap')} onRefresh={() => void handleReadFromDevice()} />
          ) : activePage === 'macros' ? (
            <MacroPage />
          ) : activePage === 'remap' ? (
            <KeyRemapPage advancedBindings={advancedBindings} key={profileSlot} layers={remapLayers} busy={profileBusy} dirtyCount={dirtyRemaps.size} canSave={deviceConnected && loadedProfileSlot === profileSlot} onSave={() => void handleSaveAll()} onAssign={assignRemap} onCopyLayer={copyRemapLayer} />
          ) : activePage === 'advanced' ? (
            <>
              {advancedReadError && <p className="ak-error" role="alert">{tr('Advanced Keys could not be read: {error}. Read the profile again before saving these bindings.', { error: advancedReadError })}</p>}
              <AdvancedKeysPage key={profileSlot} bindings={advancedBindings} busy={profileBusy} pending={advancedPending} connected={deviceConnected && loadedProfileSlot === profileSlot} onChange={next => { if (!profileBusyRef.current) { setAdvancedBindings(next); setSaveState('idle') } }} />
            </>
          ) : activePage === 'actuation' ? (
            <ActuationPage
              actuationPreviewWidth={actuationPreviewWidth}
              advancedBindings={advancedBindings}
              selectedKeys={selectedKeys}
              toggleKey={toggleKey}
              actuationByKey={actuationByKey}
              hallStreamPreviewByKey={hallStreamPreviewByKey}
              setActuationPreviewWidth={setActuationPreviewWidth}
              hasSelection={hasSelection}
              allSelected={allSelected}
              selectAll={selectAll}
              discardSelection={discardSelection}
              switchProfileMixed={switchProfileMixed}
              selectedSwitch={selectedSwitch}
              actuation={actuation}
              actuationMixed={actuationMixed}
              setActuationForSelection={setActuationForSelection}
              hallStream={hallStream}
              deviceConnected={deviceConnected}
              handleActuationHallStreamToggle={handleActuationHallStreamToggle}
              actuationHallTriggered={actuationHallTriggered}
              actuationHallFocusKeyId={actuationHallFocusKeyId}
              actuationHallTravelMm={actuationHallTravelMm}
              actuationHallTravelPercent={actuationHallTravelPercent}
              actuationHallThresholdPercent={actuationHallThresholdPercent}
              actuationHallThresholdMm={actuationHallThresholdMm}
            />
          ) : activePage === 'rapid' ? (
            <RapidPage
              advancedBindings={advancedBindings}
              selectedKeys={selectedKeys}
              toggleKey={toggleKey}
              quickPreviewMode={quickPreviewMode}
              rapidPreviewByKey={rapidPreviewByKey}
              deadzonePreviewByKey={deadzonePreviewByKey}
              hasSelection={hasSelection}
              allSelected={allSelected}
              selectAll={selectAll}
              discardSelection={discardSelection}
              rapidTrigger={rapidTrigger}
              rapidTriggerMixed={rapidTriggerMixed}
              setRapidTriggerForSelection={setRapidTriggerForSelection}
              rapidTriggerControlsEnabled={rapidTriggerControlsEnabled}
              splitSensitivity={splitSensitivity}
              splitSensitivityMixed={splitSensitivityMixed}
              setSplitSensitivityForSelection={setSplitSensitivityForSelection}
              splitSensitivityControlsEnabled={splitSensitivityControlsEnabled}
              rapidSensitivity={rapidSensitivity}
              rapidSensitivityMixed={rapidSensitivityMixed}
              setRapidSensitivityForSelection={setRapidSensitivityForSelection}
              pressSensitivity={pressSensitivity}
              pressSensitivityMixed={pressSensitivityMixed}
              setPressSensitivityForSelection={setPressSensitivityForSelection}
              releaseSensitivity={releaseSensitivity}
              releaseSensitivityMixed={releaseSensitivityMixed}
              setReleaseSensitivityForSelection={setReleaseSensitivityForSelection}
              deadzoneEnabled={deadzoneEnabled}
              deadzoneEnabledMixed={deadzoneEnabledMixed}
              setDeadzoneEnabledForSelection={setDeadzoneEnabledForSelection}
              deadzoneControlsEnabled={deadzoneControlsEnabled}
              topDeadzone={topDeadzone}
              topDeadzoneMixed={topDeadzoneMixed}
              setTopDeadzoneForSelection={setTopDeadzoneForSelection}
              bottomDeadzone={bottomDeadzone}
              bottomDeadzoneMixed={bottomDeadzoneMixed}
              setBottomDeadzoneForSelection={setBottomDeadzoneForSelection}
              setQuickPreviewMode={setQuickPreviewMode}
              rapidTriggerByKey={rapidTriggerByKey}
            />
          ) : activePage === 'quick' ? (
            <QuickSettingsPage
              advancedBindings={advancedBindings}
              selectedKeys={selectedKeys}
              toggleKey={toggleKey}
              quickPreviewMode={quickPreviewMode}
              actuationByKey={actuationByKey}
              rapidPreviewByKey={rapidPreviewByKey}
              deadzonePreviewByKey={deadzonePreviewByKey}
              hasSelection={hasSelection}
              allSelected={allSelected}
              selectAll={selectAll}
              discardSelection={discardSelection}
              selectedSwitch={selectedSwitch}
              switchProfileMixed={switchProfileMixed}
              actuation={actuation}
              actuationMixed={actuationMixed}
              setActuationForSelection={setActuationForSelection}
              rapidTrigger={rapidTrigger}
              rapidTriggerMixed={rapidTriggerMixed}
              setRapidTriggerForSelection={setRapidTriggerForSelection}
              rapidTriggerControlsEnabled={rapidTriggerControlsEnabled}
              splitSensitivity={splitSensitivity}
              splitSensitivityMixed={splitSensitivityMixed}
              setSplitSensitivityForSelection={setSplitSensitivityForSelection}
              splitSensitivityControlsEnabled={splitSensitivityControlsEnabled}
              rapidSensitivity={rapidSensitivity}
              rapidSensitivityMixed={rapidSensitivityMixed}
              setRapidSensitivityForSelection={setRapidSensitivityForSelection}
              pressSensitivity={pressSensitivity}
              pressSensitivityMixed={pressSensitivityMixed}
              setPressSensitivityForSelection={setPressSensitivityForSelection}
              releaseSensitivity={releaseSensitivity}
              releaseSensitivityMixed={releaseSensitivityMixed}
              setReleaseSensitivityForSelection={setReleaseSensitivityForSelection}
              deadzoneEnabled={deadzoneEnabled}
              deadzoneEnabledMixed={deadzoneEnabledMixed}
              setDeadzoneEnabledForSelection={setDeadzoneEnabledForSelection}
              deadzoneControlsEnabled={deadzoneControlsEnabled}
              topDeadzone={topDeadzone}
              topDeadzoneMixed={topDeadzoneMixed}
              setTopDeadzoneForSelection={setTopDeadzoneForSelection}
              bottomDeadzone={bottomDeadzone}
              bottomDeadzoneMixed={bottomDeadzoneMixed}
              setBottomDeadzoneForSelection={setBottomDeadzoneForSelection}
              tachyon={tachyon}
              tachyonBusy={tachyonBusy}
              handleTachyonChange={handleTachyonChange}
              deviceConnected={deviceConnected}
              setQuickPreviewMode={setQuickPreviewMode}
            />
          ) : activePage === 'stream' ? (
            <StreamPage
              hallStream={hallStream}
              deviceConnected={deviceConnected}
              handleHallStreamToggle={handleHallStreamToggle}
              advancedBindings={advancedBindings}
              hallStreamPreviewSelection={hallStreamPreviewSelection}
              toggleHallStreamPin={toggleHallStreamPin}
              hallStreamPreviewByKey={hallStreamPreviewByKey}
              hallStreamPinnedKeyId={hallStreamPinnedKeyId}
              hallStreamFocusKeyId={hallStreamFocusKeyId}
              hallStreamFocusSample={hallStreamFocusSample}
              hallStreamFocusPercent={hallStreamFocusPercent}
              hallStreamActiveSamples={hallStreamActiveSamples}
              hallStreamListKeyIds={hallStreamListKeyIds}
            />
          ) : activePage === 'gamepad' ? (
            <GamepadPage key={profileSlot} slot={profileSlot} busy={profileBusy||tachyon} onSetup={()=>{setActiveSettingsPage('background-service');setActiveRail('settings')}}/>
          ) : activePage === 'rgb' ? (
            <RgbPage
              onSetup={() => { setActiveSettingsPage('background-service'); setActiveRail('settings') }}
              initialCustom={rgbCustomEntry}
              onEntered={() => setRgbCustomEntry(false)}
              advancedBindings={advancedBindings}
              profileSlot={profileSlot}
              rgb={rgb}
              profileBusy={profileBusy}
              setRgb={setRgb}
              setSaveState={setSaveState}
              RgbSettingsPage={RgbSettingsPage}
            />
          ) : (
            <div className="placeholder-page page-enter">
              <div className="placeholder-icon"><SlidersHorizontal size={28} /></div>
              <h1>{sidebarItems.find((item) => item.id === activePage)?.label ?? tr('Profile')}</h1>
              <p>{tr('This page is not implemented yet.')}</p>
            </div>
          )
        ) : activeRail === 'settings' ? (
          activeSettingsPage === 'general' ? (
            <div className="page settings-page general-device-settings page-enter">
              <div className="settings-hero general-settings-hero">
                <div>
                  <h1>{tr('General Settings')}</h1>
                  <p>{tr('Device-wide HERO68 settings. Values are read from the keyboard and writes are verified with readback.')}</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                  onClick={() => void readDeviceGeneralSettings()}
                >
                  {deviceSettingsState === 'reading' ? tr('Reading…') : tr('Refresh device settings')}
                </button>
              </div>

              <section className="general-settings-stack">
                <article className="settings-card wooting-settings-card">
                  <div className="device-setting-section first">
                    <div className="device-setting-copy">
                      <h2>{tr('Polling Rate')}</h2>
                      <p>{tr('A higher polling rate lets the keyboard report to the computer more often. Changing it makes firmware 0323 briefly reconnect over USB.')}</p>
                    </div>
                    <div className="device-option-list polling-options" role="radiogroup" aria-label={tr('Polling rate')}>
                      {[...POLLING_RATES].reverse().map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          role="radio"
                          aria-checked={devicePollingRate === rate}
                          className={`device-option-row ${devicePollingRate === rate ? 'is-selected' : ''}`}
                          disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                          onClick={() => void handlePollingRateChange(rate)}
                        >
                          <span className="device-radio-dot" aria-hidden="true" />
                          <span>{rate} Hz</span>
                          {rate === 8000 && <small>{tr('Lowest latency')}</small>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="device-setting-section">
                    <div className="device-setting-copy">
                      <h2>{tr('Operating System Mode')}</h2>
                      <p>{tr('Select the keyboard OS mode stored by the HERO68 firmware.')}</p>
                    </div>
                    <div className="device-option-list" role="radiogroup" aria-label={tr('Operating system mode')}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!deviceOsModeMac}
                        className={`device-option-row ${!deviceOsModeMac ? 'is-selected' : ''}`}
                        disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                        onClick={() => void applyBooleanDeviceSetting('OS mode', false, 17, writeOsMode(false), readOsMode(), setDeviceOsModeMac)}
                      >
                        <span className="device-radio-dot" aria-hidden="true" />
                        <span>{tr('Windows mode')}</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={deviceOsModeMac}
                        className={`device-option-row ${deviceOsModeMac ? 'is-selected' : ''}`}
                        disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                        onClick={() => void applyBooleanDeviceSetting('OS mode', true, 17, writeOsMode(true), readOsMode(), setDeviceOsModeMac)}
                      >
                        <span className="device-radio-dot" aria-hidden="true" />
                        <span>{tr('macOS mode')}</span>
                      </button>
                    </div>
                  </div>

                  <div className="device-setting-section toggle-setting-section">
                    <div className="device-setting-copy">
                      <h2>{tr('Windows Key Lock')}</h2>
                      <p>{tr('Lock or unlock the Windows key using the keyboard firmware setting.')}</p>
                    </div>
                    <Toggle
                      checked={deviceWinLock}
                      onChange={(enabled) => void applyBooleanDeviceSetting('Windows key lock', enabled, 21, writeWinLock(enabled), readWinLock(), setDeviceWinLock)}
                      label={tr('Windows key lock')}
                      disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                    />
                  </div>

                  <div className="device-setting-section toggle-setting-section">
                    <div className="device-setting-copy">
                      <h2>{tr('Hall Debounce')}</h2>
                      <p>{tr('Firmware Hall-switch debounce (feature zone 24). Leave it off for the most direct Hall response unless you specifically need filtering.')}</p>
                    </div>
                    <Toggle
                      checked={deviceHallDebounce}
                      onChange={(enabled) => void applyBooleanDeviceSetting('Hall debounce', enabled, 24, writeHallDebounce(enabled), readHallDebounce(), setDeviceHallDebounce)}
                      label={tr('Hall debounce')}
                      disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                    />
                  </div>

                  {showAdvancedPages && (
                    <div className="device-setting-section toggle-setting-section advanced-device-setting">
                      <div className="device-setting-copy">
                        <h2>{tr('Auto Calibration')} <span className="advanced-badge">{tr('ADVANCED')}</span></h2>
                        <p>{tr('Expose the firmware auto-calibration feature toggle recovered from the AULA driver. This is separate from the live Hall Stream page.')}</p>
                      </div>
                      <Toggle
                        checked={deviceAutoCalibration}
                        onChange={(enabled) => void applyBooleanDeviceSetting('Auto calibration', enabled, 25, writeAutoCalibration(enabled), readAutoCalibration(), setDeviceAutoCalibration)}
                        label={tr('Auto calibration')}
                        disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                      />
                    </div>
                  )}
                </article>

                <div className={`device-settings-read-status is-${deviceSettingsState}`}>
                  {!deviceConnected
                    ? tr('Connect HERO68 to read device settings.')
                    : deviceSettingsState === 'reading'
                      ? tr('Reading settings from HERO68…')
                      : deviceSettingsState === 'saving'
                        ? tr('Applying and verifying setting…')
                        : deviceSettingsState === 'error'
                          ? tr('A device setting failed. See the device panel for details.')
                          : tr('Device settings are synchronized with the keyboard.')}
                </div>
              </section>
            </div>
          ) : activeSettingsPage === 'switches' ? (
            <div className="page settings-page switch-selector-page page-enter">
              <div className="switch-page-actions">
                    <button className="apply-button" onClick={handleSaveAll} disabled={!deviceConnected || profileBusy || loadedProfileSlot !== profileSlot || (dirtyKeys.size === 0 && dirtyRemaps.size === 0 && rgbPending === 0)}>{saveState === 'sent' ? tr('Saved') : saveState === 'staged' ? tr('Saved locally') : tr('Save')}</button>
              </div>

              <section className="switch-selector-stage">
                <SwitchSelectorBoard
                  selectedKeys={selectedKeys}
                  onToggleKey={toggleKey}
                  switchImagesByKey={switchPreviewByKey}
                />
              </section>

              <div className="selection-instruction switch-selection-instruction">
                {hasSelection
                  ? tr(selectedKeys.size === 1 ? '{count} KEY SELECTED' : '{count} KEYS SELECTED', { count: selectedKeys.size })
                  : tr('SELECT ONE OR MORE KEYS FIRST')}
              </div>

              <div className="switch-selector-heading-row">
                <h1>{tr('Switch Selector')}</h1>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={selectAll}>{tr('Select all keys')}</button>
                  <button type="button" className={hasSelection ? "secondary-button" : "ghost-button"} disabled={!hasSelection} onClick={discardSelection}>{tr('Discard selection')}</button>
                </div>
              </div>

              <section className="switch-assignment-grid">
                <article className="settings-card switch-assignment-card">
                  <div className="settings-card-head">
                    <h2>{tr('Assign Switch Profiles')}</h2>
                    <p>{tr('Select keys on the keyboard preview, then choose a calibration profile for your installed switches. The keyboard reports its saved profile IDs; it does not detect the physical switch model.')}</p>
                  </div>

                  <div className="switch-toolbar">
                    <label className="switch-search">
                      <Search size={16} />
                      <input
                        type="text"
                        value={switchSearch}
                        onChange={(e) => setSwitchSearch(e.target.value)}
                        placeholder={tr('Search for a switch profile')}
                      />
                    </label>

                    <div className="switch-brand-filter" ref={brandFilterRef}>
                      <button
                        type="button"
                        className={`brand-filter-trigger ${brandMenuOpen ? 'is-open' : ''}`}
                        aria-haspopup="listbox"
                        aria-expanded={brandMenuOpen}
                        onClick={() => setBrandMenuOpen((open) => !open)}
                      >
                        <span>{tr(brandFilterLabel)}</span>
                        <ChevronDown size={16} />
                      </button>

                      {brandMenuOpen && (
                        <div className="brand-filter-menu" role="listbox" aria-label={tr('Filter switch profiles by brand')}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={switchBrandFilter === 'all'}
                            className={switchBrandFilter === 'all' ? 'is-selected' : ''}
                            onClick={() => {
                              setSwitchBrandFilter('all')
                              setBrandMenuOpen(false)
                            }}
                          >
                            {tr('All brands')}
                          </button>
                          {switchBrands.map((brand) => (
                            <button
                              key={brand}
                              type="button"
                              role="option"
                              aria-selected={switchBrandFilter === brand}
                              className={switchBrandFilter === brand ? 'is-selected' : ''}
                              onClick={() => {
                                setSwitchBrandFilter(brand)
                                setBrandMenuOpen(false)
                              }}
                            >
                              {tr(brand)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="switch-profile-grid">
                    {filteredSwitchOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`switch-profile-card ${(!hasSelection || !switchProfileMixed) && option.id === selectedSwitch.id ? 'is-active' : ''}`}
                        disabled={!hasSelection || profileBusy}
                        title={!hasSelection ? tr('Select one or more keys first') : undefined}
                        onClick={() => assignSwitchProfile(option.id)}
                      >
                        <span className="switch-profile-thumb" style={{ color: option.accent }}>
                          {option.top ? <img src={option.top} alt={option.fullName} /> : <SwitchStemMenuIcon />}
                        </span>
                        <span className="switch-profile-brand">{tr(option.brand)}</span>
                        <strong>{option.fullName}</strong>
                      </button>
                    ))}
                    {!filteredSwitchOptions.length && (
                      <div className="switch-profile-empty">{tr('No switch profiles match the current search.')}</div>
                    )}
                  </div>
                </article>
              </section>
            </div>
          ) : activeSettingsPage === 'background-service' ? (
            <BackgroundServicePage onOpenCustom={() => { setRgbCustomEntry(true); setActivePage('rgb'); setActiveRail('keyboard') }} />
          ) : activeSettingsPage === 'interface' ? (
            <div className="page settings-page page-enter">
              <div className="settings-hero">
                <div>
                  <h1>{tr('Interface')}</h1>
                  <p>{tr('OpenHero68 interface preferences. Every option on this page has an immediate UI effect.')}</p>
                </div>
              </div>
              <section className="selector-page-grid">
                <article className="settings-card interface-only-card">
                  <div className="settings-card-head">
                    <h2>{tr('General')}</h2>
                    <p>{tr("Application-only settings inspired by Wootility's interface preferences.")}</p>
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>{tr('Language')}</strong>
                      <p>{tr('Choose the display language used by OpenHero68.')}</p>
                    </div>
                    <LanguageSelect
                      value={languagePreference}
                      onChange={selectLanguage}
                      label={tr('Language')}
                    />
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>{tr('Show advanced pages')}</strong>
                      <p>{tr('Show Hall Stream, Gamepad, and advanced device controls. Turning this off hides them immediately.')}</p>
                    </div>
                    <Toggle checked={showAdvancedPages} onChange={setShowAdvancedPages} label={tr('Show advanced pages')} />
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>{tr('Compact sidebar')}</strong>
                      <p>{tr('Reduce spacing in the main sidebar for smaller screens.')}</p>
                    </div>
                    <Toggle checked={compactSidebar} onChange={setCompactSidebar} label={tr('Compact sidebar')} />
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>{tr('Remember last selected keys')}</strong>
                      <p>{tr('Restore the currently selected keys after reloading OpenHero68. Turning this off stops persisting the selection.')}</p>
                    </div>
                    <Toggle checked={rememberSelection} onChange={setRememberSelection} label={tr('Remember last selected keys')} />
                  </div>
                </article>
              </section>
            </div>
          ) : (
            <div className="page settings-page page-enter">
              <div className="settings-hero">
                <div>
                  <h1>{tr('Settings')}</h1>
                  <p>{tr('Select a settings category from the sidebar.')}</p>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="placeholder-page page-enter">
            <div className="placeholder-icon"><CircleHelp size={28} /></div>
            <h1>{tr('Help')}</h1>
            <p>{tr('Use the left rail to switch between the keyboard workspace and the new settings page.')}</p>
          </div>
        )}
        </div>
      </main>
    </div>
    </TachyonContext.Provider></I18nProvider>
  )
}

export default App
