import { rolldown } from 'rolldown'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const root=process.cwd(), outIndex=process.argv.indexOf('--out-dir')
if(outIndex>=0&&!process.argv[outIndex+1])throw Error('--out-dir requires a directory')
const out=outIndex>=0?path.resolve(root,process.argv[outIndex+1]):path.join(root,'service','dist')
await mkdir(out,{recursive:true})
const bundle=await rolldown({input:'service/main.ts',external:/^node:/})
try{await bundle.write({format:'cjs',file:path.join(out,'service.cjs')})}finally{await bundle.close()}
const supervisor=await rolldown({input:'service/bootstrap.ts',external:/^node:/})
try{await supervisor.write({format:'cjs',file:path.join(out,'bootstrap.cjs')})}finally{await supervisor.close()}
const vcvars=process.env.HERO68_VCVARS ?? 'D:\\BuildTools\\Product\\VC\\Auxiliary\\Build\\vcvars64.bat'
const vigem=path.join(root,'service','native','vendor','ViGEmClient')
const cmd=`call "${vcvars}" && rc /nologo /i "${root}\\service\\native" /fo "${out}\\launcher.res" "${root}\\service\\native\\launcher.rc" && cl /nologo /std:c++17 /O2 /EHsc /MT "${root}\\service\\native\\hid_bridge.cpp" /Fe:"${out}\\hid-bridge.exe" /Fo:"${out}\\hid-bridge.obj" /link hid.lib setupapi.lib user32.lib ole32.lib avrt.lib uuid.lib propsys.lib && cl /nologo /std:c++17 /O2 /EHsc /MT "${root}\\service\\native\\launcher.cpp" "${out}\\launcher.res" /Fe:"${out}\\Hero68RgbService.exe" /Fo:"${out}\\launcher.obj" /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib advapi32.lib winhttp.lib`
const sdkCmd=`call "${vcvars}" && cl /nologo /std:c++17 /O2 /EHsc /MT /I "${vigem}\\include" /c "${vigem}\\src\\ViGEmClient.cpp" /Fo:"${out}\\vigem-client.obj"`
const nativeCmd=sdkCmd+' && '+cmd.slice(cmd.indexOf(' && ')+4).replace(' /Fe:"'+out+'\\hid-bridge.exe"',' /I "'+vigem+'\\include" /Fe:"'+out+'\\hid-bridge.exe"').replace('/link hid.lib','/link "'+out+'\\vigem-client.obj" xinput.lib hid.lib')
const built=spawnSync('cmd.exe',['/d','/s','/c',nativeCmd],{stdio:'inherit',windowsVerbatimArguments:true})
if(built.status!==0)process.exit(built.status??1)
await copyFile(process.execPath,path.join(out,'runtime.exe'))
await copyFile(path.join(vigem,'LICENSE'),path.join(out,'VIGEMCLIENT-LICENSE.txt'))
const license=await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`)
if(!license.ok)throw Error('Could not retrieve bundled Node runtime license')
await writeFile(path.join(out,'NODE-LICENSE.txt'),await license.text())
await writeFile(path.join(out,'README.txt'),'OpenHero68 RGB Service core 0.4.2 / launcher 0.4.2 - Windows x64\r\nSupported website: https://open-hero68.pages.dev. Choose Allow when the browser asks to access apps on this device. Extract the ZIP to a permanent folder, then run Hero68RgbService.exe.\r\nRight-click its tray icon for Start/Stop, updates, logs, Auto-start and Quit.\r\nAuto-start is optional, per Windows user, and disabled by default. Keep the folder at the same path after enabling it. Disable Auto-start before moving/deleting the folder.\r\nUse Custom Effects > Apply to keyboard in Open-Hero68 to send a preset.\r\nKeep every file in this folder together. No Node/Python installation required.\r\nControl panel: http://127.0.0.1:16868/\r\nPreset and logs: %LOCALAPPDATA%\\OpenHero68\\rgb-service\r\nDownloads: https://github.com/shizunavn/OpenHero68/releases/latest\r\nRhythm Sync captures system audio natively. Custom and Rhythm target 60 FPS. Actual Hall and LED rates depend on hardware. Side rhythm is gated until verified.\r\nGamepad uses the official separately installed ViGEmBus 1.22.0 driver. Gamepad starts disabled; configure it in the web app. Hall reads are shared on demand at up to 200 Hz for gamepad and 100 Hz for RGB. VIGEMCLIENT-LICENSE.txt contains the static client license.\r\nThe tray Check for updates installs signed compatible core updates automatically, or downloads a verified ZIP for launcher updates.\r\n')
console.log(`Built ${out}\\Hero68RgbService.exe`)
