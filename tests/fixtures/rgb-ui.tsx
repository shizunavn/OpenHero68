// Isolated browser fixture: all service calls are rewritten to the mock port.
import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import RgbSettingsPage from '../../src/components/RgbSettingsPage'
import {defaultRgb} from '../../src/protocol/hero68/rgb'
import {createRgbLayer,defaultCustomRgb} from '../../src/keyboard/customRgb'
import {refreshRgbService} from '../../src/protocol/rgbServiceState'
import {LocalServicePermissionNotice} from '../../src/components/LocalServicePermissionGuide'
import App from '../../src/App'
import Hero68Preview from '../../src/components/Hero68Preview'
import {newAdvanced} from '../../src/protocol/hero68/advanced'
import '../../src/styles/index.css'

const initial=defaultRgb();initial.custom=defaultCustomRgb(initial);initial.custom.base.mode=0
initial.custom.enabled=true;initial.custom.layers=[createRgbLayer('aurora','fixture-aurora')]
if(new URL(location.href).searchParams.has('black-base')){
  initial.custom.base={...initial.custom.base,mode:7,rgb:[0,0,0],mix:false,brightness:12,speed:1};initial.custom.layers=[]
}
if(new URL(location.href).searchParams.has('new-base')){initial.keys.rgb=[0,0,0];delete initial.custom}
if(new URL(location.href).searchParams.has('reduced')){
  const original=window.matchMedia.bind(window)
  window.matchMedia=query=>query.includes('prefers-reduced-motion')?{...original(query),matches:true,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return true},onchange:null}:original(query)
}
function Fixture(){
  const [permission,setPermission]=useState<PermissionState>(()=>new URL(location.href).searchParams.get('permission')==='denied'?'denied':'prompt')
  const [profile,setProfile]=useState(initial),[summary,setSummary]=useState(''),[setup,setSetup]=useState(false),[visible,setVisible]=useState(true)
  async function control(patch:object){await fetch('/test/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});await refreshRgbService()}
  async function inspect(){setSummary(JSON.stringify(await (await fetch('/test/state')).json()))}
  return <div style={{padding:24}}>{new URL(location.href).searchParams.has('permission')&&<><LocalServicePermissionNotice permission={permission} prompted={true}/><button onClick={()=>setPermission('granted')}>Mock allow</button></>}<nav className="custom-rgb-actions"><button onClick={()=>void control({online:false})}>Mock offline</button><button onClick={()=>void control({online:true})}>Mock online</button><button onClick={()=>void control({sessionId:'fixture-restarted'})}>Mock restart</button><button onClick={()=>void control({legacy:true})}>Mock old app</button><button onClick={()=>void control({failApply:true})}>Mock apply failure</button><button onClick={()=>void control({online:true,mode:"custom",customConfiguration:{...profile,custom:{...profile.custom,base:{...profile.custom!.base,mode:19}}}})}>Mock running Custom</button><button onClick={()=>setVisible(value=>!value)}>{visible?"Leave RGB":"Return RGB"}</button><button onClick={()=>void inspect()}>Inspect requests</button></nav><output style={{display:"block",maxHeight:60,overflow:"auto",fontSize:10}} aria-label="Mock requests">{summary}</output>{setup&&<p role="status">Setup requested</p>}{visible&&<RgbSettingsPage value={profile} onChange={setProfile} busy={false} advancedBindings={[]} onSetup={()=>setSetup(true)}/>}</div>
}
function OverlayFixture(){return <div style={{padding:24}}><h2>RT split + Advanced Keys</h2><Hero68Preview selectedKeys={new Set()} onToggleKey={()=>{}} lightingSource="local" overlayMode="rapid" advancedBindings={[newAdvanced('SOCD',['KeyW','KeyS'])]} rapidPreviewValues={{KeyW:{primary:'0.20',secondary:'0.25',active:true},KeyS:{primary:'0.30',active:true}}}/></div>}
const query=new URL(location.href).searchParams
createRoot(document.getElementById('root')!).render(<React.StrictMode>{query.has('app')?<App/>:query.has('overlays')?<OverlayFixture/>:<Fixture/>}</React.StrictMode>)
