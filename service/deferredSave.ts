/** Playback changes are immediate; persistence coalesces until editing settles. */
export function deferredSave(save: () => void, onError: (error: unknown) => void, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => { clearTimeout(timer); timer = undefined }
  return {
    schedule() { cancel(); timer = setTimeout(() => { timer = undefined; try { save() } catch (error) { onError(error) } }, delay) },
    cancel,
    flush() { if (!timer) return; cancel(); save() },
  }
}
