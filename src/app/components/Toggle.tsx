function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  mixed = false,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
  mixed?: boolean
}) {
  return (
    <button
      type="button"
      className={`toggle ${checked && !mixed ? 'is-on' : ''} ${mixed ? 'is-mixed' : ''}`}
      aria-pressed={mixed ? false : checked}
      aria-label={mixed ? `${label}, mixed values` : label}
      disabled={disabled}
      onClick={() => onChange(mixed ? true : !checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}

export { Toggle }
