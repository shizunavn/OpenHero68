import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'
const archive=path.resolve('service/releases/OpenHero68-RGB-Windows-x64.zip'),distribution=path.resolve(process.argv[2]??'service/dist'),quote=value=>"'"+value.replaceAll("'","''")+"'"
const command=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $packageZip=[System.IO.Compression.ZipFile]::OpenRead(${quote(archive)}); try { $packageRecords=@(foreach($packageEntry in $packageZip.Entries){ $packageStream=$packageEntry.Open(); $packageSha=[System.Security.Cryptography.SHA256]::Create(); try { $packageHash=[System.BitConverter]::ToString($packageSha.ComputeHash($packageStream)).Replace('-','').ToLowerInvariant(); [pscustomobject]@{name=$packageEntry.FullName;sha256=$packageHash;length=$packageEntry.Length} } finally {$packageStream.Dispose();$packageSha.Dispose()} }); ConvertTo-Json -Compress -InputObject $packageRecords } finally {$packageZip.Dispose()}`
const entries=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,encoding:'utf8'}))
const files=['Hero68RgbService.exe','hid-bridge.exe','runtime.exe','bootstrap.cjs','service.cjs','NODE-LICENSE.txt','README.txt']
assert.deepEqual(entries.map(e=>e.name).sort(),files.map(f=>'OpenHero68-RGB/'+f).sort())
for(const entry of entries){const source=await readFile(path.join(distribution,path.basename(entry.name)));assert.equal(entry.length,source.length);assert.equal(entry.sha256,createHash('sha256').update(source).digest('hex'))}
const hash=createHash('sha256').update(await readFile(archive)).digest('hex')
assert.match(await readFile('service/releases/SHA256SUMS.txt','utf8'),new RegExp('^'+hash+'  OpenHero68-RGB-Windows-x64.zip'))
const launcherVersion=execFileSync('powershell.exe',['-NoProfile','-Command',`[System.Diagnostics.FileVersionInfo]::GetVersionInfo(${quote(path.join(distribution,'Hero68RgbService.exe'))}).FileVersion`],{windowsHide:true,encoding:'utf8'}).trim()
assert.equal(launcherVersion,'0.3.0')
await writeFile('reports/service-package-verification.json',JSON.stringify({passed:true,launcherVersion,sha256:hash,entries},null,2))
console.log(JSON.stringify({passed:true,launcherVersion,files:entries.length,sha256:hash}))
