import { useSyncExternalStore } from 'react'

type AccessState = { permission: PermissionState | 'unknown'; requesting: boolean; prompted: boolean }
type PermissionQuery = () => Promise<PermissionStatus | null>

export class LocalServicePermissionError extends Error {
  constructor() { super('Browser permission blocked. Open the site permissions beside the address bar and allow access to apps on this device.'); this.name = 'LocalServicePermissionError' }
}

async function queryPermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions || typeof location === 'undefined' || location.protocol !== 'https:') return null
  const chromium = navigator.userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)
  const edge = navigator.userAgent.match(/Edg\/(\d+)/)
  // Older Chromium versions do not implement this permission.
  if (edge ? Number(edge[1]) < 143 : chromium && Number(chromium[1]) < 142) return null
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) return null
  for (const name of ['loopback-network', 'local-network-access']) {
    try { return await navigator.permissions.query({ name: name as PermissionName }) } catch { /* Try the name used by earlier browsers. */ }
  }
  return null
}

export function createLocalServiceAccess(query: PermissionQuery = queryPermission, send: typeof fetch = (...args) => fetch(...args), permissionTimeoutMs = 90_000) {
  let state: AccessState = { permission: 'unknown', requesting: false, prompted: false }
  let requests = 0, responded = false, permission: Promise<PermissionStatus | null> | undefined
  const listeners = new Set<() => void>()
  function publish(next: Partial<AccessState>) {
    state = { ...state, ...next }
    listeners.forEach(listener => listener())
  }
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  function initialize() {
    return permission ??= query().catch(() => null).then(result => {
      if (result) {
        const changed = () => {
          if (result.state === 'denied') responded = false
          publish({ permission: result.state, ...(result.state === 'granted' ? { prompted: false } : {}) })
        }
        result.addEventListener('change', changed)
        changed()
      }
      return result
    })
  }
  async function request(url: string, options: RequestInit = {}, timeoutMs = 1000) {
    await initialize()
    if (state.permission === 'denied') { publish({ prompted: true }); throw new LocalServicePermissionError() }
    requests++
    publish({ requesting: true, prompted: state.prompted || (state.permission === 'prompt' && !responded) })
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    let lastPermission: AccessState['permission'] = state.permission
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(new DOMException('Background service request timed out.', 'TimeoutError')), state.permission === 'prompt' && !responded ? permissionTimeoutMs : timeoutMs)
    }
    const stopWatching = subscribe(() => {
      if (state.permission === lastPermission) return
      lastPermission = state.permission
      if (state.permission === 'denied') controller.abort(new LocalServicePermissionError())
      else arm()
    })
    arm()
    try {
      const response = await send(url, { ...options, signal: controller.signal })
      // A response also confirms access when a browser reports "prompt" with LNA disabled.
      responded = true
      if (state.prompted) publish({ prompted: false })
      return response
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason
      throw error
    } finally {
      clearTimeout(timer!)
      stopWatching()
      requests--
      publish({ requesting: requests > 0 })
    }
  }
  return { request, subscribe, getSnapshot: () => state }
}

const access = createLocalServiceAccess()
export const fetchLocalService = access.request
export function useLocalServiceAccess() { return useSyncExternalStore(access.subscribe, access.getSnapshot, access.getSnapshot) }
