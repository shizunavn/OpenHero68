import { useSyncExternalStore } from 'react'
import { rgbService, confirmRgbServiceAvailable, isRgbServiceAvailable, type RgbServiceStatus } from './rgbService'
import { LEGACY_RGB_EFFECTS, type CustomRgbConfiguration } from '../keyboard/customRgbModel'

export const RGB_SERVICE_DOWNLOAD = 'https://github.com/shizunavn/OpenHero68/releases/latest/download/OpenHero68-Setup-Windows-x64.exe'
type ServiceState = { checking: boolean; status: RgbServiceStatus | null; reconnecting: boolean }
let state: ServiceState = { checking: true, status: null, reconnecting: false }
const listeners = new Set<()=>void>()
let timer: ReturnType<typeof setInterval> | undefined
let pending: Promise<RgbServiceStatus | null> | undefined
let revision = 0
export const getRgbServiceState = () => state
export function publishRgbServiceStatus(status: RgbServiceStatus | null) {
  revision++
  if(status)confirmRgbServiceAvailable()
  state = { checking: false, status, reconnecting: false }
  listeners.forEach(listener=>listener())
}
export function refreshRgbService(): Promise<RgbServiceStatus | null> {
  if (pending) return pending
  const current = revision
  pending = rgbService.status().then(status=>{
    if(current===revision)publishRgbServiceStatus(status)
    return status
  }).catch(()=>{
    if(current===revision){
      if(state.status&&isRgbServiceAvailable()){
        state={...state,reconnecting:true};listeners.forEach(listener=>listener())
      }else publishRgbServiceStatus(null)
    }
    return null
  }).finally(()=>{pending=undefined})
  return pending
}
export function subscribeRgbService(listener:()=>void) {
  listeners.add(listener)
  if(listeners.size===1){void refreshRgbService();timer=setInterval(()=>void refreshRgbService(),2000)}
  return ()=>{listeners.delete(listener);if(!listeners.size){clearInterval(timer);timer=undefined}}
}
export function useRgbServiceState(){return useSyncExternalStore(subscribeRgbService,getRgbServiceState,getRgbServiceState)}
export function unsupportedRgbEffects(config: CustomRgbConfiguration, status: RgbServiceStatus) {
  const supported = status.supportedEffects ?? LEGACY_RGB_EFFECTS
  return [...new Set([
    ...(config.baseEffect && !status.supportedBaseEffects?.includes(config.baseEffect.effect) ? [`${config.baseEffect.effect} (base)`] : []),
    ...config.layers.filter(layer=>!supported.includes(layer.effect)).map(layer=>layer.effect),
  ])]
}
