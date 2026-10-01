import { useEffect, useState } from 'react'
import type * as React from 'react'
import { snapToStep } from '../helpers'

function VerticalRangeControl({
  value,
  min,
  max,
  step,
  suffix,
  disabled = false,
  direction = 'bottom',
  mixed = false,
  mixedPlaceholder = 'Mixed',
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  suffix: string
  disabled?: boolean
  direction?: 'top' | 'bottom'
  mixed?: boolean
  mixedPlaceholder?: string
  onChange: (value: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  const markerStyle = direction === 'bottom' ? { bottom: `${pct}%` } : { top: `${pct}%` }
  const fillStyle = direction === 'bottom' ? { height: `${pct}%`, bottom: 0, top: 'auto' } : { height: `${pct}%`, top: 0, bottom: 'auto' }
  const [draftValue, setDraftValue] = useState(() => mixed ? '' : value.toFixed(2))

  useEffect(() => {
    setDraftValue(mixed ? '' : value.toFixed(2))
  }, [value, mixed])

  const commitNumberInput = () => {
    const normalized = draftValue.trim().replace(',', '.')
    const parsed = Number(normalized)
    if (!normalized || Number.isNaN(parsed)) {
      setDraftValue(mixed ? '' : value.toFixed(2))
      return
    }
    const committed = snapToStep(parsed, min, max, step)
    onChange(committed)
    setDraftValue(committed.toFixed(2))
  }

  return (
    <div className={`vertical-meter ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''} ${direction === 'top' ? 'is-top-oriented' : ''}`}>
      <span className="vertical-range-shell">
        <input
          className="vertical-range-input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label="Vertical value"
          onChange={(e) => onChange(snapToStep(Number(e.target.value), min, max, step))}
        />
        <span className="meter-track" aria-hidden="true">
          <span className="meter-fill" style={fillStyle as React.CSSProperties} />
          <span className="meter-marker" style={markerStyle as React.CSSProperties} />
        </span>
      </span>
      <div className="meter-readout compact-meter-readout">
        <label className="meter-value meter-value-input compact-meter-value">
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draftValue}
            disabled={disabled}
            aria-label="Vertical value input"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitNumberInput()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setDraftValue(mixed ? '' : value.toFixed(2))
                e.currentTarget.blur()
              }
            }}
          />
        </label>
        <b className="value-suffix">{suffix}</b>
      </div>
    </div>
  )
}

export { VerticalRangeControl }
