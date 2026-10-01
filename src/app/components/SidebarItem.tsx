import type { NavItemProps } from './RailItem'

function SidebarItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button className={`sidebar-item ${active ? 'is-active' : ''}`} aria-label={label} onClick={onClick}>
      <span className="sidebar-icon">{icon}</span>
      <span className="sidebar-label">{label}</span>
    </button>
  )
}

export { SidebarItem }
