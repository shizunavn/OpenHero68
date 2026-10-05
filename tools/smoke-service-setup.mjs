// Runs actual Inno Setup and the independent worker, with a fake service.
// Separate AppId, shortcuts, state, port and mutex prevent touching a user's app/HID.
import assert from 'node:assert/strict'
import {generateKeyPairSync,createHash,sign} from 'node:crypto'
import {spawn,execFileSync} from 'node:child_process'
import {mkdir,cp,readFile,writeFile,rm,readdir} from 'node:fs/promises'
import path from 'node:path'
import {rolldown} from 'rolldown'
const workspace=process.cwd(),base=path.resolve('.refactor/setup-smoke'),install=path.join(base,'Cài đặt OpenHero68'),state=path.join(base,'state')
if(!install.startsWith(workspace+path.sep)||!base.startsWith(workspace+path.sep))throw Error('Unsafe smoke test path')
await mkdir(base,{recursive:true});await mkdir(state,{recursive:true})
const env={...process.env,OPENHERO68_SETUP_TEST:'1',OPENHERO68_TEST_STATE:state,OPENHERO68_TEST_DRIVER:'missing'}
const compiler=process.env.HERO68_ISCC??path.resolve('.refactor/setup-tools/inno/ISCC.exe')
const driver=path.resolve('.refactor/setup-tools/ViGEmBus_1.22.0_x64_x86_arm64.exe')
const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'pem',type:'spki'}).toString()
const pinned=JSON.parse((await readFile('service/updatePublicKey.ts','utf8')).match(/UPDATE_PUBLIC_KEY=(".*")/)[1])
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const endpoint='http://127.0.0.1:17868'
async function run(file,args){
 return new Promise((resolve,reject)=>{
  const child=spawn(file,args,{env,windowsHide:true,stdio:'pipe'}),chunks=[]
  child.stdout.on('data',b=>chunks.push(b));child.stderr.on('data',b=>chunks.push(b))
  const timer=setTimeout(()=>{child.kill();reject(Error('Smoke process timeout: '+file))},180000)
  child.once('error',e=>{clearTimeout(timer);reject(e)})
  child.once('exit',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks).toString()):reject(Error('Process failed '+code+': '+Buffer.concat(chunks).toString().slice(-4000)))})
 })
}
async function status(version){
 const end=Date.now()+15000
 while(Date.now()<end){try{const s=await(await fetch(endpoint+'/status',{signal:AbortSignal.timeout(500)})).json();if(s.coreVersion===version)return s}catch{}await delay(200)}
 throw Error('Fixture app did not start: '+version)
}
async function stop(){
 try{await fetch(endpoint+'/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}catch{}
 try{await run(path.resolve('service/dist/update-host.exe'),['--wait-stop'])}catch{}
}
async function build(version,{unhealthy=false}={}){
 const distro=path.join(base,'dist-'+version),release=path.join(base,'release-'+version)
 await mkdir(distro,{recursive:true});await cp(path.resolve('service/dist'),distro,{recursive:true});await mkdir(release,{recursive:true})
 let worker=await readFile(path.join(distro,'update-worker.cjs'),'utf8')
 if(!worker.includes(JSON.stringify(pinned)))throw Error('Cannot inject smoke signing key')
 await writeFile(path.join(distro,'update-worker.cjs'),worker.replace(JSON.stringify(pinned),JSON.stringify(publicKey)))
 const entry=path.join(base,'fixture-'+version+'.mjs')
 await writeFile(entry,`import {createServer} from 'node:http';import {readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';import {createSetupUpdater} from ${JSON.stringify(path.resolve('service/setupUpdater.ts').replaceAll('\\','/'))};
 const state=process.env.OPENHERO68_TEST_STATE,version=${JSON.stringify(version)},operationIndex=process.argv.indexOf('--update-operation');
 const updater=createSetupUpdater({version,stateDir:state,directory:__dirname,publicKey:${JSON.stringify(publicKey)},fetch:async url=>{
 const network=JSON.parse(readFileSync(path.join(state,'network.json'),'utf8'));
 if(url.endsWith('/latest'))return Response.json(network.release);
 const file=url.endsWith('.json')?network.manifest:network.setup;
 return new Response(readFileSync(file));}});
 const server=createServer(async(req,res)=>{let text='';for await(const c of req)text+=c;res.setHeader('Content-Type','application/json');
 if(req.url==='/status')res.end(JSON.stringify({coreVersion:version,launcherVersion:version,apiVersion:6,pid:process.pid,supportsFullUpdate:true,updateOperation:operationIndex>=0?process.argv[operationIndex+1]:undefined}));
 else if(req.url==='/updates/apply'){res.statusCode=202;res.end(JSON.stringify(updater.start()));}
 else if(req.url==='/updates')res.end(JSON.stringify(updater.status()));
 else if(req.url==='/updates/prepare')res.end('{}');
 else if(req.url==='/shutdown'){res.end('{}');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),500).unref();}
 else{res.statusCode=404;res.end('{}');}});
 ${unhealthy?'if(operationIndex>=0)process.exit(1);':''}
 server.listen(17868,'127.0.0.1');`)
 const b=await rolldown({input:entry,external:/^node:/});try{await b.write({format:'cjs',file:path.join(distro,'service.cjs')})}finally{await b.close()}
 const output=await run(compiler,[`/DAppVersion=${version}`,`/DDistribution=${distro}`,`/DReleaseDirectory=${release}`,`/DDriverInstaller=${driver}`,'/DTestBuild=1',path.resolve('service/installer/OpenHero68.iss')])
 await writeFile(path.join(base,'build-'+version+'.log'),output)
 const setup=path.join(release,'OpenHero68-Setup-Windows-x64.exe'),bytes=await readFile(setup)
 const payload={schemaVersion:1,version,apiVersion:6,platform:'windows-x64',asset:path.basename(setup),size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
 const manifest=path.join(release,'manifest.json');await writeFile(manifest,JSON.stringify({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),pair.privateKey).toString('base64')}))
 return {setup,manifest,payload}
}
async function update(next,expectedPhase){
 await writeFile(path.join(state,'network.json'),JSON.stringify({setup:next.setup,manifest:next.manifest,release:{tag_name:'v'+next.payload.version,assets:[
 {name:'OpenHero68-update.json',size:(await readFile(next.manifest)).length,browser_download_url:'https://github.com/shizunavn/OpenHero68/releases/download/v'+next.payload.version+'/OpenHero68-update.json'},
 {name:next.payload.asset,size:next.payload.size,browser_download_url:'https://github.com/shizunavn/OpenHero68/releases/download/v'+next.payload.version+'/'+next.payload.asset}
 ]}}))
 const first=await(await fetch(endpoint+'/updates/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()
 const second=await(await fetch(endpoint+'/updates/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json()
 assert.equal(first.operationId,second.operationId)
 const end=Date.now()+120000
 while(Date.now()<end){
  let result;try{result=JSON.parse(await readFile(path.join(state,'updates/status.json'),'utf8'))}catch{}
  if(result?.operationId===first.operationId&&['completed','failed'].includes(result.phase)){
   assert.equal(result.phase,expectedPhase,JSON.stringify(result));return result
  }
  await delay(250)
 }
 throw Error('Update smoke timed out')
}
const desktop=execFileSync('powershell.exe',['-NoProfile','-Command',"[Environment]::GetFolderPath('Desktop')"],{encoding:'utf8',windowsHide:true}).trim()
const shortcut=path.join(desktop,'OpenHero68 Setup Test.lnk')
let ready=false
try{
 await stop()
 const initial=await build('0.5.0'),next=await build('0.5.1'),third=await build('0.5.2.1'),bad=await build('0.5.3',{unhealthy:true})
 await run(initial.setup,['/VERYSILENT','/SUPPRESSMSGBOXES','/SP-','/NORESTART',`/DIR=${install}`,'/TASKS=desktopicon',`/LOG=${path.join(base,'install.log')}`,`/TESTREPORT=${path.join(base,'missing-driver.txt')}`]);ready=true
 assert.equal(await readFile(path.join(base,'missing-driver.txt'),'utf8'),'1|1')
 assert.equal(JSON.parse(await readFile(path.join(install,'installation.json'))).desktop,true)
 assert.ok((await readFile(shortcut)).length>0)
 await writeFile(path.join(state,'preset.json'),JSON.stringify({saved:'preserved'}))
 await run(path.join(install,'OpenHero68.exe'),[]);await status('0.5.0')
 await update(next,'completed');await status('0.5.1')
 assert.equal(JSON.parse(await readFile(path.join(install,'installation.json'))).active,'0.5.1')
 await update(third,'completed');await status('0.5.2.1')
 const failed=await update(bad,'failed');assert.match(failed.error,/healthy/);await status('0.5.2.1')
 assert.equal(JSON.parse(await readFile(path.join(install,'installation.json'))).active,'0.5.2.1')
 assert.equal(JSON.parse(await readFile(path.join(state,'preset.json'))).saved,'preserved')
 assert.ok((await readFile(shortcut)).length>0)
 // Simulate power loss at the commit boundary: the starter points at an uncommitted
 // new directory, which recovery must delete without locking its own runtime.
 await stop()
 const previousRecord=JSON.parse(await readFile(path.join(install,'installation.json')))
 const completed=JSON.parse(await readFile(path.join(state,'updates/status.json')))
 const recoveryFolder=path.join(state,'updates',completed.operationId)
 await cp(path.join(base,'dist-0.5.3'),path.join(install,'versions','0.5.3'),{recursive:true})
 await writeFile(path.join(install,'installation.json'),JSON.stringify({...previousRecord,active:'0.5.3'}))
 await writeFile(path.join(install,'active-version.txt'),'0.5.3')
 await writeFile(path.join(install,'update-transaction.json'),JSON.stringify({operationId:completed.operationId,root:install,stateDir:state,previous:previousRecord,target:'0.5.3',apiVersion:6,setup:bad.setup,phase:'restarting',backupReady:true,hadInstallation:true}))
 await run(path.join(install,'OpenHero68.exe'),[]);await status('0.5.2.1')
 assert.equal(JSON.parse(await readFile(path.join(install,'installation.json'))).active,'0.5.2.1')
 await assert.rejects(readFile(path.join(install,'update-transaction.json')))
 console.log('PASS: interrupted commit recovers using copied runtime and starts the previous app.')
 console.log('PASS: Unicode install, shortcut, two full updates, independent worker, app restart, health rollback, data preservation.')
 await stop()
 await run(path.join(install,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',`/LOG=${path.join(base,'uninstall.log')}`]);ready=false
 await assert.rejects(readFile(shortcut));assert.equal(JSON.parse(await readFile(path.join(state,'preset.json'))).saved,'preserved')
 // Install again without a Desktop shortcut.
 env.OPENHERO68_TEST_DRIVER='ready'
 await run(initial.setup,['/VERYSILENT','/SUPPRESSMSGBOXES','/SP-','/NORESTART',`/DIR=${install}`,'/TASKS=',`/LOG=${path.join(base,'no-shortcut.log')}`,`/TESTREPORT=${path.join(base,'installed-driver.txt')}`]);ready=true
 assert.equal(await readFile(path.join(base,'installed-driver.txt'),'utf8'),'0|0')
 assert.equal(JSON.parse(await readFile(path.join(install,'installation.json'))).desktop,false);await assert.rejects(readFile(shortcut))
 env.OPENHERO68_TEST_DRIVER='error'
 await run(initial.setup,['/VERYSILENT','/SUPPRESSMSGBOXES','/SP-','/NORESTART',`/DIR=${install}`,'/TASKS=',`/LOG=${path.join(base,'broken-driver.log')}`,`/TESTREPORT=${path.join(base,'broken-driver.txt')}`])
 assert.equal(await readFile(path.join(base,'broken-driver.txt'),'utf8'),'2|0')
 console.log('PASS: uninstall preserves data; unchecked shortcut is not created.')
}finally{
 await stop()
 if(ready)try{await run(path.join(install,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'])}catch{}
 // All deletion targets are explicit children of the verified smoke workspace.
 await rm(install,{recursive:true,force:true});await rm(shortcut,{force:true})
}
