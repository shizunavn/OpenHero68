import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import './FeatureHelp.css'
import { useI18n } from '../i18n'

type FeatureHelpProps = {
  title: string
  paragraphs: readonly string[]
  icon?: ReactNode
  triggerClassName?: string
  triggerLabel?: string
  onActivate?: () => void
  pinOnClick?: boolean
  disabled?: boolean
}

export default function FeatureHelp({ title, paragraphs, icon, triggerClassName, triggerLabel, onActivate, pinOnClick = true, disabled }: FeatureHelpProps) {
  const { tr } = useI18n()
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinned = useRef(false)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 12, top: 12, above: false })

  function cancelClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  function show() {
    cancelClose()
    setOpen(true)
  }

  function dismiss() {
    cancelClose()
    pinned.current = false
    setOpen(false)
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && (!pinOnClick || document.activeElement !== trigger.current)) setOpen(false)
    }, 60)
  }

  useEffect(() => () => cancelClose(), [])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      if (!trigger.current || !panel.current) return
      const anchor = trigger.current.getBoundingClientRect()
      const box = panel.current.getBoundingClientRect()
      const above = anchor.bottom + box.height + 20 > window.innerHeight && anchor.top > box.height + 20
      setPosition({
        left: Math.max(12, Math.min(anchor.left - 12, window.innerWidth - box.width - 12)),
        top: Math.max(12, Math.min(above ? anchor.top - box.height - 10 : anchor.bottom + 10, window.innerHeight - box.height - 12)),
        above,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    if (panel.current) observer.observe(panel.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    const onOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) dismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onOutside)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside)
    }
  }, [open])

  return <>
    <button
      ref={trigger}
      type="button"
      disabled={disabled}
      className={`${triggerClassName ?? 'feature-help-trigger'} ${open ? 'is-open' : ''}`}
      aria-label={triggerLabel ? tr(triggerLabel) : tr('About {title}', { title: tr(title) })}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={scheduleClose}
      onFocus={show}
      onBlur={() => { if (!pinned.current) scheduleClose() }}
      onClick={() => {
        onActivate?.()
        if (!pinOnClick) return
        if (pinned.current) dismiss()
        else { pinned.current = true; show() }
      }}
    >{icon ?? <CircleHelp size={16} aria-hidden="true" />}</button>
    {createPortal(<div
      ref={panel}
      id={id}
      role="tooltip"
      aria-hidden={!open}
      className={`feature-help-panel ${paragraphs.length ? '' : 'is-compact'} ${open ? 'is-open' : ''} ${position.above ? 'is-above' : ''}`}
      style={{ left: position.left, top: position.top }}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <strong>{tr(title)}</strong>
      {paragraphs.map(paragraph => <p key={paragraph}>{tr(paragraph)}</p>)}
    </div>, document.body)}
  </>
}
