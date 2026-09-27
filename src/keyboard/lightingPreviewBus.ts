export type LightingFrame = Record<string, string>
export type LightingFrameListener = (frame: LightingFrame) => void

const listeners = new Set<LightingFrameListener>()

/**
 * Tiny UI/backend boundary for the keyboard RGB preview.
 *
 * Later, the protocol layer only needs to call:
 *   publishLightingFrame({ KeyW: '#00d8ff', KeyA: '#ff00aa', ... })
 * whenever it receives the current per-key RGB state from the Hero68.
 * The preview does not need to know anything about HID packets.
 */
export function publishLightingFrame(frame: LightingFrame) {
  listeners.forEach((listener) => listener(frame))
}

export function subscribeLightingFrame(listener: LightingFrameListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
