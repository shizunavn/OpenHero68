import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, CircleHelp, Cpu, ExternalLink, Gamepad2, Keyboard, RefreshCw } from 'lucide-react'
import { RGB_SERVICE_DOWNLOAD, refreshRgbService, useRgbServiceState } from '../protocol/rgbServiceState'
import { gamepadService, VIGEMBUS_DOWNLOAD, VIGEMBUS_RELEASE } from '../protocol/gamepadService'
import { useLocalServiceAccess } from '../protocol/localServiceAccess'
import { useI18n } from '../i18n'
import '../components/RgbSettingsPage.css'
import './BackgroundServicePage.css'

const VI: Record<string, string> = {
  'Custom RGB, Rhythm Sync and Gamepad keep running when you close the browser.': 'Custom RGB, Rhythm Sync và Gamepad tiếp tục chạy khi bạn đóng trình duyệt.',
  'Your connection': 'Kết nối của bạn',
  'Windows service': 'Dịch vụ Windows',
  'Running': 'Đang chạy', 'Not running': 'Chưa chạy',
  'Connected': 'Đã kết nối', 'Not connected': 'Chưa kết nối',
  'Installed': 'Đã cài', 'Not installed': 'Chưa cài', 'Not checked': 'Chưa kiểm tra',
  'Service update needed': 'Cần cập nhật service', 'Windows app': 'Ứng dụng Windows',
  'Required for Custom RGB, Rhythm Sync and Gamepad.': 'Cần cho Custom RGB, Rhythm Sync và Gamepad.',
  'Download Windows app': 'Tải ứng dụng Windows',
  'Extract the ZIP to a permanent folder.': 'Giải nén ZIP vào một thư mục cố định.',
  'Run Hero68RgbService.exe; its icon stays in the system tray.': 'Mở Hero68RgbService.exe; biểu tượng sẽ nằm ở khay hệ thống.',
  'Choose Allow if the browser asks to connect to local apps.': 'Chọn Cho phép khi trình duyệt hỏi quyền kết nối ứng dụng trên máy.',
  'Xbox controller driver': 'Driver tay cầm Xbox',
  'Only needed for Gamepad. RGB works without this driver.': 'Chỉ cần cho Gamepad. RGB vẫn hoạt động khi chưa cài driver này.',
  'Download ViGEmBus': 'Tải ViGEmBus', 'Official release': 'Bản phát hành chính thức',
  'Open the installer and follow its instructions. Windows may ask for administrator permission.': 'Mở trình cài đặt và làm theo hướng dẫn. Windows có thể yêu cầu quyền quản trị.',
  'Restart Windows if requested, reopen the service, then check the connection here.': 'Khởi động lại Windows nếu được yêu cầu, mở lại service rồi kiểm tra kết nối tại đây.',
  'Service and keyboard are ready.': 'Service và bàn phím đã sẵn sàng.',
  'Open the Windows app to connect.': 'Mở ứng dụng Windows để kết nối.',
  'Connect HERO68 to your computer.': 'Kết nối HERO68 với máy tính.',
  'Checking the service and driver…': 'Đang kiểm tra service và driver…',
  'Allow local app access in your browser’s site permissions, then check again.': 'Cho phép truy cập ứng dụng trên máy trong quyền của trang web, rồi kiểm tra lại.',
  'Open Gamepad': 'Mở Gamepad', 'Need help?': 'Cần trợ giúp?',
  'Start with Windows': 'Chạy cùng Windows',
  'Enable Auto-start from the service tray menu. Keep the app folder in the same location.': 'Bật Auto-start trong menu khay hệ thống của service. Giữ nguyên vị trí thư mục ứng dụng.',
  'Update the app': 'Cập nhật ứng dụng',
  'Stop Gamepad, quit the tray app, replace its folder with the new package and run it again.': 'Tắt Gamepad, thoát ứng dụng ở khay hệ thống, thay thư mục bằng gói mới rồi mở lại.',
  'Keyboard not detected': 'Không tìm thấy bàn phím',
  'Close other keyboard configuration apps and reconnect HERO68.': 'Đóng ứng dụng cấu hình bàn phím khác và kết nối lại HERO68.',
  'Driver installed but Gamepad unavailable': 'Đã cài driver nhưng chưa dùng được Gamepad',
  'Check again after restarting the service. If Xbox creation still fails, restart Windows.': 'Kiểm tra lại sau khi khởi động lại service. Nếu vẫn lỗi tạo Xbox controller, khởi động lại Windows.',
}
type DriverState = 'checking' | 'ready' | 'missing' | 'update' | 'unknown'

export default function BackgroundServicePage({ onOpenCustom, onOpenGamepad }: { onOpenCustom: () => void; onOpenGamepad: () => void }) {
  const { language, tr } = useI18n(), t = (text: string) => language === 'vi' ? VI[text] ?? tr(text) : text
  const { checking, status, reconnecting } = useRgbServiceState()
  const { permission } = useLocalServiceAccess()
  const [driver, setDriver] = useState<DriverState>('checking')
  const [attempt, setAttempt] = useState(0)
  const online = !!status && !reconnecting, blocked = permission === 'denied'
  useEffect(() => {
    if (!online) { setDriver('unknown'); return }
    let active = true, revision = 0
    setDriver('checking')
    const accept = (value: Awaited<ReturnType<typeof gamepadService.status>>) => {
      if (active) setDriver(value.capabilities?.gamepad !== true ? 'update' : value.driverAvailable === true ? 'ready' : 'missing')
    }
    const close = gamepadService.stream(value => { revision++; accept(value) }, () => { revision++; if (active) setDriver('unknown') })
    void gamepadService.status().then(value => { if (!revision) accept(value) }).catch(() => { if (active && !revision) setDriver('unknown') })
    return () => { active = false; close() }
  }, [online, attempt])
  const checkingConnection = checking || driver === 'checking'
  const rows = [
    { icon: Cpu, name: t('Windows service'), value: t(blocked ? 'Permission blocked' : checking ? 'Checking' : online ? 'Running' : 'Not running'), ready: online && !blocked },
    { icon: Keyboard, name: 'HERO68', value: t(online && status?.connected ? 'Connected' : 'Not connected'), ready: online && !!status?.connected },
    { icon: Gamepad2, name: 'ViGEmBus', value: t(driver === 'ready' ? 'Installed' : driver === 'missing' ? 'Not installed' : driver === 'update' ? 'Service update needed' : driver === 'checking' ? 'Checking' : 'Not checked'), ready: online && driver === 'ready' },
  ]
  return <div className="page settings-page background-service-page page-enter">
    <header className="bs-heading"><h1>{tr('Background Service')}</h1><p>{t('Custom RGB, Rhythm Sync and Gamepad keep running when you close the browser.')}</p></header>
    <section className="bs-connection" aria-label={t('Your connection')}>
      <div className="bs-connection-top"><h2>{t('Your connection')}</h2><button className="bs-text-button" disabled={checkingConnection} onClick={() => { setAttempt(n => n + 1); void refreshRgbService() }}><RefreshCw size={14} className={checkingConnection ? 'bs-spinning' : ''}/>{tr('Check again')}</button></div>
      <div className="bs-status-grid">{rows.map(({ icon: Icon, name, value, ready }) => <div className={`bs-status ${ready ? 'is-ready' : ''}`} key={name}><span className="bs-status-icon"><Icon size={19}/></span><span><strong>{name}</strong><small><i/>{value}</small></span>{ready && <Check className="bs-check" size={16}/>}</div>)}</div>
      <p className={`bs-connection-note ${blocked ? 'is-warning' : ''}`} role="status">{t(blocked ? 'Allow local app access in your browser’s site permissions, then check again.' : checkingConnection ? 'Checking the service and driver…' : !online ? 'Open the Windows app to connect.' : !status?.connected ? 'Connect HERO68 to your computer.' : 'Service and keyboard are ready.')}</p>
    </section>
    <div className="bs-install-grid">
      <section className="bs-install-card">
        <div className="bs-install-heading"><span className="bs-install-icon"><Cpu size={25}/></span><div><h2>{t('Windows app')}</h2><p>{t('Required for Custom RGB, Rhythm Sync and Gamepad.')}</p></div></div>
        <a className="apply-button bs-download" href={RGB_SERVICE_DOWNLOAD}><ArrowDownToLine size={17}/>{t('Download Windows app')}<span>Windows x64 · ZIP</span></a>
        <ol className="bs-steps"><li>{t('Extract the ZIP to a permanent folder.')}</li><li>{t('Run Hero68RgbService.exe; its icon stays in the system tray.')}</li><li>{t('Choose Allow if the browser asks to connect to local apps.')}</li></ol>
      </section>
      <section className="bs-install-card">
        <div className="bs-install-heading"><span className="bs-install-icon"><Gamepad2 size={25}/></span><div><h2>{t('Xbox controller driver')}</h2><p>{t('Only needed for Gamepad. RGB works without this driver.')}</p></div></div>
        <a className="apply-button bs-download" href={VIGEMBUS_DOWNLOAD}><ArrowDownToLine size={17}/>{t('Download ViGEmBus')}<span>v1.22.0 · EXE</span></a>
        <ol className="bs-steps"><li>{t('Open the installer and follow its instructions. Windows may ask for administrator permission.')}</li><li>{t('Restart Windows if requested, reopen the service, then check the connection here.')}</li></ol>
        <a className="bs-official" href={VIGEMBUS_RELEASE} target="_blank" rel="noreferrer">{t('Official release')}<ExternalLink size={12}/></a>
      </section>
    </div>
    <div className="bs-actions"><button className="secondary-button" disabled={!online} onClick={onOpenCustom}>{tr('Open Custom Effects')}<ArrowRight size={15}/></button><button className="secondary-button" disabled={!online || driver !== 'ready'} onClick={onOpenGamepad}>{t('Open Gamepad')}<ArrowRight size={15}/></button>{online && <a className="bs-text-button" href="http://127.0.0.1:16868/" target="_blank" rel="noreferrer">{tr('Service panel')}<ExternalLink size={13}/></a>}</div>
    <details className="bs-help"><summary><CircleHelp size={17}/>{t('Need help?')}<ChevronRight size={16}/></summary><div className="bs-help-grid">{[
      ['Start with Windows', 'Enable Auto-start from the service tray menu. Keep the app folder in the same location.'],
      ['Update the app', 'Stop Gamepad, quit the tray app, replace its folder with the new package and run it again.'],
      ['Keyboard not detected', 'Close other keyboard configuration apps and reconnect HERO68.'],
      ['Driver installed but Gamepad unavailable', 'Check again after restarting the service. If Xbox creation still fails, restart Windows.'],
    ].map(([title, text]) => <div key={title}><h3>{t(title)}</h3><p>{t(text)}</p></div>)}</div></details>
  </div>
}
