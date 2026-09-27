import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  ChevronDown,
  CircleHelp,
  Gamepad2,
  Info,
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
import Hero68Preview from './components/Hero68Preview'
import FeatureHelp from './components/FeatureHelp'
import KeyRemapPage from './components/KeyRemapPage'
import AdvancedKeysPage from './components/AdvancedKeysPage'
import MacroPage from './components/MacroPage'
import { advancedEqual, mergeAdvanced, readAdvancedBindings, saveAdvancedBindings, type AdvancedBinding } from './protocol/hero68/advanced'
import MyProfilePage from './components/MyProfilePage'
import { mergeRgb, readRgbProfile, restoreStoredRgb, rgbChanges, rgbDirtyCount, saveRgbProfile, type RgbProfile } from './protocol/hero68/rgb'
import { HERO68_KEY_IDS, HERO68_LAYOUT } from './keyboard/hero68Layout'
import { loadOpenHeroState, saveOpenHeroState, type PersistedOpenHeroState, type ProfileDraft } from './state/persistence'
import { defaultRemapLayers, isMacroRemapValue, readRemapLayers, readOnboardProfileName, saveOnboardProfileName, saveRemapChanges, REMAP_LAYERS, type RemapLayer, type RemapLayers } from './protocol/hero68/remap'
import { makeKeyDeviceSettings, saveDeviceConfiguration } from './protocol/deviceBridge'
import { hero68DeviceManager, useHero68Device, type Hero68ConnectionState } from './protocol/hero68/webhid'
import { syncHero68MacroLibrary } from './protocol/hero68/macroDevice'
import { loadMacroLibrary } from './state/macros'
import { hydrateFromDevice, type HydratedKeySettings } from './protocol/hero68/hero68Encoder'
import { HERO68_SWITCH_PROFILES, isSwitchProfileId, switchProfileLabel, type SwitchProfileId } from './protocol/hero68/switchProfiles'
import { HERO68_HALL_VISUAL_MAX_MM, hero68HallStream, useHero68HallStream } from './protocol/hero68/hallStream'
import {
  liveIdle,
  POLLING_RATES,
  readActiveProfile,
  readAutoCalibration,
  readHallDebounce,
  readOsMode,
  readPollingRate,
  readWinLock,
  selectProfile,
  writeAutoCalibration,
  writeHallDebounce,
  writeOsMode,
  writePollingRate,
  writeWinLock,
} from './protocol/hero68/commands'
import type { PollingRate, ProfileSlot } from './protocol/hero68/types'
import logo from './assets/openhero68-logo.png'
import hero68 from './assets/hero68.png'
import clearFront from './assets/switches/clear-front.png'
import clearTop from './assets/switches/clear-top.png'
import blueFront from './assets/switches/blue-front.png'
import blueTop from './assets/switches/blue-top.png'
import blackFront from './assets/switches/black-front.png'
import blackTop from './assets/switches/black-top.png'
import whiteFront from './assets/switches/white-front.png'
import whiteTop from './assets/switches/white-top.png'
import wingChunTop from './assets/switches/wing-chun-top.png'
import uranusTop from './assets/switches/uranus-top.png'
import jadeProTop from './assets/switches/jade-pro-top.png'
import wingChunFront from './assets/switches/wing-chun-front.png'
import uranusFront from './assets/switches/uranus-front.png'
import jadeProFront from './assets/switches/jade-pro-front.png'

const RgbSettingsPage = lazy(() => import('./components/RgbSettingsPage'))

type NavItemProps = {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}

type SwitchTone = SwitchProfileId

type SwitchOption = {
  id: SwitchTone
  name: string
  fullName: string
  brand: string
  accent: string
  note: string
  front?: string
  top?: string
}

const HERO68_KEY_LABEL_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(HERO68_LAYOUT.flat().map((key) => [key.id, key.label])),
)
const FACTORY_REMAP_LAYERS = defaultRemapLayers()

function hallKeyLabel(keyId: string | null): string {
  if (!keyId) return 'Press a key'
  return HERO68_KEY_LABEL_BY_ID[keyId] ?? keyId.replace(/^Key/, '').replace(/^Digit/, '')
}

const SWITCH_IMAGES: Partial<Record<SwitchTone, { front: string; top: string }>> = {
  white: { front: whiteFront, top: whiteTop },
  black: { front: blackFront, top: blackTop },
  blue: { front: blueFront, top: blueTop },
  clear: { front: clearFront, top: clearTop },
  'switch-4': { front: wingChunFront, top: wingChunTop },
  'switch-3': { front: uranusFront, top: uranusTop },
  'switch-1': { front: jadeProFront, top: jadeProTop },
  'switch-14': { front: jadeProFront, top: jadeProTop },
}
const SWITCH_OPTIONS: SwitchOption[] = HERO68_SWITCH_PROFILES
  .filter(option => ![5, 22, 24, 27].includes(option.firmwareId))
  .map(option => ({
  id: option.id, name: option.name, fullName: `${option.name} Switch`,
  brand: 'AULA presets', accent: option.color, note: '', ...SWITCH_IMAGES[option.id],
}))


function SwitchSelectorBoard({
  selectedKeys,
  onToggleKey,
  switchImagesByKey,
}: {
  selectedKeys: Set<string>
  onToggleKey: (keyId: string) => void
  switchImagesByKey: Record<string, string>
}) {
  return (
    <div className="switch-board-wrap">
      <div className="switch-board-preview">
        {HERO68_LAYOUT.map((row, rowIndex) => (
          <div className="switch-board-row" key={rowIndex}>
            {row.map((key) => (
              <button
                key={key.id}
                type="button"
                className={`switch-board-key ${selectedKeys.has(key.id) ? 'is-selected' : ''}`}
                style={{ ['--key-units' as any]: key.width ?? 1 }}
                onClick={() => onToggleKey(key.id)}
                aria-label={key.label}
              >
                {switchImagesByKey[key.id]
                  ? <img src={switchImagesByKey[key.id]} alt="" aria-hidden="true" className="switch-board-switch" />
                  : <span className="switch-board-generic" aria-hidden="true"><SwitchStemMenuIcon /></span>}
                <span className="switch-board-key-label" aria-hidden="true">{key.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function RailItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button className={`rail-item ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label}>
      <span className="rail-icon">{icon}</span>
      <span className="rail-label">{label}</span>
    </button>
  )
}

function SidebarItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button className={`sidebar-item ${active ? 'is-active' : ''}`} aria-label={label} onClick={onClick}>
      <span className="sidebar-icon">{icon}</span>
      <span className="sidebar-label">{label}</span>
    </button>
  )
}

function KeyboardMenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M168-240q-29.7 0-50.85-21.15Q96-282.3 96-312v-336q0-29.7 21.15-50.85Q138.3-720 168-720h624q29.7 0 50.85 21.15Q864-677.7 864-648v336q0 29.7-21.15 50.85Q821.7-240 792-240H168Zm0-72h624v-336H168v336Zm168-24h288v-72H336v72Zm-96-120h72v-72h-72v72Zm102 0h72v-72h-72v72Zm102 0h72v-72h-72v72Zm102 0h72v-72h-72v72Zm102 0h72v-72h-72v72Zm-408-96h72v-72h-72v72Zm102 0h72v-72h-72v72Zm102 0h72v-72h-72v72Zm102 0h72v-72h-72v72Zm102 0h72v-72h-72v72ZM168-312v-336 336Z" />
    </svg>
  )
}

function SwitchStemMenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M444-288h72v-156h156v-72H516v-156h-72v156H288v72h156v156ZM216-144q-29.7 0-50.85-21.15Q144-186.3 144-216v-528q0-29.7 21.15-50.85Q186.3-816 216-816h528q29.7 0 50.85 21.15Q816-773.7 816-744v528q0 29.7-21.15 50.85Q773.7-144 744-144H216Zm0-72h528v-528H216v528Zm0-528v528-528Z" />
    </svg>
  )
}

function KeyRemapMenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M168-96q-29.7 0-50.85-21.15Q96-138.3 96-168v-408q0-29.7 21.15-50.85Q138.3-648 168-648h624q29.7 0 50.85 21.15Q864-605.7 864-576v408q0 29.7-21.15 50.85Q821.7-96 792-96H168Zm0-72h624v-408H168v408Zm168-48h288v-72H336v72ZM216-336h72v-72h-72v72Zm114 0h72v-72h-72v72Zm114 0h72v-72h-72v72Zm114 0h72v-72h-72v72Zm114 0h72v-72h-72v72ZM216-456h72v-72h-72v72Zm114 0h72v-72h-72v72Zm114 0h72v-72h-72v72Zm114 0h72v-72h-72v72Zm114 0h72v-72h-72v72ZM168-168v-408 408Zm75-552v-192h72v66q33.68-31.38 76.84-48.69Q435-912 483-912q86.02 0 151.51 53.5T717-720h-74q-16-54-60-87t-100-33q-33.57 0-63.79 12.5Q389-815 366-792h69v72H243Z" />
    </svg>
  )
}

function AdvancedKeysMenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M288-288h384v-72H288v72Zm51-144 141-141 141 141 51-51-192-192-192 192 51 51ZM216-144q-29.7 0-50.85-21.15Q144-186.3 144-216v-528q0-29.7 21.15-50.85Q186.3-816 216-816h528q29.7 0 50.85 21.15Q816-773.7 816-744v528q0 29.7-21.15 50.85Q773.7-144 744-144H216Zm0-72h528v-528H216v528Zm0-528v528-528Z" />
    </svg>
  )
}

function RapidTriggerMenuIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M72-360v-72h144v72H72Zm204-189L158-668l51-51 118 119-51 51Zm12 309v-120h384v120H288Zm156-408v-200h72v200h-72Zm240 99-51-51 119-119 51 51-119 119Zm60 189v-72h144v72H744Z" />
    </svg>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  mixed = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
  mixed?: boolean
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked && !mixed ? 'is-on' : ''} ${mixed ? 'is-mixed' : ''}`}
      aria-pressed={mixed ? false : checked}
      aria-label={mixed ? `${label}, mixed values` : label}
      disabled={disabled}
      onClick={() => onChange(mixed ? true : !checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snapToStep(value: number, min: number, max: number, step: number) {
  const clamped = clampNumber(value, min, max)
  const decimals = (step.toString().split('.')[1] ?? '').length
  const snapped = Math.round((clamped - min) / step) * step + min
  return Number(snapped.toFixed(decimals))
}

const RAPID_TRIGGER_VALUES = [
  0.01,
  ...Array.from({ length: 68 }, (_, index) => Number(((index + 1) * 0.05).toFixed(2))),
] as const

function snapToAllowedValue(value: number, allowedValues: readonly number[]) {
  if (!allowedValues.length) return value
  return allowedValues.reduce((closest, candidate) =>
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest,
  allowedValues[0])
}

function selectionHasMixedValues<T>(selectedKeys: Set<string>, values: Record<string, T>) {
  if (selectedKeys.size <= 1) return false
  const keys = Array.from(selectedKeys)
  const first = values[keys[0]]
  return keys.some((keyId) => values[keyId] !== first)
}

const HERO68_KEY_ID_SET = new Set(HERO68_KEY_IDS)

function normalizeHero68Selection(keys: Iterable<string>) {
  return new Set(Array.from(keys).filter((keyId) => HERO68_KEY_ID_SET.has(keyId)))
}

function isWholeKeyboardSelected(keys: ReadonlySet<string>) {
  return HERO68_KEY_IDS.every((keyId) => keys.has(keyId))
}

function mergePerKeyState<T>(saved: Record<string, T> | undefined, fallback: T) {
  return Object.fromEntries(HERO68_KEY_IDS.map((keyId) => [keyId, saved?.[keyId] ?? fallback])) as Record<string, T>
}

type HydratedNumberField = 'actuationMm' | 'rapidSensitivityMm' | 'pressSensitivityMm' | 'releaseSensitivityMm' | 'topDeadzoneMm' | 'bottomDeadzoneMm'
type HydratedBooleanField = 'rapidTriggerEnabled' | 'splitSensitivity' | 'deadzoneEnabled'

function mergeHydratedNumbers(previous: Record<string, number>, hydrated: Map<string, HydratedKeySettings>, field: HydratedNumberField) {
  const next = { ...previous }
  for (const [keyId, settings] of hydrated) {
    const value = settings[field]
    if (value !== undefined) next[keyId] = value
  }
  return next
}

function mergeHydratedBooleans(previous: Record<string, boolean>, hydrated: Map<string, HydratedKeySettings>, field: HydratedBooleanField) {
  const next = { ...previous }
  for (const [keyId, settings] of hydrated) {
    const value = settings[field]
    if (value !== undefined) next[keyId] = value
  }
  return next
}

function RangeControl({
  value,
  min,
  max,
  step,
  suffix,
  allowedValues,
  disabled = false,
  recommendedValue,
  mixed = false,
  mixedPlaceholder = 'Mixed',
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  suffix: string
  allowedValues?: readonly number[]
  disabled?: boolean
  recommendedValue?: number
  mixed?: boolean
  mixedPlaceholder?: string
  onChange: (value: number) => void
}) {
  const hasAllowedValues = Boolean(allowedValues?.length)
  const effectiveValue = hasAllowedValues ? snapToAllowedValue(value, allowedValues!) : value
  const discreteIndex = hasAllowedValues
    ? allowedValues!.reduce((bestIndex, candidate, index) =>
      Math.abs(candidate - effectiveValue) < Math.abs(allowedValues![bestIndex] - effectiveValue) ? index : bestIndex, 0)
    : 0
  const pct = hasAllowedValues
    ? (discreteIndex / Math.max(1, allowedValues!.length - 1)) * 100
    : ((effectiveValue - min) / (max - min)) * 100
  const recommendedPct = recommendedValue == null
    ? null
    : hasAllowedValues
      ? (allowedValues!.reduce((bestIndex, candidate, index) =>
        Math.abs(candidate - recommendedValue) < Math.abs(allowedValues![bestIndex] - recommendedValue) ? index : bestIndex, 0)
        / Math.max(1, allowedValues!.length - 1)) * 100
      : ((recommendedValue - min) / (max - min)) * 100
  const [draftValue, setDraftValue] = useState(() => mixed ? '' : value.toFixed(2))

  useEffect(() => {
    setDraftValue(mixed ? '' : value.toFixed(2))
  }, [value, mixed])

  const commitNumberInput = () => {
    const normalized = draftValue.trim().replace(',', '.')
    const parsed = Number(normalized)
    if (!normalized || Number.isNaN(parsed)) {
      setDraftValue(mixed ? '' : value.toFixed(2))
      return
    }
    const committed = hasAllowedValues
      ? snapToAllowedValue(clampNumber(parsed, min, max), allowedValues!)
      : snapToStep(parsed, min, max, step)
    onChange(committed)
    setDraftValue(committed.toFixed(2))
  }

  return (
    <div className={`range-wrap ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''}`}>
      <div className="range-slider-shell">
        {recommendedPct != null && <span className="recommend-marker" style={{ left: `${recommendedPct}%` }} aria-hidden="true" />}
        <input
          type="range"
          min={hasAllowedValues ? 0 : min}
          max={hasAllowedValues ? allowedValues!.length - 1 : max}
          step={hasAllowedValues ? 1 : step}
          value={hasAllowedValues ? discreteIndex : value}
          disabled={disabled}
          style={{ '--range-progress': `${pct}%` } as React.CSSProperties}
          onChange={(e) => {
            if (hasAllowedValues) {
              const index = clampNumber(Math.round(Number(e.target.value)), 0, allowedValues!.length - 1)
              onChange(allowedValues![index])
              return
            }
            onChange(snapToStep(Number(e.target.value), min, max, step))
          }}
        />
      </div>
      <div className="value-readout">
        <label className="value-pill value-pill-input">
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={hasAllowedValues ? 0.01 : step}
            value={draftValue}
            aria-label={mixed ? 'Value input, mixed values' : 'Value input'}
            disabled={disabled}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={(e) => {
              if (hasAllowedValues && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                const parsed = Number(draftValue.trim().replace(',', '.'))
                const baseValue = Number.isFinite(parsed) ? snapToAllowedValue(parsed, allowedValues!) : effectiveValue
                const baseIndex = allowedValues!.reduce((bestIndex, candidate, index) =>
                  Math.abs(candidate - baseValue) < Math.abs(allowedValues![bestIndex] - baseValue) ? index : bestIndex, 0)
                const nextIndex = clampNumber(baseIndex + (e.key === 'ArrowUp' ? 1 : -1), 0, allowedValues!.length - 1)
                const nextValue = allowedValues![nextIndex]
                setDraftValue(nextValue.toFixed(2))
                onChange(nextValue)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                commitNumberInput()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setDraftValue(mixed ? '' : value.toFixed(2))
                e.currentTarget.blur()
              }
            }}
          />
        </label>
        <span className="value-suffix">{suffix}</span>
      </div>
    </div>
  )
}

function VerticalRangeControl({
  value,
  min,
  max,
  step,
  suffix,
  disabled = false,
  direction = 'bottom',
  mixed = false,
  mixedPlaceholder = 'Mixed',
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  suffix: string
  disabled?: boolean
  direction?: 'top' | 'bottom'
  mixed?: boolean
  mixedPlaceholder?: string
  onChange: (value: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const markerStyle = direction === 'bottom' ? { bottom: `${pct}%` } : { top: `${pct}%` }
  const fillStyle = direction === 'bottom' ? { height: `${pct}%`, bottom: 0, top: 'auto' } : { height: `${pct}%`, top: 0, bottom: 'auto' }
  const [draftValue, setDraftValue] = useState(() => mixed ? '' : value.toFixed(2))

  useEffect(() => {
    setDraftValue(mixed ? '' : value.toFixed(2))
  }, [value, mixed])

  const commitNumberInput = () => {
    const normalized = draftValue.trim().replace(',', '.')
    const parsed = Number(normalized)
    if (!normalized || Number.isNaN(parsed)) {
      setDraftValue(mixed ? '' : value.toFixed(2))
      return
    }
    const committed = snapToStep(parsed, min, max, step)
    onChange(committed)
    setDraftValue(committed.toFixed(2))
  }

  return (
    <div className={`vertical-meter ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''} ${direction === 'top' ? 'is-top-oriented' : ''}`}>
      <span className="vertical-range-shell">
        <input
          className="vertical-range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label="Vertical value"
          onChange={(e) => onChange(snapToStep(Number(e.target.value), min, max, step))}
        />
        <span className="meter-track" aria-hidden="true">
          <span className="meter-fill" style={fillStyle as React.CSSProperties} />
          <span className="meter-marker" style={markerStyle as React.CSSProperties} />
        </span>
      </span>
      <div className="meter-readout compact-meter-readout">
        <label className="meter-value meter-value-input compact-meter-value">
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draftValue}
            disabled={disabled}
            aria-label="Vertical value input"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitNumberInput()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setDraftValue(mixed ? '' : value.toFixed(2))
                e.currentTarget.blur()
              }
            }}
          />
        </label>
        <b className="value-suffix">{suffix}</b>
      </div>
    </div>
  )
}

function App() {
  const persistedState = useMemo(() => loadOpenHeroState(), [])
  const hero68Device = useHero68Device()
  const hallStream = useHero68HallStream()
  const deviceConnectionState: Hero68ConnectionState = hero68Device.state
  const [activeRail, setActiveRail] = useState<'keyboard' | 'settings' | 'help'>(() => persistedState?.activeRail ?? 'keyboard')
  const [activePage, setActivePage] = useState(() => persistedState?.activePage ?? 'quick')
  const [activeSettingsPage, setActiveSettingsPage] = useState(() => persistedState?.activeSettingsPage ?? 'general')
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
  const profileSwitchAllowedAtRef = useRef(0)
  const remapBaselineRef = useRef<RemapLayers>(persistedState?.profileDrafts?.[persistedState?.profileSlot ?? 1]?.remapBaseline ?? defaultRemapLayers())
  const [devicePollingRate, setDevicePollingRateState] = useState<PollingRate | null>(() => persistedState?.pollingRate ?? null)
  const [deviceOsModeMac, setDeviceOsModeMac] = useState(() => persistedState?.osModeMac ?? false)
  const [deviceWinLock, setDeviceWinLock] = useState(() => persistedState?.winLock ?? false)
  const [deviceHallDebounce, setDeviceHallDebounce] = useState(() => persistedState?.hallDebounce ?? false)
  const [deviceAutoCalibration, setDeviceAutoCalibration] = useState(() => persistedState?.autoCalibration ?? false)
  const [deviceSettingsState, setDeviceSettingsState] = useState<'idle' | 'reading' | 'ready' | 'saving' | 'error'>('idle')
  const [deviceReadState, setDeviceReadState] = useState<'idle' | 'reading' | 'success' | 'error'>('idle')
  const [deviceActionError, setDeviceActionError] = useState<string | null>(null)
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const brandFilterRef = useRef<HTMLDivElement>(null)

  const sidebarItems = useMemo(() => {
    const items = [
      { id: 'actuation', label: 'Actuation Point', icon: <ArrowDownToLine size={18} />, advanced: false },
      { id: 'rapid', label: 'Rapid Trigger', icon: <RapidTriggerMenuIcon />, advanced: false },
      { id: 'stream', label: 'Hall Stream', icon: <Activity size={18} />, advanced: true },
      { id: 'rgb', label: 'RGB Settings', icon: <Lightbulb size={18} />, advanced: false },
      { id: 'remap', label: 'Key Remap', icon: <KeyRemapMenuIcon />, advanced: false },
      { id: 'advanced', label: 'Advanced Keys', icon: <AdvancedKeysMenuIcon />, advanced: false },
      { id: 'macros', label: 'Macros', icon: <ListOrdered size={18} />, advanced: false },
      { id: 'gamepad', label: 'Gamepad', icon: <Gamepad2 size={18} />, advanced: true },
    ]
    return items.filter((item) => showAdvancedPages || !item.advanced)
  }, [showAdvancedPages])

  const keyboardSettingsItems = useMemo(() => [
    { id: 'general', label: 'General Settings', icon: <KeyboardMenuIcon /> },
    { id: 'switches', label: 'Switch Selector', icon: <SwitchStemMenuIcon /> },
  ], [])

  const uiSettingsItems = useMemo(() => [
    { id: 'interface', label: 'Interface', icon: <Palette size={18} /> },
  ], [])

  const selectedSwitch: SwitchOption = SWITCH_OPTIONS.find((option) => option.id === selectedSwitchId) ?? { id: selectedSwitchId, name: switchProfileLabel(selectedSwitchId), fullName: switchProfileLabel(selectedSwitchId), brand: 'AULA presets', accent: '#9ba3a8', note: '' }
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
    .filter((sample) => sample.pressed || sample.releaseInferred || sample.visualDistanceMm >= 0.05)
    .sort((a, b) => b.timestampMs - a.timestampMs), [hallStream.samples])
  const hallStreamListKeyIds = hallStreamActiveSamples.slice(0, 8).map((sample) => sample.keyId)
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
  }, [activeRail, activePage, activeSettingsPage, selectedKeys, selectedSwitchId, assignedSwitchesByKey, actuationByKey, rapidTriggerByKey, splitSensitivityByKey, rapidSensitivityByKey, pressSensitivityByKey, releaseSensitivityByKey, deadzoneEnabledByKey, topDeadzoneByKey, bottomDeadzoneByKey, tachyon, tachyonPreviousPollingRate, compactSidebar, showAdvancedPages, rememberSelection, devicePollingRate, deviceOsModeMac, deviceWinLock, deviceHallDebounce, deviceAutoCalibration, switchSearch, switchBrandFilter, profileSlot, profileNames, remapLayers, profileDrafts, dirtyKeys, dirtyRemaps, rgb, rgbBaseline, advancedBindings, advancedBaseline])

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

  async function readCurrentPollingRate(): Promise<PollingRate> {
    const report = await hero68DeviceManager.request(readPollingRate(), 0x84, 0x17, 1000)
    const level = report.data[0] ?? 3
    const rate = POLLING_RATES[level]
    if (!rate) throw new Error(`Unsupported polling level returned by HERO68: ${level}`)
    return rate
  }

  async function readCurrentProfileSlot(): Promise<ProfileSlot> {
    const report = await hero68DeviceManager.request(readActiveProfile(), 0x90, 0, 1000)
    const slot = report.data[0]
    if (slot !== 0 && slot !== 1 && slot !== 2) throw new Error(`Unsupported active profile returned by HERO68: ${slot}`)
    return slot
  }

  async function readDeviceGeneralSettings() {
    if (!hero68DeviceManager.connected) return
    setDeviceSettingsState('reading')
    try {
      const polling = await readCurrentPollingRate()
      const osMode = await hero68DeviceManager.request(readOsMode(), 0x84, 17, 1000)
      const winLock = await hero68DeviceManager.request(readWinLock(), 0x84, 21, 1000)
      const hallDebounce = await hero68DeviceManager.request(readHallDebounce(), 0x84, 24, 1000)
      const autoCalibration = await hero68DeviceManager.request(readAutoCalibration(), 0x84, 25, 1000)
      setDevicePollingRateState(polling)
      setDeviceOsModeMac((osMode.data[0] ?? 0) !== 0)
      setDeviceWinLock((winLock.data[0] ?? 0) !== 0)
      setDeviceHallDebounce((hallDebounce.data[0] ?? 0) !== 0)
      setDeviceAutoCalibration((autoCalibration.data[0] ?? 0) !== 0)
      setDeviceSettingsState('ready')
    } catch (error) {
      setDeviceSettingsState('error')
      setDeviceActionError(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async function setDevicePollingRate(rate: PollingRate) {
    // Firmware 0323 immediately re-enumerates USB after a polling write; waiting
    // for a normal 0x04 ACK leaves a stale WebHID handle. Send, reopen the new
    // interface, then verify the persisted enum with 0x84/0x17.
    await hero68DeviceManager.sendReenumerating(writePollingRate(rate), 7000)
    const actual = await readCurrentPollingRate()
    if (actual !== rate) throw new Error(`Polling-rate verify failed: requested ${rate} Hz, device reports ${actual} Hz`)
    setDevicePollingRateState(actual)
  }

  async function handlePollingRateChange(rate: PollingRate) {
    if (!hero68DeviceManager.connected || deviceSettingsState === 'saving') return
    setDeviceActionError(null)
    setDeviceSettingsState('saving')
    try {
      if (hallStream.active || hallStream.starting) await hero68HallStream.stop()
      if (rgbStreamActive) {
        await hero68DeviceManager.send(liveIdle())
        setRgbStreamActive(false)
      }
      await setDevicePollingRate(rate)
      if (tachyon && rate !== 8000) {
        setTachyon(false)
        setTachyonPreviousPollingRate(null)
      }
      setDeviceSettingsState('ready')
    } catch (error) {
      setDeviceSettingsState('error')
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function applyBooleanDeviceSetting(
    label: string,
    value: boolean,
    zone: 17 | 21 | 24 | 25,
    writeReport: Uint8Array,
    readReport: Uint8Array,
    setter: (next: boolean) => void,
  ) {
    if (!hero68DeviceManager.connected || deviceSettingsState === 'saving') return
    setDeviceActionError(null)
    setDeviceSettingsState('saving')
    try {
      await hero68DeviceManager.request(writeReport, 0x04, zone, 1200)
      const verify = await hero68DeviceManager.request(readReport, 0x84, zone, 1200)
      const actual = (verify.data[0] ?? 0) !== 0
      if (actual !== value) throw new Error(`${label} verify failed: requested ${value ? 'on' : 'off'}, device reports ${actual ? 'on' : 'off'}`)
      setter(actual)
      setDeviceSettingsState('ready')
    } catch (error) {
      setDeviceSettingsState('error')
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleTachyonChange(enabled: boolean) {
    if (!hero68DeviceManager.connected) {
      setDeviceActionError('Connect HERO68 before changing Tachyon Mode.')
      return
    }
    setDeviceActionError(null)
    try {
      if (enabled) {
        const previous = await readCurrentPollingRate()
        setTachyonPreviousPollingRate(previous)
        if (hallStream.active || hallStream.starting) await hero68HallStream.stop()
        await hero68DeviceManager.send(liveIdle())
        setRgbStreamActive(false)
        if (previous !== 8000) await setDevicePollingRate(8000)
        setTachyon(true)
      } else {
        const restoreRate = tachyonPreviousPollingRate ?? 1000
        await setDevicePollingRate(restoreRate)
        setTachyon(false)
        setTachyonPreviousPollingRate(null)
      }
    } catch (error) {
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    }
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
        // Do not restore the pre-Tachyon polling rate here. Polling writes make
        // firmware 0323 re-enumerate USB, which made the old Stream button look
        // like it disconnected the keyboard. A diagnostic stream simply takes
        // precedence over the host-side Tachyon composite while keeping the
        // current hardware polling rate untouched.
        if (tachyon) {
          setTachyon(false)
          setTachyonPreviousPollingRate(null)
        }
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

  async function handleDeviceConnection() {
    setDeviceActionError(null)
    setDeviceReadState('idle')
    try {
      if (deviceConnectionState === 'connected') {
        if (hallStream.active || hallStream.starting) await hero68HallStream.stop()
        if (rgbStreamActive) await hero68DeviceManager.send(liveIdle())
        setRgbStreamActive(false)
        await hero68DeviceManager.disconnect()
        setLoadedProfileSlot(null)
        setDeviceSettingsState('idle')
      }
      else {
        await hero68DeviceManager.connect(true)
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
      if (result.mode === 'sent' && rgbPending) await saveRgbProfile(hero68DeviceManager, rgb, rgbBaseline, setRgbBaseline)
      if (result.mode === 'sent') {
        const refreshed = await readAndApplyProfile(profileSlot)
        setSaveState(refreshed ? 'sent' : 'idle')
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
    ? 'Connected'
    : deviceConnectionState === 'connecting'
      ? 'Connecting…'
      : deviceConnectionState === 'unsupported'
        ? 'WebHID unavailable'
        : deviceConnectionState === 'error'
          ? 'Connection error'
          : 'Not connected'
  const deviceFeedback = deviceActionError ?? hero68Device.error
    ?? (deviceReadState === 'success' ? `Profile ${profileSlot} loaded from keyboard.` : null)

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
          {deviceConnecting ? 'Connecting…' : deviceConnected ? 'Disconnect' : 'Connect'}
        </button>

        <div className="profile-slot-row">
          <span>Profile slot</span>
          <div className="profile-slot-buttons" role="group" aria-label="Onboard profile slot">
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
          {deviceReadState === 'reading' ? 'Reading…' : 'Read from device'}
        </button>
      </div>

      {deviceFeedback && <div className={`device-feedback ${deviceActionError || hero68Device.error ? 'is-error' : 'is-success'}`}>{deviceFeedback}</div>}
    </div>
  )

  const showKeyboardArea = activeRail === 'keyboard'

  return (
    <div
      className={`app-shell ${compactSidebar ? 'is-sidebar-compact' : ''}`}
    >
      <aside className="rail">
        <div className="brand-mark"><img src={logo} alt="OpenHero68" /></div>
        <div className="rail-stack">
          <RailItem icon={<Keyboard size={22} />} label="Keyboard" active={activeRail === 'keyboard'} onClick={() => setActiveRail('keyboard')} />
          <RailItem icon={<Settings size={22} />} label="Settings" active={activeRail === 'settings'} onClick={() => setActiveRail('settings')} />
          <RailItem icon={<CircleHelp size={22} />} label="Help" active={activeRail === 'help'} onClick={() => setActiveRail('help')} />
        </div>
      </aside>

      <aside className="sidebar">
        {showKeyboardArea ? (
          <>
            <div className="sidebar-title">
              <strong>Keyboard Configuration</strong>
              <button className="icon-button compact" aria-label="Collapse sidebar">‹</button>
            </div>

            {renderDevicePanel()}

            <div className="sidebar-section-label">Profiles</div>
            <SidebarItem icon={<Zap size={18} />} label="Quick Settings" active={activePage === 'quick'} onClick={() => setActivePage('quick')} />
            <SidebarItem icon={<Sparkles size={18} />} label="My Profile" active={activePage === 'profile'} onClick={() => setActivePage('profile')} />

            <div className="sidebar-section-label">Keyboard Configuration</div>
            {sidebarItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activePage === item.id} onClick={() => setActivePage(item.id)} />
            ))}

            <div className="sidebar-version">OpenHero68 <span>v0.9.55 UI</span></div>
          </>
        ) : activeRail === 'settings' ? (
          <>
            <div className="sidebar-title">
              <strong>Settings</strong>
              <button className="icon-button compact" aria-label="Collapse sidebar">‹</button>
            </div>

            {renderDevicePanel()}

            <div className="sidebar-section-label">Cài đặt bàn phím</div>
            {keyboardSettingsItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeSettingsPage === item.id} onClick={() => setActiveSettingsPage(item.id)} />
            ))}

            <div className="sidebar-section-label">Cài đặt UI</div>
            {uiSettingsItems.map((item) => (
              <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeSettingsPage === item.id} onClick={() => setActiveSettingsPage(item.id)} />
            ))}

            <div className="sidebar-version">OpenHero68 <span>Settings UI</span></div>
          </>
        ) : (
          <>
            <div className="sidebar-title">
              <strong>Help</strong>
            </div>
            <div className="help-sidebar-copy">
              <p>This baseline currently focuses on the keyboard workspace and the switch profile selector settings page.</p>
            </div>
          </>
        )}
      </aside>

      <main className={`workspace ${activeRail === 'settings' ? 'workspace-settings' : ''}`}>
        {activeRail !== 'settings' && (
          <header className="topbar">
            <div className="profile-control-wrap">
              {showKeyboardArea && activePage === 'macros' ? (
                <div className="page-title-bar"><span className="profile-icon"><ListOrdered size={17}/></span><strong>Macro library</strong></div>
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
                          {profileNames[slot]} {profileSlot === slot && <span>Current</span>}
                        </button>
                      ))}
                      <button onClick={() => { setActivePage('profile'); setProfileOpen(false) }}>Manage profile</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="page-title-bar">
                  <span className="profile-icon"><Settings size={17} /></span>
                  <strong>Help</strong>
                </div>
              )}
            </div>

            <div className="topbar-actions">
              {showKeyboardArea && activePage === 'macros' ? <span className="profile-status">Local + HERO68 macro library</span> : <button className="apply-button" onClick={handleSaveAll} disabled={!deviceConnected || profileBusy || loadedProfileSlot !== profileSlot || (dirtyKeys.size === 0 && dirtyRemaps.size === 0 && rgbPending === 0 && !advancedPending)}>{profileBusy ? 'Syncing…' : saveState === 'sent' ? `Saved to profile ${profileSlot}` : saveState === 'staged' ? 'Saved locally' : `Save to profile ${profileSlot}`}</button>}
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
              {advancedReadError && <p className="ak-error" role="alert">Advanced Keys could not be read: {advancedReadError}. Read the profile again before saving these bindings.</p>}
              <AdvancedKeysPage key={profileSlot} bindings={advancedBindings} busy={profileBusy} pending={advancedPending} connected={deviceConnected && loadedProfileSlot === profileSlot} onChange={next => { if (!profileBusyRef.current) { setAdvancedBindings(next); setSaveState('idle') } }} />
            </>
          ) : activePage === 'actuation' ? (
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
                  ? `Adjusting Actuation Point for ${selectedKeys.size} selected key${selectedKeys.size === 1 ? '' : 's'}.`
                  : 'To adjust Actuation Point, select one or more keys first.'}
              </div>

              <div className="quick-heading-row actuation-heading-row">
                <div className="actuation-title-wrap">
                  <h1>Actuation Point</h1>
                  <FeatureHelp title="Actuation Point" paragraphs={[
                    'The actuation point is the distance a key must travel before it registers a keypress. A lower value activates the key with a lighter press; a higher value requires a deeper press.',
                    'Select one or more keys to adjust their actuation point. Use a shallow setting for fast inputs, or a deeper setting to help avoid accidental keypresses when typing.',
                  ]} />
                </div>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={selectAll}>Select all keys</button>
                  <button type="button" className={hasSelection ? "secondary-button" : "ghost-button"} disabled={!hasSelection} onClick={discardSelection}>Discard selection</button>
                </div>
              </div>

              <section className="actuation-woot-grid">
                <article className={`setting-card actuation-woot-card actuation-editor-woot-card ${!hasSelection ? 'is-unavailable' : ''}`}>
                  <div className="actuation-editor-head actuation-editor-woot-head">
                    <div>
                      <h2>Set Actuation Point</h2>
                      <p>Customize the actuation point by setting the exact distance a key must be pressed before it registers a keypress.</p>
                    </div>
                    <span className="actuation-always-on"><i />Always on</span>
                  </div>

                  <div className="actuation-editor-summary-line">
                    <span>Changing Actuation Point for</span>
                    <strong>{hasSelection ? `${selectedKeys.size} key${selectedKeys.size === 1 ? '' : 's'}` : '0 keys'}</strong>
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
                        <span><b>0.10 mm</b><small>Shallow</small></span>
                        <span><b>3.40 mm</b><small>Deep</small></span>
                      </div>
                    </div>
                  </div>

                </article>

                <article className={`setting-card actuation-woot-card actuation-hall-card ${(!hasSelection || !deviceConnected) && !hallStream.active ? 'is-unavailable' : ''}`}>
                  <div className="actuation-woot-card-head actuation-hall-head">
                    <div>
                      <h2>Visual Feedback</h2>
                      <span className={`actuation-live-state ${hallStream.active ? 'is-live' : ''}`}><i />{hallStream.starting ? 'STARTING' : hallStream.active ? 'LIVE' : 'IDLE'}</span>
                    </div>
                    <Toggle
                      checked={hallStream.active}
                      onChange={() => void handleActuationHallStreamToggle()}
                      label="Visual Feedback"
                      disabled={!deviceConnected || !hasSelection || hallStream.starting}
                    />
                  </div>
                  <p className="actuation-woot-copy">
                    Read the selected keys' real Hall travel and compare it with their Actuation Point while you press them.
                  </p>

                  <div className={`actuation-hall-panel ${actuationHallTriggered ? 'is-actuated' : ''}`}>
                    <div className="actuation-hall-row">
                      <div>
                        <span className="actuation-hall-kicker">{selectedKeys.size > 1 ? 'ACTIVE SELECTED KEY' : 'SELECTED KEY'}</span>
                        <strong>{actuationHallFocusKeyId ? hallKeyLabel(actuationHallFocusKeyId) : hasSelection ? 'Press a selected key' : 'Select a key'}</strong>
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
                      <span>{actuationHallTriggered && hallStream.active ? 'ACTUATED' : hallStream.active ? 'READY' : 'STREAM OFF'}</span>
                      <span>{actuationHallFocusKeyId ? `AP ${actuationHallThresholdMm.toFixed(2)} mm` : actuationMixed ? 'Mixed AP values' : `AP ${actuation.toFixed(2)} mm`}</span>
                      <span>{hallStream.active && hallStream.telemetryHz ? `~${hallStream.telemetryHz.toFixed(1)} Hz` : 'Selected-key Hall poll'}</span>
                    </div>
                  </div>

                  <div className="actuation-hall-note">
                    <Info size={15} aria-hidden="true" />
                    <span>{!deviceConnected
                      ? 'Connect HERO68 to use Visual Feedback.'
                      : !hasSelection
                        ? 'Select one or more keys above, then enable Visual Feedback.'
                        : hallStream.active
                          ? 'Press any selected key. The most recently moving selected key is shown here.'
                          : 'Enable Visual Feedback to start reading the selected keys.'}</span>
                  </div>
                  {hallStream.error && <p className="actuation-hall-error">{hallStream.error}</p>}
                </article>
              </section>
            </div>
          ) : activePage === 'rapid' ? (
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
          ) : activePage === 'quick' ? (
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
          ) : activePage === 'stream' ? (
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
          ) : activePage === 'rgb' ? (
            <Suspense fallback={<div className="page settings-page">Loading RGB preview…</div>}><RgbSettingsPage advancedBindings={advancedBindings} key={profileSlot} value={rgb} busy={profileBusy} onChange={next => { setRgb(next); setSaveState('idle') }} /></Suspense>
          ) : (
            <div className="placeholder-page page-enter">
              <div className="placeholder-icon"><SlidersHorizontal size={28} /></div>
              <h1>{sidebarItems.find((item) => item.id === activePage)?.label ?? 'Profile'}</h1>
              <p>This page is not implemented yet.</p>
            </div>
          )
        ) : activeRail === 'settings' ? (
          activeSettingsPage === 'general' ? (
            <div className="page settings-page general-device-settings page-enter">
              <div className="settings-hero general-settings-hero">
                <div>
                  <h1>General Settings</h1>
                  <p>Device-wide HERO68 settings. Values are read from the keyboard and writes are verified with readback.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                  onClick={() => void readDeviceGeneralSettings()}
                >
                  {deviceSettingsState === 'reading' ? 'Reading…' : 'Refresh device settings'}
                </button>
              </div>

              <section className="general-settings-stack">
                <article className="settings-card wooting-settings-card">
                  <div className="device-setting-section first">
                    <div className="device-setting-copy">
                      <h2>Polling Rate</h2>
                      <p>A higher polling rate lets the keyboard report to the computer more often. Changing it makes firmware 0323 briefly reconnect over USB.</p>
                    </div>
                    <div className="device-option-list polling-options" role="radiogroup" aria-label="Polling rate">
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
                          {rate === 8000 && <small>Lowest latency</small>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="device-setting-section">
                    <div className="device-setting-copy">
                      <h2>Operating System Mode</h2>
                      <p>Select the keyboard OS mode stored by the HERO68 firmware.</p>
                    </div>
                    <div className="device-option-list" role="radiogroup" aria-label="Operating system mode">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!deviceOsModeMac}
                        className={`device-option-row ${!deviceOsModeMac ? 'is-selected' : ''}`}
                        disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                        onClick={() => void applyBooleanDeviceSetting('OS mode', false, 17, writeOsMode(false), readOsMode(), setDeviceOsModeMac)}
                      >
                        <span className="device-radio-dot" aria-hidden="true" />
                        <span>Windows mode</span>
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
                        <span>macOS mode</span>
                      </button>
                    </div>
                  </div>

                  <div className="device-setting-section toggle-setting-section">
                    <div className="device-setting-copy">
                      <h2>Windows Key Lock</h2>
                      <p>Lock or unlock the Windows key using the keyboard firmware setting.</p>
                    </div>
                    <Toggle
                      checked={deviceWinLock}
                      onChange={(enabled) => void applyBooleanDeviceSetting('Windows key lock', enabled, 21, writeWinLock(enabled), readWinLock(), setDeviceWinLock)}
                      label="Windows key lock"
                      disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                    />
                  </div>

                  <div className="device-setting-section toggle-setting-section">
                    <div className="device-setting-copy">
                      <h2>Hall Debounce</h2>
                      <p>Firmware Hall-switch debounce (feature zone 24). Leave it off for the most direct Hall response unless you specifically need filtering.</p>
                    </div>
                    <Toggle
                      checked={deviceHallDebounce}
                      onChange={(enabled) => void applyBooleanDeviceSetting('Hall debounce', enabled, 24, writeHallDebounce(enabled), readHallDebounce(), setDeviceHallDebounce)}
                      label="Hall debounce"
                      disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                    />
                  </div>

                  {showAdvancedPages && (
                    <div className="device-setting-section toggle-setting-section advanced-device-setting">
                      <div className="device-setting-copy">
                        <h2>Auto Calibration <span className="advanced-badge">ADVANCED</span></h2>
                        <p>Expose the firmware auto-calibration feature toggle recovered from the AULA driver. This is separate from the live Hall Stream page.</p>
                      </div>
                      <Toggle
                        checked={deviceAutoCalibration}
                        onChange={(enabled) => void applyBooleanDeviceSetting('Auto calibration', enabled, 25, writeAutoCalibration(enabled), readAutoCalibration(), setDeviceAutoCalibration)}
                        label="Auto calibration"
                        disabled={!deviceConnected || deviceSettingsState === 'reading' || deviceSettingsState === 'saving'}
                      />
                    </div>
                  )}
                </article>

                <div className={`device-settings-read-status is-${deviceSettingsState}`}>
                  {!deviceConnected
                    ? 'Connect HERO68 to read device settings.'
                    : deviceSettingsState === 'reading'
                      ? 'Reading settings from HERO68…'
                      : deviceSettingsState === 'saving'
                        ? 'Applying and verifying setting…'
                        : deviceSettingsState === 'error'
                          ? 'A device setting failed. See the device panel for details.'
                          : 'Device settings are synchronized with the keyboard.'}
                </div>
              </section>
            </div>
          ) : activeSettingsPage === 'switches' ? (
            <div className="page settings-page switch-selector-page page-enter">
              <div className="switch-page-actions">
                    <button className="apply-button" onClick={handleSaveAll} disabled={!deviceConnected || profileBusy || loadedProfileSlot !== profileSlot || (dirtyKeys.size === 0 && dirtyRemaps.size === 0 && rgbPending === 0)}>{saveState === 'sent' ? 'Saved' : saveState === 'staged' ? 'Saved locally' : 'Save'}</button>
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
                  ? `${selectedKeys.size} KEY${selectedKeys.size === 1 ? '' : 'S'} SELECTED`
                  : 'SELECT ONE OR MORE KEYS FIRST'}
              </div>

              <div className="switch-selector-heading-row">
                <h1>Switch Selector</h1>
                <div className="selection-actions">
                  <button type="button" className="secondary-button" disabled={allSelected} aria-pressed={allSelected} onClick={selectAll}>Select all keys</button>
                  <button type="button" className={hasSelection ? "secondary-button" : "ghost-button"} disabled={!hasSelection} onClick={discardSelection}>Discard selection</button>
                </div>
              </div>

              <section className="switch-assignment-grid">
                <article className="settings-card switch-assignment-card">
                  <div className="settings-card-head">
                    <h2>Assign Switch Profiles</h2>
                    <p>Select keys directly on the keyboard preview, then assign your installed switch profile from the list below for optimal accuracy.</p>
                  </div>

                  <div className="switch-toolbar">
                    <label className="switch-search">
                      <Search size={16} />
                      <input
                        type="text"
                        value={switchSearch}
                        onChange={(e) => setSwitchSearch(e.target.value)}
                        placeholder="Search for a switch profile"
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
                        <span>{brandFilterLabel}</span>
                        <ChevronDown size={16} />
                      </button>

                      {brandMenuOpen && (
                        <div className="brand-filter-menu" role="listbox" aria-label="Filter switch profiles by brand">
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
                            All brands
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
                              {brand}
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
                        onClick={() => assignSwitchProfile(option.id)}
                      >
                        <span className="switch-profile-thumb" style={{ color: option.accent }}>
                          {option.top ? <img src={option.top} alt={option.fullName} /> : <SwitchStemMenuIcon />}
                        </span>
                        <span className="switch-profile-brand">{option.brand}</span>
                        <strong>{option.fullName}</strong>
                      </button>
                    ))}
                    {!filteredSwitchOptions.length && (
                      <div className="switch-profile-empty">No switch profiles match the current search.</div>
                    )}
                  </div>
                </article>
              </section>
            </div>
          ) : activeSettingsPage === 'interface' ? (
            <div className="page settings-page page-enter">
              <div className="settings-hero">
                <div>
                  <h1>Interface</h1>
                  <p>OpenHero68 interface preferences. Every option on this page has an immediate UI effect.</p>
                </div>
              </div>
              <section className="selector-page-grid">
                <article className="settings-card interface-only-card">
                  <div className="settings-card-head">
                    <h2>General</h2>
                    <p>Application-only settings inspired by Wootility's interface preferences.</p>
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>Show advanced pages</strong>
                      <p>Show Hall Stream, Gamepad, and advanced device controls. Turning this off hides them immediately.</p>
                    </div>
                    <Toggle checked={showAdvancedPages} onChange={setShowAdvancedPages} label="Show advanced pages" />
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>Compact sidebar</strong>
                      <p>Reduce spacing in the main sidebar for smaller screens.</p>
                    </div>
                    <Toggle checked={compactSidebar} onChange={setCompactSidebar} label="Compact sidebar" />
                  </div>
                  <div className="setting-line">
                    <div>
                      <strong>Remember last selected keys</strong>
                      <p>Restore the currently selected keys after reloading OpenHero68. Turning this off stops persisting the selection.</p>
                    </div>
                    <Toggle checked={rememberSelection} onChange={setRememberSelection} label="Remember last selected keys" />
                  </div>
                </article>
              </section>
            </div>
          ) : (
            <div className="page settings-page page-enter">
              <div className="settings-hero">
                <div>
                  <h1>Settings</h1>
                  <p>Select a settings category from the sidebar.</p>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="placeholder-page page-enter">
            <div className="placeholder-icon"><CircleHelp size={28} /></div>
            <h1>Help</h1>
            <p>Use the left rail to switch between the keyboard workspace and the new settings page.</p>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

export default App
