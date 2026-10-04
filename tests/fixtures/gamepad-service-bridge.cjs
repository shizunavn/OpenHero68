// In-process HID/ViGEm stand-in. Tests never open a USB handle or install a hook.
const {PassThrough,Writable}=require('node:stream'),{EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path');
const child=require('node:child_process'),originalSpawn=child.spawn;
child.spawn=function(file,...args){
 if(!String(file).endsWith('hid-bridge.exe'))return originalSpawn.call(this,file,...args);
 const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();
 const dir=process.argv[process.argv.indexOf('--state-dir')+1],stateFile=path.join(dir,'fixture-hid.json');
 let saved=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{slot:0,remaps:{}},enabled=false,streaming=false,sequence=0;
 const neutral={buttons:0,lx:0,ly:0,rx:0,ry:0,lt:0,rt:0},emit=s=>p.stdout.write(s+'\n');
 const status=()=>({driverAvailable:true,keyboardHookSupported:true,fastInputSupported:true,keyboardSuppressionActive:false,enabled,armed:enabled,stale:!enabled,xinputVerified:enabled,userIndex:enabled?0:-1,neutralCount:0,error:'',report:neutral});
 const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(saved));
 const value=(layer,pos)=>saved.remaps[`${saved.slot}:${layer}:${pos}`]??(0x10000+pos+layer*100);
 const report=(packet,data=[])=>{const b=Buffer.alloc(64);b[0]=9;b[1]=packet[1];b[2]=packet[2];b[4]=1;b[6]=data.length;Buffer.from(data).copy(b,7);b[63]=(255-[...b.subarray(0,63)].reduce((a,b)=>a+b,0))&255;return b.toString('hex')};
 const command=line=>{
  if(line==='gamepad-status'){emit('gamepad-state:'+JSON.stringify(status()));return}
  if(line==='device-identity'){emit('device-identity:0066006900780074007500720065');return}
  if(line==='custom-start'){saved.customStarts=(saved.customStarts??0)+1;persist();emit('custom-ready');return}
  if(line.startsWith('rhythm:')){emit('rhythm-ready');return}
  const commands={'gamepad-start':'gamepad-ready','gamepad-stop':'gamepad-stopped','gamepad-pause':'gamepad-paused','gamepad-resume':'gamepad-resumed','rhythm-pause':'rhythm-paused','rhythm-resume':'rhythm-resumed','custom-stop':'custom-stopped','rhythm-stop':'rhythm-stopped','close':'closed'};
  if(line==='gamepad-start-paused'){
   const ready=()=>{enabled=true;saved.starts=(saved.starts??0)+1;persist();emit('gamepad-ready')};
   const delayFile=path.join(dir,'fixture-start-delay.json');
   const delay=fs.existsSync(delayFile)?JSON.parse(fs.readFileSync(delayFile,'utf8')).delayMs:0;
   if(delay)setTimeout(ready,delay);else ready();return
  }
  if(line==='gamepad-start'){enabled=true;saved.starts=(saved.starts??0)+1;persist()}if(line==='gamepad-stop'){enabled=false;saved.stops=(saved.stops??0)+1;persist()}
  if(commands[line]){emit(commands[line]);return}
  if(line.startsWith('gamepad-config:')){emit('gamepad-configured');return}
  if(line.startsWith('gamepad-digital:')){saved.digitalCommand=line;saved.digitalReads=(saved.digitalReads??0)+1;persist();emit('gamepad-digital-ready');return}
  if(line.startsWith('hall-config:')){emit('hall-ready');return}
  if(line.startsWith('gamepad-input-')){streaming=line==='gamepad-input-on';emit('gamepad-input-ready');return}
  if(/^[a-f0-9]{128}$/.test(line)){
   const b=Buffer.from(line,'hex'),data=[];
   if(b[1]===0x82)data.push(17,0,0,0,0,3);
   if(b[1]===0x90)data.push(saved.slot);
   if(b[1]===0x10){saved.slot=b[7];persist()}
   const settingCommands={0x93:[0x13,5,[0,200,1]],0x99:[0x19,8,[1,0,20,0,10,1]],0x96:[0x16,8,[0,5,0,10,1,1]]};
   if(settingCommands[b[1]]){const [command,bytes,fallback]=settingCommands[b[1]];for(let i=7;i<7+b[6];i+=2){const pos=b.readUInt16BE(i);data.push(pos>>8,pos&255,...(saved.settings?.[`${saved.slot}:${command}:${pos}`]??fallback))}}
   if([0x13,0x19,0x16].includes(b[1])){saved.settings??={};const bytes=b[1]===0x13?5:8;for(let i=7;i<7+b[6];i+=bytes)saved.settings[`${saved.slot}:${b[1]}:${b.readUInt16BE(i)}`]=[...b.subarray(i+2,i+bytes)];persist()}
   if(b[1]===0x83)for(let i=7;i<7+b[6];i+=2){const pos=b.readUInt16BE(i),v=value(b[2],pos);data.push(pos>>8,pos&255,(v>>>24)&255,(v>>>16)&255,(v>>>8)&255,v&255)}
   if(b[1]===0x03){saved.writes=(saved.writes??0)+1;for(let i=7;i<7+b[6];i+=6)saved.remaps[`${saved.slot}:${b[2]}:${b.readUInt16BE(i)}`]=b.readUInt32BE(i+2);persist()}
   emit(report(b,data));return
  }
  emit('error:Unknown fixture command '+line);
 };
 let pending='';p.stdin=new Writable({write(chunk,encoding,done){pending+=chunk;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);setImmediate(()=>command(line))}done()}});
 const statistics=setInterval(()=>emit('gamepad-status:'+JSON.stringify(status())),250);
 const fast=setInterval(()=>{if(streaming)emit('gamepad-input:'+JSON.stringify({...status(),sequence:++sequence}))},1000/60);
 p.kill=()=>{clearInterval(statistics);clearInterval(fast);p.stdout.end();p.emit('exit',0)};
 p.stdin.on('finish',p.kill);return p;
};
