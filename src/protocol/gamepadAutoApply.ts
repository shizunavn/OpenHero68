import type { GamepadConfiguration } from '../keyboard/gamepad'

export type GamepadSaveState = 'saved' | 'pending' | 'saving' | 'error'
type Result = { configuration: GamepadConfiguration }

/** One in-flight write and one latest draft. Start/Stop use the same lane. */
export class GamepadAutoApply<R extends Result> {
  private latest: GamepadConfiguration | null = null
  private applied = ''
  private flight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private available = false
  private command = false
  private commands = 0
  private operation: Promise<unknown> = Promise.resolve()
  private disposed = false
  private failed = false
  constructor(
    private write: (configuration: GamepadConfiguration) => Promise<R>,
    private result: (value: R) => void,
    private state: (phase: GamepadSaveState, error?: unknown) => void,
    private delay = 180,
  ) {}
  setAvailable(available: boolean) {
    const reconnecting = available && !this.available
    this.available = available
    clearTimeout(this.timer)
    if (reconnecting) this.failed = false
    if (available) this.schedule()
  }
  update(configuration: GamepadConfiguration, remote?: GamepadConfiguration) {
    if (this.disposed) return
    this.latest = structuredClone(configuration)
    if (!this.flight && remote && JSON.stringify(remote) === JSON.stringify(configuration))
      this.applied = JSON.stringify(remote)
    this.failed = false
    clearTimeout(this.timer)
    this.schedule()
  }
  private schedule() {
    if (this.disposed || !this.latest) return
    if (JSON.stringify(this.latest) === this.applied && !this.flight) {
      this.latest = null
      this.state('saved')
      return
    }
    if (this.failed) return
    this.state(this.flight ? 'saving' : 'pending')
    if (this.available && !this.command && !this.flight)
      this.timer = setTimeout(() => void this.flush(), this.delay)
  }
  private async flush() {
    if (this.disposed || !this.available || this.command || this.flight || !this.latest) return
    const draft = this.latest
    this.latest = null
    this.state('saving')
    this.flight = (async () => {
      try {
        const value = await this.write(draft)
        this.applied = JSON.stringify(draft)
        if (!this.disposed) this.result(value)
      } catch (error) {
        const newerDraft = this.latest && JSON.stringify(this.latest) !== JSON.stringify(draft)
        this.latest ??= draft
        this.failed = !newerDraft
        if (!this.disposed && this.failed) this.state('error', error)
      }
    })()
    await this.flight
    this.flight = null
    if (!this.failed) {
      if (this.latest) this.schedule()
      else if (!this.disposed) this.state('saved')
    }
  }
  run(operation: () => Promise<R>): Promise<R> {
    clearTimeout(this.timer)
    this.command = true
    this.commands++
    const next = this.operation.catch(() => {}).then(async () => {
      await this.flight
      const value = await operation()
      this.applied = JSON.stringify(value.configuration)
      this.failed = false
      if (!this.disposed) this.result(value)
      return value
    })
    this.operation = next.finally(() => {
      this.commands--
      this.command = this.commands > 0
      if (!this.command && !this.failed) this.schedule()
    })
    // Keep the lane reusable when a command fails; return the original failure.
    void this.operation.catch(() => {})
    return next
  }
  dispose() {
    this.disposed = true
    this.available = false
    clearTimeout(this.timer)
    this.latest = null
  }
}
