import { rgbService } from './rgbService'
import { publishRgbServiceStatus } from './rgbServiceState'
import { hero68DeviceManager } from './hero68/webhid'
import { TachyonLighting, validTachyonSnapshot } from './hero68/tachyonLighting'

const storageKey = 'openhero68:tachyon-lighting'
let lighting: TachyonLighting | undefined
function directLighting() {
  if (!lighting) {
    let saved: unknown
    try { saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') } catch { /* No saved lighting. */ }
    lighting = new TachyonLighting(validTachyonSnapshot(saved) ? saved : null, snapshot => {
      if (snapshot) localStorage.setItem(storageKey, JSON.stringify(snapshot))
      else localStorage.removeItem(storageKey)
    })
  }
  return lighting
}

export async function setTachyonLighting(enabled: boolean) {
  const status = await rgbService.status().catch(error => {
    if (hero68DeviceManager.viaService) throw error
    return null
  })
  if (status) {
    if (!status.supportsTachyon) {
      await rgbService.stop()
      throw Error('Update the background app to use Tachyon Mode.')
    }
    const transfer = hero68DeviceManager.connected && !hero68DeviceManager.viaService
    if (transfer) await hero68DeviceManager.disconnect()
    const result = await rgbService.tachyon(enabled)
    if (transfer && result.connected) await hero68DeviceManager.connectViaService()
    publishRgbServiceStatus(result)
    // A snapshot from an earlier direct connection must also survive switching transports.
    if (!enabled) await directLighting().restore(hero68DeviceManager)
  } else if (enabled) await directLighting().disable(hero68DeviceManager)
  else await directLighting().restore(hero68DeviceManager)
}
