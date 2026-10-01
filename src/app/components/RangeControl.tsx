import { useEffect, useState } from 'react'
import type * as React from 'react'
import { clampNumber, snapToAllowedValue, snapToStep } from '../helpers'

function RangeControl({
  value,
  min,
  max,
  step,
  suffix,
  allowedValues,
  disabled = false,
  recommendedValue,
  mixed = false,
  mixedPlaceholder = 'Mixed',
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  suffix: string
  allowedValues?: readonly number[]
  disabled?: boolean
  recommendedValue?: number
  mixed?: boolean
  mixedPlaceholder?: string
  onChange: (value: number) => void
}) {
  const hasAllowedValues = Boolean(allowedValues?.length)
  const effectiveValue = hasAllowedValues ? snapToAllowedValue(value, allowedValues!) : value
  const discreteIndex = hasAllowedValues
    ? allowedValues!.reduce((bestIndex, candidate, index) =>
      Math.abs(candidate - effectiveValue) < Math.abs(allowedValues![bestIndex] - effectiveValue) ? index : bestIndex, 0)
    : 0
  const pct = hasAllowedValues
    ? (discreteIndex / Math.max(1, allowedValues!.length - 1)) * 100
    : ((effectiveValue - min) / (max - min)) * 100
  const recommendedPct = recommendedValue == null
    ? null
    : hasAllowedValues
      ? (allowedValues!.reduce((bestIndex, candidate, index) =>
        Math.abs(candidate - recommendedValue) < Math.abs(allowedValues![bestIndex] - recommendedValue) ? index : bestIndex, 0)
        / Math.max(1, allowedValues!.length - 1)) * 100
      : ((recommendedValue - min) / (max - min)) * 100
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
    const committed = hasAllowedValues
      ? snapToAllowedValue(clampNumber(parsed, min, max), allowedValues!)
      : snapToStep(parsed, min, max, step)
    onChange(committed)
    setDraftValue(committed.toFixed(2))
  }

  return (
    <div className={`range-wrap ${disabled ? 'is-disabled' : ''} ${mixed ? 'is-mixed' : ''} ${mixed && mixedPlaceholder !== '—' ? 'has-mixed-label' : ''}`}>
      <div className="range-slider-shell">
        {recommendedPct != null && <span className="recommend-marker" style={{ left: `${recommendedPct}%` }} aria-hidden="true" />}
        <input
          type="range"
          min={hasAllowedValues ? 0 : min}
          max={hasAllowedValues ? allowedValues!.length - 1 : max}
          step={hasAllowedValues ? 1 : step}
          value={hasAllowedValues ? discreteIndex : value}
          disabled={disabled}
          style={{ '--range-progress': `${pct}%` } as React.CSSProperties}
          onChange={(e) => {
            if (hasAllowedValues) {
              const index = clampNumber(Math.round(Number(e.target.value)), 0, allowedValues!.length - 1)
              onChange(allowedValues![index])
              return
            }
            onChange(snapToStep(Number(e.target.value), min, max, step))
          }}
        />
      </div>
      <div className="value-readout">
        <label className="value-pill value-pill-input">
          {mixed && !draftValue && <span className="mixed-value-label">{mixedPlaceholder}</span>}
          <input
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={hasAllowedValues ? 0.01 : step}
            value={draftValue}
            aria-label={mixed ? 'Value input, mixed values' : 'Value input'}
            disabled={disabled}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraftValue(e.target.value)}
            onBlur={commitNumberInput}
            onKeyDown={(e) => {
              if (hasAllowedValues && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                const parsed = Number(draftValue.trim().replace(',', '.'))
                const baseValue = Number.isFinite(parsed) ? snapToAllowedValue(parsed, allowedValues!) : effectiveValue
                const baseIndex = allowedValues!.reduce((bestIndex, candidate, index) =>
                  Math.abs(candidate - baseValue) < Math.abs(allowedValues![bestIndex] - baseValue) ? index : bestIndex, 0)
                const nextIndex = clampNumber(baseIndex + (e.key === 'ArrowUp' ? 1 : -1), 0, allowedValues!.length - 1)
                const nextValue = allowedValues![nextIndex]
                setDraftValue(nextValue.toFixed(2))
                onChange(nextValue)
              } else if (e.key === 'Enter') {
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
        <span className="value-suffix">{suffix}</span>
      </div>
    </div>
  )
}

export { RangeControl }
