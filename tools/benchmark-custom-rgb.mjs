import {rolldown} from 'rolldown'
import {mkdir,writeFile} from 'node:fs/promises'

async function load(input){const b=await rolldown({input});try{const {output}=await b.generate({format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(output[0].code).toString('base64'))}finally{await b.close()}}
const {CustomRgbEngine,defaultCustomRgb,createRgbLayer}=await load('src/keyboard/customRgb.ts')
const {defaultRgb}=await load('src/protocol/hero68/rgb.ts')
const {RgbFrameEncoder}=await load('service/frame.ts')
const profile=defaultRgb();profile.side.mode=0;profile.custom=defaultCustomRgb(profile)
profile.custom.base.mode=10;profile.custom.base.brightness=12
profile.custom.baseEffect={effect:'aurora',palette:'aurora',width:2.5,speed:1.5};profile.custom.base.mix=true
profile.custom.layers=[createRgbLayer('pressure-wave','pressure'),createRgbLayer('scan','scan')]
const keys=Object.keys(profile.colors),percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1]
const scenarios=[]
for(const name of ['idle','single-key-spam','all-keys-spam']){
  const engine=new CustomRgbEngine(profile),encoder=new RgbFrameEncoder(),render=[],encode=[]
  let maxWaves=0,maxPackets=0,sequence=0
  for(let i=0;i<720;i++){
    const time=110+i*1000/60,down=name!=='idle'&&i%6<3
    const active=name==='all-keys-spam'?keys:['KeyW']
    const at=performance.now();engine.advance(time)
    for(const id of active)engine.event(id,down)
    engine.setTravel(Object.fromEntries(active.map(id=>[id,down?3.4:0])),Object.fromEntries(active.map(id=>[id,{sequence:++sequence,timestampMs:time}])))
    const frame=engine.frame().keys,rendered=performance.now(),result=encoder.prepare(frame),encoded=performance.now()
    if(i>=120){render.push(rendered-at);encode.push(encoded-rendered)}
    maxWaves=Math.max(maxWaves,engine.activeWaveCount);maxPackets=Math.max(maxPackets,result.packets.length)
  }
  const total=render.map((ms,i)=>ms+encode[i])
  scenarios.push({name,renderP95Ms:percentile(render,.95),encodeP95Ms:percentile(encode,.95),totalP99Ms:percentile(total,.99),maxWaves,maxPackets})
}
const report={node:process.version,scenarios}
await mkdir('reports',{recursive:true})
await writeFile(process.argv[2]??'reports/custom-rgb-benchmark.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
