const base='http://127.0.0.1:16868'
const keys=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']
const seconds=Number(process.argv[2]??15)
if(!Number.isInteger(seconds)||seconds<1||seconds>300)throw Error('Expected 1-300 seconds')
const status=()=>fetch(base+'/status').then(r=>r.json())
const original=await status()
if(original.apiVersion<4||!original.preset)throw Error('Start current RGB service with a saved preset first')
const switched=original.mode!=='custom'
if(switched){
  const start=await fetch(base+'/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'custom'})})
  if(!start.ok)throw Error('Could not start saved custom preset')
}
const before=await status()
const abort=new AbortController()
try{
const response=await fetch(base+'/hall/stream?keys='+keys.join(','),{signal:abort.signal})
if(!response.ok)throw Error('Hall stream failed: '+response.status)
const counts=Object.fromEntries(keys.map(k=>[k,0]))
let messages=0,buffer=''
const reader=response.body.getReader()
const end=Date.now()+seconds*1000
while(Date.now()<end){
  const next=await Promise.race([reader.read(),new Promise(resolve=>setTimeout(()=>resolve(null),Math.max(0,end-Date.now())))])
  if(!next||next.done)break
  buffer+=new TextDecoder().decode(next.value)
  let split
  while((split=buffer.indexOf('\n\n'))>=0){
    const message=buffer.slice(0,split);buffer=buffer.slice(split+2)
    if(!message.startsWith('data: '))continue
    const data=JSON.parse(message.slice(6));messages++
    for(const record of data.records??[])if(record.keyId in counts)counts[record.keyId]++
  }
}
const after=await status()
console.log(JSON.stringify({seconds,counts,perKeyHz:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,+(v/seconds).toFixed(1)])),messages,rgbFps:after.fps,hallPolls:after.hallPolls-before.hallPolls,requests:after.packets-before.packets,timeouts:after.timeouts-before.timeouts,maxGapMs:after.maxGapMs,frameGapP95Ms:after.frameGapP95Ms,frameGapP99Ms:after.frameGapP99Ms,gapsOver100:after.gapsOver100,lastLongGapAt:after.lastLongGapAt,eventLoopDelayP99Ms:after.eventLoopDelayP99Ms,eventLoopDelayMaxMs:after.eventLoopDelayMaxMs,lastError:after.lastError},null,2))
}finally{
  abort.abort()
  if(switched)await fetch(base+'/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'onboard'})})
}
