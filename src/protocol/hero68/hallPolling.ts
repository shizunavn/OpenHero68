/** Read-only Hall snapshots can be retried safely; configuration writes cannot. */
export async function runHallPolling({ positions, isActive, requestBatch, delay, recover, onRecovering, now = () => performance.now(), maxOutageMs = 15000 }: {
  positions: readonly number[]
  isActive: () => boolean
  requestBatch: (positions: readonly number[]) => Promise<unknown>
  delay: (milliseconds: number) => Promise<void>
  recover?: () => Promise<void>
  onRecovering?: (recovering: boolean) => void
  now?: () => number
  maxOutageMs?: number
}): Promise<void> {
  let batchSize = 9
  let outageStarted: number | null = null
  let recoveryAttempted = false
  let backoffMs = 250
  while (isActive()) {
    let offset = 0
    while (offset < positions.length && isActive()) {
      const batch = positions.slice(offset, offset + batchSize)
      let completed = false
      for (let attempt = 0; attempt < 2 && isActive(); attempt++) {
        try {
          await requestBatch(batch)
          completed = true
          if (outageStarted !== null) onRecovering?.(false)
          outageStarted = null
          recoveryAttempted = false
          backoffMs = 250
          break
        } catch (error) {
          if (!isActive()) return
          const message = error instanceof Error ? error.message : String(error)
          if (!/timed out|timeout/i.test(message)) throw error
          if (outageStarted === null) {
            outageStarted = now()
            onRecovering?.(true)
          }
          if (now() - outageStarted >= maxOutageMs) throw error
          if (attempt === 0) await delay(80)
          else if (batch.length === 1 && recover && !recoveryAttempted) {
            // A stalled Windows HID handle needs reopening, not a firmware
            // reset or calibration command. Do this only once per outage.
            recoveryAttempted = true
            try { await recover() } catch (recoveryError) {
              if (!isActive()) return
              const detail = recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
              if (!/timed out|timeout/i.test(detail)) throw recoveryError
            }
          }
        }
      }
      if (!isActive()) return
      if (completed) offset += batch.length
      else batchSize = Math.max(1, Math.floor(batch.length / 2))
      // Cap normal traffic at 125 requests/s. A sustained outage backs off
      // instead of flooding a busy firmware or stopping after two lost replies.
      if (!completed && batch.length === 1) {
        await delay(backoffMs)
        backoffMs = Math.min(2000, backoffMs * 2)
      } else await delay(completed ? 8 : 80)
    }
  }
}
