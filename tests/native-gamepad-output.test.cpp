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
  output.digitalSettings(gamepad::parseDigital("70,200,0,20,10,0,0,0"));
  if(!output.start()){std::cerr<<output.error()<<'\n';return 1;}
  std::atomic<bool> quit{false},feeding{true},diagnostic{true};std::atomic<unsigned> analog{0},digital{0};
  std::thread producer([&]{DWORD task=0;HANDLE scheduling=AvSetMmThreadCharacteristicsW(L"Games",&task);uint64_t seq=1;while(!quit){if(feeding){double at=now();output.sample(30,{uint16_t(analog.load()),0,false,at,seq++});output.sample(70,{uint16_t(digital.load()),0,diagnostic.load(),at,seq++});}Sleep(5);}if(scheduling)AvRevertMmThreadCharacteristics(scheduling);});
  auto waitFor=[&](const std::string& text){const double limit=now()+1500;std::string state;do{Sleep(10);state=output.status();if(state.find(text)!=std::string::npos&&state.find("\"xinputVerified\":true")!=std::string::npos)return state;}while(now()<limit);std::cerr<<"Expected "<<text<<" in "<<state<<'\n';assert(false);return state;};
  waitFor("\"armed\":true");
  std::cout<<"rest:"<<output.status()<<'\n';
  assert(output.status().find("\"xinputVerified\":true")!=std::string::npos);
  analog=340;digital=200;diagnostic=false;waitFor("\"ly\":32767");
  std::cout<<"held:"<<output.status()<<'\n';
  assert(output.status().find("\"ly\":32767")!=std::string::npos);
  assert(output.status().find("\"buttons\":4096")!=std::string::npos);
  assert(output.status().find("\"xinputVerified\":true")!=std::string::npos);
  feeding=false;waitFor("\"stale\":true");
  std::cout<<"watchdog:"<<output.status()<<'\n';assert(output.status().find("\"ly\":0")!=std::string::npos);
  feeding=true;Sleep(100);assert(output.status().find("\"armed\":false")!=std::string::npos);
  analog=0;digital=0;diagnostic=true;waitFor("\"armed\":true");
  analog=340;digital=200;diagnostic=false;waitFor("\"ly\":32767");output.pause(true);
  assert(output.status().find("\"ly\":0")!=std::string::npos);output.pause(false);
  analog=0;digital=0;output.digitalSettings(gamepad::parseDigital("70,250,1,20,10,1,5,10"));waitFor("\"armed\":true");
  auto checkDigital=[&](unsigned distance,bool expected){digital=distance;diagnostic=!expected;Sleep(50);waitFor(expected?"\"buttons\":4096":"\"buttons\":0");};
  checkDigital(0,false);checkDigital(240,false);checkDigital(250,true);
  checkDigital(220,false);checkDigital(230,true); // RT reactivation below AP
  checkDigital(5,false);checkDigital(230,false);checkDigital(250,true);
  std::cout<<"AP/RT with contradictory Hall pressed flags verified by XInput\n";
  quit=true;producer.join();output.stop();std::cout<<"stopped:"<<output.status()<<'\n';assert(!output.enabled());
  std::cout<<"ViGEm watchdog, restart-after-rest and pause checks passed\n";
}
