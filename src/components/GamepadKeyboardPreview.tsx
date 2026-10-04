import Hero68Preview, { type Hero68PreviewProps } from './Hero68Preview'
import {useSyncExternalStore} from 'react'
import type {GamepadLiveStore} from '../protocol/gamepadLive'

// The Gamepad editor shares the physical layout and key interactions with settings.
export default function GamepadKeyboardPreview({liveStore,...props}: Hero68PreviewProps & {liveStore:GamepadLiveStore}) {
  const live=useSyncExternalStore(liveStore.subscribe,liveStore.getSnapshot)
  const streamPreviewValues=Object.fromEntries(live.samples.map(s=>[s.keyId,{distanceMm:s.distanceUnits/100,rawAdc:s.adc,pressed:s.pressed}]))
  const decorations=Object.fromEntries(Object.entries(props.keyDecorations??{}).map(([id,icon])=>[id,<span className="gp-key-binding" key={id}>{icon}{props.overlayMode==='stream'&&<small>{(streamPreviewValues[id]?.distanceMm??0).toFixed(2)}</small>}</span>]))
  return <Hero68Preview {...props} streamPreviewValues={streamPreviewValues} keyDecorations={decorations}/>
}
