#pragma once
#include <windows.h>
#include <Xinput.h>
#include <avrt.h>
#include <ViGEm/Client.h>
#include "gamepad_core.h"
#include <mutex>
#include <thread>
#include <atomic>
#include "keyboard_hook.h"
namespace gamepad {
// This adapter and its watchdog never wait for keyboard HID or the IPC scheduler.
class Output {
  std::mutex mutex_;
  std::thread worker_;
  std::atomic<bool> quit_{false};
  HANDLE wake_=CreateEventW(nullptr,FALSE,FALSE,nullptr);
  PVIGEM_CLIENT client_=nullptr;
  PVIGEM_TARGET target_=nullptr;
  Config config_;
  keyboard::Hook keyboardHook_;
  std::array<hall::Sample,hall::Capacity> samples_{};
  bool enabled_=false,paused_=false,armed_=false,stale_=true,verified_=false;
  bool driverAvailable_=false;
  uint64_t neutralCount_=0,outputs_=0;
  Report report_{};
  double nextOutput_=0,started_=0,lastOutput_=0;
  std::vector<double> outputGaps_;
  std::string error_;
  unsigned long userIndex_=ULONG_MAX;
  DWORD xinputError_=ERROR_DEVICE_NOT_CONNECTED;
  XINPUT_STATE actual_{};
  static double clock(){LARGE_INTEGER t,f;QueryPerformanceCounter(&t);QueryPerformanceFrequency(&f);return t.QuadPart*1000./f.QuadPart;}
  static bool nonzero(const Report& r){return r.buttons||r.lx||r.ly||r.rx||r.ry||r.lt||r.rt;}
  void neutral(){keyboardHook_.release();if(target_)vigem_target_x360_update(client_,target_,{});report_={};armed_=false;verified_=false;neutralCount_++;}
  void destroy(){keyboardHook_.stop();if(target_){neutral();vigem_target_remove(client_,target_);vigem_target_free(target_);target_=nullptr;}if(client_){vigem_disconnect(client_);vigem_free(client_);client_=nullptr;}enabled_=false;report_={};actual_={};userIndex_=ULONG_MAX;xinputError_=ERROR_DEVICE_NOT_CONNECTED;verified_=false;}
  void run(){
    DWORD task=0;HANDLE scheduling=AvSetMmThreadCharacteristicsW(L"Games",&task);
    HANDLE timer=CreateWaitableTimerExW(nullptr,nullptr,0x00000002,TIMER_MODIFY_STATE|SYNCHRONIZE);
    if(!timer)timer=CreateWaitableTimerW(nullptr,FALSE,nullptr);
    while(!quit_){
      double delay=10000;
      {
        std::lock_guard<std::mutex> lock(mutex_);
        if(enabled_&&target_){
          const double now=clock();bool stale,resting;
          auto desired=map(config_,samples_,now,stale,resting);
          if(stale||paused_)armed_=false;else if(resting)armed_=true;
          if(stale&&!stale_)neutralCount_++;
          stale_=stale;
          if(!armed_||paused_)desired={};
          const bool block=config_.suppressMappedKeys&&armed_&&!paused_&&!stale;
          if(!block&&keyboardHook_.active())keyboardHook_.release();else keyboardHook_.active(block);
          // A stale sample must neutralize immediately, even between 50 Hz outputs.
          const bool watchdog=(!armed_||paused_)&&nonzero(report_);
          if(now>=nextOutput_||watchdog){
            XUSB_REPORT r{};r.wButtons=desired.buttons;r.sThumbLX=desired.lx;r.sThumbLY=desired.ly;
            r.sThumbRX=desired.rx;r.sThumbRY=desired.ry;r.bLeftTrigger=desired.lt;r.bRightTrigger=desired.rt;
            const auto result=vigem_target_x360_update(client_,target_,r);
            if(!VIGEM_SUCCESS(result)){error_="ViGEm output failed";destroy();}
            else {
              report_=desired;
              if(lastOutput_){outputGaps_.push_back(now-lastOutput_);if(outputGaps_.size()>1024)outputGaps_.erase(outputGaps_.begin());}
              lastOutput_=now;outputs_++;
              const double period=1000./config_.rate;
              if(now>=nextOutput_){nextOutput_+=period;if(nextOutput_<=now)nextOutput_+=std::floor((now-nextOutput_)/period+1)*period;}
              XINPUT_STATE actual{};
              // Standard XInputGetState omits the Guide bit.
              xinputError_=userIndex_<4?XInputGetState(userIndex_,&actual):ERROR_DEVICE_NOT_CONNECTED;
              verified_=xinputError_==ERROR_SUCCESS&&
                actual.Gamepad.wButtons==(r.wButtons&~1024)&&actual.Gamepad.sThumbLX==r.sThumbLX&&
                actual.Gamepad.sThumbLY==r.sThumbLY&&actual.Gamepad.sThumbRX==r.sThumbRX&&actual.Gamepad.sThumbRY==r.sThumbRY&&
                actual.Gamepad.bLeftTrigger==r.bLeftTrigger&&actual.Gamepad.bRightTrigger==r.bRightTrigger;
              actual_=actual;
            }
          }
          delay=std::max(.05,nextOutput_-clock());
          if(!stale)for(const auto& b:config_.bindings)delay=std::min(delay,std::max(.05,samples_[b.pos].at+50-clock()));
        }
      }
      if(timer&&wake_){LARGE_INTEGER due{};due.QuadPart=-static_cast<LONGLONG>(delay*10000);SetWaitableTimer(timer,&due,0,nullptr,nullptr,FALSE);HANDLE waits[]={wake_,timer};WaitForMultipleObjects(2,waits,FALSE,10000);}
      else if(wake_)WaitForSingleObject(wake_,DWORD(std::max(1.,delay)));else Sleep(DWORD(std::max(1.,delay)));
    }
    if(timer)CloseHandle(timer);
    if(scheduling)AvRevertMmThreadCharacteristics(scheduling);
  }
public:
  Output(){auto probe=vigem_alloc();if(probe){driverAvailable_=VIGEM_SUCCESS(vigem_connect(probe));vigem_disconnect(probe);vigem_free(probe);}worker_=std::thread([this]{run();});}
  ~Output(){quit_=true;SetEvent(wake_);worker_.join();std::lock_guard<std::mutex> lock(mutex_);destroy();if(wake_)CloseHandle(wake_);}
  void configure(const Config& c){std::lock_guard<std::mutex> lock(mutex_);neutral();if(!keyboardHook_.prepare(c.keyboardScans,c.suppressMappedKeys&&enabled_))throw std::runtime_error("Windows keyboard hook unavailable");config_=c;samples_={};nextOutput_=clock();SetEvent(wake_);}
  bool start(){
    std::lock_guard<std::mutex> lock(mutex_);destroy();error_.clear();client_=vigem_alloc();
    if(!client_){error_="ViGEm allocation failed";return false;}
    if(!VIGEM_SUCCESS(vigem_connect(client_))){driverAvailable_=false;error_="Install the official ViGEmBus v1.22.0 driver";destroy();return false;}
    driverAvailable_=true;
    target_=vigem_target_x360_alloc();
    const auto added=target_?vigem_target_add(client_,target_):VIGEM_ERROR_TARGET_UNINITIALIZED;
    const DWORD addedError=GetLastError();
    if(!VIGEM_SUCCESS(added)){std::ostringstream e;e<<"Could not create Xbox controller (ViGEm 0x"<<std::hex<<unsigned(added)<<", Windows "<<std::dec<<addedError<<")";error_=e.str();destroy();return false;}
    // ViGEmBus 1.22 initializes XInput with its captured boot packet (nonzero
    // sticks), but its report cache starts zero and suppresses an initial zero
    // update. Force a tiny cache transition, identify this exact XInput device,
    // then neutralize before exposing ready. All four axis values are far below
    // standard deadzones; no buttons/triggers are emitted. GET_USER_INDEX can
    // return zero bytes on 1.22 and falsely identify another controller as P1.
    XUSB_REPORT seed{};seed.sThumbLX=1;seed.sThumbLY=2;seed.sThumbRX=3;seed.sThumbRY=4;
    const auto seeded=vigem_target_x360_update(client_,target_,seed);
    userIndex_=ULONG_MAX;
    const double indexDeadline=clock()+500;
    while(VIGEM_SUCCESS(seeded)&&userIndex_>=4&&clock()<indexDeadline){
      for(DWORD index=0;index<4;++index){
        XINPUT_STATE actual{};
        if(XInputGetState(index,&actual)==ERROR_SUCCESS&&actual.Gamepad.wButtons==0&&
          actual.Gamepad.bLeftTrigger==0&&actual.Gamepad.bRightTrigger==0&&
          actual.Gamepad.sThumbLX==1&&actual.Gamepad.sThumbLY==2&&
          actual.Gamepad.sThumbRX==3&&actual.Gamepad.sThumbRY==4){userIndex_=index;break;}
      }
      if(userIndex_>=4)Sleep(5);
    }
    const auto neutralized=vigem_target_x360_update(client_,target_,{});
    if(!VIGEM_SUCCESS(seeded)||!VIGEM_SUCCESS(neutralized)||userIndex_>=4){error_="Could not verify Xbox controller initialization";destroy();return false;}
    if(!keyboardHook_.prepare(config_.keyboardScans,config_.suppressMappedKeys)){error_="Windows keyboard hook unavailable";destroy();return false;}
    enabled_=true;paused_=false;armed_=false;stale_=true;outputs_=0;
    started_=nextOutput_=clock();lastOutput_=0;outputGaps_.clear();samples_={};SetEvent(wake_);return true;
  }
  void stop(){std::lock_guard<std::mutex> lock(mutex_);destroy();SetEvent(wake_);}
  void pause(bool value){std::lock_guard<std::mutex> lock(mutex_);if(paused_==value)return;paused_=value;neutral();samples_={};SetEvent(wake_);}
  void sample(uint16_t pos,const hall::Sample& s){std::lock_guard<std::mutex> lock(mutex_);if(pos<hall::Capacity)samples_[pos]=s;}
  bool enabled(){std::lock_guard<std::mutex> lock(mutex_);return enabled_;}
  std::string error(){std::lock_guard<std::mutex> lock(mutex_);return error_;}
  std::string input(){
    std::lock_guard<std::mutex> lock(mutex_);std::ostringstream s;s<<"{\"enabled\":"<<(enabled_?"true":"false")<<",\"armed\":"<<(armed_?"true":"false")<<",\"stale\":"<<(stale_?"true":"false")<<",\"xinputVerified\":"<<(verified_?"true":"false")<<",\"report\":{\"buttons\":"<<report_.buttons<<",\"lx\":"<<report_.lx<<",\"ly\":"<<report_.ly<<",\"rx\":"<<report_.rx<<",\"ry\":"<<report_.ry<<",\"lt\":"<<int(report_.lt)<<",\"rt\":"<<int(report_.rt)<<"}}";return s.str();
  }
  std::string status(){
    std::lock_guard<std::mutex> lock(mutex_);const double now=clock();auto gaps=outputGaps_;std::sort(gaps.begin(),gaps.end());
    const double p99=gaps.empty()?0:gaps[size_t(std::ceil(gaps.size()*.99))-1];
    std::ostringstream s;s<<"{\"keyboardHookSupported\":true,\"fastInputSupported\":true,\"keyboardSuppressionActive\":"<<(keyboardHook_.active()?"true":"false")<<",\"keyboardSuppressionError\":\""<<keyboardHook_.error()<<"\",\"driverAvailable\":"<<(driverAvailable_?"true":"false")<<",\"enabled\":"<<(enabled_?"true":"false")<<",\"armed\":"<<(armed_?"true":"false")<<",\"stale\":"<<(stale_?"true":"false")
      <<",\"xinputVerified\":"<<(verified_?"true":"false")<<",\"userIndex\":"<<(userIndex_<4?int(userIndex_):-1)
      <<",\"xinputError\":"<<xinputError_<<",\"outputHz\":"<<(enabled_&&outputs_>1?(outputs_-1)*1000/std::max(1.,now-started_):0)<<",\"outputP99Ms\":"<<p99
      <<",\"actualReport\":{\"buttons\":"<<actual_.Gamepad.wButtons<<",\"lx\":"<<actual_.Gamepad.sThumbLX<<",\"ly\":"<<actual_.Gamepad.sThumbLY<<",\"rx\":"<<actual_.Gamepad.sThumbRX<<",\"ry\":"<<actual_.Gamepad.sThumbRY<<",\"lt\":"<<int(actual_.Gamepad.bLeftTrigger)<<",\"rt\":"<<int(actual_.Gamepad.bRightTrigger)<<"}"
      <<",\"neutralCount\":"<<neutralCount_<<",\"error\":\""<<error_<<"\",\"report\":{\"buttons\":"<<report_.buttons
      <<",\"lx\":"<<report_.lx<<",\"ly\":"<<report_.ly<<",\"rx\":"<<report_.rx<<",\"ry\":"<<report_.ry
      <<",\"lt\":"<<int(report_.lt)<<",\"rt\":"<<int(report_.rt)<<"}}";return s.str();
  }
};
}
