import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import GamepadPage from '../../src/pages/GamepadPage'
import '../../src/styles/index.css'
function Fixture(){const [slot,setSlot]=useState(0);return <main style={{maxWidth:1200,margin:'auto',padding:24}}><nav>{[0,1,2].map(n=><button key={n} onClick={()=>setSlot(n)}>P{n+1}</button>)}</nav><GamepadPage key={slot} slot={slot} onSetup={()=>{}}/></main>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>)
