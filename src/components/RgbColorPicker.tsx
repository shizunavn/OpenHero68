import { useLayoutEffect, useRef } from 'react'

/** Let the native picker own its value while dragging; publish at most every 80ms. */
export default function RgbColorPicker({ value, onChange, disabled, label }: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  label: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const initialColor = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  const emitted = useRef(value)
  const callback = useRef(onChange)
  callback.current = onChange

  function flush() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next === null || next === emitted.current) return
    emitted.current = next
    callback.current(next)
  }

  function stage(next: string) {
    if (next === emitted.current && pending.current === null) return
    pending.current = next
    if (timer.current === null) timer.current = setTimeout(flush, 80)
  }

  useLayoutEffect(() => {
    // Parent echoes of a published color must not rewind a newer native drag value.
    if (value === emitted.current) return
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    emitted.current = value
    if (input.current) input.current.value = value
  }, [value])

  useLayoutEffect(() => {
    const node = input.current
    // Native change fires when the picker commits; React onChange also receives
    // live input events, so it cannot serve as the final flush on its own.
    const commit = () => { if (node) pending.current = node.value; flush() }
    const outside = (event: PointerEvent) => {
      if (event.target !== node) flush()
    }
    node?.addEventListener('change', commit)
    document.addEventListener('pointerdown', outside, true)
    return () => {
      node?.removeEventListener('change', commit)
      document.removeEventListener('pointerdown', outside, true)
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  return <input ref={input} type="color" aria-label={label} defaultValue={initialColor.current} disabled={disabled}
    onInput={event => stage(event.currentTarget.value)}
    onChange={event => stage(event.currentTarget.value)} onBlur={flush} />
}
