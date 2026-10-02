import { HERO68_KEY_IDS } from './hero68Layout'

/** Typing after choosing an effect should still animate its local preview. */
export function acceptsRgbPreviewKey(event: KeyboardEvent) {
  if (event.repeat || !HERO68_KEY_IDS.includes(event.code)) return false
  const target = event.target as HTMLElement | null
  if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable=false])')) return false
  // Preserve keyboard navigation and activation on focused controls.
  if (target?.closest('button,a') && /^(Enter|Space|Tab|Escape|Arrow)/.test(event.code)) return false
  return !event.ctrlKey && !event.metaKey
}
