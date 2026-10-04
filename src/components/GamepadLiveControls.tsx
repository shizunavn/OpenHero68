import {useSyncExternalStore} from 'react'
import type {GamepadLiveStore} from '../protocol/gamepadLive'
import {GAMEPAD_BUTTONS,type GamepadAction} from '../keyboard/gamepad'
import GamepadControlIcon from './GamepadControlIcon'
export default function GamepadLiveControls({store}:{store:GamepadLiveStore}){
  const {report,source}=useSyncExternalStore(store.subscribe,store.getSnapshot)
  return <div className="gp-test-controls" data-input-source={source}>
    {(['L','R'] as const).map(prefix=><div className="gp-stick" key={prefix}>
      <svg viewBox="0 0 160 160" aria-label={prefix+' stick'}>
        <circle cx="80" cy="80" r="65"/><line x1="15" x2="145" y1="80" y2="80"/><line y1="15" y2="145" x1="80" x2="80"/>
        <circle className="gp-dot" cx={80+(prefix==='L'?report.lx:report.rx)/32767*65} cy={80-(prefix==='L'?report.ly:report.ry)/32767*65} r="7"/>
      </svg><span>{prefix}: {prefix==='L'?report.lx:report.rx}, {prefix==='L'?report.ly:report.ry}</span>
    </div>)}
    <div className="gp-triggers">{(['lt','rt'] as const).map(key=><label key={key}>{key.toUpperCase()} {report[key]}/255<meter min="0" max="255" value={report[key]}/></label>)}</div>
    <div className="gp-palette">{Object.entries(GAMEPAD_BUTTONS).map(([a,mask])=><span key={a} role="img" aria-label={a} className={'gp-action '+(report.buttons&mask!?'held':'')}><GamepadControlIcon action={a as GamepadAction}/></span>)}</div>
  </div>
}
