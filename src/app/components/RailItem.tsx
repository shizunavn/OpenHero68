import type * as React from 'react'

type NavItemProps = {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}

function RailItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button className={`rail-item ${active ? 'is-active' : ''}`} onClick={onClick} aria-label={label}>
      <span className="rail-icon">{icon}</span>
      <span className="rail-label">{label}</span>
    </button>
  )
}

export { RailItem }
export type { NavItemProps }
