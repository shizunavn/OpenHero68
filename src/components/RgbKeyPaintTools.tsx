import {Paintbrush} from 'lucide-react'
import {useEffect,useState,type ReactNode} from 'react'
import {HERO68_KEY_IDS} from '../keyboard/hero68Layout'
import RgbColorPicker from './RgbColorPicker'
import { useI18n } from '../i18n'

const groups=[{name:'WASD',keys:['KeyW','KeyA','KeyS','KeyD']},{name:'Arrows',keys:['ArrowLeft','ArrowDown','ArrowUp','ArrowRight']},{name:'All keys',keys:HERO68_KEY_IDS}]
export function RgbKeySelectionTools({selected,onSelect,disabled,children}: {
  selected:Set<string>;onSelect:(keys:Set<string>)=>void;disabled:boolean;children?:ReactNode
}) {
  const { tr } = useI18n()
  return <div className="rgb-key-paint-selection">
    <span role="status" aria-live="polite">{selected.size} / {HERO68_KEY_IDS.length} {tr('selected')}</span>
    <div role="group" aria-label={tr('Select key group')}>{groups.map(group=><button key={group.name} type="button" className="secondary-button" disabled={disabled} aria-pressed={selected.size===group.keys.length&&group.keys.every(id=>selected.has(id))} onClick={()=>onSelect(new Set(group.keys))}>{tr(group.name)}</button>)}<button type="button" className="secondary-button" disabled={disabled||!selected.size} onClick={()=>onSelect(new Set())}>{tr('Clear selection')}</button></div>
    {children}
  </div>
}
export default function RgbKeyPaintTools({selected,onSelect,color,onColor,onPaint,disabled}: {
  selected:Set<string>;onSelect:(keys:Set<string>)=>void;color:string;onColor:(color:string)=>void;onPaint:()=>void;disabled:boolean
}) {
  const { tr } = useI18n()
  const [hex,setHex]=useState(color.toUpperCase())
  useEffect(()=>setHex(color.toUpperCase()),[color])
  function changeHex(next:string){
    setHex(next)
    if(/^#?[0-9a-f]{6}$/i.test(next))onColor('#'+next.replace('#','').toLowerCase())
  }
  return <section className="rgb-key-paint-tools" aria-label={tr('Per-key painting')}>
    <RgbKeySelectionTools selected={selected} onSelect={onSelect} disabled={disabled}/>
    <div className="rgb-key-paint-color">
      <label>{tr('Color')}<RgbColorPicker label={tr('Paint selected keys')} value={color} disabled={disabled} onChange={onColor}/></label>
      <input className="rgb-key-paint-hex" aria-label={tr('Brush HEX color')} value={hex} maxLength={7} spellCheck={false} disabled={disabled} onChange={event=>changeHex(event.target.value)} onBlur={()=>setHex(color.toUpperCase())}/>
      <button type="button" className="apply-button" title={!selected.size?tr('Select keys on the preview to paint.'):undefined} disabled={disabled||!selected.size} onClick={onPaint}><Paintbrush size={15}/> {tr('Paint keys')}</button>
    </div>
  </section>
}
