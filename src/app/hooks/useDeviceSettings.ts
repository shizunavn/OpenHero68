import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { PersistedOpenHeroState } from '../../state/persistence'
import { hero68DeviceManager } from '../../protocol/hero68/webhid'
import { hero68HallStream } from '../../protocol/hero68/hallStream'
import {
  liveIdle,
  POLLING_RATES,
  readAutoCalibration,
  readHallDebounce,
  readOsMode,
  readPollingRate,
  readWinLock,
  writePollingRate,
} from '../../protocol/hero68/commands'
import { setTachyonLighting } from '../../protocol/tachyon'
import { rgbService } from '../../protocol/rgbService'
import type { PollingRate } from '../../protocol/hero68/types'

type HallStreamState = {
  active: boolean
  starting: boolean
}

type UseDeviceSettingsOptions = {
  persistedState: PersistedOpenHeroState | null | undefined
  hallStream: HallStreamState
  rgbStreamActive: boolean
  setRgbStreamActive: Dispatch<SetStateAction<boolean>>
  tachyon: boolean
  setTachyon: Dispatch<SetStateAction<boolean>>
  tachyonPreviousPollingRate: PollingRate | null
  setTachyonPreviousPollingRate: Dispatch<SetStateAction<PollingRate | null>>
}

export function useDeviceSettings({
  persistedState,
  hallStream,
  rgbStreamActive,
  setRgbStreamActive,
  tachyon,
  setTachyon,
  tachyonPreviousPollingRate,
  setTachyonPreviousPollingRate,
}: UseDeviceSettingsOptions) {
  const tachyonChanging = useRef(false)
  const tachyonRef = useRef(tachyon); tachyonRef.current = tachyon
  const [tachyonBusy, setTachyonBusy] = useState(false)
  useEffect(() => {
    let disposed = false
    const synchronize = async () => {
      if (tachyonChanging.current || !hero68DeviceManager.connected) return
      tachyonChanging.current = true
      try {
        const status = await rgbService.status().catch(() => null)
        if (disposed) return
        if (tachyonRef.current) await setTachyonLighting(true)
        else if (status?.tachyon) setTachyon(true)
      } catch (error) {
        if (!disposed) setDeviceActionError(error instanceof Error ? error.message : String(error))
      } finally { tachyonChanging.current = false }
    }
    const unsubscribeDevice = hero68DeviceManager.subscribe(() => void synchronize())
    const unsubscribeService = rgbService.onAvailability(online => { if (online) void synchronize() })
    void synchronize()
    return () => { disposed = true; unsubscribeDevice(); unsubscribeService() }
  }, [])
  const [devicePollingRate, setDevicePollingRateState] = useState<PollingRate | null>(() => persistedState?.pollingRate ?? null)
  const [deviceOsModeMac, setDeviceOsModeMac] = useState(() => persistedState?.osModeMac ?? false)
  const [deviceWinLock, setDeviceWinLock] = useState(() => persistedState?.winLock ?? false)
  const [deviceHallDebounce, setDeviceHallDebounce] = useState(() => persistedState?.hallDebounce ?? false)
  const [deviceAutoCalibration, setDeviceAutoCalibration] = useState(() => persistedState?.autoCalibration ?? false)
  const [deviceSettingsState, setDeviceSettingsState] = useState<'idle' | 'reading' | 'ready' | 'saving' | 'error'>('idle')
  const [deviceReadState, setDeviceReadState] = useState<'idle' | 'reading' | 'success' | 'error'>('idle')
  const [deviceActionError, setDeviceActionError] = useState<string | null>(null)

  async function readCurrentPollingRate(): Promise<PollingRate> {
    const report = await hero68DeviceManager.request(readPollingRate(), 0x84, 0x17, 1000)
    const level = report.data[0] ?? 3
    const rate = POLLING_RATES[level]
    if (!rate) throw new Error(`Unsupported polling level returned by HERO68: ${level}`)
    return rate
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
      if (tachyon && rate !== 8000) await setTachyonLighting(false)
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
    if (tachyonChanging.current || deviceSettingsState === 'saving') return
    if (!hero68DeviceManager.connected) {
      setDeviceActionError('Connect HERO68 before changing Tachyon Mode.')
      return
    }
    tachyonChanging.current = true
    setTachyonBusy(true)
    setDeviceSettingsState('saving')
    setDeviceActionError(null)
    const resumeHall = hallStream.active || hallStream.starting
    const hallKeys = hero68HallStream.getRequestedKeys()
    const hallSource = hero68HallStream.getSnapshot().source
    try {
      // Polling changes re-enumerate USB. Resume only telemetry the user enabled.
      if (resumeHall) await hero68HallStream.stop()
      if (enabled) {
        const previous = await readCurrentPollingRate()
        if (!tachyon) setTachyonPreviousPollingRate(previous)
        await setTachyonLighting(true)
        setTachyon(true)
        await hero68DeviceManager.send(liveIdle())
        setRgbStreamActive(false)
        if (previous !== 8000) await setDevicePollingRate(8000)
      } else {
        const restoreRate = tachyonPreviousPollingRate ?? 1000
        if (await readCurrentPollingRate() !== restoreRate) await setDevicePollingRate(restoreRate)
        await setTachyonLighting(false)
        setTachyon(false)
        setTachyonPreviousPollingRate(null)
      }
      setDeviceSettingsState('ready')
    } catch (error) {
      setDeviceSettingsState('error')
      setDeviceActionError(error instanceof Error ? error.message : String(error))
    } finally {
      if (resumeHall && hero68DeviceManager.connected) {
        await hero68HallStream.start(hallKeys, hallSource).catch(error => setDeviceActionError(error instanceof Error ? error.message : String(error)))
      }
      tachyonChanging.current = false
      setTachyonBusy(false)
    }
  }

  return {
    tachyonBusy,
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
  }
}
