import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HERO68_LAYOUT, makeDemoLighting } from '../keyboard/hero68Layout'
import { subscribeLightingFrame, type LightingFrame } from '../keyboard/lightingPreviewBus'
import { HERO68_HALL_VISUAL_MAX_MM } from '../protocol/hero68/hallStream'
import type { AdvancedBinding } from '../protocol/hero68/advanced'
import AdvancedKeyIcon from './AdvancedKeyIcon'


const WOOTILITY_MAX_FONT_PX = 12.3199
const HERO68_DESIGN_WIDTH_EM = 64.05
const HERO68_DESIGN_HEIGHT_EM = 21.35
const HERO68_MIN_FONT_PX = 7.4
const HALL_STREAM_NOISE_FLOOR_MM = 0.05

function fitKeyboardFontSize(width: number, height: number, maxFontPx = WOOTILITY_MAX_FONT_PX) {
  const widthScale = width / HERO68_DESIGN_WIDTH_EM
  const heightScale = height > 0 ? height / HERO68_DESIGN_HEIGHT_EM : maxFontPx
  const fitted = Math.min(widthScale, heightScale, maxFontPx)
  // Preserve the preferred minimum only while the entire keyboard still fits.
  const minimum = Math.min(HERO68_MIN_FONT_PX, widthScale, heightScale)
  return Math.max(minimum, Math.round(fitted * 100) / 100)
}

export type Hero68PreviewProps = {
  selectedKeys: Set<string>
  highlightedKeys?: ReadonlySet<string>
  onToggleKey: (keyId: string) => void
  keyLabels?: Record<string, string>
  keyDecorations?: Record<string, ReactNode>
  advancedBindings?: AdvancedBinding[]
  keyTooltips?: Record<string, { title: string; detail?: string; raw?: string }>
  lightingFrame?: LightingFrame
  selectionEnabled?: boolean
  overlayMode?: 'none' | 'actuation' | 'rapid' | 'deadzone' | 'stream'
  actuationValues?: Record<string, number>
  rapidPreviewValues?: Record<string, { primary: string; secondary?: string; active: boolean }>
  deadzonePreviewValues?: Record<string, { top: string; bottom: string; active: boolean }>
  streamPreviewValues?: Record<string, { distanceMm: number; rawAdc: number; pressed: boolean; releaseInferred?: boolean }>
  maxFontPx?: number
  onWidthChange?: (width: number) => void
}

export default function Hero68Preview({
  selectedKeys,
  highlightedKeys,
  onToggleKey,
  keyLabels,
  keyDecorations,
  advancedBindings = [],
  keyTooltips = {},
  lightingFrame,
  selectionEnabled = true,
  overlayMode = 'none',
  actuationValues = {},
  rapidPreviewValues = {},
  deadzonePreviewValues = {},
  streamPreviewValues = {},
  maxFontPx = WOOTILITY_MAX_FONT_PX,
  onWidthChange,
}: Hero68PreviewProps) {
  const demoFrame = useMemo(() => makeDemoLighting(), [])
  const advancedByKey = useMemo(() => new Map(advancedBindings.flatMap(binding => binding.keys.map(key => [key, binding] as const))), [advancedBindings])
  const previewTooltips = useMemo(() => {
    const result = { ...keyTooltips }
    for (const [keyId, binding] of advancedByKey) {
      const physical = HERO68_LAYOUT.flat().find(key => key.id === keyId)?.label ?? keyId
      result[keyId] = {
        ...result[keyId],
        title: `${physical} · ${binding.kind === 'UNKNOWN' ? 'Advanced Key' : binding.kind}`,
        detail: [result[keyId]?.title, result[keyId]?.detail, binding.kind === 'SOCD' ? `Paired with ${binding.keys.filter(key => key !== keyId).map(key => HERO68_LAYOUT.flat().find(item => item.id === key)?.label ?? key).join(', ')}` : 'Advanced Key binding'].filter(Boolean).join(' · '),
      }
    }
    return result
  }, [advancedByKey, keyTooltips])
  const [lighting, setLighting] = useState<LightingFrame>(demoFrame)
  const previewRef = useRef<HTMLDivElement>(null)
  const tooltipTimerRef = useRef<number | null>(null)
  const [keyboardFontSize, setKeyboardFontSize] = useState(maxFontPx)
  const [keyTooltip, setKeyTooltip] = useState<null | {
    keyId: string
    title: string
    detail?: string
    raw?: string
    left: number
    top: number
    placement: 'above' | 'below'
  }>(null)

  const clearTooltipTimer = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
  }

  const showKeyTooltip = (keyId: string, target: HTMLButtonElement, immediate = false) => {
    const tooltip = previewTooltips[keyId]
    if (!tooltip) return
    clearTooltipTimer()
    const show = () => {
      const rect = target.getBoundingClientRect()
      const placement: 'above' | 'below' = rect.top >= 106 ? 'above' : 'below'
      const left = Math.max(124, Math.min(window.innerWidth - 124, rect.left + rect.width / 2))
      const top = placement === 'above' ? rect.top - 8 : rect.bottom + 8
      setKeyTooltip({ keyId, ...tooltip, left, top, placement })
      tooltipTimerRef.current = null
    }
    if (immediate) show()
    else tooltipTimerRef.current = window.setTimeout(show, 170)
  }

  const hideKeyTooltip = () => {
    clearTooltipTimer()
    setKeyTooltip(null)
  }

  useLayoutEffect(() => {
    const preview = previewRef.current
    const container = preview?.parentElement
    if (!preview || !container) return

    const updateSize = () => {
      const horizontalPadding = 12
      const verticalPadding = 8
      const availableWidth = Math.max(1, container.clientWidth - horizontalPadding)
      const availableHeight = Math.max(1, container.clientHeight - verticalPadding)
      setKeyboardFontSize((current) => {
        const next = fitKeyboardFontSize(availableWidth, availableHeight, maxFontPx)
        return Math.abs(current - next) > 0.01 ? next : current
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [maxFontPx])

  useLayoutEffect(() => {
    const keyboard = previewRef.current?.querySelector<HTMLElement>('.hero68-case')
    if (!keyboard || !onWidthChange) return
    // Use layout pixels: getBoundingClientRect includes the app's CSS zoom.
    onWidthChange(keyboard.offsetWidth)
    const observer = new ResizeObserver(([entry]) => {
      onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? keyboard.offsetWidth)
    })
    observer.observe(keyboard)
    return () => observer.disconnect()
  }, [onWidthChange])

  useEffect(() => lightingFrame ? undefined : subscribeLightingFrame((frame) => {
    // Realtime-ready: protocol can publish only the LEDs that changed.
    setLighting((previous) => ({ ...previous, ...frame }))
  }), [lightingFrame])

  useEffect(() => () => clearTooltipTimer(), [])

  useEffect(() => {
    if (!keyTooltip) return
    const dismiss = () => hideKeyTooltip()
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [keyTooltip])

  return (
    <>
    <div
      ref={previewRef}
      className="hero68-preview-wrap"
      aria-label="AULA Hero68 RGB preview"
      style={{ '--keyboard-font-size': `${keyboardFontSize}px` } as React.CSSProperties}
    >
      <div className="hero68-case">
        <div className="hero68-layout" dir="ltr">
          {HERO68_LAYOUT.map((row, rowIndex) => (
            <div className="hero68-row" key={rowIndex}>
              {row.map((key, keyIndex) => {
                const selected = selectedKeys.has(key.id)
                const advanced = overlayMode === 'deadzone' ? undefined : advancedByKey.get(key.id)
                const advancedIcon = advanced && <span className="hero-key-advanced-icon"><AdvancedKeyIcon kind={advanced.kind} /></span>
                const keyColor = (lightingFrame ?? lighting)[key.id] ?? '#35393b'
                const channels = /^#[0-9a-f]{6}$/i.test(keyColor) ? [1,3,5].map(i=>parseInt(keyColor.slice(i,i+2),16)) : undefined
                const rgbTextColor = lightingFrame && channels && channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722 > 155 ? '#172022' : undefined

                const rapidPreview = rapidPreviewValues[key.id]
                const deadzonePreview = deadzonePreviewValues[key.id]
                const streamPreview = streamPreviewValues[key.id]
                const actuationValue = actuationValues[key.id] ?? 0
                const showActuationOverlay = overlayMode === 'actuation'
                const showRapidOverlay = overlayMode === 'rapid'
                const rapidDisabled = showRapidOverlay && !rapidPreview?.active
                const showDeadzoneOverlay = overlayMode === 'deadzone'
                const deadzoneDisabled = showDeadzoneOverlay && !deadzonePreview?.active
                const showStreamOverlay = overlayMode === 'stream'
                const showStreamState = Boolean(
                  showStreamOverlay
                  && streamPreview
                  && (streamPreview.pressed || streamPreview.releaseInferred || streamPreview.distanceMm >= HALL_STREAM_NOISE_FLOOR_MM)
                )
                const streamTravelPercent = showStreamState && streamPreview
                  ? Math.max(0, Math.min(100, (streamPreview.distanceMm / HERO68_HALL_VISUAL_MAX_MM) * 100))
                  : 0

                return (
                  <div
                    className="hero-key-slot"
                    key={key.id}
                    style={{ '--key-units': key.width ?? 1 } as React.CSSProperties}
                  >
                    <div className="hero-key-selectable" data-key={key.matrixKey ?? `${rowIndex}-${keyIndex}`}>
                      <button
                        type="button"
                        aria-label={keyLabels?.[key.id] ?? key.label}
                        aria-description={advanced ? previewTooltips[key.id]?.title : undefined}
                        className={`hero-key ${highlightedKeys?.has(key.id) ? "is-preset-highlighted" : ""} ${advanced ? 'has-advanced-binding' : ''} ${selected ? 'is-selected' : ''} ${overlayMode !== 'none' ? 'has-overlay' : ''} ${showActuationOverlay ? 'is-actuation-overlay' : ''} ${showRapidOverlay && rapidPreview?.active ? 'has-rapid-overlay' : ''} ${rapidDisabled || deadzoneDisabled ? 'is-feature-disabled' : ''} ${showDeadzoneOverlay && deadzonePreview?.active ? 'has-deadzone-overlay' : ''} ${showStreamOverlay ? 'is-stream-key' : ''} ${showStreamState ? 'has-stream-overlay' : ''} ${showStreamState && streamPreview?.releaseInferred ? 'has-stream-inferred-release' : ''}`}
                        style={{
                          '--key-rgb': keyColor,
                          '--rgb-label-color': rgbTextColor,
                          '--stream-travel': `${streamTravelPercent}%`,
                        } as React.CSSProperties}
                        onClick={() => onToggleKey(key.id)}
                        onPointerEnter={(event) => showKeyTooltip(key.id, event.currentTarget)}
                        onPointerLeave={hideKeyTooltip}
                        onFocus={(event) => showKeyTooltip(key.id, event.currentTarget, true)}
                        onBlur={hideKeyTooltip}
                        aria-selected={selected}
                        aria-pressed={lightingFrame && selectionEnabled ? selected : undefined}
                        aria-disabled="false"
                      >
                        <span className="hero-key-render" aria-hidden="true" />
                        <span className="hero-key-content">
                          {keyDecorations?.[key.id] ? keyDecorations[key.id] : showActuationOverlay ? (
                            <span className="hero-key-actuation-content">
                              <span className="hero-key-actuation-value">{actuationValue.toFixed(2)}</span>
                              {!advanced && <span className="hero-key-actuation-name">{keyLabels?.[key.id] ?? key.label}</span>}
                              {key.indicator && <span className={`hero-key-indicator is-${key.indicator}`} aria-hidden="true" />}
                            </span>
                          ) : showRapidOverlay && rapidPreview?.active ? (
                            <span className={`hero-key-rapid-overlay ${rapidPreview?.active ? 'is-active' : ''} ${rapidPreview?.secondary ? 'is-split' : ''}`}>
                              <span>{rapidPreview?.primary ?? '0.00'}</span>
                              {rapidPreview?.secondary && <span>{rapidPreview.secondary}</span>}
                            </span>
                          ) : showDeadzoneOverlay && deadzonePreview?.active ? (
                            <span className={`hero-key-deadzone-overlay ${deadzonePreview?.active ? 'is-active' : ''}`}>
                              <span>↑{deadzonePreview?.top ?? '0.00'}</span>
                              <span>↓{deadzonePreview?.bottom ?? '0.00'}</span>
                            </span>
                          ) : showStreamOverlay && showStreamState ? (
                            <span className={`hero-key-stream-overlay ${streamPreview?.pressed ? 'is-pressed' : ''}`}>
                              <span className="hero-key-stream-fill" aria-hidden="true" />
                              <span className="hero-key-stream-value">{streamPreview ? streamPreview.distanceMm.toFixed(2) : '—'}</span>
                              <small>mm</small>
                            </span>
                          ) : (
                            <>
                              {!advanced && <span className="hero-key-label">{keyLabels?.[key.id] ?? key.label}</span>}
                              {key.indicator && <span className={`hero-key-indicator is-${key.indicator}`} aria-hidden="true" />}
                            </>
                          )}
                          {!keyDecorations?.[key.id] && advancedIcon}
                        </span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="hero68-case-lip" aria-hidden="true" />
        <div className="hero68-badge">HERO68</div>
      </div>
    </div>
    {keyTooltip && typeof document !== 'undefined' && createPortal(
      <div
        className={`hero-key-tooltip is-${keyTooltip.placement}`}
        role="tooltip"
        style={{ left: keyTooltip.left, top: keyTooltip.top }}
        data-key={keyTooltip.keyId}
      >
        <strong>{keyTooltip.title}</strong>
        {keyTooltip.detail && <span>{keyTooltip.detail}</span>}
        {keyTooltip.raw && <code>{keyTooltip.raw}</code>}
      </div>,
      document.body,
    )}
    </>
  )
}
