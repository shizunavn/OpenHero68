import { useSyncExternalStore } from 'react'
import { registerHero68Protocol, type Hero68Transport } from '../deviceBridge'
import { hexToBytes } from '../hex'
import { buildReport, decodeReport } from './codec'
import { hero68ProtocolEncoder } from './hero68Encoder'
import type { DecodedReport } from './types'
import { rgbService } from '../rgbService'

const HERO68_VENDOR_ID = 0x372e
const HERO68_PRODUCT_ID = 0x103e
const HERO68_USAGE_PAGE = 0xff60
const HERO68_USAGE = 0x0061
const HERO68_REPORT_ID = 0x09

interface HIDReportInfoLike {
  reportId?: number
  items?: Array<{ reportSize?: number; reportCount?: number; usages?: number[] }>
}

interface HIDCollectionInfoLike {
  usagePage?: number
  usage?: number
  type?: number
  inputReports?: HIDReportInfoLike[]
  outputReports?: HIDReportInfoLike[]
  featureReports?: HIDReportInfoLike[]
  children?: HIDCollectionInfoLike[]
}

interface HIDInputReportEventLike {
  data: DataView
  reportId: number
  device?: HIDDeviceLike
}

interface HIDConnectionEventLike {
  device: HIDDeviceLike
}

interface HIDDeviceLike {
  opened: boolean
  vendorId: number
  productId: number
  productName?: string
  collections?: HIDCollectionInfoLike[]
  open(): Promise<void>
  close(): Promise<void>
  sendReport(reportId: number, data: BufferSource): Promise<void>
  addEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void
  removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEventLike) => void): void
}

interface NavigatorHIDLike {
  getDevices(): Promise<HIDDeviceLike[]>
  requestDevice(options: {
    filters: Array<{ vendorId: number; productId: number; usagePage?: number; usage?: number }>
  }): Promise<HIDDeviceLike[]>
  addEventListener?(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEventLike) => void): void
  removeEventListener?(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEventLike) => void): void
}

type ReportWaiter = {
  expectedCommand: number
  expectedZone?: number
  predicate?: (report: DecodedReport) => boolean
  resolve: (report: DecodedReport) => void
  reject: (error: Error) => void
  timer: number
}

export type Hero68ConnectionState = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error'

export type Hero68DeviceSnapshot = {
  state: Hero68ConnectionState
  deviceName: string
  error: string | null
}

export type Hero68RawInputReport = {
  reportId: number
  data: Uint8Array
  timestampMs: number
}

export type Hero68HidCollectionDiagnostic = {
  path: string
  usagePage: number | null
  usage: number | null
  type: number | null
  inputReportIds: number[]
  outputReportIds: number[]
  featureReportIds: number[]
}

function getHid(): NavigatorHIDLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { hid?: NavigatorHIDLike }).hid
}

function collectionMatches(collection: HIDCollectionInfoLike): boolean {
  if (collection.usagePage === HERO68_USAGE_PAGE && collection.usage === HERO68_USAGE) return true
  return collection.children?.some(collectionMatches) ?? false
}

function isHero68ControlDevice(device: HIDDeviceLike): boolean {
  if (device.vendorId !== HERO68_VENDOR_ID || device.productId !== HERO68_PRODUCT_ID) return false
  if (!device.collections?.length) return true
  return device.collections.some(collectionMatches)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class Hero68DeviceManager implements Hero68Transport {
  #device: HIDDeviceLike | undefined
  #snapshot: Hero68DeviceSnapshot = {
    state: getHid() ? 'disconnected' : 'unsupported',
    deviceName: 'AULA Hero68',
    error: null,
  }
  #subscribers = new Set<() => void>()
  #reportListeners = new Set<(report: DecodedReport) => void>()
  #rawReportListeners = new Set<(report: Hero68RawInputReport) => void>()
  #waiters = new Set<ReportWaiter>()
  #viaService = false
  get viaService() { return this.#viaService }

  constructor() {
    getHid()?.addEventListener?.('disconnect', this.#onHidDisconnect)
  }

  get connected(): boolean {
    return this.#snapshot.state === 'connected' && (this.#viaService || Boolean(this.#device?.opened))
  }

  getSnapshot = (): Hero68DeviceSnapshot => this.#snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(listener)
    return () => {
      this.#subscribers.delete(listener)
    }
  }

  #setSnapshot(next: Partial<Hero68DeviceSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...next }
    this.#subscribers.forEach((listener) => listener())
  }

  async connect(requestPermission = true): Promise<void> {
    if(this.connected)return
    if(typeof location!=='undefined'&&location.protocol.startsWith('http')){
      const service=await rgbService.status().catch(()=>null)
      if(service?.enabled&&(service.apiVersion??0)>=2){await this.connectViaService();return}
    }
    const hid = getHid()
    if (!hid) {
      this.#setSnapshot({ state: 'unsupported', error: 'WebHID is not available in this browser.' })
      throw new Error('WebHID is not available in this browser')
    }
    if (this.connected) return

    this.#setSnapshot({ state: 'connecting', error: null })
    try {
      let devices = (await hid.getDevices()).filter(isHero68ControlDevice)
      if (devices.length === 0 && requestPermission) {
        const requested = await hid.requestDevice({
          // Official AULA HUB asks by VID/PID only. Do the same so Chromium
          // grants the whole vendor HID interface, including its second vendor
          // top-level collection (Windows exposes MI_02 Col01 + Col02).
          filters: [{
            vendorId: HERO68_VENDOR_ID,
            productId: HERO68_PRODUCT_ID,
          }],
        })
        devices = requested.filter(isHero68ControlDevice)
      }

      if (devices.length !== 1) {
        throw new Error(`Expected one authorized HERO68 control interface, found ${devices.length}.`)
      }

      const device = devices[0]
      // Transfer ownership after the chooser to preserve browser user activation.
      if(typeof location!=='undefined'&&location.protocol.startsWith('http')){
        const service=await rgbService.status().catch(()=>null)
        if(service?.enabled)await rgbService.stop()
      }
      if (!device.opened) await device.open()
      device.addEventListener('inputreport', this.#onInputReport)
      this.#device = device
      this.#setSnapshot({
        state: 'connected',
        deviceName: device.productName || 'AULA Hero68',
        error: null,
      })
    } catch (error) {
      this.#device = undefined
      this.#setSnapshot({ state: 'error', error: errorMessage(error) })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.#viaService=false
    const device = this.#device
    this.#device = undefined
    this.#rejectWaiters(new Error('HERO68 disconnected'))
    if (device) {
      device.removeEventListener('inputreport', this.#onInputReport)
      if (device.opened) await device.close()
    }
    this.#setSnapshot({ state: getHid() ? 'disconnected' : 'unsupported', error: null })
  }

  /** Keep the same configuration transport while the service owns the HID handle. */
  async connectViaService():Promise<void> {
    const device=this.#device
    if(device){device.removeEventListener('inputreport',this.#onInputReport);if(device.opened)await device.close();this.#device=undefined}
    try {
      // An identity read verifies that the native helper can access this keyboard.
      await rgbService.deviceRequest(buildReport({command:0x82,zone:1}))
      this.#viaService=true;this.#setSnapshot({state:'connected',deviceName:'AULA Hero68',error:null})
    }catch(error){this.#viaService=false;this.#setSnapshot({state:'error',error:errorMessage(error)});throw error}
  }

  onReport(listener: (report: DecodedReport) => void): () => void {
    this.#reportListeners.add(listener)
    return () => {
      this.#reportListeners.delete(listener)
    }
  }

  /** Listen to every input report on the opened HERO68 WebHID interface.
   * This is intentionally pre-decoder and includes secondary vendor report IDs.
   * The passive Hall probe uses it without sending any stream/calibration command.
   */
  onRawReport(listener: (report: Hero68RawInputReport) => void): () => void {
    this.#rawReportListeners.add(listener)
    return () => {
      this.#rawReportListeners.delete(listener)
    }
  }

  getCollectionDiagnostics(): Hero68HidCollectionDiagnostic[] {
    const result: Hero68HidCollectionDiagnostic[] = []
    const visit = (collection: HIDCollectionInfoLike, path: string) => {
      result.push({
        path,
        usagePage: collection.usagePage ?? null,
        usage: collection.usage ?? null,
        type: collection.type ?? null,
        inputReportIds: (collection.inputReports ?? []).map((report) => Number(report.reportId ?? 0)),
        outputReportIds: (collection.outputReports ?? []).map((report) => Number(report.reportId ?? 0)),
        featureReportIds: (collection.featureReports ?? []).map((report) => Number(report.reportId ?? 0)),
      })
      ;(collection.children ?? []).forEach((child, index) => visit(child, `${path}.${index + 1}`))
    }
    ;(this.#device?.collections ?? []).forEach((collection, index) => visit(collection, `C${index + 1}`))
    return result
  }

  async send(report: Uint8Array): Promise<void> {
    if(this.#viaService){await rgbService.deviceRequest(report);return}
    const device = this.#device
    if (!device?.opened) throw new Error('HERO68 is not connected')
    if (report.length !== 64 || report[0] !== HERO68_REPORT_ID) {
      throw new Error('Expected a complete 64-byte HERO68 report with report ID 0x09')
    }
    await device.sendReport(HERO68_REPORT_ID, report.slice(1))
  }

  /**
   * Send a command that intentionally makes HERO68 re-enumerate (polling-rate
   * writes on firmware 0323 do this). There is no reliable normal ACK: the old
   * HID handle disappears first. Wait for the authorized control interface to
   * come back, reopen it, and leave the manager connected to the fresh handle.
   */
  async sendReenumerating(report: Uint8Array, timeoutMs = 7000): Promise<void> {
    if(this.#viaService){await rgbService.deviceRequest(report,true);return}
    const hid = getHid()
    const previous = this.#device
    if (!hid || !previous?.opened || !this.connected) throw new Error('HERO68 is not connected')

    let sendError: unknown = null
    try {
      await this.send(report)
    } catch (error) {
      // A write can race the USB reset. Verification after re-enumeration is
      // authoritative, so retain the error but still try to recover the device.
      sendError = error
    }

    this.#setSnapshot({ state: 'connecting', error: null })
    const deadline = performance.now() + Math.max(500, timeoutMs)
    let sawTransition = this.#device !== previous || !previous.opened

    while (performance.now() < deadline) {
      const devices = (await hid.getDevices()).filter(isHero68ControlDevice)
      const previousStillListed = devices.includes(previous)
      if (!previousStillListed || !previous.opened || this.#device !== previous) sawTransition = true

      if (sawTransition && devices.length > 0) {
        const candidate = devices[0]
        try {
          previous.removeEventListener('inputreport', this.#onInputReport)
          if (!candidate.opened) await candidate.open()
          candidate.removeEventListener('inputreport', this.#onInputReport)
          candidate.addEventListener('inputreport', this.#onInputReport)
          this.#device = candidate
          this.#setSnapshot({
            state: 'connected',
            deviceName: candidate.productName || 'AULA Hero68',
            error: null,
          })
          return
        } catch {
          // The interface can be visible a moment before Windows finishes
          // reopening it. Keep polling until the timeout.
        }
      }

      await new Promise((resolve) => window.setTimeout(resolve, 120))
    }

    // Some firmware/host combinations may apply the setting without a visible
    // re-enumeration. Preserve a still-live handle in that case.
    if (this.#device?.opened) {
      this.#setSnapshot({ state: 'connected', error: null })
      return
    }

    const detail = sendError instanceof Error ? ` (${sendError.message})` : ''
    this.#setSnapshot({ state: 'error', error: `HERO68 did not return after USB re-enumeration${detail}` })
    throw new Error(`HERO68 did not return after USB re-enumeration${detail}`)
  }

  async sendHex(hex: string): Promise<void> {
    const report = hexToBytes(hex)
    const decoded = decodeReport(report)

    // The official HERO68 driver retries RT / safe-area / switch-type writes
    // up to three times with ~100 ms spacing. These commands are the ones most
    // likely to be dropped while the firmware is busy applying a batch.
    const maxAttempts = [0x19, 0x16, 0x15].includes(decoded.command) ? 3 : 1
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.request(report, decoded.command, decoded.zone, 1000)
        return
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 100))
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async request(
    report: Uint8Array,
    expectedCommand: number,
    expectedZone?: number,
    timeoutMs = 800,
    predicate?: (report: DecodedReport) => boolean,
  ): Promise<DecodedReport> {
    if (!this.connected) throw new Error('HERO68 is not connected')
    if(this.#viaService){
      const reply=await rgbService.deviceRequest(report)
      if(reply.command!==expectedCommand||(expectedZone!==undefined&&reply.zone!==expectedZone)||(predicate&&!predicate(reply)))throw Error('Unexpected service configuration reply')
      this.#reportListeners.forEach(listener=>listener(reply))
      return reply
    }

    return new Promise<DecodedReport>((resolve, reject) => {
      const waiter: ReportWaiter = {
        expectedCommand,
        expectedZone,
        predicate,
        resolve,
        reject,
        timer: window.setTimeout(() => {
          this.#waiters.delete(waiter)
          const zoneText = expectedZone === undefined ? '' : `, zone=0x${expectedZone.toString(16).padStart(2, '0')}`
          reject(new Error(`HERO68 read timed out (command=0x${expectedCommand.toString(16).padStart(2, '0')}${zoneText})`))
        }, Math.max(0, timeoutMs)),
      }
      this.#waiters.add(waiter)

      void this.send(report).catch((error) => {
        window.clearTimeout(waiter.timer)
        this.#waiters.delete(waiter)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  #rejectWaiters(error: Error) {
    for (const waiter of this.#waiters) {
      window.clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    this.#waiters.clear()
  }

  #onInputReport = (event: HIDInputReportEventLike): void => {
    const payload = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
    const raw: Hero68RawInputReport = {
      reportId: event.reportId,
      data: payload.slice(),
      timestampMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    }
    this.#rawReportListeners.forEach((listener) => listener(raw))

    if (event.reportId !== HERO68_REPORT_ID) return
    try {
      const report = decodeReport(payload)
      if (!report.checksumValid) return

      for (const waiter of this.#waiters) {
        if (report.command !== waiter.expectedCommand) continue
        if (waiter.expectedZone !== undefined && report.zone !== waiter.expectedZone) continue
        if (waiter.predicate && !waiter.predicate(report)) continue
        window.clearTimeout(waiter.timer)
        this.#waiters.delete(waiter)
        waiter.resolve(report)
        break
      }

      this.#reportListeners.forEach((listener) => listener(report))
    } catch (error) {
      this.#setSnapshot({ error: errorMessage(error) })
    }
  }

  #onHidDisconnect = (event: HIDConnectionEventLike): void => {
    if (!this.#device) return
    if (event.device !== this.#device) return
    this.#device.removeEventListener('inputreport', this.#onInputReport)
    this.#device = undefined
    this.#rejectWaiters(new Error('HERO68 disconnected'))
    this.#setSnapshot({ state: 'disconnected', error: 'HERO68 was disconnected.' })
  }
}

export const hero68DeviceManager = new Hero68DeviceManager()
registerHero68Protocol(hero68ProtocolEncoder, hero68DeviceManager)

export function useHero68Device(): Hero68DeviceSnapshot {
  return useSyncExternalStore(
    hero68DeviceManager.subscribe,
    hero68DeviceManager.getSnapshot,
    hero68DeviceManager.getSnapshot,
  )
}
