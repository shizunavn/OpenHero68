#define NOMINMAX
#include "../service/native/gamepad_output.h"
#include <cassert>
#include <iostream>
double now(){LARGE_INTEGER t,f;QueryPerformanceCounter(&t);QueryPerformanceFrequency(&f);return t.QuadPart*1000./f.QuadPart;}
int main(){
  _set_error_mode(_OUT_TO_STDERR);_set_abort_behavior(0,_WRITE_ABORT_MSG|_CALL_REPORTFAULT);
  std::cout<<std::unitbuf;
  gamepad::Output output;
  auto config=gamepad::parse("50;1;0;0;45;0,0|1,1;30,15,0.1,3.4|70,0,0.1,3.4");output.configure(config);
  if(!output.start()){std::cerr<<output.error()<<'\n';return 1;}
  uint64_t seq=1;
  auto feed=[&](bool held){double at=now();output.sample(30,{uint16_t(held?340:0),0,false,at,seq++});output.sample(70,{uint16_t(held?200:0),0,held,at,seq++});};
  for(int i=0;i<500;i++){feed(false);Sleep(5);if(i>=50&&output.status().find("\"xinputVerified\":true")!=std::string::npos)break;}
  std::cout<<"rest:"<<output.status()<<'\n';
  assert(output.status().find("\"xinputVerified\":true")!=std::string::npos);
  for(int i=0;i<50;i++){feed(true);Sleep(5);}
  std::cout<<"held:"<<output.status()<<'\n';
  assert(output.status().find("\"ly\":32767")!=std::string::npos);
  assert(output.status().find("\"xinputVerified\":true")!=std::string::npos);
  double stopped=now();Sleep(53);
  std::cout<<"watchdog:"<<output.status()<<'\n';assert(output.status().find("\"ly\":0")!=std::string::npos);
  for(int i=0;i<10;i++){feed(true);Sleep(5);}assert(output.status().find("\"armed\":false")!=std::string::npos);
  for(int i=0;i<10;i++){feed(false);Sleep(5);}assert(output.status().find("\"armed\":true")!=std::string::npos);
  for(int i=0;i<10;i++){feed(true);Sleep(5);}output.pause(true);
  assert(output.status().find("\"ly\":0")!=std::string::npos);output.pause(false);
  output.stop();std::cout<<"stopped:"<<output.status()<<'\n';assert(!output.enabled());
  std::cout<<"ViGEm watchdog, restart-after-rest and pause checks passed\n";
}
