import { useEffect, useRef, useState } from 'react'
import type { RgbProfile } from '../protocol/hero68/rgb'
import { restoreCustomRgb } from '../keyboard/customRgbModel'
import { rgbService } from '../protocol/rgbService'
import { getRgbServiceState, publishRgbServiceStatus, refreshRgbService, unsupportedRgbEffects, useRgbServiceState } from '../protocol/rgbServiceState'
import { hero68DeviceManager } from '../protocol/hero68/webhid'
import { hero68HallStream } from '../protocol/hero68/hallStream'
import { latestUpdates } from '../protocol/latestUpdates'

export function useCustomRgbPlayback(value: RgbProfile, onChange: (value: RgbProfile)=>void, onSetup:()=>void) {
  const { status, checking } = useRgbServiceState()
  const [session, setSession] = useState<string|null>(null)
  const [bindingRevision, setBindingRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const generation = useRef(0)
  const action = useRef(0)
  const current = useRef(value); current.current=value
  const signature=JSON.stringify({custom:value.custom,colors:value.colors})
  const previous=useRef(signature)
  const queue=useRef<ReturnType<typeof latestUpdates<RgbProfile>>|null>(null)
  const config=restoreCustomRgb(value.custom,value)
  const unsupported=status?unsupportedRgbEffects(config,status):[]
  const updateRequired=!!status&&((status.apiVersion??0)<3||unsupported.length>0)
  const applied=!!session&&status?.sessionId===session&&status.enabled

  useEffect(()=>{
    if(session&&(!status||!status.enabled||status.sessionId!==session)){
      generation.current++;queue.current?.close();queue.current=null;setSession(null)
    }
  },[status,session])
  useEffect(()=>{
    if(!session)return
    const token=++generation.current
    const updates=latestUpdates<RgbProfile>(async profile=>{
      const live=getRgbServiceState().status
      if(token!==generation.current||!live?.enabled||live.sessionId!==session)return
      const normalized=restoreCustomRgb(profile.custom,profile)
      if(unsupportedRgbEffects(normalized,live).length){setError('Update the background app to use these effects.');return}
      const result=await rgbService.update(profile,session)
      const latest=getRgbServiceState().status
      if(token===generation.current&&latest?.enabled&&latest.sessionId===session)publishRgbServiceStatus(result)
    },reason=>{if(token===generation.current)setError(reason instanceof Error?reason.message:String(reason))})
    previous.current=JSON.stringify({custom:current.current.custom,colors:current.current.colors})
    queue.current=updates
    return ()=>{generation.current++;updates.close();if(queue.current===updates)queue.current=null}
  },[session,bindingRevision])
  useEffect(()=>{
    const changed=previous.current!==signature;previous.current=signature
    if(changed&&applied)queue.current?.stage(value)
  },[signature,applied,value])
  useEffect(()=>()=>{action.current++;generation.current++;queue.current?.close()},[])

  async function apply(): Promise<boolean> {
    if(busy)return false
    if(!status||updateRequired){onSetup();return false}
    setBusy(true);setError(null)
    queue.current?.close();queue.current=null
    generation.current++
    const token=++action.current
    setSession(null)
    try {
      const fresh=await refreshRgbService()
      if(token!==action.current)return false
      if(!fresh)throw Error('Background service is not responding. Run the app and try again.')
      const profile={...current.current,custom:{...restoreCustomRgb(current.current.custom,current.current),enabled:true}}
      if((fresh.apiVersion??0)<3||unsupportedRgbEffects(profile.custom,fresh).length)throw Error('Update the background app to use this preset.')
      if(hero68HallStream.getSnapshot().active)await hero68HallStream.stop()
      if(token!==action.current)return false
      if(hero68DeviceManager.connected&&!hero68DeviceManager.viaService)await hero68DeviceManager.disconnect()
      if(token!==action.current)return false
      const result=await rgbService.mode('custom',profile)
      if(token!==action.current)return false
      publishRgbServiceStatus(result)
      // The app may still be waiting for a keyboard; keep the preset applied.
      if(result.connected)await hero68DeviceManager.connectViaService()
      if(token!==action.current)return false
      if(!result.sessionId)throw Error('Update the background app to support live editing.')
      onChange(profile);setSession(result.sessionId);setBindingRevision(n=>n+1)
      return true
    } catch(reason) {
      if(token===action.current)setError(reason instanceof Error?reason.message:String(reason))
      return false
    } finally {if(token===action.current)setBusy(false)}
  }
  async function onboard() {
    if(busy||!status)return
    setBusy(true);setError(null);queue.current?.close();queue.current=null
    generation.current++;const token=++action.current;setSession(null)
    try {
      const result=await ((status.apiVersion??0)>=3?rgbService.mode('onboard'):rgbService.stop())
      if(token!==action.current)return
      publishRgbServiceStatus(result)
      onChange({...current.current,custom:{...restoreCustomRgb(current.current.custom,current.current),enabled:false}})
    } catch(reason){if(token===action.current)setError(reason instanceof Error?reason.message:String(reason))}
    finally{if(token===action.current)setBusy(false)}
  }
  return {status,checking,session,applied,busy,error,updateRequired,unsupported,apply,onboard}
}
