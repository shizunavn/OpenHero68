import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { useI18n } from '../i18n'
import { useLocalServiceAccess } from '../protocol/localServiceAccess'
import { refreshRgbService } from '../protocol/rgbServiceState'
import './LocalServicePermissionGuide.css'

export default function LocalServicePermissionGuide() {
  const access = useLocalServiceAccess()
  return <LocalServicePermissionNotice permission={access.permission} prompted={access.prompted}/>
}

export function LocalServicePermissionNotice({permission,prompted}:{permission:PermissionState|'unknown';prompted:boolean}) {
  const { tr } = useI18n()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || !prompted || permission === 'granted') return null
  const blocked = permission === 'denied'

  return <aside className="local-service-guide" aria-label={tr('Browser connection permission')}>
    <svg className="local-service-guide-arrow" viewBox="0 0 140 100" aria-hidden="true"><path d="M132 84 C65 88 67 29 12 14 M12 14 L34 13 M12 14 L23 35"/></svg>
    <div className="local-service-guide-card" role="status">
      <ShieldCheck className="local-service-guide-icon" size={24}/>
      <button className="local-service-guide-close" aria-label={tr('Dismiss permission guidance')} onClick={() => setDismissed(true)}><X size={17}/></button>
      <strong>{blocked ? tr('Allow access in site permissions') : tr('Click Allow in the browser popup')}</strong>
      <p>{blocked ? tr('Open the site controls beside the address bar. Allow access to apps and services on this device, then check again.') : tr('This lets OpenHero68 connect to the background app on your computer. The browser remembers your choice.')}</p>
      {blocked
        ? <button className="local-service-guide-retry" onClick={() => void refreshRgbService()}>{tr('Check again')}</button>
        : <small>{tr('Look near the address bar \u2191 \u00b7 Preview works without this permission.')}</small>
      }
    </div>
  </aside>
}
