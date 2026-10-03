import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import './AppSelect.css'

export type SelectOption<T extends string | number> = { value: T; label: string; disabled?: boolean }

export function AppSelect<T extends string | number>({ value, options, onChange, label, disabled = false, className = '' }: {
  value: T
  options: readonly SelectOption<T>[]
  onChange: (value: T) => void
  label: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties>({})
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLDivElement | null)[]>([])
  const search = useRef({ text: '', time: 0 })
  const id = useId()
  const selected = options.find(option => option.value === value)
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0)
  const canOpen = !disabled && enabled.length > 0

  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  const choose = (index: number) => {
    if (!disabled && !options[index].disabled) { onChange(options[index].value); close(true) }
  }

  useLayoutEffect(() => {
    if (!open || !canOpen) return
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const style = getComputedStyle(root.current!)
      const width = Math.min(rect.width, window.innerWidth - 16)
      // Measure wrapped labels at their final width before choosing a direction.
      menu.current!.style.width = `${width}px`
      const below = window.innerHeight - rect.bottom - 14
      const above = rect.top - 14
      const flip = below < Math.min(260, menu.current!.scrollHeight) && above > below
      const maxHeight = Math.max(40, Math.min(300, flip ? above : below))
      menu.current!.style.maxHeight = `${maxHeight}px`
      const height = Math.min(maxHeight, menu.current!.scrollHeight + 2)
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: flip ? rect.top - height - 6 : rect.bottom + 6,
        width, maxHeight,
        '--select-accent': style.getPropertyValue('--select-accent').trim() || '#ffd45c',
        '--select-soft': style.getPropertyValue('--select-soft').trim() || 'rgba(255, 212, 92, .13)',
        fontSize: getComputedStyle(trigger.current!).fontSize,
      } as CSSProperties)
    }
    place()
    const selectedIndex = options.findIndex(option => option.value === value && !option.disabled)
    const initial = items.current[selectedIndex < 0 ? enabled[0] : selectedIndex]
    initial?.focus({ preventScroll: true })
    if (initial) menu.current!.scrollTop = Math.max(0, initial.offsetTop - menu.current!.clientHeight / 2)
    const contains = (target: EventTarget | null) => target instanceof Node && (root.current?.contains(target) || menu.current?.contains(target))
    const outside = (event: Event) => { if (!contains(event.target)) close() }
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) place() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', scroll, true)
    }
    // Focus once when opening; parent rerenders must preserve keyboard navigation.
  }, [open, canOpen])

  const navigate = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const key = event.key
    if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    else if (key === 'Tab') {
      // Put focus back into document order before the browser advances it.
      trigger.current?.focus()
      close()
    } else if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(index) }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault()
      const current = enabled.indexOf(index)
      const next = key === 'Home' ? enabled[0] : key === 'End' ? enabled.at(-1)!
        : enabled[(current + (key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]
      items.current[next]?.focus()
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now()
      search.current.text = now - search.current.time > 700 ? key.toLocaleLowerCase() : search.current.text + key.toLocaleLowerCase()
      search.current.time = now
      const text = search.current.text
      const prefix = [...text].every(char => char === text[0]) ? text[0] : text
      const start = enabled.indexOf(index)
      for (let offset = 1; offset <= enabled.length; offset++) {
        const next = enabled[(start + offset) % enabled.length]
        if (options[next].label.toLocaleLowerCase().startsWith(prefix)) { items.current[next]?.focus(); break }
      }
    }
  }

  return <div className={`app-select ${className}`} ref={root}>
    <button type="button" className="app-select-trigger" ref={trigger} disabled={disabled}
      aria-label={`${label}: ${selected?.label ?? value}`} aria-haspopup="listbox"
      aria-expanded={open && canOpen} aria-controls={open && canOpen ? id : undefined}
      title={selected?.label} onClick={() => { if (canOpen) { search.current.text = ''; setOpen(!open) } }}
      onKeyDown={event => {
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && canOpen) { event.preventDefault(); search.current.text = ''; setOpen(true) }
        else if (event.key === 'Escape') close()
      }}>
      <span>{selected?.label ?? value}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && canOpen && createPortal(<div className="app-select-menu" ref={menu} style={position}
      id={id} role="listbox" aria-label={label}>
      {options.map((option, index) => <div key={option.value} ref={element => { items.current[index] = element }}
        role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} tabIndex={-1}
        className={`app-select-option${option.value === value ? ' is-selected' : ''}`}
        onClick={() => choose(index)} onKeyDown={event => navigate(event, index)}>
        <span>{option.label}</span>{option.value === value && <Check size={16} aria-hidden="true" />}
      </div>)}
    </div>, document.body)}
  </div>
}
