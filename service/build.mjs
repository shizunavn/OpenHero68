import {rolldown} from 'rolldown'
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises'
import {spawnSync,execFileSync} from 'node:child_process'
import path from 'node:path'
const root=process.cwd(),version=JSON.parse(await readFile('service/version.json','utf8'))
const index=process.argv.indexOf('--out-dir'),out=path.resolve(index>=0?process.argv[index+1]:'service/dist')
await mkdir(out,{recursive:true})
for(const [input,name] of [['service/main.ts','service.cjs'],['service/bootstrap.ts','bootstrap.cjs'],['service/updateWorker.ts','update-worker.cjs']]){
 const bundle=await rolldown({input,external:/^node:/})
 try{await bundle.write({format:'cjs',file:path.join(out,name)})}finally{await bundle.close()}
}
const header='#pragma once\n#define HERO68_VERSION_W L"'+version.version+'"\n#define HERO68_VERSION_TEXT "'+version.version+'\\0"\n#define HERO68_VERSION_NUMBERS '+version.version.replaceAll('.',',')+',0\n'
await writeFile(path.join(out,'version.h'),header)
let vcvars=process.env.HERO68_VCVARS
if(!vcvars){
 const vswhere=path.join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe')
 try{const vs=execFileSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true}).trim();if(vs)vcvars=path.join(vs,'VC','Auxiliary','Build','vcvars64.bat')}catch{}
}
if(!vcvars)throw Error('Install Visual Studio C++ Build Tools or set HERO68_VCVARS')
const q=s=>'"'+s+'"',vigem=path.join(root,'service/native/vendor/ViGEmClient'),native=path.join(root,'service/native')
const compile=(name,extra='')=>'cl /nologo /std:c++17 /O2 /EHsc /MT /I '+q(out)+' /I '+q(path.join(vigem,'include'))+' '+q(path.join(native,name+'.cpp'))+' /Fe:'+q(path.join(out,name==='launcher'?'Hero68RgbService.exe':name==='update_host'?'update-host.exe':'hid-bridge.exe'))+' /Fo:'+q(path.join(out,name+'.obj'))+' '+extra
const commands=[
 'call '+q(vcvars),
 'cl /nologo /std:c++17 /O2 /EHsc /MT /I '+q(path.join(vigem,'include'))+' /c '+q(path.join(vigem,'src/ViGEmClient.cpp'))+' /Fo:'+q(path.join(out,'vigem-client.obj')),
 'rc /nologo /i '+q(out)+' /i '+q(native)+' /fo '+q(path.join(out,'launcher.res'))+' '+q(path.join(native,'launcher.rc')),
 compile('hid_bridge','/link '+q(path.join(out,'vigem-client.obj'))+' xinput.lib hid.lib setupapi.lib user32.lib ole32.lib avrt.lib uuid.lib propsys.lib'),
 compile('launcher',q(path.join(out,'launcher.res'))+' /link /SUBSYSTEM:WINDOWS user32.lib shell32.lib advapi32.lib winhttp.lib'),
 compile('update_host','/link /SUBSYSTEM:WINDOWS '+q(path.join(out,'vigem-client.obj'))+' user32.lib shell32.lib advapi32.lib setupapi.lib')
]
const result=spawnSync('cmd.exe',['/d','/s','/c',commands.join(' && ')],{windowsHide:true,stdio:'inherit',windowsVerbatimArguments:true})
if(result.status!==0)process.exit(result.status??1)
await copyFile(process.execPath,path.join(out,'runtime.exe'))
await copyFile(path.join(vigem,'LICENSE'),path.join(out,'VIGEMCLIENT-LICENSE.txt'))
const license=await fetch('https://raw.githubusercontent.com/nodejs/node/v'+process.versions.node+'/LICENSE')
if(!license.ok)throw Error('Cannot fetch Node license')
await writeFile(path.join(out,'NODE-LICENSE.txt'),await license.text())
await writeFile(path.join(out,'README.txt'),'OpenHero68 '+version.version+' - Windows x64\r\nInstall using OpenHero68-Setup-Windows-x64.exe. No Node/Python required.\r\nUpdates close and restart the app only, never Windows.\r\nSettings and logs: %LOCALAPPDATA%/OpenHero68/rgb-service\r\nGamepad driver is optional. Gamepad starts disabled.\r\nWebsite: https://open-hero68.pages.dev/\r\n')
console.log('Built service '+version.version+' in '+out)
