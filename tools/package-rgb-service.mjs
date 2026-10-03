// Node entry point works with Windows policies that require signed .ps1 files.
// The inline command only invokes .NET's ZIP API; no execution policy is changed.
import {mkdir,mkdtemp,copyFile,readFile,writeFile,rm,stat} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root=process.cwd(),distribution=path.resolve(process.argv[2]??'service/dist')
const release=path.resolve(process.argv[3]??path.join(root,'service/releases')),temporary=path.join(root,'.refactor')
await mkdir(release,{recursive:true});await mkdir(temporary,{recursive:true})
const stage=await mkdtemp(path.join(temporary,'rgb-package-')),folder=path.join(stage,'OpenHero68-RGB')
await mkdir(folder)
const files=['Hero68RgbService.exe','hid-bridge.exe','runtime.exe','bootstrap.cjs','service.cjs','NODE-LICENSE.txt','VIGEMCLIENT-LICENSE.txt','README.txt']
for(const file of files)await copyFile(path.join(distribution,file),path.join(folder,file))
const archive=path.join(release,'OpenHero68-RGB-Windows-x64.zip'),quote=value=>"'"+value.replaceAll("'","''")+"'"
await rm(archive,{force:true})
const entries=files.map(file=>`[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($packageZip,${quote(path.join(folder,file))},${quote('OpenHero68-RGB/'+file)},[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null`).join('; ')
execFileSync('powershell.exe',['-NoProfile','-Command',`Add-Type -AssemblyName System.IO.Compression.FileSystem; Add-Type -AssemblyName System.IO.Compression; $packageZip=[System.IO.Compression.ZipFile]::Open(${quote(archive)},[System.IO.Compression.ZipArchiveMode]::Create); try { ${entries} } finally { $packageZip.Dispose() }`],{windowsHide:true,stdio:'inherit'})
const bytes=await readFile(archive),hash=createHash('sha256').update(bytes).digest('hex')
await writeFile(path.join(release,'SHA256SUMS.txt'),`${hash}  OpenHero68-RGB-Windows-x64.zip\n`)
console.log(JSON.stringify({archive,bytes:(await stat(archive)).size,sha256:hash,files}))
