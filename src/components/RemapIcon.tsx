const icons = import.meta.glob('../assets/remap-icons/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

export default function RemapIcon({ name }: { name: string }) {
  const svg = icons[`../assets/remap-icons/${name}.svg`]
  return svg ? <span className="remap-svg-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} /> : null
}

export const REMAP_ACTION_ICONS: Record<string, string> = {
  Right: 'arrow-right', Left: 'arrow-left', Down: 'arrow-down', Up: 'arrow-up',
  previous_song: 'media-33', play_pause: 'media-34', next_song: 'media-36',
  mute: 'media-37', volume_down: 'media-38', volume_up: 'media-39',
  system_multimedia: 'functions-11', email: 'functions-12', calculator: 'functions-13',
  my_computer: 'functions-14', 'Ctrl + F': 'functions-15', browser: 'functions-16',
  'Alt + Left': 'functions-17', 'Alt + Right': 'functions-18', favorite: 'functions-20',
  screen_bright_down: 'functions-25', screen_bright_up: 'functions-26',
  pause: 'media-35', left_button: 'mouse-42', right_button: 'mouse-43', mid_button: 'mouse-44',
  back: 'mouse-45', forward: 'mouse-46',
}

// The capture does not contain SVGs for these HERO68 actions. Keep the same
// icon presentation using the app's existing icon set instead of text tiles.
const supplementalIcons: Record<string, LucideIcon> = {
  cut: Scissors, copy: Copy, paste: ClipboardPaste, revoke: Undo2,
  Win: Monitor, Mac: Apple, close_windows: X, lock_computer: LockKeyhole,
  zoom_in: ZoomIn, zoom_out: ZoomOut, show_desktop: PanelsTopLeft,
  task_manager: ListTodo, save: Save, empty_button: Ban,
  dpi_plus: Gauge, dpi_sub: Gauge, dpi_switch: Gauge, shoot_button: Crosshair,
  'Ctrl + X': Scissors, 'Ctrl + C': Copy, 'Ctrl + V': ClipboardPaste,
  'Ctrl + Z': Undo2, 'Ctrl + S': Save, 'Alt + F4': X,
  'LWin + L': LockKeyhole, 'LWin + D': PanelsTopLeft, 'Alt + Tab': AppWindow,
  'Ctrl + Shift + Esc': ListTodo,
}

export function hasRemapActionIcon(name: string): boolean {
  return !!(REMAP_ACTION_ICONS[name] || supplementalIcons[name])
}

export function RemapActionIcon({ name, label }: { name: string; label: string }) {
  if (REMAP_ACTION_ICONS[name]) return <RemapIcon name={REMAP_ACTION_ICONS[name]} />
  const Icon = supplementalIcons[name]
  return Icon ? <span className="remap-svg-icon" aria-hidden="true"><Icon /></span> : <>{label}</>
}
import { Apple, AppWindow, ClipboardPaste, Copy, Crosshair, Gauge, LockKeyhole, Monitor, PanelsTopLeft, Save, Scissors, Undo2, X, ZoomIn, ZoomOut, ListTodo, Ban, type LucideIcon } from 'lucide-react'
