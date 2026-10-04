import {execFileSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
const out=path.resolve('.refactor/native-ipc-tests');await mkdir(out,{recursive:true})
let vcvars=process.env.HERO68_VCVARS
if(!vcvars){const finder=path.join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe');const installation=execFileSync(finder,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true}).trim();vcvars=path.join(installation,'VC/Auxiliary/Build/vcvars64.bat')}
const executable=path.join(out,'ipc-output-test.exe'),script=path.join(out,'build.cmd')
await writeFile(script,`@echo off\r\ncall "${vcvars}"\r\nif errorlevel 1 exit /b %errorlevel%\r\ncl /nologo /std:c++17 /O2 /EHsc /MT "${path.resolve('tests/native-ipc-output.test.cpp')}" /Fe:"${executable}" /Fo:"${path.join(out,'ipc-output-test.obj')}"\r\n`)
execFileSync('cmd.exe',['/d','/c',script],{stdio:'inherit',windowsHide:true})
execFileSync(executable,[],{stdio:'inherit',windowsHide:true,timeout:5000})
