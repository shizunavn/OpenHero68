import { restoreCustomRgb } from '../keyboard/customRgbModel'
import { HERO68_KEY_IDS } from '../keyboard/hero68Layout'
import type { RgbProfile } from './hero68/rgb'
import type { RgbServiceStatus } from './rgbService'

export function customSignature(profile: RgbProfile) {
  const custom = restoreCustomRgb(profile.custom, profile)
  return JSON.stringify({ custom: { ...custom, enabled: true }, colors: HERO68_KEY_IDS.map(id => profile.colors[id]) })
}
export function mergeRunningCustom(draft: RgbProfile, remote: RgbProfile): RgbProfile {
  return { ...draft, custom: restoreCustomRgb(remote.custom, remote), colors: structuredClone(remote.colors) }
}
export type CustomSessionState = { session: string | null; syncing: boolean; conflict: boolean; error: string | null }

/** A running service owns the baseline. Navigation only joins; user edits write. */
export class CustomRgbSession {
  private session: string | null = null
  private revision = -1
  private acknowledged = ''
  private pending: RgbProfile | null = null
  private flight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private lastSent = -Infinity
  private remote: RgbServiceStatus | null = null
  private blocked = false
  private suspended = false
  private closed = false
  private joining = false
  constructor(private options: {
    draft: () => RgbProfile
    adopt: (profile: RgbProfile) => void
    backup: (profile: RgbProfile) => void
    write: (profile: RgbProfile, session: string, revision: number) => Promise<RgbServiceStatus>
    status: (status: RgbServiceStatus) => void
    state: (state: CustomSessionState) => void
    refresh: () => void
    interval?: number
  }) {}
  private emit(error: string | null = null) {
    if (!this.closed) this.options.state({ session: this.session, syncing: !!(this.pending || this.flight), conflict: this.blocked, error })
  }
  observe(status: RgbServiceStatus | null) {
    this.remote = status
    if (this.closed || this.suspended) return
    if (!status?.enabled || status.mode !== 'custom' || !status.sessionId || !status.customConfiguration || status.customRevision === undefined) {
      if (this.session) this.detach()
      return
    }
    if (this.session !== status.sessionId) {
      this.detach(); this.blocked = false; this.adopt(status)
    } else if (!this.blocked && !this.pending && !this.flight && (status.customRevision > this.revision || this.joining && status.customRevision === this.revision)) this.adopt(status)
  }
  join(status: RgbServiceStatus | null) { this.joining = true; this.observe(status) }
  private adopt(status: RgbServiceStatus) {
    const remote = status.customConfiguration!
    const draft = this.options.draft()
    const signature = customSignature(remote)
    if (customSignature(draft) !== signature) this.options.backup(structuredClone(draft))
    this.session = status.sessionId!
    this.revision = status.customRevision!
    this.acknowledged = signature
    this.joining = false
    this.options.adopt(mergeRunningCustom(draft, remote))
    this.emit()
  }
  stage(profile: RgbProfile) {
    if (this.closed || this.suspended || this.blocked || !this.session) return
    if (!this.flight && customSignature(profile) === this.acknowledged) { this.pending = null; clearTimeout(this.timer); this.timer = undefined; this.emit(); return }
    this.pending = structuredClone(profile)
    this.emit(); this.pump()
  }
  private pump() {
    if (this.closed || this.suspended || this.blocked || this.flight || this.timer || !this.pending || !this.session) return
    const wait = (this.options.interval ?? 40) - (performance.now() - this.lastSent)
    if (wait > 0) { this.timer = setTimeout(() => { this.timer = undefined; this.pump() }, wait); return }
    const draft = this.pending, session = this.session, revision = this.revision, token = this.generation
    this.pending = null; this.lastSent = performance.now()
    this.flight = Promise.resolve().then(async () => {
      try {
        if (this.closed || token !== this.generation) return
        const result = await this.options.write({ ...draft, custom: { ...restoreCustomRgb(draft.custom, draft), enabled: true } }, session, revision)
        if (this.closed || token !== this.generation) return
        this.revision = result.customRevision ?? revision
        this.acknowledged = customSignature(draft)
        this.options.status(result)
      } catch (error) {
        if (this.closed || token !== this.generation) return
        this.options.backup(structuredClone(this.options.draft()))
        this.pending = null; this.blocked = true
        this.emit(error instanceof Error ? error.message : String(error))
        this.options.refresh()
      }
    }).finally(() => {
      this.flight = null
      if (this.closed || token !== this.generation) { this.pump(); return }
      if (!this.blocked) { this.emit(); this.pump(); if (!this.pending && !this.flight) this.observe(this.remote) }
    })
    this.emit()
  }
  resolve(profile: RgbProfile) {
    const remote = this.remote
    if (!remote?.enabled || remote.mode !== 'custom' || remote.sessionId !== this.session || remote.customRevision === undefined) return
    this.revision = remote.customRevision; this.blocked = false
    this.stage(profile)
  }
  async pause() { this.detach(); await this.flight }
  setSuspended(value: boolean) {
    this.suspended = value
    if (value) this.detach()
    else this.observe(this.remote)
  }
  private detach() {
    this.generation++; this.pending = null; clearTimeout(this.timer); this.timer = undefined
    this.session = null; this.revision = -1; this.acknowledged = ''; this.emit()
  }
  dispose() { this.closed = true; this.detach() }
}
