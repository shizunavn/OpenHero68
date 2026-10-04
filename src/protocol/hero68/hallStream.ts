import { useSyncExternalStore } from 'react'
import {
  calibrationDistanceExit,
  calibrationDistanceStart,
  calibrationDistanceSync,
  readAutoCalibration,
  writeAutoCalibration,
} from './commands'
import { decodeDistanceCalibrationLive } from './codec'
import { HERO68_KEY_POSITIONS, keyIdToPos, posToKeyId } from './keyPositions'
import { hero68DeviceManager } from './webhid'
import { rgbService, type RgbServiceHallRecord } from '../rgbService'
import { HERO68_DISTANCE_UNIT_MM } from './precision'
import { runHallPolling } from './hallPolling'

/** The usable HERO68 key travel tops out around 3.4 mm. Clamp the UI to 3.40 mm so full travel visually reaches 100%. */
export const HERO68_HALL_VISUAL_MAX_MM = 3.4 as const

/**
 * Firmware-reversed Hall sources. None uses 0x94 manual calibration, so none
 * triggers the red/green calibration LED state.
 *
 * direct-poll: repeated 0x98/01 snapshot reads WITHOUT 0x98/00 START. Static
 *              firmware RE shows zone 1 reads Hall state directly and is not
 *              gated by the 0x98 mode bit. This is the passive path candidate.
 * mode-poll:   same multi-key snapshots after entering 0x98 mode; fallback if
 *              firmware 0323 differs from the 0320 image.
 */
export type HallStreamSource = 'direct-poll' | 'mode-poll'

export type HallStreamSample = {
  keyId: string
  pos: number
  distanceMm: number
  visualDistanceMm: number
  distanceUnits: number
  rawAdc: number
  pressed: boolean
  releaseInferred: boolean
  timestampMs: number
}

export type HallStreamState = {
  active: boolean
  starting: boolean
  recovering: boolean
  source: HallStreamSource
  error: string | null
  sampleCount: number
  frameCount: number
  telemetryHz: number | null
  samples: Readonly<Record<string, HallStreamSample>>
  keyTelemetryHz: Readonly<Record<string, number>>
}

class Hero68HallStream {
  #state: HallStreamState = {
    active: false,
    starting: false,
    recovering: false,
    source: 'direct-poll',
    error: null,
    sampleCount: 0,
    frameCount: 0,
    telemetryHz: null,
    samples: {},
    keyTelemetryHz: {},
  }
  #listeners = new Set<() => void>()
  #unsubscribeReport: (() => void) | null = null
  #unsubscribeDevice: (() => void) | null = null
  #frameTimes: number[] = []
  #keyFrameTimes = new Map<string, number[]>()
  #keyupHandler: ((event: KeyboardEvent) => void) | null = null
  #keydownHandler: ((event: KeyboardEvent) => void) | null = null
  #hostPressedKeys = new Set<string>()
  #sampleExpiryTimers = new Map<string, number>()
  #restoreAutoCalibration = false
  #stage = 'idle'
  #requestedKeyIds: string[] = []
  getRequestedKeys = () => [...this.#requestedKeyIds]
  #pollGeneration = 0
  #pollPromise: Promise<void> | null = null
  #notifyTimer: ReturnType<typeof setTimeout> | null = null

  getSnapshot = (): HallStreamState => this.#state

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #setState(next: Partial<HallStreamState>) {
    this.#state = { ...this.#state, ...next }
    this.#listeners.forEach((listener) => listener())
  }

  #publishSamples(next: Partial<HallStreamState>) {
    this.#state = { ...this.#state, ...next }
    if(this.#notifyTimer!==null)return
    this.#notifyTimer=setTimeout(()=>{
      this.#notifyTimer=null
      this.#listeners.forEach(listener=>listener())
    },32)
  }

  #cleanupListeners() {
    if(this.#notifyTimer!==null){clearTimeout(this.#notifyTimer);this.#notifyTimer=null}
    this.#unsubscribeReport?.()
    this.#unsubscribeReport = null
    this.#unsubscribeDevice?.()
    this.#unsubscribeDevice = null
    if (typeof window !== 'undefined') {
      if (this.#keyupHandler) window.removeEventListener('keyup', this.#keyupHandler, true)
      if (this.#keydownHandler) window.removeEventListener('keydown', this.#keydownHandler, true)
      for (const timer of this.#sampleExpiryTimers.values()) window.clearTimeout(timer)
    }
    this.#keyupHandler = null
    this.#keydownHandler = null
    this.#hostPressedKeys.clear()
    this.#sampleExpiryTimers.clear()
  }

  #installHostKeyFallback() {
    if (typeof window === 'undefined') return
    this.#keydownHandler = (event: KeyboardEvent) => {
      try { keyIdToPos(event.code) } catch { return }
      this.#hostPressedKeys.add(event.code)
    }
    this.#keyupHandler = (event: KeyboardEvent) => {
      try { keyIdToPos(event.code) } catch { return }
      this.#hostPressedKeys.delete(event.code)
      const sample = this.#state.samples[event.code]
      if (!sample || (!sample.pressed && sample.visualDistanceMm === 0)) return
      const released: HallStreamSample = {
        ...sample,
        visualDistanceMm: 0,
        pressed: false,
        releaseInferred: true,
        timestampMs: performance.now(),
      }
      this.#setState({ samples: { ...this.#state.samples, [event.code]: released } })
      this.#scheduleSampleExpiry(event.code, 450)
    }
    window.addEventListener('keydown', this.#keydownHandler, true)
    window.addEventListener('keyup', this.#keyupHandler, true)
  }

  #recordFrameTime(now: number): number | null {
    this.#frameTimes.push(now)
    if (this.#frameTimes.length > 24) this.#frameTimes.shift()
    if (this.#frameTimes.length < 3) return null
    const intervals: number[] = []
    for (let index = 1; index < this.#frameTimes.length; index += 1) {
      const delta = this.#frameTimes[index] - this.#frameTimes[index - 1]
      if (delta > 0 && delta < 1000) intervals.push(delta)
    }
    if (intervals.length === 0) return null
    intervals.sort((a, b) => a - b)
    const mid = Math.floor(intervals.length / 2)
    const median = intervals.length % 2 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2
    return median > 0 ? 1000 / median : null
  }

  #recordKeyFrameTime(keyId: string, now: number): number | null {
    const times = this.#keyFrameTimes.get(keyId) ?? []
    times.push(now)
    // Keep enough history to smooth the very low-rate secondary-key case while
    // still reacting quickly when the scheduler changes.
    while (times.length > 32) times.shift()
    while (times.length > 2 && now - times[0] > 2500) times.shift()
    this.#keyFrameTimes.set(keyId, times)
    if (times.length < 2) return null
    const elapsed = times[times.length - 1] - times[0]
    return elapsed > 0 ? ((times.length - 1) * 1000) / elapsed : null
  }

  #scheduleSampleExpiry(keyId: string, delayMs = 900) {
    if (typeof window === 'undefined') return
    const previous = this.#sampleExpiryTimers.get(keyId)
    if (previous) window.clearTimeout(previous)
    const timer = window.setTimeout(() => {
      this.#sampleExpiryTimers.delete(keyId)
      const sample = this.#state.samples[keyId]
      if (!sample || sample.pressed || (!sample.releaseInferred && sample.visualDistanceMm > 0)) return
      const next = { ...this.#state.samples }
      delete next[keyId]
      this.#setState({ samples: next })
    }, delayMs)
    this.#sampleExpiryTimers.set(keyId, timer)
  }

  #cancelSampleExpiry(keyId: string) {
    if (typeof window === 'undefined') return
    const previous = this.#sampleExpiryTimers.get(keyId)
    if (!previous) return
    window.clearTimeout(previous)
    this.#sampleExpiryTimers.delete(keyId)
  }

  #ingestRecords(records:readonly {keyId:number;distanceUnits:number;adc:number;pressed:boolean}[]) {
      if (records.length === 0) return
      const timestampMs = performance.now()
      const telemetryHz = this.#recordFrameTime(timestampMs)
      const next = { ...this.#state.samples }
      const keyTelemetryHz = { ...this.#state.keyTelemetryHz }
      let added = 0
      for (const record of records) {
        const keyId = posToKeyId(record.keyId)
        if (!keyId) continue
        const previous = this.#state.samples[keyId]
        const keyHz = this.#recordKeyFrameTime(keyId, timestampMs)
        if (keyHz !== null) keyTelemetryHz[keyId] = keyHz
        const distanceMm = record.distanceUnits * HERO68_DISTANCE_UNIT_MM
        const moved = !previous || previous.distanceUnits !== record.distanceUnits || previous.pressed !== record.pressed
        const hallAtRest = !record.pressed && distanceMm <= 0.08
        next[keyId] = {
          keyId,
          pos: record.keyId,
          distanceMm,
          visualDistanceMm: hallAtRest ? 0 : Math.min(distanceMm, HERO68_HALL_VISUAL_MAX_MM),
          distanceUnits: record.distanceUnits,
          rawAdc: record.adc,
          pressed: record.pressed,
          releaseInferred: false,
          timestampMs: moved ? timestampMs : previous.timestampMs,
        }
        if (record.pressed || !hallAtRest) this.#cancelSampleExpiry(keyId)
        else this.#scheduleSampleExpiry(keyId, 450)
        added += 1
      }
      if (added) this.#publishSamples({
        samples: next,
        sampleCount: this.#state.sampleCount + added,
        frameCount: this.#state.frameCount + 1,
        telemetryHz,
        keyTelemetryHz,
      })
  }

  #installDistanceReportHandler() {
    this.#unsubscribeReport = hero68DeviceManager.onReport((report) => {
      if (report.command !== 0x98 || report.zone !== 1) return
      this.#ingestRecords(decodeDistanceCalibrationLive(report.data))
    })
  }

  #installDeviceWatcher() {
    this.#unsubscribeDevice = hero68DeviceManager.subscribe(() => {
      const snapshot = hero68DeviceManager.getSnapshot()
      if (snapshot.state === 'connected' || (!this.#state.active && !this.#state.starting)) return
      ++this.#pollGeneration
      this.#cleanupListeners()
      this.#setState({
        active: false,
        starting: false,
        recovering: false,
        samples: this.#zeroVisualSamples(),
        telemetryHz: null,
        keyTelemetryHz: {},
        error: snapshot.state === 'disconnected'
          ? `HERO68 USB interface disconnected during Hall Stream (${this.#stage}).`
          : snapshot.error,
      })
    })
  }

  #reportMatchesBatch(report: import('./types').DecodedReport, positions: readonly number[]): boolean {
    if (report.command !== 0x98 || report.zone !== 1) return false
    if (report.data.length !== positions.length * 6) return false
    for (let index = 0; index < positions.length; index += 1) {
      const offset = index * 6
      const pos = (report.data[offset] << 8) | report.data[offset + 1]
      if (pos !== positions[index]) return false
    }
    return true
  }

  async #runFirmwarePolling(generation: number, positions: readonly number[]): Promise<void> {
    // Firmware 0320 disassembly shows the host-side 0x98/01 handler loops every
    // requested POS and returns one 6-byte POS/DISTANCE/ADC record per key.
    // A 63-byte HID payload can safely carry 9 such records (54 data bytes), so
    // start with 9-key batches and reduce their size if matching snapshots time
    // out repeatedly. Direct polling never enters calibration/LED mode.
    await runHallPolling({
      positions,
      isActive: () => generation === this.#pollGeneration && hero68DeviceManager.connected,
      requestBatch: batch => hero68DeviceManager.request(
        calibrationDistanceSync(batch),
        0x98,
        1,
        650,
        (report) => this.#reportMatchesBatch(report, batch),
      ),
      delay: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
      recover: () => hero68DeviceManager.recoverControlChannel(),
      onRecovering: recovering => {
        if (generation !== this.#pollGeneration || !hero68DeviceManager.connected) return
        if (recovering) {
          this.#frameTimes = []
          this.#keyFrameTimes.clear()
          this.#setState({ recovering, samples: this.#zeroVisualSamples(), telemetryHz: null, keyTelemetryHz: {} })
        } else this.#setState({ recovering })
      },
    })
  }

  async start(preferredKeyIds: Iterable<string> = [], source: HallStreamSource = 'direct-poll'): Promise<void> {
    if (this.#state.active || this.#state.starting) return
    // Failure cleanup may still be exiting distance mode/restoring calibration.
    if (this.#pollPromise) await this.#pollPromise
    if (this.#state.active || this.#state.starting) return
    if (!hero68DeviceManager.connected) throw new Error('Connect HERO68 before starting Hall Stream')

    preferredKeyIds = Array.from(preferredKeyIds)
    this.#requestedKeyIds = [...preferredKeyIds]
    const preferredPositions: number[] = []
    const seenPositions = new Set<number>()
    for (const keyId of preferredKeyIds) {
      const pos = HERO68_KEY_POSITIONS[keyId]
      if (pos === undefined || seenPositions.has(pos)) continue
      seenPositions.add(pos)
      preferredPositions.push(pos)
    }
    // The diagnostics page can still request the whole matrix by passing no
    // preferred keys. Actuation passes its current selection, so Visual Feedback
    // polls only those keys instead of hammering all 68 keys unnecessarily.
    const pollingPositions = preferredPositions.length > 0
      ? preferredPositions
      : Object.values(HERO68_KEY_POSITIONS)

    const viaService=hero68DeviceManager.viaService
    if(viaService){
      const status=await rgbService.status()
      if((status.apiVersion??0)<4)throw Error('Update RGB service to share Hall samples with the web.')
      if(source!=='direct-poll')throw Error('Service Hall stream uses direct polling only.')
    }

    if (this.#restoreAutoCalibration) {
      this.#stage = 'restore-auto-calibration-after-reconnect'
      await this.#restoreAutoCalibrationIfNeeded()
    }

    this.#stage = 'prepare'
    this.#cleanupListeners()
    this.#frameTimes = []
    this.#keyFrameTimes.clear()
    this.#setState({
      source,
      starting: true,
      recovering: false,
      error: null,
      samples: {},
      sampleCount: 0,
      frameCount: 0,
      telemetryHz: null,
      keyTelemetryHz: {},
    })
    this.#installHostKeyFallback()
    this.#installDeviceWatcher()
    if(!viaService)this.#installDistanceReportHandler()

    try {
      if (source !== 'direct-poll'&&!viaService) {
        // Only the started modes need the safe 0x98 precondition discovered on
        // hardware. Direct polling never sets the 0x98 mode bit at all.
        this.#stage = 'read-auto-calibration'
        const autoCalibration = await hero68DeviceManager.request(readAutoCalibration(), 0x84, 25, 1000)
        this.#restoreAutoCalibration = (autoCalibration.data[0] ?? 0) !== 0
        if (this.#restoreAutoCalibration) {
          this.#stage = 'disable-auto-calibration'
          await hero68DeviceManager.request(writeAutoCalibration(false), 0x04, 25, 1000)
        }

        this.#stage = 'start-0x98-await-ack'
        await hero68DeviceManager.request(calibrationDistanceStart(), 0x98, 0, 1000)
      }

      this.#stage = `${source}-streaming`
      this.#setState({ active: true, starting: false, error: null })
      if(viaService){
        const ids=preferredPositions.length?Array.from(preferredKeyIds).filter(id=>HERO68_KEY_POSITIONS[id]!==undefined):Object.keys(HERO68_KEY_POSITIONS)
        this.#unsubscribeReport=rgbService.hallStream(ids,(records:RgbServiceHallRecord[])=>this.#ingestRecords(records.map(record=>({keyId:record.pos,distanceUnits:record.distanceUnits,adc:record.adc,pressed:record.pressed}))),()=>{
          this.#cleanupListeners()
          this.#setState({active:false,starting:false,recovering:false,samples:this.#zeroVisualSamples(),error:'Service Hall stream disconnected',telemetryHz:null,keyTelemetryHz:{}})
        })
      }else if (source === 'direct-poll' || source === 'mode-poll') {
        const generation = ++this.#pollGeneration
        this.#pollPromise = this.#runFirmwarePolling(generation, pollingPositions).catch(async (error) => {
          if (generation !== this.#pollGeneration) return
          const message = error instanceof Error ? error.message : String(error)
          this.#cleanupListeners()
          this.#setState({
            active: false,
            starting: false,
            recovering: false,
            error: `Hall polling stopped: ${message}. Close other keyboard apps or tabs, reconnect HERO68, then start again.`,
            samples: this.#zeroVisualSamples(),
            telemetryHz: null,
            keyTelemetryHz: {},
          })
          if (hero68DeviceManager.connected && source !== 'direct-poll') {
            try { await hero68DeviceManager.request(calibrationDistanceExit(), 0x98, 2, 1000) } catch { /* best effort */ }
          }
          try { await this.#restoreAutoCalibrationIfNeeded() } catch { /* retry on the next start */ }
        })
      }
    } catch (error) {
      if (hero68DeviceManager.connected) {
        if (source !== 'direct-poll') {
          try { await hero68DeviceManager.request(calibrationDistanceExit(), 0x98, 2, 1000) } catch { /* best effort */ }
        }
        try { await this.#restoreAutoCalibrationIfNeeded() } catch { /* best effort */ }
      }
      this.#cleanupListeners()
      const snapshot = hero68DeviceManager.getSnapshot()
      const message = snapshot.state === 'disconnected'
        ? `HERO68 USB interface disconnected during Hall Stream (${this.#stage}).`
        : error instanceof Error ? error.message : String(error)
      this.#setState({ active: false, starting: false, recovering: false, error: message })
      throw new Error(message)
    }
  }

  async #restoreAutoCalibrationIfNeeded(): Promise<void> {
    if (!this.#restoreAutoCalibration || !hero68DeviceManager.connected) return
    this.#stage = 'restore-auto-calibration'
    await hero68DeviceManager.request(writeAutoCalibration(true), 0x04, 25, 1000)
    this.#restoreAutoCalibration = false
  }

  #zeroVisualSamples(): Record<string, HallStreamSample> {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    return Object.fromEntries(Object.entries(this.#state.samples).map(([keyId, sample]) => [keyId, {
      ...sample,
      distanceMm: 0,
      visualDistanceMm: 0,
      distanceUnits: 0,
      rawAdc: 0,
      pressed: false,
      releaseInferred: false,
      timestampMs: now,
    }]))
  }

  async stop(): Promise<void> {
    if (!this.#state.active && !this.#state.starting) return

    // Reset every visible Hall value immediately so stopping the stream never
    // leaves a stale pressed/travel overlay on the keyboard preview while the
    // transport finishes its final in-flight request/cleanup.
    this.#setState({
      samples: this.#zeroVisualSamples(),
      keyTelemetryHz: {},
      telemetryHz: null,
    })

    ++this.#pollGeneration
    const pollPromise = this.#pollPromise
    this.#pollPromise = null
    if (pollPromise) {
      try { await pollPromise } catch { /* polling errors are surfaced in state */ }
    }
    try {
      if (hero68DeviceManager.connected && this.#state.source !== 'direct-poll'&&!hero68DeviceManager.viaService) {
        this.#stage = 'exit-0x98-await-ack'
        await hero68DeviceManager.request(calibrationDistanceExit(), 0x98, 2, 1000)
      }
    } finally {
      try { await this.#restoreAutoCalibrationIfNeeded() } finally {
        this.#cleanupListeners()
        // A final response during shutdown must not repaint an old value.
        this.#setState({
          active: false,
          starting: false,
          recovering: false,
          samples: this.#zeroVisualSamples(),
          keyTelemetryHz: {},
          telemetryHz: null,
        })
        this.#stage = 'idle'
      }
    }
  }
}

export const hero68HallStream = new Hero68HallStream()

export function useHero68HallStream(): HallStreamState {
  return useSyncExternalStore(hero68HallStream.subscribe, hero68HallStream.getSnapshot, hero68HallStream.getSnapshot)
}
