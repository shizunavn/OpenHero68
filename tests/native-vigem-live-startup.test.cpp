#define NOMINMAX
#include <Windows.h>
#include <unordered_map>
#include <cassert>
#include <iostream>
BOOL WINAPI trackedDeviceIoControl(HANDLE,DWORD,LPVOID,DWORD,LPVOID,DWORD,LPDWORD,LPOVERLAPPED);
BOOL WINAPI forcedGetOverlappedResult(HANDLE,LPOVERLAPPED,LPDWORD,BOOL);
#define DeviceIoControl trackedDeviceIoControl
#define GetOverlappedResult forcedGetOverlappedResult
#include "../service/native/vendor/ViGEmClient/src/ViGEmClient.cpp"
#undef DeviceIoControl
#undef GetOverlappedResult
#include "../service/native/gamepad_output.h"
static std::unordered_map<LPOVERLAPPED,DWORD> requests;
static bool forceTimeout=true;
static unsigned plugs=0,waits=0,unplugs=0;
static LPOVERLAPPED skippedWait=nullptr;
BOOL WINAPI trackedDeviceIoControl(HANDLE handle,DWORD code,LPVOID input,DWORD inputSize,LPVOID output,DWORD outputSize,LPDWORD transferred,LPOVERLAPPED ol){
  requests[ol]=code;
  if(code==IOCTL_VIGEM_WAIT_DEVICE_READY){
    ++waits;
    if(forceTimeout&&waits==1){skippedWait=ol;SetLastError(ERROR_DEVICE_HARDWARE_ERROR);return FALSE;}
  }
  if(code==IOCTL_VIGEM_UNPLUG_TARGET)++unplugs;
  return DeviceIoControl(handle,code,input,inputSize,output,outputSize,transferred,ol);
}
BOOL WINAPI forcedGetOverlappedResult(HANDLE handle,LPOVERLAPPED ol,LPDWORD transferred,BOOL wait){
  if(ol==skippedWait){skippedWait=nullptr;SetLastError(ERROR_DEVICE_HARDWARE_ERROR);return FALSE;}
  const BOOL result=GetOverlappedResult(handle,ol,transferred,wait);
  if(result&&requests[ol]==IOCTL_VIGEM_PLUGIN_TARGET)++plugs;
  const DWORD resultError=result?0:GetLastError();
  if(requests[ol]==IOCTL_VIGEM_WAIT_DEVICE_READY)std::cout<<"actual-ready:"<<result<<",error:"<<resultError<<'\n';
  if(!result)SetLastError(resultError);
  return result;
}
int main(){
  _set_error_mode(_OUT_TO_STDERR);_set_abort_behavior(0,_WRITE_ABORT_MSG|_CALL_REPORTFAULT);
  std::cout<<std::unitbuf;
  for(int attempt=0;attempt<3;++attempt){
    forceTimeout=attempt==0;
    const auto plugsBefore=plugs,waitsBefore=waits,unplugsBefore=unplugs;
    gamepad::Output output;
    gamepad::Config config;
    config.suppressMappedKeys=false;
    output.configure(config);
    if(!output.start()){std::cerr<<output.error()<<'\n';return 1;}
    Sleep(150);
    const auto status=output.status();
    assert(output.enabled());
    assert(status.find("\"xinputVerified\":true")!=std::string::npos);
    assert(status.find("\"actualReport\":{\"buttons\":0,\"lx\":0,\"ly\":0,\"rx\":0,\"ry\":0,\"lt\":0,\"rt\":0}")!=std::string::npos);
    assert(status.find("\"userIndex\":-1")==std::string::npos);
    assert(status.find("\"lx\":0,\"ly\":0,\"rx\":0,\"ry\":0,\"lt\":0,\"rt\":0")!=std::string::npos);
    assert(plugs==plugsBefore+1&&unplugs==unplugsBefore);
    if(forceTimeout)assert(waits>=waitsBefore+2);
    std::cout<<(forceTimeout?"forced timeout recovery":"normal startup")<<":"<<status<<'\n';
    output.stop();assert(!output.enabled());assert(unplugs==unplugsBefore+1);
    Sleep(150);
  }
  std::cout<<"Real bus recovery/neutral output and repeated warm start/stop passed; no physical keyboard writes\n";
}
