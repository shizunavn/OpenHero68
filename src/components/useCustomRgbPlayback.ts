import { useEffect, useRef, useState } from 'react'
import type { RgbProfile } from '../protocol/hero68/rgb'
import { restoreCustomRgb } from '../keyboard/customRgbModel'
import { rgbService } from '../protocol/rgbService'
import { publishRgbServiceStatus, refreshRgbService, unsupportedRgbEffects, useRgbServiceState } from '../protocol/rgbServiceState'
import { hero68DeviceManager } from '../protocol/hero68/webhid'
import { hero68HallStream } from '../protocol/hero68/hallStream'
import { CustomRgbSession, customSignature, mergeRunningCustom, type CustomSessionState } from '../protocol/customRgbSession'

export function useCustomRgbPlayback(value: RgbProfile, onChange: (value: RgbProfile)=>void, onSetup:()=>void, slot=0, editing=true) {
  const { status, checking, reconnecting } = useRgbServiceState()
  const [state, setState] = useState<CustomSessionState>({session:null,syncing:false,conflict:false,error:null})
  const [busy, setBusy] = useState(false), [error, setError] = useState<string|null>(null)
  const [previewOnly, setPreviewOnly] = useState(false), [backup, setBackup] = useState<RgbProfile|null>(null)
  const current = useRef(value); current.current=value
  const callbacks = useRef(onChange); callbacks.current=onChange
  const action = useRef(0), queue = useRef<CustomRgbSession|null>(null)
  const config=restoreCustomRgb(value.custom,value)
  const unsupported=status?unsupportedRgbEffects(config,status):[]
  const updateRequired=!!status&&((status.apiVersion??0)<3||status.customRevision===undefined||unsupported.length>0)
  const applied=!!state.session&&status?.sessionId===state.session&&status.enabled&&status.mode==='custom'&&!previewOnly
  const signature=customSignature(value)
  const previousSignature=useRef(signature)
  const previousEditing=useRef(false)
  useEffect(()=>{
    let active=true
    const key=`openhero68:custom-recovery:${slot}`
    try{setBackup(JSON.parse(localStorage.getItem(key)??'null'))}catch{setBackup(null)}
    const session=new CustomRgbSession({
      draft:()=>current.current,
      adopt:profile=>{if(active){current.current=profile;previousSignature.current=customSignature(profile);callbacks.current(profile)}},
      backup:profile=>{if(!active)return;setBackup(profile);try{localStorage.setItem(key,JSON.stringify(profile))}catch{/* Keep recovery in memory. */}},
      write:(profile,id,revision)=>rgbService.update(profile,id,revision),
      status:publishRgbServiceStatus,
      state:next=>{if(active)setState(next)},
      refresh:()=>{void refreshRgbService()},
    })
    queue.current=session
    return()=>{active=false;action.current++;session.dispose()}
  },[slot])
  useEffect(()=>{const changed=previousSignature.current!==signature;previousSignature.current=signature;if(changed&&editing)queue.current?.stage(value)},[signature,slot,editing])
  useEffect(()=>{
    if(busy)return
    if(editing&&!previousEditing.current)queue.current?.join(status)
    else if(editing||status?.mode!=='custom')queue.current?.observe(status)
    previousEditing.current=editing
  },[status,busy,slot,editing])
  function demo(enabled:boolean){queue.current?.setSuspended(enabled);setPreviewOnly(enabled)}
  async function start(): Promise<boolean> {
    if(busy)return false
    if(!status||updateRequired){onSetup();return false}
    const token=++action.current;setBusy(true);setError(null)
    try {
      await queue.current?.pause()
      const fresh=await refreshRgbService()
      if(token!==action.current)return false
      if(!fresh)throw Error('Background service is not responding. Run the app and try again.')
      const profile={...current.current,custom:{...restoreCustomRgb(current.current.custom,current.current),enabled:true}}
      if(fresh.customRevision===undefined||unsupportedRgbEffects(profile.custom,fresh).length)throw Error('Update the background app to use this preset.')
      if(hero68HallStream.getSnapshot().active||hero68HallStream.getSnapshot().starting)await hero68HallStream.stop()
      if(token!==action.current)return false
      if(hero68DeviceManager.connected&&!hero68DeviceManager.viaService)await hero68DeviceManager.disconnect()
      if(token!==action.current)return false
      const result=await rgbService.mode('custom',profile)
      if(token!==action.current)return false
      current.current=profile;previousSignature.current=customSignature(profile)
      callbacks.current(profile);publishRgbServiceStatus(result);queue.current?.observe(result);demo(false)
      if(result.connected)await hero68DeviceManager.connectViaService()
      return token===action.current
    } catch(reason) {
      if(token===action.current)setError(reason instanceof Error?reason.message:String(reason))
      return false
    } finally {if(token===action.current)setBusy(false)}
  }
  async function onboard() {
    if(busy||!status)return
    const token=++action.current;setBusy(true);setError(null)
    try {
      await queue.current?.pause()
      const result=await ((status.apiVersion??0)>=3?rgbService.mode('onboard'):rgbService.stop())
      if(token!==action.current)return
      publishRgbServiceStatus(result)
      callbacks.current({...current.current,custom:{...restoreCustomRgb(current.current.custom,current.current),enabled:false}})
    } catch(reason){if(token===action.current)setError(reason instanceof Error?reason.message:String(reason))}
    finally{if(token===action.current)setBusy(false)}
  }
  function restoreDraft(){
    if(!backup||busy)return
    const profile=mergeRunningCustom(current.current,backup)
    callbacks.current(profile);setError(null)
    if(status?.enabled&&status.mode==='custom'&&!previewOnly)queue.current?.resolve(profile)
  }
  return {status,checking,reconnecting,session:state.session,applied,busy,error:error??state.error,conflict:state.conflict,syncing:state.syncing,backup,restoreDraft,updateRequired,unsupported,start,onboard,demo}
}
