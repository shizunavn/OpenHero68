#pragma once
#include <windows.h>
#include <atomic>
#include <mutex>
#include <thread>
#include <array>
#include <string>
#include <cstdint>
#include "keyboard_hook_core.h"
namespace keyboard {
// One message thread, no HID calls or output locks in the hook. Only SendInput
// key-ups bearing our marker are used for cleanup; they cannot recurse.
class Hook {
  static constexpr UINT Update=WM_APP+71;
  static constexpr UINT Release=WM_APP+72;
  static constexpr ULONG_PTR Marker=0x48473638;
  inline static thread_local Hook* owner_=nullptr;
  std::thread thread_;
  HANDLE ready_=CreateEventW(nullptr,TRUE,FALSE,nullptr),done_=CreateEventW(nullptr,TRUE,FALSE,nullptr);
  std::atomic<DWORD> threadId_{0};
  std::atomic<bool> desired_{false},installed_{false},quitting_{false};
  std::mutex pendingMutex_;
  Mask pendingMask_,mask_;
  bool wanted_=false;
  uint64_t revision_=0;
  std::atomic<uint64_t> completedRevision_{0};
  std::string error_;
  HHOOK handle_=nullptr;
  Policy policy_;
  static LRESULT CALLBACK callback(int code,WPARAM message,LPARAM data){
    auto* self=owner_;
    if(code==HC_ACTION&&self){
      const auto& key=*reinterpret_cast<KBDLLHOOKSTRUCT*>(data);
      const bool down=message==WM_KEYDOWN||message==WM_SYSKEYDOWN;
      const bool up=message==WM_KEYUP||message==WM_SYSKEYUP;
      const unsigned scan=key.scanCode|((key.flags&LLKHF_EXTENDED)?0x100:0);
      if((down||up)&&self->policy_.event(scan,down,self->desired_.load(std::memory_order_relaxed),self->mask_,key.dwExtraInfo==Marker))return 1;
    }
    return CallNextHookEx(nullptr,code,message,data);
  }
  void cleanup(){
    const auto keys=policy_.release();
    std::array<INPUT,512> inputs{};UINT count=0;
    for(unsigned i=0;i<512;i++)if(keys[i]){
      auto& input=inputs[count++];input.type=INPUT_KEYBOARD;input.ki.wScan=WORD(i&255);
      input.ki.dwFlags=KEYEVENTF_SCANCODE|KEYEVENTF_KEYUP|((i&256)?KEYEVENTF_EXTENDEDKEY:0);input.ki.dwExtraInfo=Marker;
    }
    if(count&&SendInput(count,inputs.data(),sizeof(INPUT))!=count){
      std::lock_guard<std::mutex> lock(pendingMutex_);error_="Windows could not release blocked keys (check application privilege level)";
    }
  }
  void run(){
    owner_=this;MSG msg{};PeekMessageW(&msg,nullptr,0,0,PM_NOREMOVE);
    threadId_=GetCurrentThreadId();SetEvent(ready_);
    while(!quitting_&&GetMessageW(&msg,nullptr,0,0)>0){
      if(msg.message==Release){cleanup();continue;}
      if(msg.message!=Update){TranslateMessage(&msg);DispatchMessageW(&msg);continue;}
      Mask next;bool wanted;uint64_t revision;
      {std::lock_guard<std::mutex> lock(pendingMutex_);next=pendingMask_;wanted=wanted_;revision=revision_;}
      cleanup();mask_=next;
      if(wanted&&!handle_){
        handle_=SetWindowsHookExW(WH_KEYBOARD_LL,callback,GetModuleHandleW(nullptr),0);
        if(!handle_){std::lock_guard<std::mutex> lock(pendingMutex_);error_="Windows keyboard hook installation failed: "+std::to_string(GetLastError());}
        else {
          // Preserve any down that Windows delivered before installation.
          for(unsigned i=0;i<512;i++)if(mask_[i]){
            UINT vk=MapVirtualKeyW((i&256)?0xe000|(i&255):i,MAPVK_VSC_TO_VK_EX);
            if(vk&&(GetAsyncKeyState(vk)&0x8000))policy_.delivered.set(i);
          }
        }
      }else if(!wanted&&handle_){UnhookWindowsHookEx(handle_);handle_=nullptr;policy_={};}
      installed_=handle_!=nullptr;completedRevision_=revision;SetEvent(done_);
    }
    desired_=false;cleanup();if(handle_)UnhookWindowsHookEx(handle_);installed_=false;owner_=nullptr;
  }
public:
  Hook(){thread_=std::thread([this]{run();});WaitForSingleObject(ready_,500);}
  ~Hook(){quitting_=true;desired_=false;if(threadId_)PostThreadMessageW(threadId_,WM_QUIT,0,0);thread_.join();CloseHandle(ready_);CloseHandle(done_);}
  bool prepare(const Mask& mask,bool wanted){
    desired_=false;
    uint64_t revision;
    {std::lock_guard<std::mutex> lock(pendingMutex_);pendingMask_=mask;wanted_=wanted;error_.clear();revision=++revision_;}
    ResetEvent(done_);
    if(!PostThreadMessageW(threadId_,Update,0,0)){return false;}
    const ULONGLONG deadline=GetTickCount64()+500;
    while(wanted&&completedRevision_<revision){
      const auto now=GetTickCount64();if(now>=deadline||WaitForSingleObject(done_,DWORD(deadline-now))!=WAIT_OBJECT_0)return false;
      if(completedRevision_<revision)ResetEvent(done_);
    }
    return !wanted||installed_.load();
  }
  void active(bool value){desired_=value&&installed_.load();}
  void release(){desired_=false;PostThreadMessageW(threadId_,Release,0,0);}
  void stop(){desired_=false;{std::lock_guard<std::mutex> lock(pendingMutex_);wanted_=false;++revision_;}PostThreadMessageW(threadId_,Update,0,0);}
  bool active() const{return installed_&&desired_;}
  std::string error(){std::lock_guard<std::mutex> lock(pendingMutex_);return error_;}
};
}
