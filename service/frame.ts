import { buildReport } from '../src/protocol/hero68/codec'
import { HERO68_KEY_POSITIONS } from '../src/protocol/hero68/keyPositions'
import { HERO68_KEY_IDS } from '../src/keyboard/hero68Layout'

const channels = (hex: string) => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))
const distance = (a:number[],b:number[]) => (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2
type PaletteState = { assignments: number[] }
// CMD08's aggregate-length counter is a byte. 68 IDs + 32*4 <= 196 bytes.
export function prepareFrame(frame: Record<string,string>, previous?: PaletteState) {
  const values=HERO68_KEY_IDS.map(id=>channels(frame[id]))
  if(values.some(v=>v.some(n=>!Number.isInteger(n)||n<0||n>255)))throw Error('Invalid RGB frame')
  const unique=new Map<string,{color:number[];members:number[];black:boolean;prior:number}>()
  values.forEach((color,i)=>{
    const key=color.join(','),entry=unique.get(key)
    const prior=previous?.assignments[i]??-1
    if(entry){entry.members.push(i);if(entry.prior!==prior)entry.prior=-1}
    else unique.set(key,{color,members:[i],black:color[0]===0&&color[1]===0&&color[2]===0,prior})
  })
  let groups=[...unique.values()]
  const count=groups.length,active=Array(count).fill(true),costs=new Float64Array(count*count)
  const cost=(i:number,j:number)=>{
    const a=groups[i],b=groups[j]
    if(a.black||b.black)return Infinity
    let value=distance(a.color,b.color)*a.members.length*b.members.length/(a.members.length+b.members.length)
    if(a.prior>=0&&a.prior===b.prior)value*=.6
    return value
  }
  if(count>32)for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)costs[i*count+j]=cost(i,j)
  let remaining=count
  while(remaining>32) {
    let left=0,right=1,best=Infinity
    for(let i=0;i<count;i++)if(active[i])for(let j=i+1;j<count;j++)if(active[j]) {
      const value=costs[i*count+j]
      if(value<best){best=value;left=i;right=j}
    }
    const a=groups[left],b=groups[right],total=a.members.length+b.members.length
    a.color=a.color.map((v,i)=>(v*a.members.length+b.color[i]*b.members.length)/total)
    if(a.prior!==b.prior)a.prior=-1
    a.members.push(...b.members);active[right]=false;remaining--
    // Only distances involving the merged color change. Reuse all other pairs.
    for(let i=0;i<count;i++)if(active[i]&&i!==left){const lo=Math.min(i,left),hi=Math.max(i,left);costs[lo*count+hi]=cost(lo,hi)}
  }
  groups=groups.filter((_,i)=>active[i])
  // Average neighboring colors instead of snapping to an unrelated brighter key.
  // Favor preceding key groups slightly to avoid palette flicker in slow gradients.
  const assignments:number[]=[],keys:Record<string,string>={}
  groups.forEach((group,index)=>{
    group.color=group.color.map(Math.round)
    const hex='#'+group.color.map(c=>c.toString(16).padStart(2,'0')).join('')
    group.members.forEach(i=>{assignments[i]=index;keys[HERO68_KEY_IDS[i]]=hex})
  })
  const body=groups.flatMap(g=>[...g.color,g.members.length,...g.members.map(i=>HERO68_KEY_POSITIONS[HERO68_KEY_IDS[i]])])
  const parts:number[][]=[]
  for(let i=0;i<body.length;i+=56)parts.push(body.slice(i,i+56))
  return {keys,packets:parts.map((data,sequence)=>buildReport({command:8,zone:1,total:parts.length,sequence,data})),palette:{assignments}}
}
export class RgbFrameEncoder {
  private previous?: PaletteState
  private input?: Record<string,string>
  private result?: ReturnType<typeof prepareFrame>
  prepare(frame: Record<string,string>){
    if(this.result&&HERO68_KEY_IDS.every(id=>frame[id]===this.input?.[id]))return this.result
    const result=prepareFrame(frame,this.previous)
    this.previous=result.palette;this.input={...frame};this.result=result
    return result
  }
  reset(){this.previous=undefined;this.input=undefined;this.result=undefined}
}
export function framePackets(frame:Record<string,string>){return prepareFrame(frame).packets}
