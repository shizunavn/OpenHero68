// Local browser fixture with no access to hardware or the real RGB service.
import {build} from 'vite'
import react from '@vitejs/plugin-react'
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve('.refactor/rgb-ui-fixture')
await build({configFile:false,plugins:[react(),{
  name:'isolated-rgb-service',enforce:'pre',
  transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/protocol/rgbService.ts'))return code.replace('http://127.0.0.1:16868','http://127.0.0.1:5190')},
}],build:{outDir:root,rollupOptions:{input:'tests/fixtures/rgb-ui.html'}}})
let online=false,legacy=false,failApply=false,enabled=false,sessionId='fixture-session',savedOpacity=null,mode='onboard',rhythmConfiguration=null
const requests=[]
const effects=['aurora','comet','pressure-wave','jelly','scan','breath','ripple','touch','reaction','aoe','mixing','trail','rt']
const status=()=>({apiVersion:legacy?4:5,...(!legacy?{supportedEffects:effects,supportedBaseEffects:["aurora"],supportedModes:['onboard','custom','rhythm'],supportedRhythmModes:[169,170,171,172,173,180,428],supportedRhythmSideModes:[500]}:{}),sessionId,enabled,mode:enabled?mode:'onboard',connected:false,preset:true,fps:60,targetFps:60,frameMs:1,frames:0,packets:0,hallSnapshots:0,timeouts:0,maxGapMs:17,lastError:null,rhythmConfiguration,sideOutput:false})
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'}
createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:5190')
  const json=(value,code=200)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value))}
  let input={};if(req.method==='POST'){let body='';for await(const part of req)body+=part;input=JSON.parse(body||'{}')}
  if(url.pathname==='/test/state'){
    if(req.method==='POST'){
      if(input.online!==undefined)online=input.online
      if(input.legacy!==undefined)legacy=input.legacy
      if(input.failApply!==undefined)failApply=input.failApply
      if(input.sessionId)sessionId=input.sessionId
    }
    json({online,enabled,sessionId,savedOpacity,requests});return
  }
  if(['/status','/mode','/preset','/rhythm/start','/rhythm/config','/audio/devices','/stop','/frames','/device/request'].includes(url.pathname)){
    if(!online){json({error:'Mock service offline'},503);return}
    if(url.pathname==='/status'){json(status());return}
    if(url.pathname==='/audio/devices'){json({devices:[{id:'fixture-speakers',name:'Fixture speakers',default:true}]});return}
    if(url.pathname==='/frames'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(`data: ${JSON.stringify({...status(),sequence:1})}\n\n`);return}
    requests.push({path:url.pathname,mode:input.mode,sessionId:input.sessionId})
    if(url.pathname==='/rhythm/start'||url.pathname==='/rhythm/config'){
      if(legacy){json({error:'Update app'},404);return}
      if(url.pathname==='/rhythm/config'&&input.sessionId!==sessionId){json({error:'Stale session'},409);return}
      if(input.configuration.sideMode!==500){json({error:'Side unverified'},400);return}
      enabled=true;mode='rhythm';rhythmConfiguration=input.configuration;json(status());return
    }
    if(url.pathname==='/mode'){
      if(failApply){failApply=false;json({error:'Simulated Apply failure'},500);return}
      enabled=input.mode==='custom';mode=input.mode;savedOpacity=input.profile?.custom?.layers?.[0]?.opacity??savedOpacity;json(status());return
    }
    if(url.pathname==='/preset'){
      if(input.sessionId!==sessionId){json({error:'Stale session'},409);return}
      savedOpacity=input.profile?.custom?.layers?.[0]?.opacity??savedOpacity;json(status());return
    }
    if(url.pathname==='/stop'){enabled=false;json(status());return}
    json({error:'This fixture never connects to hardware'},403);return
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/tests/fixtures/rgb-ui.html':url.pathname))
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end()}
}).listen(5190,'127.0.0.1',()=>console.log('Isolated RGB UI fixture: http://127.0.0.1:5190/ (add ?reduced for reduced motion)'))
