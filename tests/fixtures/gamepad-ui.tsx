import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import GamepadPage from '../../src/pages/GamepadPage'
import BackgroundServicePage from '../../src/pages/BackgroundServicePage'
import {I18nProvider} from '../../src/i18n'
import '../../src/styles/index.css'
function Fixture(){const [slot,setSlot]=useState(0),[page,setPage]=useState('gamepad'),[language,setLanguage]=useState<'en'|'vi'>('vi');return <I18nProvider language={language}><main style={{maxWidth:1200,margin:'auto',padding:24}}><nav style={{display:'flex',gap:8,marginBottom:20}}><button onClick={()=>setPage('gamepad')}>Gamepad</button><button onClick={()=>setPage('service')}>Background Service</button><button onClick={()=>setLanguage(language==='vi'?'en':'vi')}>VI / EN</button>{[0,1,2].map(n=><button key={n} onClick={()=>setSlot(n)}>P{n+1}</button>)}</nav>{page==='gamepad'?<GamepadPage key={slot} slot={slot} onSetup={()=>setPage('service')}/>:<BackgroundServicePage onOpenCustom={()=>{}} onOpenGamepad={()=>setPage('gamepad')}/>}</main></I18nProvider>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>)
