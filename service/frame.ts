import { buildReport } from '../src/protocol/hero68/codec'
import { HERO68_KEY_POSITIONS } from '../src/protocol/hero68/keyPositions'
import { HERO68_KEY_IDS } from '../src/keyboard/hero68Layout'

const channels = (hex: string) => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))
const distance = (a:number[],b:number[]) => a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)
// CMD08's aggregate-length counter is a byte. 68 IDs + 32*4 <= 196 bytes.
// A bounded palette prevents overflow on frames containing 68 unique colors.
export function prepareFrame(frame: Record<string,string>) {
  const values = HERO68_KEY_IDS.map(id=>channels(frame[id]))
  if(values.some(v=>v.some(n=>!Number.isInteger(n)||n<0||n>255))) throw Error('Invalid RGB frame')
  const unique = [...new Map(values.map(v=>[v.join(','),v])).values()]
  const palette:number[][] = unique.length<=32 ? unique : [unique[0]]
  while(palette.length<32 && palette.length<unique.length) {
    let farthest = unique[0], best = -1
    for(const color of unique) {const score=Math.min(...palette.map(p=>distance(color,p)));if(score>best){best=score;farthest=color}}
    palette.push(farthest)
  }
  const groups = palette.map(color=>({color,keys:[] as number[]}))
  const keys:Record<string,string>={}
  values.forEach((color,i)=>{
    let index=0, best=Infinity
    palette.forEach((p,j)=>{const d=distance(color,p);if(d<best){best=d;index=j}})
    // fw0320 0x08021C9C calls 0x08012D08: live IDs are POS bytes,
    // looked up in the u16 table at 0x08029B9E, then translated to LED X/Y.
    groups[index].keys.push(HERO68_KEY_POSITIONS[HERO68_KEY_IDS[i]])
    keys[HERO68_KEY_IDS[i]]='#'+palette[index].map(c=>c.toString(16).padStart(2,'0')).join('')
  })
  const body=groups.filter(g=>g.keys.length).flatMap(g=>[...g.color,g.keys.length,...g.keys])
  const parts:number[][]=[]
  for(let i=0;i<body.length;i+=56) parts.push(body.slice(i,i+56))
  return {keys,packets:parts.map((data,sequence)=>buildReport({command:8,zone:1,total:parts.length,sequence,data}))}
}
export function framePackets(frame:Record<string,string>){return prepareFrame(frame).packets}
