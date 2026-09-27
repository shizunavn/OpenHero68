import Hero68Preview, { type Hero68PreviewProps } from './Hero68Preview'

// Ready for the future Gamepad page; no navigation or Gamepad settings are added.
// Pass the active profile's Advanced Keys to share the same icons and tooltips.
export default function GamepadKeyboardPreview(props: Hero68PreviewProps) {
  return <Hero68Preview {...props} />
}
