#include "../service/native/gamepad_core.h"
#include "../service/native/gamepad_digital.h"
#include <cassert>
#include <iostream>
#include <cstdlib>
int main(){
  _set_error_mode(_OUT_TO_STDERR);_set_abort_behavior(0,_WRITE_ABORT_MSG|_CALL_REPORTFAULT);
  auto settings=gamepad::parseDigital("70,200,1,20,10,1,5,10");gamepad::DigitalState digital;uint64_t sequence=0;double at=0;
  auto press=[&](unsigned distance,bool diagnostic=false){return digital.sample(settings[70],{uint16_t(distance),0,diagnostic,at+=5,++sequence});};
  assert(!press(0,true));assert(!press(199,true));assert(press(200,false));
  assert(press(250));assert(press(231));assert(!press(230,true)); // peak minus release sensitivity
  assert(!press(180));assert(!press(189));assert(press(190)); // trough plus press sensitivity, below AP
  assert(press(190));assert(!press(5));assert(!press(190,true));assert(press(200)); // top deadzone resets AP
  assert(press(335));assert(press(330));assert(!press(315)); // bottom deadzone holds until outside it
  at+=50;assert(!press(190,true)); // timeout resets the old RT latch
  settings[70].rt=false;digital={};assert(!press(199,true));assert(press(200,false));assert(!press(199,true));
  settings[70].ap=280;assert(!press(250,true));assert(press(280,false));
  for(const auto& invalid:{"70,200,2,20,10,0,0,0","70,341,0,0,0,0,0,0","70,200,1,20,10,0,0,0|70,100,0,0,0,0,0,0","2,100,0,0,0,0,0,0"}){bool rejected=false;try{gamepad::parseDigital(invalid);}catch(...){rejected=true;}assert(rejected);}
  keyboard::Policy policy;keyboard::Mask mask;mask.set(30);mask.set(0x148);
  assert(policy.event(30,true,true,mask));assert(policy.event(30,true,true,mask));assert(policy.event(30,false,false,mask));
  assert(!policy.event(30,true,false,mask));assert(!policy.event(30,true,true,mask));assert(!policy.event(30,false,true,mask));
  assert(policy.event(0x148,true,true,mask));assert(!policy.event(0x48,true,true,mask));assert(!policy.event(30,true,true,mask,true));
  auto released=policy.release();assert(released.count()==1&&released[0x148]);assert(!policy.release().any());
  auto hook=gamepad::parse("200;1;0;0;45;0,0|1,1;30,15,0.1,3.4;1;30,328");assert(hook.suppressMappedKeys&&hook.keyboardScans[30]&&hook.keyboardScans[328]);
  std::array<uint8_t,64> packet{};packet[0]=9;packet[1]=0x98;packet[2]=1;packet[6]=6;packet[8]=30;
  auto checksum=[&]{unsigned sum=0;for(size_t i=0;i<63;i++)sum+=packet[i];packet[63]=uint8_t(255-sum);};checksum();
  assert(hall::matchesReply(packet.data(),64,{30}));assert(!hall::matchesReply(packet.data(),63,{30}));assert(!hall::matchesReply(packet.data(),64,{43}));
  packet[2]=0;checksum();assert(!hall::matchesReply(packet.data(),64,{30}));packet[2]=1;checksum();packet[63]++;assert(!hall::matchesReply(packet.data(),64,{30}));
  hall::Scheduler s;std::array<double,hall::Capacity> hz{};
  assert(!s.active()&&s.batch(0).empty());hz[30]=200;hz[43]=100;s.configure(hz,0);
  assert(s.batch(0).size()==2);s.received(30,0,100,false,.7);s.received(43,0,100,false,.7);
  assert(s.batch(4.9).empty());assert(s.batch(5)==std::vector<uint16_t>{30});
  s.received(30,20,100,false,5.6);assert(s.due[30]==10);
  assert(s.lifetimeP99(30)==5);
  s.received(30,20,100,false,22);assert(s.due[30]==25);assert(s.batch(22).size()==1); // overdue 100 Hz only
  hz[43]=200;s.configure(hz,23);assert(s.batch(23)==std::vector<uint16_t>{43});
  for(int i=15;i<78;i++)hz[i]=100;s.configure(hz,30);assert(s.batch(30).size()==9);
  s.failed(50);assert(s.batch(299).empty());assert(s.retryAt==300);
  s.failed(300);assert(s.retryAt==800);s.failed(800);assert(s.retryAt==1800);s.failed(1800);assert(s.retryAt==3800);s.success();
  hz={};s.configure(hz,4000);assert(!s.active()&&s.batch(10000).empty());
  auto c=gamepad::parse("200;1;0;0;45;0,0|1,1;30,15,0.1,3.4|44,16,0.1,3.4|29,23,0.1,3.4|70,0,0.1,3.4");
  std::array<hall::Sample,hall::Capacity> samples{};
  bool stale=false,resting=false;auto r=gamepad::map(c,samples,100,stale,resting);assert(stale&&!r.buttons&&!r.ly);
  for(const auto& b:c.bindings)samples[b.pos]={0,0,false,100,1};
  r=gamepad::map(c,samples,105,stale,resting);assert(!stale&&resting);
  samples[30].distance=340;samples[44].distance=175;samples[29].distance=175;samples[70].pressed=true;
  r=gamepad::map(c,samples,110,stale,resting);assert(!stale&&!resting&&r.ly==32767&&r.lt==128&&r.buttons==4096);
  samples[70].distance=180;samples[70].pressed=false;
  r=gamepad::map(c,samples,110,stale,resting);assert(r.buttons==0);
  samples[70].distance=190;samples[70].pressed=true;
  r=gamepad::map(c,samples,110,stale,resting);assert(r.buttons==4096);
  samples[44].distance=340;r=gamepad::map(c,samples,110,stale,resting);assert(r.ly==0);
  c.snappy=false;samples[44].distance=175;r=gamepad::map(c,samples,110,stale,resting);assert(r.ly==16384);
  r=gamepad::map(c,samples,150,stale,resting);assert(stale&&r.ly==0&&r.lt==0&&r.buttons==0);
  for(const auto& payload:{"200;1;0;0;45;0,0|1,1;2,15,0.1,3.4","200;1;0;0;45;0,0|1,1;30,15,0.1,3.4|30,1,0.1,3.4","200;1;0;0;45;0,0|.5,.8|.7,.1|1,1;","200;1;0;0;45;0,0|1,1;30,15,0.1,4"}){bool rejected=false;try{gamepad::parse(payload);}catch(...){rejected=true;}assert(rejected);}
  assert(gamepad::parse("200;1;0;0;45;0,0|1,1;").bindings.empty());
  assert(gamepad::parse("200;1;0;0;45;0,0|1,1;30,15,0.1,0.11").bindings.size()==1);
  std::cout<<"Native Hall scheduler and Gamepad mapping checks passed\n";
}
