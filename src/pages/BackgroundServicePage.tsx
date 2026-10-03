import { ArrowDownToLine, ArrowRight, CheckCircle2, FolderOpen, Play, RefreshCw } from 'lucide-react'
import { RGB_SERVICE_DOWNLOAD, refreshRgbService, useRgbServiceState } from '../protocol/rgbServiceState'
import { useLocalServiceAccess } from '../protocol/localServiceAccess'
import { useI18n } from '../i18n'
import '../components/RgbSettingsPage.css'

export default function BackgroundServicePage({onOpenCustom}:{onOpenCustom:()=>void}) {
  const { tr } = useI18n()
  const {checking,status}=useRgbServiceState()
  const {permission}=useLocalServiceAccess()
  const blocked=permission==='denied'
  const label=blocked?tr('Permission blocked'):checking?tr('Checking'):!status?tr('Offline'):!status.connected?tr('Waiting for keyboard'):tr('Ready')
  return <div className="page settings-page background-service-page page-enter">
    <div className="settings-hero"><div><h1>{tr('Background Service')}</h1><p>{tr('Keep your Custom RGB running, even after closing the browser.')}</p></div><span className="rgb-basic-badge">{tr('Windows app')}</span></div>
    <section className="settings-card service-setup-card">
      <div className="rgb-section-heading"><div><h2>{tr('Get started')}</h2><p>{tr('Download once. Run quietly from the system tray.')}</p></div></div>
      <ol className="service-setup-steps">
        <li><span className="service-step-icon"><ArrowDownToLine size={22}/></span><div><small>{tr('STEP 1')}</small><h3>{tr('Download the app')}</h3><p>{tr('Get the portable Windows package for OpenHero68.')}</p><a className="apply-button" href={RGB_SERVICE_DOWNLOAD}>{tr('Download for Windows')}</a></div></li>
        <li><span className="service-step-icon"><FolderOpen size={22}/></span><div><small>{tr('STEP 2')}</small><h3>{tr('Extract the whole folder')}</h3><p>{tr('Choose a permanent folder and keep all included files together. Run the app from the extracted folder.')}</p></div></li>
        <li><span className="service-step-icon"><Play size={22}/></span><div><small>{tr('STEP 3')}</small><h3>{tr('Run and apply your effects')}</h3><p>{tr('Open Hero68RgbService.exe. The app appears in the system tray. Open Custom Effects, choose your layers, then Apply to keyboard.')}</p></div></li>
      </ol>
    </section>
    <section className="settings-card service-connection-card">
      <div className="rgb-section-heading"><div><h2>{tr('Connection')}</h2><p>{blocked?tr('Allow access to apps and services on this device in the browser’s site permissions, then check again.'):checking&&permission==='prompt'?tr('Choose Allow in the browser popup to connect to the background app.'):!status?tr('The service is not responding. Run the app, then check again.'):status.connected?tr('The background app and keyboard are ready.'):tr('The app is running. Connect your keyboard to apply effects.')}</p></div><span className={`service-state-pill ${status?'is-ready':''}`} role="status"><CheckCircle2 size={15}/>{label}</span></div>
      <div className="custom-rgb-actions"><button className="secondary-button" onClick={()=>void refreshRgbService()}><RefreshCw size={15}/> {tr('Check again')}</button>{status&&<a className="secondary-button" href="http://127.0.0.1:16868/" target="_blank" rel="noreferrer">{tr('Service panel')}</a>}<button className="apply-button" onClick={onOpenCustom}>{tr('Open Custom Effects')} <ArrowRight size={16}/></button></div>
      <details className="service-details"><summary>{tr('Startup and troubleshooting')}</summary><div><p>{tr('When the browser asks to access apps and services on this device, choose Allow. If you selected Block, use the site controls beside the address bar to allow it, then Check again.')}</p><p>{tr("To launch with Windows, enable Auto-start in the app's tray menu. Keep its folder in the same location.")}</p><p>{tr('If the service stays offline after Allow, open Hero68RgbService.exe again. For open-hero68.pages.dev, use an app build that supports this website. Close other keyboard configuration apps if the keyboard cannot connect.')}</p><p>{tr('To update, quit the tray app, extract the new package over its folder, and run it again.')}</p></div></details>
    </section>
  </div>
}
