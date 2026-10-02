/** Keep a brief HTTP interruption from becoming a device disconnect. */
export function serviceHealth(now: () => number = () => performance.now()) {
  let online = false, failures = 0, firstFailure = 0
  return {
    get online() { return online },
    success() { online = true; failures = 0; return online },
    failure(immediate = false) {
      if (!failures++) firstFailure = now()
      if (immediate || !online || failures >= 2 && now() - firstFailure >= 2000) online = false
      return online
    },
  }
}
