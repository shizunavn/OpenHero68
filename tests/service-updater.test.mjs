import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash,generateKeyPairSync,sign} from 'node:crypto'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {rolldown} from 'rolldown'

async function bundle(input){const b=await rolldown({input,external:/^node:/});try{const {output}=await b.generate({format:'esm',codeSplitting:false});return import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`)}finally{await b.close()}}
const {createServiceUpdater}=await bundle('service/updater.ts')
const {superviseCore}=await bundle('service/coreSupervisor.ts')
const {verifyCore}=await bundle('service/updatePackage.ts')
const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'pem',type:'spki'}).toString()
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex')
const prefix='https://github.com/shizunavn/OpenHero68-RGB-Service/releases/download/v'

function fixture({version='0.2.3',minLauncher='0.2.3',apiVersion=5,coreVersion='0.2.3',launcherVersion='0.2.3',mutate=()=>{}}={}){
  const core=Buffer.from('verified core '+version),zip=Buffer.from('verified Windows package '+version)
  const payload={version,apiVersion,minLauncher,sha256:digest(core).slice(7),size:core.length,asset:'OpenHero68-RGB-core.cjs'}
  const signed={payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),pair.privateKey).toString('base64')}
  const manifest=Buffer.from(JSON.stringify(signed))
  const values=new Map([['OpenHero68-RGB-core.json',manifest],['OpenHero68-RGB-core.cjs',core],['OpenHero68-RGB-Windows-x64.zip',zip]])
  const release={tag_name:'v'+version,assets:[...values].map(([name,bytes])=>({name,size:bytes.length,digest:digest(bytes),browser_download_url:prefix+version+'/'+name}))}
  mutate({release,signed,values})
  const calls=[]
  const request=async url=>{calls.push(url);if(url.endsWith('/latest'))return Response.json(release);return new Response(values.get(url.split('/').at(-1))??'',{status:values.has(url.split('/').at(-1))?200:404})}
  return {options:{coreVersion,launcherVersion,fetch:request,publicKey},calls,release,values,zip,core,signed}
}
async function withUpdater(config,run){const stateDir=await mkdtemp(path.join(os.tmpdir(),'hero68-update-test-'));const f=fixture(config);try{await run(createServiceUpdater({...f.options,stateDir}),f,stateDir)}finally{await rm(stateDir,{recursive:true,force:true})}}

test('updater considers native compatibility even when the core already equals latest',async()=>{
  for(const [coreVersion,launcherVersion,version,minLauncher,available,requiresFullPackage] of [
    ['0.2.3','0.2.1','0.2.3','0.2.3',true,true],
    ['0.2.2','0.2.1','0.2.3','0.2.3',true,true],
    ['0.2.3','0.2.3','0.2.3','0.2.3',false,false],
    ['0.2.3','0.2.3','0.2.4','0.2.3',true,false],
    ['0.2.3','0.2.3','0.2.4','0.2.4',true,true],
    ['0.2.4','0.2.1','0.2.3','0.2.3',false,false]
  ])await withUpdater({coreVersion,launcherVersion,version,minLauncher},async updater=>{const result=await updater.latestCore();assert.equal(result.available,available);assert.equal(result.requiresFullPackage,requiresFullPackage)})
  await withUpdater({apiVersion:6},async updater=>{assert.equal((await updater.latestCore()).requiresFullPackage,true)})
})

test('compatible core staging reuses the signed manifest and does not download the large ZIP',async()=>{
  await withUpdater({version:'0.2.4'},async(updater,f,state)=>{
    const release=await updater.latestCore();assert.equal(await updater.stageCoreUpdate(release),'0.2.4')
    assert.equal(f.calls.filter(url=>url.endsWith('.json')).length,1)
    assert.equal(f.calls.filter(url=>url.endsWith('.cjs')).length,1)
    assert.equal(f.calls.some(url=>url.endsWith('.zip')),false)
    const pending=JSON.parse(await readFile(path.join(state,'core/pending.json'),'utf8'))
    assert.equal(verifyCore(pending,await readFile(path.join(state,'core/0.2.4/service.cjs')),publicKey,'0.2.3'),'0.2.4')
  })
})

test('renamed GitHub repository supports signed core and full Windows package downloads',async()=>{
  const rename=({release})=>{for(const asset of release.assets)asset.browser_download_url=asset.browser_download_url.replace('OpenHero68-RGB-Service/','OpenHero68/')}
  await withUpdater({version:'0.3.1',coreVersion:'0.3.0',launcherVersion:'0.3.0',minLauncher:'0.3.0',mutate:rename},async(updater,f)=>{
    const release=await updater.latestCore()
    assert.equal(release.requiresFullPackage,false)
    assert.equal(await updater.stageCoreUpdate(release),'0.3.1')
    assert.equal(f.calls[0],'https://api.github.com/repos/shizunavn/OpenHero68/releases/latest')
    assert.ok(f.calls.slice(1).every(url=>url.startsWith('https://github.com/shizunavn/OpenHero68/releases/download/')))
  })
  await withUpdater({version:'0.3.1',coreVersion:'0.2.3',launcherVersion:'0.2.3',minLauncher:'0.3.0',mutate:rename},async(updater,f)=>{
    const release=await updater.latestCore()
    assert.equal(release.requiresFullPackage,true)
    assert.deepEqual(await readFile(await updater.downloadFullPackage(release)),f.zip)
  })
})

test('update source allowlist rejects lookalike hosts, owners and repository names before fetch',async()=>{
  for(const url of [
    'https://github.com.evil.test/shizunavn/OpenHero68/releases/download/v0.3.1/core.json',
    'https://github.com/other/OpenHero68/releases/download/v0.3.1/core.json',
    'https://github.com/shizunavn/OpenHero68-fake/releases/download/v0.3.1/core.json',
    'https://github.com/shizunavn/OpenHero68-RGB-Service-fake/releases/download/v0.3.1/core.json',
    'http://github.com/shizunavn/OpenHero68/releases/download/v0.3.1/core.json',
    'https://github.com/shizunavn/OpenHero68/raw/main/core.json',
  ])await withUpdater({mutate:({release})=>release.assets[0].browser_download_url=url},async(updater,f)=>{
    await assert.rejects(updater.latestCore(),/Unexpected update source/)
    assert.equal(f.calls.length,1)
  })
})

test('full package is downloaded once, checksum checked, cached and redownloaded if cache is corrupt',async()=>{
  await withUpdater({launcherVersion:'0.2.1'},async(updater,f)=>{
    const release=await updater.latestCore()
    await assert.rejects(updater.stageCoreUpdate(release),/new EXE/)
    const [first,second]=await Promise.all([updater.downloadFullPackage(release),updater.downloadFullPackage(release)])
    assert.equal(first,second);assert.deepEqual(await readFile(first),f.zip)
    await updater.downloadFullPackage(release)
    assert.equal(f.calls.filter(url=>url.endsWith('.zip')).length,1)
    await writeFile(first,'corrupt cache');await updater.downloadFullPackage(release)
    assert.equal(f.calls.filter(url=>url.endsWith('.zip')).length,2)
    assert.deepEqual(await readFile(first),f.zip)
  })
})

test('concurrent checks share requests; a failed check can be retried',async()=>{
  await withUpdater({},async(updater,f)=>{await Promise.all([updater.latestCore(),updater.latestCore(),updater.latestCore()]);assert.equal(f.calls.length,2)})
  const f=fixture();let fail=true
  const updater=createServiceUpdater({...f.options,stateDir:os.tmpdir(),fetch:async(...args)=>{if(fail){fail=false;return new Response('',{status:503})}return f.options.fetch(...args)}})
  await assert.rejects(updater.latestCore(),/503/);assert.equal((await updater.latestCore()).available,false)
})

test('tampered manifest, release mismatch and malformed assets fail before installation',async()=>{
  for(const mutate of [
    ({values,signed})=>values.set('OpenHero68-RGB-core.json',Buffer.from(JSON.stringify({...signed,signature:'AAAA'}))),
    ({release})=>release.tag_name='v0.2.4',
    ({release})=>release.assets[0].size=9000,
    ({release})=>release.assets[0].browser_download_url='https://example.com/core.json'
  ])await withUpdater({mutate},async updater=>{await assert.rejects(updater.latestCore())})
})

test('corrupt ZIP or core never creates an installed or pending update',async()=>{
  await withUpdater({launcherVersion:'0.2.1',mutate:({values})=>values.set('OpenHero68-RGB-Windows-x64.zip',Buffer.from('corrupt'))},async(updater,_,state)=>{
    await assert.rejects(updater.downloadFullPackage(await updater.latestCore()),/checksum/)
    await assert.rejects(readFile(path.join(state,'downloads/OpenHero68-RGB-Windows-x64-v0.2.3.zip')),/ENOENT/)
  })
  await withUpdater({version:'0.2.4',mutate:({values})=>values.set('OpenHero68-RGB-core.cjs',Buffer.from('corrupt'))},async(updater,_,state)=>{
    await assert.rejects(updater.stageCoreUpdate(),/checksum/)
    await assert.rejects(readFile(path.join(state,'core/pending.json')),/ENOENT/)
  })
})

test('new core cannot pretend its old native launcher is compatible',()=>{
  const f=fixture();assert.throws(()=>verifyCore(f.signed,f.core,publicKey,'0.2.1'),/newer launcher/)
  assert.equal(verifyCore(f.signed,f.core,publicKey,'0.2.3'),'0.2.3')
})

function supervisorFixture({unhealthy=false,crash=false,invalid=false}={}){
  const initial={file:'bundled',version:'0.2.3'},launches=[],rollbacks=[],errors=[];let staged=0,killed=0,waited=0
  const runner={
    launch(core){launches.push(core.version);return {pid:1,exit:Promise.resolve(core.version==='0.2.5'?0:core.version==='0.2.4'&&crash?1:core.version==='0.2.3'&&staged?0:73),kill(){killed++}}},
    pending:()=>true,
    prepare(){staged++;if(invalid)throw Error('Invalid signature');return {file:'downloaded',version:staged===1?'0.2.4':'0.2.5'}},
    healthy:async()=>!unhealthy,rollback:previous=>rollbacks.push(previous.version),quitting:()=>false,error:e=>errors.push(String(e)),wait:async()=>{waited++}
  }
  return {initial,runner,launches,rollbacks,errors,counts:()=>({killed,waited})}
}
test('supervisor applies two consecutive core updates in one tray session',async()=>{
  const f=supervisorFixture();await superviseCore(f.initial,f.runner)
  assert.deepEqual(f.launches,['0.2.3','0.2.4','0.2.5']);assert.deepEqual(f.errors,[]);assert.equal(f.counts().waited,0)
})
test('unhealthy, crashed or invalid updated cores roll back to the previous installation',async()=>{
  for(const config of [{unhealthy:true},{crash:true},{invalid:true}]){
    const f=supervisorFixture(config);await superviseCore(f.initial,f.runner)
    assert.deepEqual(f.rollbacks,['0.2.3']);assert.equal(f.launches.at(-1),'0.2.3');assert.equal(f.errors.length,1)
    if(config.unhealthy)assert.equal(f.counts().killed,1)
  }
})
