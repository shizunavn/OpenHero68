import { ArrowDownToLine, ArrowRight, CheckCircle2, FolderOpen, Play, RefreshCw } from 'lucide-react'
import { RGB_SERVICE_DOWNLOAD, refreshRgbService, useRgbServiceState } from '../protocol/rgbServiceState'
import { useLocalServiceAccess } from '../protocol/localServiceAccess'
import '../components/RgbSettingsPage.css'

export default function BackgroundServicePage({onOpenCustom}:{onOpenCustom:()=>void}) {
  const {checking,status}=useRgbServiceState()
  const {permission}=useLocalServiceAccess()
  const blocked=permission==='denied'
  const label=blocked?'Permission blocked':checking?'Checking':!status?'Offline':!status.connected?'Waiting for keyboard':'Ready'
  return <div className="page settings-page background-service-page page-enter">
    <div className="settings-hero"><div><h1>Background Service</h1><p>Keep your Custom RGB running, even after closing the browser.</p></div><span className="rgb-basic-badge">Windows app</span></div>
    <section className="settings-card service-setup-card">
      <div className="rgb-section-heading"><div><h2>Get started</h2><p>Download once. Run quietly from the system tray.</p></div></div>
      <ol className="service-setup-steps">
        <li><span className="service-step-icon"><ArrowDownToLine size={22}/></span><div><small>STEP 1</small><h3>Download the app</h3><p>Get the portable Windows package for OpenHero68.</p><a className="apply-button" href={RGB_SERVICE_DOWNLOAD}>Download for Windows</a></div></li>
        <li><span className="service-step-icon"><FolderOpen size={22}/></span><div><small>STEP 2</small><h3>Extract the whole folder</h3><p>Choose a permanent folder and keep all included files together. Run the app from the extracted folder.</p></div></li>
        <li><span className="service-step-icon"><Play size={22}/></span><div><small>STEP 3</small><h3>Run and apply your effects</h3><p>Open <code>Hero68RgbService.exe</code>. The app appears in the system tray. Open Custom Effects, choose your layers, then Apply to keyboard.</p></div></li>
      </ol>
    </section>
    <section className="settings-card service-connection-card">
      <div className="rgb-section-heading"><div><h2>Connection</h2><p>{blocked?'Allow access to apps and services on this device in the browser’s site permissions, then check again.':checking&&permission==='prompt'?'Choose Allow in the browser popup to connect to the background app.':!status?'The service is not responding. Run the app, then check again.':status.connected?'The background app and keyboard are ready.':'The app is running. Connect your keyboard to apply effects.'}</p></div><span className={`service-state-pill ${status?'is-ready':''}`} role="status"><CheckCircle2 size={15}/>{label}</span></div>
      <div className="custom-rgb-actions"><button className="secondary-button" onClick={()=>void refreshRgbService()}><RefreshCw size={15}/> Check again</button>{status&&<a className="secondary-button" href="http://127.0.0.1:16868/" target="_blank" rel="noreferrer">Service panel</a>}<button className="apply-button" onClick={onOpenCustom}>Open Custom Effects <ArrowRight size={16}/></button></div>
      <details className="service-details"><summary>Startup and troubleshooting</summary><div><p>When the browser asks to access apps and services on this device, choose Allow. If you selected Block, use the site controls beside the address bar to allow it, then Check again.</p><p>To launch with Windows, enable Auto-start in the app's tray menu. Keep its folder in the same location.</p><p>If the service stays offline after Allow, open Hero68RgbService.exe again. For open-hero68.pages.dev, use an app build that supports this website. Close other keyboard configuration apps if the keyboard cannot connect.</p><p>To update, quit the tray app, extract the new package over its folder, and run it again.</p></div></details>
    </section>
  </div>
}
