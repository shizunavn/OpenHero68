import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

type Tab = 'onboard' | 'custom' | 'rhythm'
const ToolbarContext = createContext<{ actions: HTMLElement | null; notices: HTMLElement | null }>({ actions: null, notices: null })

/** Slots move controls without moving the editor's session or update queue. */
export function RgbToolbarSlot({ children, visible = true, notice = false }: { children: ReactNode; visible?: boolean; notice?: boolean }) {
  const hosts = useContext(ToolbarContext)
  const host = notice ? hosts.notices : hosts.actions
  return visible && host ? createPortal(children, host) : null
}

export function RgbWorkspace({ tab, onTab, disabled, output, children }: {
  tab: Tab; onTab: (tab: Tab) => void; disabled: boolean; output: Tab; children: ReactNode
}) {
  const { tr } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const [actions, setActions] = useState<HTMLDivElement | null>(null)
  const [notices, setNotices] = useState<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const header = root.current?.closest('.workspace')?.querySelector<HTMLElement>(':scope > .topbar')
    if (!header) return
    const measure = () => root.current?.style.setProperty('--rgb-toolbar-top', `${header.getBoundingClientRect().height}px`)
    const observer = new ResizeObserver(measure)
    observer.observe(header); measure()
    return () => observer.disconnect()
  }, [])
  return <ToolbarContext.Provider value={{ actions, notices }}>
    <div ref={root} className="page settings-page rgb-settings-page page-enter">
      <header className="rgb-page-heading"><h1>RGB</h1></header>
      <div className="rgb-workspace-toolbar">
        <div className="rgb-editor-tabs" role="group" aria-label={tr('RGB mode')}>
          {([['onboard', 'Onboard Effects'], ['custom', 'Custom Effects'], ['rhythm', 'Rhythm Sync']] as const).map(([id, name]) =>
            <button key={id} type="button" aria-pressed={tab === id} disabled={disabled} onClick={() => onTab(id)}>{tr(name)}</button>)}
        </div>
        <div className="rgb-toolbar-output"><span className={`rgb-output-state ${output !== 'onboard' ? 'is-running' : ''}`} role="status">
          <i aria-hidden="true" />{tr(output === 'custom' ? 'Output: Custom' : output === 'rhythm' ? 'Output: Rhythm' : 'Using onboard lighting')}
        </span><div className="rgb-toolbar-actions" ref={setActions} /></div>
        <div className="rgb-toolbar-notices" ref={setNotices} />
      </div>
      {children}
    </div>
  </ToolbarContext.Provider>
}

export function RgbPreviewPanel({ source, hint, actions, footer, children }: {
  source: string; hint?: string; actions?: ReactNode; footer?: ReactNode; children: ReactNode
}) {
  const { tr } = useI18n()
  return <section className="rgb-preview-panel" aria-label={tr('Lighting preview')}>
    <div className="rgb-preview-heading"><div><span className="rgb-preview-source">{source}</span>{hint && <span className="rgb-preview-hint">{hint}</span>}</div>{actions}</div>
    <div className="rgb-preview-stage">{children}</div>
    {footer && <div className="rgb-preview-tools">{footer}</div>}
  </section>
}
