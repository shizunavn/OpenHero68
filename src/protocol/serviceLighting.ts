import {useSyncExternalStore} from 'react'
import {rgbService} from './rgbService'
import type {LightingFrame} from '../keyboard/lightingPreviewBus'

let frame:LightingFrame|null=null
let lastSession='',lastSequence=-1
const listeners=new Set<()=>void>()
let timer:ReturnType<typeof setInterval>|undefined,closeFrames:(()=>void)|undefined
let generation=0
function publish(next:LightingFrame|null){frame=next;listeners.forEach(listener=>listener())}
function subscribe(listener:()=>void){
  listeners.add(listener)
  if(listeners.size===1){
    const current=++generation
    const refresh=async()=>{
      try{
        const status=await rgbService.status()
        if(current!==generation)return
        if(status.enabled&&(status.apiVersion??0)>=2){
          if(!closeFrames)closeFrames=rgbService.frames(next=>{
            if(next.sessionId){
              if(next.sessionId!==lastSession){lastSession=next.sessionId;lastSequence=-1}
              if(typeof next.sequence==='number'&&next.sequence<=lastSequence)return
              if(typeof next.sequence==='number')lastSequence=next.sequence
            }
            publish(next.enabled&&next.connected&&next.keys?next.keys:null)
          },()=>publish(null))
        }else{closeFrames?.();closeFrames=undefined;publish(null)}
      }catch{if(current===generation){closeFrames?.();closeFrames=undefined;publish(null)}}
    }
    void refresh();timer=setInterval(()=>void refresh(),2000)
  }
  return()=>{
    listeners.delete(listener)
    if(!listeners.size){generation++;clearInterval(timer);closeFrames?.();closeFrames=undefined;frame=null;lastSession='';lastSequence=-1}
  }
}
/** Share actual service output across RGB, AP, RT and other keyboard previews. */
export function useServiceLighting(){return useSyncExternalStore(subscribe,()=>frame,()=>null)}
