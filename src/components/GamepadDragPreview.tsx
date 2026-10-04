import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { GamepadAction } from '../keyboard/gamepad'
import GamepadControlIcon from './GamepadControlIcon'

export default function GamepadDragPreview({ action, x, y, label, removing = false }: { action: GamepadAction; x: number; y: number; label: string; removing?: boolean }) {
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0, left = x, top = y
    const paint = () => {
      frame = 0
      if (element.current) element.current.style.transform = `translate3d(${left + 16}px,${top + 16}px,0)`
    }
    const move = (event: DragEvent) => {
      left = event.clientX; top = event.clientY
      if (!frame) frame = requestAnimationFrame(paint)
    }
    paint()
    document.addEventListener('dragover', move)
    return () => { document.removeEventListener('dragover', move); cancelAnimationFrame(frame) }
  }, [x, y])
  return createPortal(<div ref={element} className={`gp-drag-cursor${removing ? ' is-removing' : ''}`} aria-hidden="true"><div className="gp-drag-tile"><GamepadControlIcon action={action}/></div><span>{label}</span></div>, document.body)
}
